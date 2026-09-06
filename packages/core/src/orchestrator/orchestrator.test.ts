import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import type { AgentEvent } from '../events.js';
import { MockAgentRuntime, type ScenarioScript } from '../mock/mock-agent-runtime.js';
import { Scenario, scenario } from '../mock/scenario.js';
import { scenarios } from '../mock/scenarios/index.js';
import type { AgentRuntime } from '../runtime.js';
import {
  PEER_CONTEXT_LIMIT,
  PEER_MESSAGE_LIMIT,
  ROUTINE_TURN_BUDGET,
  WAKE_BATCH_LIMIT,
} from './bounds.js';
import type { Agent, Team } from './domain.js';
import { InMemoryMessageStore } from './message-store.js';
import { Orchestrator, type BudgetExhausted, type SilentHandoff } from './orchestrator.js';

const team: Team = {
  id: 'team_1',
  name: 'demo',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};

const alice: Agent = {
  id: 'agent_alice',
  teamId: team.id,
  name: 'Alice',
  role: 'frontend',
  workspacePath: '/agents/alice',
};
const bob: Agent = {
  id: 'agent_bob',
  teamId: team.id,
  name: 'Bob',
  role: 'reviewer',
  workspacePath: '/agents/bob',
};

interface Harness {
  orchestrator: Orchestrator;
  clock: VirtualClock;
  store: InMemoryMessageStore;
  events: AgentEvent[];
  prompts: Map<string, string[]>;
  budget: BudgetExhausted[];
  handoffs: SilentHandoff[];
  run(agentId: string, text: string): Promise<void>;
}

async function harness(
  scripts: Record<string, ScenarioScript>,
  overrides: Partial<Team> = {},
): Promise<Harness> {
  const clock = new VirtualClock();
  const store = new InMemoryMessageStore();
  const prompts = new Map<string, string[]>();
  const runtimes = new Map<string, AgentRuntime>();
  // Bound lazily: the mock's peer handler is the orchestrator's own tool handler, and the
  // orchestrator needs the runtimes to exist first.
  let orchestrator: Orchestrator;

  for (const agent of [alice, bob]) {
    const script = scripts[agent.id] ?? scenario('quiet').say('ok').end();
    const runtime = new MockAgentRuntime({
      agentId: agent.id,
      clock,
      startupMs: 0,
      peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
      script: (prompt, turnIndex) => {
        const seen = prompts.get(agent.id) ?? [];
        seen.push(prompt.text);
        prompts.set(agent.id, seen);
        if (typeof script === 'function') return script(prompt, turnIndex);
        if (Array.isArray(script)) {
          const list = script as readonly Scenario[];
          return list[Math.min(turnIndex, list.length - 1)] as Scenario;
        }
        return script as Scenario;
      },
    });
    runtimes.set(agent.id, runtime);
  }

  orchestrator = new Orchestrator({
    team: { ...team, ...overrides },
    agents: [alice, bob],
    runtimes,
    store,
    clock,
  });

  const events: AgentEvent[] = [];
  orchestrator.onEvent((event) => events.push(event));
  const budget: BudgetExhausted[] = [];
  orchestrator.onBudgetExhausted((exhausted) => budget.push(exhausted));
  const handoffs: SilentHandoff[] = [];
  orchestrator.onSilentHandoff((observed) => handoffs.push(observed));

  const starting = orchestrator.start();
  await clock.runAll();
  await starting;

  return {
    orchestrator,
    clock,
    store,
    events,
    prompts,
    budget,
    handoffs,
    async run(agentId, text) {
      const done = orchestrator.promptFromUser([agentId], text);
      await clock.runAll();
      await orchestrator.settled();
      await done;
    },
  };
}

