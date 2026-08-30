import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import type { AgentEvent } from '../events.js';
import { MockAgentRuntime, type ScenarioScript } from '../mock/mock-agent-runtime.js';
import { Scenario, scenario } from '../mock/scenario.js';
import { scenarios } from '../mock/scenarios/index.js';
import type { AgentRuntime } from '../runtime.js';
import type { Agent, Team } from './domain.js';
import { InMemoryMessageStore } from './message-store.js';
import { Orchestrator, type BudgetExhausted } from './orchestrator.js';

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
    async run(agentId, text) {
      const done = orchestrator.promptFromUser(agentId, text);
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

    await clock.runAll();
    // Nothing ran. The UI shows "1 message waiting" and the first user action releases it.
    expect(orchestrator.mailbox(bob.id)).toHaveLength(1);
    expect(orchestrator.statusOf(bob.id)).toBe('idle');
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