describe('a peer message end to end', () => {
  it('wakes an idle recipient and runs both agents off one user prompt', async () => {
    const h = await harness({
      [alice.id]: [scenarios['alice-asks-bob'], scenario('after').say('Noted, thanks.').end()],
      [bob.id]: scenarios['bob-reviews'],
    });
    await h.run(alice.id, 'Get the auth change reviewed.');

    // Alice → Bob, then Bob → Alice, all from one user prompt.
    expect(h.prompts.get(bob.id)?.[0]).toContain('From Alice (frontend)');
    expect(h.prompts.get(alice.id)?.[1]).toContain('From Bob (reviewer)');
    expect(h.orchestrator.turnsThisPrompt).toBe(3);
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
    expect(h.orchestrator.statusOf(bob.id)).toBe('idle');
  });

  it('announces the peer message itself, so the UI never sees a tool', async () => {
    const h = await harness({
      [alice.id]: scenarios['alice-asks-bob'],
      [bob.id]: scenario('quiet').say('ok').end(),
    });
    await h.run(alice.id, 'go');

    const sent = h.events.filter((event) => event.type === 'agent_message_sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      agentId: alice.id,
      to: 'Bob',
      context: expect.stringContaining('committed on blobot/demo/alice'),
    });
  });

  it('carries the sender, their role and their context line into the envelope', async () => {
    const h = await harness({
      [alice.id]: scenarios['alice-asks-bob'],
      [bob.id]: scenario('quiet').say('ok').end(),
    });
    await h.run(alice.id, 'go');

    const woken = h.prompts.get(bob.id)?.[0] ?? '';
    expect(woken).toContain('From Alice (frontend), a teammate, not the operator:');
    expect(woken).toContain('Their context: I rewrote refresh()');
    expect(woken).toContain('Teammates you can message: Alice (frontend)');
  });
});

// Issue 02 of `.scratch/team-addressing/`: the fan-out that was chosen over a coordinator.
describe('one prompt, several agents', () => {
  it('commits a row per named agent, all carrying the same words at the same moment', async () => {
    const h = await harness({});
    const done = h.orchestrator.promptFromUser([alice.id, bob.id], 'the page double-charges');
    await h.clock.runAll();
    await h.orchestrator.settled();
    await done;

    const fromUser = [alice, bob].flatMap((agent) =>
      h.store.forAgent(agent.id).filter((message) => message.fromAgentId === null),
    );
    expect(fromUser.map((message) => message.toAgentId)).toEqual([alice.id, bob.id]);
    expect(new Set(fromUser.map((message) => message.body)).size).toBe(1);
    // One read of the clock, which is what lets the team pane draw one bubble.
    expect(new Set(fromUser.map((message) => message.at)).size).toBe(1);
    // Both really ran: this is the two-blobatars-busy case the ticket was about.
    expect(h.prompts.get(alice.id)).toHaveLength(1);
    expect(h.prompts.get(bob.id)).toHaveLength(1);
  });

  it('spends the budget once for the whole fan-out, not once per agent', async () => {
    const h = await harness({});
    const done = h.orchestrator.promptFromUser([alice.id, bob.id], 'have a look');
    await h.clock.runAll();
    await h.orchestrator.settled();
    await done;

    // Two agents named is two of the ten, rather than a reset each time round.
    expect(h.orchestrator.turnsThisPrompt).toBe(2);
  });
});

describe('the ack', () => {
  it('says started for an idle recipient and queued for a busy one', async () => {
    const h = await harness({});
    const first = await h.orchestrator.handleMessageAgent({
      from: alice.id,
      agent: 'Bob',
      message: 'one',
      idempotencyKey: 'k1',
    });
    expect(first.status).toBe('started');

    // Bob's turn is now in flight; the next one has to wait for it.
    const second = await h.orchestrator.handleMessageAgent({
      from: alice.id,
      agent: 'Bob',
      message: 'two',
      idempotencyKey: 'k2',
    });
    expect(second).toEqual({ delivered: true, recipient: 'Bob', status: 'queued' });

    await h.clock.runAll();
    await h.orchestrator.settled();
  });

  it('is committed before it is acked', async () => {
    const h = await harness({});
    await h.orchestrator.handleMessageAgent({
      from: alice.id,
      agent: 'Bob',
      message: 'durable first',
      idempotencyKey: 'k1',
    });
    // The row exists the instant the sender is told it does.
    expect(h.store.forAgent(bob.id).map((message) => message.body)).toContain('durable first');

    await h.clock.runAll();
    await h.orchestrator.settled();
  });

  it('is idempotent on the key, so a retried tool call wakes nobody twice', async () => {
    const h = await harness({});
    const call = {
      from: alice.id,
      agent: 'Bob',
      message: 'only once',
      idempotencyKey: 'same-key',
    };
    await h.orchestrator.handleMessageAgent(call);
    await h.clock.runAll();
    await h.orchestrator.settled();
    await h.orchestrator.handleMessageAgent(call);
    await h.clock.runAll();
    await h.orchestrator.settled();

    expect(h.store.forAgent(bob.id).filter((message) => message.body === 'only once')).toHaveLength(
      1,
    );
    expect(h.prompts.get(bob.id)).toHaveLength(1);
  });

  it('rejects an unknown recipient with something the sender can act on', async () => {
    const h = await harness({});
    await expect(
      h.orchestrator.handleMessageAgent({ from: alice.id, agent: 'Reviewr', message: 'hi', idempotencyKey: 'k' }),
    ).rejects.toThrow("no agent named 'Reviewr' on this team; try: Bob");
    expect(h.store.forAgent(bob.id)).toHaveLength(0);
  });

  it('rejects a message to yourself', async () => {
    const h = await harness({});
    await expect(
      h.orchestrator.handleMessageAgent({ from: alice.id, agent: 'Alice', message: 'hi', idempotencyKey: 'k' }),
    ).rejects.toThrow('you cannot message yourself');
  });
});

describe('the mailbox', () => {
  it('delivers a mid-turn batch as one numbered prompt when the turn ends', async () => {
    const h = await harness({ [bob.id]: scenario('slow').wait(5_000).say('done').end() });

    await h.orchestrator.handleMessageAgent({
      from: alice.id,
      agent: 'Bob',
      message: 'first thing',
      idempotencyKey: 'k1',
    });
    await h.clock.advance(1_000);
    await h.orchestrator.handleMessageAgent({
      from: alice.id,
      agent: 'Bob',
      message: 'second thing',
      idempotencyKey: 'k2',
    });
    await h.orchestrator.handleMessageAgent({
      from: alice.id,
      agent: 'Bob',
      message: 'third thing',
      idempotencyKey: 'k3',
    });
    await h.clock.runAll();
    await h.orchestrator.settled();

    const woken = h.prompts.get(bob.id) ?? [];
    expect(woken).toHaveLength(2);
    expect(woken[0]).toContain('first thing');
    // One prompt, not one per message: two turns, not four.
    expect(woken[1]).toContain('These arrived from your teammates while you were working');
    expect(woken[1]).toContain('1. From Alice');
    expect(woken[1]).toContain('2. From Alice');
    expect(woken[1]).toContain('second thing');
    expect(woken[1]).toContain('third thing');
  });

  it('holds queued messages across a relaunch instead of ambushing the user', async () => {
    const store = new InMemoryMessageStore();
    store.commit({
      id: 'msg_1',
      teamId: team.id,
      fromAgentId: alice.id,
      toAgentId: bob.id,
      body: 'left over from last time',
      at: 0,
    });

    const clock = new VirtualClock();
    const runtimes = new Map<string, AgentRuntime>([
      [
        bob.id,
        new MockAgentRuntime({
          agentId: bob.id,
          clock,
          startupMs: 0,
          script: scenario('quiet').say('ok').end(),
        }),
      ],
    ]);
    const orchestrator = new Orchestrator({ team, agents: [alice, bob], runtimes, store, clock });

    const starting = orchestrator.start();
    await clock.runAll();
    await starting;
    // Nothing ran. The UI shows "1 message waiting" and the first user action releases it.
    expect(orchestrator.mailbox(bob.id)).toHaveLength(1);
    expect(orchestrator.statusOf(bob.id)).toBe('idle');
  });
});

describe('what blobot puts in the context', () => {
  it('refuses a message that is a transcript rather than a summary', async () => {
    const h = await harness({});
    await expect(
      h.orchestrator.handleMessageAgent({
        from: alice.id,
        agent: 'Bob',
        message: 'x'.repeat(PEER_MESSAGE_LIMIT + 1),
        idempotencyKey: 'k-long',
      }),
    ).rejects.toThrow(/limit is 4,000.*short version/s);
    // Refused means it does not exist: no row, and nobody woken. The sender reads the error as
    // a tool failure and gets to write the short version.
    expect(h.store.undelivered(bob.id)).toHaveLength(0);
    expect(h.prompts.get(bob.id)).toBeUndefined();
  });

  it('refuses a context line that is not a line', async () => {
    const h = await harness({});
    await expect(
      h.orchestrator.handleMessageAgent({
        from: alice.id,
        agent: 'Bob',
        message: 'have a look',
        context: 'y'.repeat(PEER_CONTEXT_LIMIT + 1),
        idempotencyKey: 'k-context',
      }),
    ).rejects.toThrow(/one line about what you are working on/);
  });

  it('takes a message at exactly the limit, because a bound is not a suggestion', async () => {
    const h = await harness({});
    const ack = await h.orchestrator.handleMessageAgent({
      from: alice.id,
      agent: 'Bob',
      message: 'x'.repeat(PEER_MESSAGE_LIMIT),
      idempotencyKey: 'k-exact',
    });
    expect(ack.delivered).toBe(true);
  });

  it('wakes with a bounded batch and keeps the rest in the mailbox', async () => {
    const h = await harness({ [bob.id]: scenario('slow').wait(5_000).say('done').end() });
    for (let index = 0; index < WAKE_BATCH_LIMIT + 3; index += 1) {
      await h.orchestrator.handleMessageAgent({
        from: alice.id,
        agent: 'Bob',
        message: `thing ${index}`,
        idempotencyKey: `k${index}`,
      });
    }
    await h.clock.runAll();
    await h.orchestrator.settled();

    const woken = h.prompts.get(bob.id) ?? [];
    // The first message started a turn; the seven that arrived during it are delivered five
    // and then two, oldest first, rather than as one numbered list of seven.
    const batches = woken.slice(1);
    expect(batches[0]).toContain(`${WAKE_BATCH_LIMIT}. From Alice`);
    expect(batches[0]).not.toContain(`${WAKE_BATCH_LIMIT + 1}. From Alice`);
    expect(batches.join('\n')).toContain('thing 7');
    // Nothing is dropped and nothing is left waiting: `#runTurn` wakes the agent again when
    // the turn ends, which is the path a mid-turn arrival already takes.
    expect(h.orchestrator.mailbox(bob.id)).toHaveLength(0);
  });

  it('reports what it sent, for the breakdown under the gauge', async () => {
    const h = await harness({});
    await h.orchestrator.handleMessageAgent({
      from: alice.id,
      agent: 'Bob',
      message: 'have a look',
      idempotencyKey: 'k-sent',
    });
    await h.clock.runAll();
    await h.orchestrator.settled();

    const sent = h.orchestrator.injectionOf(bob.id);
    expect(sent.lastWakeMessages).toBe(1);
    expect(sent.lastWakeChars).toBeGreaterThan('have a look'.length);
    expect(sent.queued).toBe(0);
    // An agent nobody has written to has been sent nothing, which is zero rather than absent.
    expect(h.orchestrator.injectionOf(alice.id)).toEqual({
      lastWakeChars: 0,
      lastWakeMessages: 0,
      queued: 0,
      attachmentCount: 0,
      attachmentBytes: 0,
    });
  });
});

describe('the turn budget', () => {
  const pingPong = (target: string): Scenario =>
    scenario('ping-pong')
      .say('On it.')
      .messageAgent(target, 'thanks, let me know if you need anything')
      .end();

  it('halts a ping-pong and holds the mail rather than dropping it', async () => {
    const h = await harness(
      { [alice.id]: pingPong('Bob'), [bob.id]: pingPong('Alice') },
      { turnBudget: 3 },
    );
    await h.run(alice.id, 'go');

    expect(h.orchestrator.turnsThisPrompt).toBe(3);
    expect(h.budget.length).toBeGreaterThan(0);
    expect(h.budget[0]).toMatchObject({ turnBudget: 3, turnsUsed: 3 });
    // Halted, not truncated: the message is still in the mailbox.
    const held = h.orchestrator.mailbox(alice.id).length + h.orchestrator.mailbox(bob.id).length;
    expect(held).toBe(1);
  });

  it('resumes when the user says continue', async () => {
    const h = await harness(
      { [alice.id]: pingPong('Bob'), [bob.id]: scenario('polite').say('thanks').end() },
      { turnBudget: 1 },
    );
    await h.run(alice.id, 'go');
    expect(h.orchestrator.mailbox(bob.id)).toHaveLength(1);

    h.orchestrator.resumeAfterBudget();
    await h.clock.runAll();
    await h.orchestrator.settled();

    expect(h.orchestrator.mailbox(bob.id)).toHaveLength(0);
    expect(h.prompts.get(bob.id)).toHaveLength(1);
  });

  it('does not change any agent status — it is a team condition', async () => {
    const h = await harness(
      { [alice.id]: pingPong('Bob'), [bob.id]: pingPong('Alice') },
      { turnBudget: 2 },
    );
    const seen: string[] = [];
    h.orchestrator.onStatusChange((_agentId, status) => seen.push(status));
    await h.run(alice.id, 'go');

    expect(seen).not.toContain('failed');
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
    expect(h.orchestrator.statusOf(bob.id)).toBe('idle');
  });
});

describe('failure', () => {
  it('leaves a dead agent failed without taking the team down', async () => {
    const h = await harness({
      [alice.id]: scenarios['alice-asks-bob'],
      [bob.id]: scenarios['runtime-dies-midturn'],
    });
    await h.run(alice.id, 'go');

    expect(h.orchestrator.statusOf(bob.id)).toBe('failed');
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
  });

  it('surfaces a rejected recipient to the sender as a failed tool call', async () => {
    const h = await harness({
      [alice.id]: scenario('typo').messageAgent('Reviewr', 'take a look').end(),
    });
    await h.run(alice.id, 'go');

    const failed = h.events.find(
      (event) => event.type === 'tool_call_updated' && event.status === 'failed',
    );
    expect(failed).toMatchObject({ error: expect.stringContaining('no agent named') });
    // The turn survived it.
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
  });
});

/**
 * Ticket 14's block, from the orchestrator's side. The UI half is in `apps/desktop`; what is
 * asserted here is the part that has to be true whoever is drawing it: the turn blocks, the
 * agent reads `waiting`, and nobody answering is a cancellation rather than an approval.
 */
describe('a tool call that asks first', () => {
  const asks = (): Scenario =>
    scenario('rm')
      .say('Clearing the build directory.')
      .callTool('rm -rf dist', 'execute', { asks: true })
      .say('Done.')
      .end();

  it('holds the turn at `waiting` and runs the tool once it is allowed', async () => {
    const h = await harness({ [alice.id]: asks() });
    const seen: string[] = [];
    h.orchestrator.onPermissionRequested((pending) => {
      seen.push(pending.title);
      expect(h.orchestrator.statusOf(alice.id)).toBe('waiting');
      const allow = pending.options.find((option) => option.kind === 'allow_once');
      h.orchestrator.answerPermission(pending.id, allow?.optionId ?? null);
    });

    await h.run(alice.id, 'Clear the build directory.');

    expect(seen).toEqual(['rm -rf dist']);
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
    const tool = h.events.filter((event) => event.type === 'tool_call_updated');
    expect(tool.at(-1)).toMatchObject({ status: 'completed' });
  });

  it('reports a rejection as a failed tool, and the turn carries on', async () => {
    const h = await harness({ [alice.id]: asks() });
    const settled: string[] = [];
    h.orchestrator.onPermissionSettled((_id, outcome) => settled.push(outcome));
    h.orchestrator.onPermissionRequested((pending) => {
      const reject = pending.options.find((option) => option.kind === 'reject_once');
      h.orchestrator.answerPermission(pending.id, reject?.optionId ?? null);
    });

    await h.run(alice.id, 'Clear the build directory.');

    expect(settled).toEqual(['rejected']);
    expect(
      h.events.some((event) => event.type === 'tool_call_updated' && event.status === 'failed'),
    ).toBe(true);
    // The turn survived it: a rejected tool is not a dead agent.
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
  });

  it('cancels rather than allows when nobody is listening', async () => {
    const h = await harness({ [alice.id]: asks() });
    await h.run(alice.id, 'Clear the build directory.');
    expect(
      h.events.some((event) => event.type === 'tool_call_updated' && event.status === 'failed'),
    ).toBe(true);
  });

  it('cancels every outstanding request when the team is disposed', async () => {
    const h = await harness({ [alice.id]: asks() });
    const settled: string[] = [];
    h.orchestrator.onPermissionSettled((_id, outcome) => settled.push(outcome));
    h.orchestrator.onPermissionRequested(() => {
      // Deliberately unanswered: this is the window in which the user closes the window.
    });

    const running = h.run(alice.id, 'Clear the build directory.');
    await h.clock.runAll();
    expect(h.orchestrator.pendingPermissions).toHaveLength(1);

    h.orchestrator.dispose();
    await h.clock.runAll();
    await running;

    expect(settled).toEqual(['cancelled']);
    expect(h.orchestrator.pendingPermissions).toHaveLength(0);
  });
});

/**
 * `.scratch/team-addressing/issues/05-mock-a-coordinator-that-forgets-to-route.md`. Every case
 * here is a scoping decision: the observation is worth having only if it stays quiet on
 * everything that is not the failure.
 */
describe('an agent that names a teammate and writes to nobody', () => {
  it('says so when the user named them and the message never went', async () => {
    const h = await harness({ [alice.id]: scenarios['promises-bob-and-forgets'] });
    await h.run(alice.id, 'Get Bob to look at the retry loop.');

    expect(h.handoffs).toEqual([
      { teamId: team.id, agentId: alice.id, named: ['Bob'], at: expect.any(Number) },
    ]);
  });

  it('stays quiet when the message did go', async () => {
    const h = await harness({
      [alice.id]: scenarios['alice-asks-bob'],
      [bob.id]: scenario('quiet').say('ok').end(),
    });
    await h.run(alice.id, 'Get Bob to look at the retry loop.');

    expect(h.handoffs).toEqual([]);
  });

  it('stays quiet on shop talk the user never asked for', async () => {
    const h = await harness({ [alice.id]: scenarios['promises-bob-and-forgets'] });
    await h.run(alice.id, 'Look at the retry loop.');

    // Alice names Bob, and the user did not. A warning that fires here is a warning nobody
    // reads: she is talking about a teammate, which is not a handoff anybody is waiting on.
    expect(h.handoffs).toEqual([]);
  });

  it('stays quiet about an agent the user addressed directly', async () => {
    const h = await harness({
      [alice.id]: scenarios['promises-bob-and-forgets'],
      [bob.id]: scenario('quiet').say('on it').end(),
    });
    const done = h.orchestrator.promptFromUser([alice.id, bob.id], 'Bob, take the retry loop.');
    await h.clock.runAll();
    await h.orchestrator.settled();
    await done;

    // Bob has the user's own words already. Nothing was lost by Alice not forwarding them.
    expect(h.handoffs).toEqual([]);
  });

  it('stays quiet on a turn that did not get to the end of itself', async () => {
    const h = await harness({
      [alice.id]: scenario('refuses-to-hand-off')
        .say('I will not ask Bob to force-push on my say-so.')
        .end('refusal'),
    });
    await h.run(alice.id, 'Get Bob to force-push it.');

    // The turn stopped, and the transcript already says so. An absence inside a turn that never
    // finished is not a promise anybody broke.
    expect(h.handoffs).toEqual([]);
  });

  it('never fires on a turn a peer started', async () => {
    const h = await harness({
      [alice.id]: scenarios['alice-asks-bob'],
      [bob.id]: scenario('bob-mentions-alice').say('Alice is right about the backoff.').end(),
    });
    await h.run(alice.id, 'Get Bob to look at the retry loop.');

    // Bob names Alice and writes to nobody, but the prompt that woke him was hers, not the
    // user's. The observation is defined against what the user asked for.
    expect(h.handoffs).toEqual([]);
  });
});

describe('a lead that leads', () => {
  // Issue 06, which reopened issue 02. Issue 01 built the lead as pure addressing, and the
  // author's report on first contact was that it "means nothing — he delegates no work".

  it('tells the lead who its teammates are and what each is doing', async () => {
    const h = await harness({}, { leadAgentId: alice.id });
    await h.run(alice.id, 'where are we on the checkout page?');

    const sent = h.prompts.get(alice.id)?.[0] ?? '';
    expect(sent).toContain('You lead this team.');
    // Issue 04's finding, honoured: a router that cannot see status hands work to a busy agent.
    expect(sent).toContain('- Bob (reviewer): free');
    // Issue 03, said to the agent that has to live with it.
    expect(sent).toContain('not as an instruction from the operator');
  });

  it('says nothing of the kind to an agent that does not lead', async () => {
    const h = await harness({}, { leadAgentId: alice.id });
    await h.run(bob.id, 'take the retry loop');

    expect(h.prompts.get(bob.id)?.[0] ?? '').not.toContain('You lead this team.');
  });

  it('keeps the brief out of the transcript, because the row is what the user typed', async () => {
    const h = await harness({}, { leadAgentId: alice.id });
    await h.run(alice.id, 'where are we?');

    const [message] = h.store.forAgent(alice.id);
    expect(message?.body).toBe('where are we?');
  });

  it('replaces the roster line on a wake, rather than saying the roster twice', async () => {
    const h = await harness(
      {
        [bob.id]: scenario('bob-asks-alice')
          .messageAgent('Alice', 'Can you take the token store while I finish the review?')
          .say('Asked Alice.')
          .end(),
      },
      { leadAgentId: alice.id },
    );
    await h.run(bob.id, 'get some help on this');

    const woken = h.prompts.get(alice.id)?.[0] ?? '';
    expect(woken).toContain('You lead this team.');
    expect(woken).not.toContain('Teammates you can message:');
  });

  it('sees a teammate that is busy as busy', async () => {
    const h = await harness(
      {
        // Alice's turn is still open when Bob's wake composes his own prompt, so hers is the
        // status the fold is holding: this is the whole reason the brief is composed per turn.
        [alice.id]: scenario('alice-asks-bob-then-works')
          .messageAgent('Bob', 'Can you review the retry loop?')
          .wait(50)
          .say('Asked Bob.')
          .end(),
      },
      { leadAgentId: bob.id },
    );
    await h.run(alice.id, 'get the retry loop reviewed');

    const woken = h.prompts.get(bob.id)?.[0] ?? '';
    expect(woken).toContain('- Alice (frontend):');
    // Not `free`, which is the word the decision turns on: handing work to a busy agent is the
    // failure issue 04 named.
    expect(woken).not.toContain('- Alice (frontend): free');
  });
});

describe('the silent handoff, on a lead the user let choose', () => {
  it('fires on a teammate the lead named and never wrote to', async () => {
    const h = await harness(
      { [alice.id]: scenarios['promises-bob-and-forgets'] },
      { leadAgentId: alice.id },
    );
    // The user named nobody, which is the whole premise of a lead: the choice of recipient was
    // handed over, so what Alice decided is the only record of who the work was for.
    await h.run(alice.id, 'the retry loop needs another pair of eyes');

    expect(h.handoffs).toEqual([
      { teamId: team.id, agentId: alice.id, named: ['Bob'], at: expect.any(Number) },
    ]);
  });

  it('holds the ordinary rule when the user named the lead itself', async () => {
    const h = await harness(
      { [alice.id]: scenarios['promises-bob-and-forgets'] },
      { leadAgentId: alice.id },
    );
    await h.run(alice.id, 'Alice, look at the retry loop.');

    // Addressed by name, so nothing was deferred to her and the prompt still has to have named
    // Bob. This is issue 05's scoping intact everywhere except the one case that needs it gone.
    expect(h.handoffs).toEqual([]);
  });

  it('stays quiet when the lead did write', async () => {
    const h = await harness(
      {
        [alice.id]: scenarios['alice-asks-bob'],
        [bob.id]: scenario('quiet').say('ok').end(),
      },
      { leadAgentId: alice.id },
    );
    await h.run(alice.id, 'the retry loop needs another pair of eyes');

    expect(h.handoffs).toEqual([]);
  });
});

describe('a turn that only routed', () => {
  // Issue 02 decided this and left it unbuilt, because with no coordinator nothing spent such
  // a turn. Defined by what the turn did, never by who held it.

  it('does not count against the budget', async () => {
    const h = await harness(
      {
        [alice.id]: scenario('routes-and-says-nothing')
          .messageAgent('Bob', 'Can you take the retry loop?')
          .end(),
        [bob.id]: scenario('quiet').say('on it').end(),
      },
      { leadAgentId: alice.id },
    );
    await h.run(alice.id, 'the retry loop needs another pair of eyes');

    // Bob's turn, and Bob's alone. Alice messaged and said nothing else.
    expect(h.orchestrator.turnsThisPrompt).toBe(1);
  });

  it('counts in full the moment the router says anything at all', async () => {
    const h = await harness(
      {
        [alice.id]: scenario('routes-and-reports')
          .messageAgent('Bob', 'Can you take the retry loop?')
          .say('I have asked Bob.')
          .end(),
        [bob.id]: scenario('quiet').say('on it').end(),
      },
      { leadAgentId: alice.id },
    );
    await h.run(alice.id, 'the retry loop needs another pair of eyes');

    expect(h.orchestrator.turnsThisPrompt).toBe(2);
  });

  it('is not a title: an agent that leads nothing gets the same refund', async () => {
    const h = await harness({
      [alice.id]: scenario('routes-and-says-nothing')
        .messageAgent('Bob', 'Can you take the retry loop?')
        .end(),
      [bob.id]: scenario('quiet').say('on it').end(),
    });
    await h.run(alice.id, 'get the retry loop reviewed');

    expect(h.orchestrator.turnsThisPrompt).toBe(1);
  });
});

describe("a Routine's prompt", () => {
  const fire = async (
    h: Harness,
    text = 'summarise hacker news and send it back to me',
    expiryMs = 60_000,
  ): Promise<void> => {
    const done = h.orchestrator.promptFromRoutine(alice.id, text, {
      runId: 'run_1',
      permissionExpiryMs: expiryMs,
    });
    await h.clock.runAll();
    await h.orchestrator.settled();
    await done;
  };

  it("delivers the words in the user's voice, and records which firing brought them", async () => {
    const h = await harness({});
    await fire(h);

    const [message] = h.store.forAgent(alice.id);
    // Still the user's words and still the user's authority: they authored the Routine.
    expect(message?.fromAgentId).toBeNull();
    expect(message?.body).toBe('summarise hacker news and send it back to me');
    // The one thing the bubble gets wrong is *when*, and this is what the `system` line above
    // it and the rail's unread mark are both drawn from.
    expect(message?.routineRunId).toBe('run_1');
    expect(h.prompts.get(alice.id)?.[0]).toContain('summarise hacker news');
  });

  it('an ordinary prompt still carries no firing', async () => {
    const h = await harness({});
    await h.run(alice.id, 'hello');
    expect(h.store.forAgent(alice.id)[0]?.routineRunId).toBeUndefined();
  });

  /**
   * The team's ten is per *user prompt* and its release valve is a person answering *continue?*.
   * A Routine has no person, so the valve is shut and a smaller ceiling is the only thing between
   * an hourly firing and a bill.
   */
  it('spends the run budget and not the team’s', async () => {
    const pingPong = (target: string): ScenarioScript =>
      scenario('ping-pong')
        .say('On it.')
        .messageAgent(target, 'thanks, let me know if you need anything')
        .end();
    const h = await harness({ [alice.id]: pingPong('Bob'), [bob.id]: pingPong('Alice') });

    await fire(h, 'go');

    expect(h.orchestrator.turnsThisPrompt).toBe(ROUTINE_TURN_BUDGET);
    expect(h.budget[0]).toMatchObject({ turnBudget: ROUTINE_TURN_BUDGET });
    // Halted, not truncated. The team's own budget is untouched and still ten.
    expect(team.turnBudget).toBe(10);
  });

  const asksToDelete = (): ScenarioScript =>
    scenario('rm')
      .say('Clearing the build directory.')
      .callTool('rm -rf dist', 'execute', { asks: true })
      .say('Done.')
      .end();

  /**
   * Issue 03. Nobody was ever cancelling: main subscribes at team start, so a request at 03:00
   * waits forever, the agent is `waiting`, and the pool never evicts a working team. Four nights
   * of that is a pool that cannot start the team the user is trying to open.
   */
  it('cancels a permission nobody answered, rather than parking the run forever', async () => {
    const h = await harness({ [alice.id]: asksToDelete() });
    const settled: string[] = [];
    h.orchestrator.onPermissionSettled((_id, outcome) => settled.push(outcome));
    // Somebody is listening — a window is open — and simply never answers.
    h.orchestrator.onPermissionRequested(() => {});

    await fire(h, 'tidy the build directory', 60_000);

    expect(settled).toEqual(['cancelled']);
    // The run ended. It did not hold a session, a bridge process and a pool slot until morning.
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
  });

  /**
   * The line issue 03 drew on purpose: the expiry belongs to the run, never to the request. A
   * user started their own turn and can answer it, and an agent blocked on a human sitting there
   * until answered is what the rail's one contrast inversion is spent on.
   */
  it("never expires a permission on the user's own turn", async () => {
    const h = await harness({ [alice.id]: asksToDelete() });
    h.orchestrator.onPermissionRequested(() => {});

    const done = h.orchestrator.promptFromUser([alice.id], 'tidy the build directory');
    await h.clock.runAll();
    await h.clock.advance(60 * 60_000);

    expect(h.orchestrator.pendingPermissions).toHaveLength(1);
    expect(h.orchestrator.statusOf(alice.id)).toBe('waiting');

    // Let the turn finish so the test does not leave one in flight.
    const [pending] = h.orchestrator.pendingPermissions;
    h.orchestrator.answerPermission(pending?.id ?? '', null);
    await h.clock.runAll();
    await done;
  });
});
