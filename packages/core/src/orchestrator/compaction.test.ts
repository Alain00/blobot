import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import type { AgentEvent, ContextCompacted } from '../events.js';
import { MockAgentRuntime, type MockAgentRuntimeOptions } from '../mock/mock-agent-runtime.js';
import { Scenario, scenario } from '../mock/scenario.js';
import { scenarios } from '../mock/scenarios/index.js';
import type { AgentRuntime, Prompt } from '../runtime.js';
import { unmeasuredCeiling } from '../context-ceiling.js';
import {
  COMPACTION_TRIGGER,
  HANDOFF_LIMIT,
  HANDOFF_PROMPT,
  overCompactionThreshold,
  type HandoffArchive,
  type HandoffRecord,
} from './compaction.js';
import type { Agent, Team } from './domain.js';
import { InMemoryMessageStore } from './message-store.js';
import { Orchestrator, type Compacted } from './orchestrator.js';

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

/** What a 200,000 window works out to for a model nobody measured, which is nearly all of them. */
const CEILING = unmeasuredCeiling(200_000).tokens;

/** Everything the mock was handed, so a test can read what blobot actually said to an agent. */
interface Harness {
  orchestrator: Orchestrator;
  clock: VirtualClock;
  events: AgentEvent[];
  compactions: Compacted[];
  archived: HandoffRecord[];
  prompts: Map<string, Prompt[]>;
  runtimes: Map<string, MockAgentRuntime>;
  compacted(): ContextCompacted[];
  run(agentId: string, text: string): Promise<void>;
}

async function harness(options: {
  scripts: Record<string, readonly Scenario[] | Scenario>;
  agents?: readonly Agent[];
  /** Keyed by agent id, in the shape `contextCeilings` takes: absent means unmeasured. */
  ceilings?: Record<string, number>;
  archive?: HandoffArchive;
  mock?: Partial<MockAgentRuntimeOptions>;
}): Promise<Harness> {
  const clock = new VirtualClock();
  const store = new InMemoryMessageStore();
  const agents = options.agents ?? [alice, bob];
  const prompts = new Map<string, Prompt[]>();
  const runtimes = new Map<string, MockAgentRuntime>();
  let orchestrator: Orchestrator;

  for (const agent of agents) {
    const script = options.scripts[agent.id] ?? scenario('quiet').say('ok').end();
    const runtime = new MockAgentRuntime({
      agentId: agent.id,
      clock,
      startupMs: 0,
      peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
      ...options.mock,
      script: (prompt, turnIndex) => {
        const seen = prompts.get(agent.id) ?? [];
        seen.push(prompt);
        prompts.set(agent.id, seen);
        if (Array.isArray(script)) {
          const list = script as readonly Scenario[];
          return list[Math.min(turnIndex, list.length - 1)] as Scenario;
        }
        return script as Scenario;
      },
    });
    runtimes.set(agent.id, runtime);
  }

  const archived: HandoffRecord[] = [];
  orchestrator = new Orchestrator({
    team,
    agents,
    runtimes: runtimes as ReadonlyMap<string, AgentRuntime>,
    store,
    clock,
    contextCeilings: new Map(Object.entries(options.ceilings ?? {})),
    handoffs: options.archive ?? {
      async write(record) {
        archived.push(record);
        return `/handoffs/${record.agentId}-${record.at}.md`;
      },
    },
  });

  const events: AgentEvent[] = [];
  orchestrator.onEvent((event) => events.push(event));
  const compactions: Compacted[] = [];
  orchestrator.onCompaction((compacted) => compactions.push(compacted));

  const starting = orchestrator.start();
  await clock.runAll();
  await starting;

  return {
    orchestrator,
    clock,
    events,
    compactions,
    archived,
    prompts,
    runtimes,
    compacted: () =>
      events.filter((event): event is ContextCompacted => event.type === 'context_compacted'),
    async run(agentId, text) {
      const done = orchestrator.promptFromUser([agentId], text);
      await clock.runAll();
      await orchestrator.settled();
      await done;
    },
  };
}

/** A turn that leaves the gauge wherever the caller wants it, and ends the ordinary way. */
function fillsTo(used: number, said = 'done'): Scenario {
  return scenario('fills').usage(used).say(said).end();
}

describe('the threshold', () => {
  it('is measured against the working ceiling and not the advertised window', () => {
    // 110,000 of a 200,000 window is 55%, a gauge with room to spare on it. Against the
    // ceiling a 200,000 window actually gets — 120,000 — it is 92%, and past the moment worth
    // choosing. Ticket 09's two denominators, and the reason this fires on the right one.
    expect(overCompactionThreshold(110_000, 200_000)).toBe(false);
    expect(overCompactionThreshold(110_000, CEILING)).toBe(true);
  });

  it('says no when nothing reported a window, rather than guessing one', () => {
    expect(overCompactionThreshold(500_000, 0)).toBe(false);
  });

  it('leaves room under the ceiling for the handoff turn itself', () => {
    // The handoff is the most expensive turn available and the one most likely to stop for
    // want of room. Firing at the ceiling would mean asking for it with nowhere to write it.
    expect(COMPACTION_TRIGGER).toBeLessThan(1);
    expect(overCompactionThreshold(CEILING - 1, CEILING)).toBe(true);
    expect(overCompactionThreshold(Math.floor(CEILING * 0.5), CEILING)).toBe(false);
  });
});

describe('a session that fills up', () => {
  it('asks the agent for a handoff and starts it again, carrying what it wrote', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff')
            .say('I am migrating the old call sites. Four left, all in checkout.')
            .end(),
          scenario('resumed').say('Read it.').end(),
        ],
      },
    });
    const before = h.runtimes.get(alice.id)?.sessionId;
    await h.run(alice.id, 'Migrate the call sites.');

    const [compacted] = h.compacted();
    expect(compacted?.how).toBe('handoff');
    // The reading the fill-up left behind, plus whatever the turn itself cost. Asserted as a
    // floor rather than exactly: what matters is that the decision was taken against the last
    // *real* reading, and a cancelled turn's `used: 0` never becomes one.
    expect(compacted?.used).toBeGreaterThanOrEqual(110_000);
    expect(compacted?.ceiling).toBe(CEILING);
    // Nobody measured the mock's model, so the ceiling is blobot's own estimate and the line
    // the user reads has to be able to say so.
    expect(compacted?.measured).toBe(false);
    expect(compacted?.handoff).toContain('Four left');

    // The session is genuinely a different one, which is the whole of what a restart buys.
    expect(h.runtimes.get(alice.id)?.sessionId).not.toBe(before);

    // And the handoff was asked for in blobot's own words, not the user's.
    const asked = h.prompts.get(alice.id) ?? [];
    expect(asked.some((prompt) => prompt.text === HANDOFF_PROMPT)).toBe(true);
    // A peer, never the user: an agent that reads this as an operator instruction answers the
    // operator with it.
    expect(asked.find((prompt) => prompt.text === HANDOFF_PROMPT)?.from).toBe('peer');
  });

  it('opens the fresh session with the handoff itself, never a path to it', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites; four left in checkout.').end(),
          scenario('resumed').say('Read it.').end(),
        ],
      },
    });
    await h.run(alice.id, 'Migrate the call sites.');

    const asked = h.prompts.get(alice.id) ?? [];
    const resumed = asked.at(-1);
    expect(resumed?.text).toContain('four left in checkout');
    // ADR-0004's rule, applied here: a path handed to an agent is an ungated read outside its
    // own workspace, because `Read` never prompts.
    expect(resumed?.text).not.toContain('/handoffs/');
  });

  it('archives the note where a person can read it, outside every workspace', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites; four left.').end(),
          scenario('resumed').say('Read it.').end(),
        ],
      },
    });
    await h.run(alice.id, 'Migrate the call sites.');

    expect(h.archived).toHaveLength(1);
    expect(h.archived[0]?.agentName).toBe('Alice');
    expect(h.archived[0]?.handoff).toContain('four left');
    expect(h.compacted()[0]?.handoffPath).toContain('/handoffs/');
  });

  it('never reaches for the runtime’s own compaction, whatever the session advertises', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites; four left.').end(),
          scenario('resumed').say('Read it.').end(),
        ],
      },
    });
    await h.run(alice.id, 'Migrate the call sites.');

    // Reversed by the author 2026-08-30 after watching a real agent compact itself and come
    // back having lost too much. `/compact` stays in the palette for a person to type; it is
    // not something blobot reaches for on their behalf.
    const asked = h.prompts.get(alice.id) ?? [];
    expect(asked.some((prompt) => prompt.text.startsWith('/compact'))).toBe(false);
    expect(h.compacted().map((event) => event.how)).toEqual(['handoff']);
  });
});

describe('a refusal to restart', () => {
  it('keeps the live session when the handoff turn stops for want of room', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          // The exact hazard the margin exists for: asked for a handoff at maximum occupancy,
          // the agent stops mid-sentence. A truncated handoff plus a discarded session is
          // worse than either alone.
          scenario('cut off').say('I am migrating the old call').end('max_tokens'),
        ],
      },
    });
    const before = h.runtimes.get(alice.id)?.sessionId;
    await h.run(alice.id, 'Migrate the call sites.');

    const [compacted] = h.compacted();
    expect(compacted?.how).toBe('refused');
    expect(compacted?.reason).toContain('the session was kept');
    expect(h.runtimes.get(alice.id)?.sessionId).toBe(before);
    expect(h.archived).toHaveLength(0);
  });

  it('keeps the live session when the agent writes nothing', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [scenarios['fills-up-and-keeps-going'], scenario('silent').end()],
      },
    });
    const before = h.runtimes.get(alice.id)?.sessionId;
    await h.run(alice.id, 'Migrate the call sites.');

    expect(h.compacted()[0]?.how).toBe('refused');
    expect(h.runtimes.get(alice.id)?.sessionId).toBe(before);
  });

  it('refuses a handoff that is itself a transcript, rather than truncating it', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('everything').say('x'.repeat(HANDOFF_LIMIT + 1)).end(),
        ],
      },
    });
    const before = h.runtimes.get(alice.id)?.sessionId;
    await h.run(alice.id, 'Migrate the call sites.');

    expect(h.compacted()[0]?.how).toBe('refused');
    expect(h.compacted()[0]?.reason).toContain('characters');
    expect(h.runtimes.get(alice.id)?.sessionId).toBe(before);
  });

  it('says so when the fresh session could not be opened', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites; four left.').end(),
        ],
      },
      mock: { restartFailure: 'the bridge is gone' },
    });
    await h.run(alice.id, 'Migrate the call sites.');

    expect(h.compacted()[0]?.how).toBe('refused');
    expect(h.compacted()[0]?.reason).toContain('fresh session could not be opened');
  });
});

describe('what the user chose', () => {
  it('leaves an agent entirely alone when compaction is off for it', async () => {
    const off: Agent = { ...alice, compaction: 'off' };
    const h = await harness({
      agents: [off, bob],
      scripts: { [off.id]: scenarios['fills-up-and-keeps-going'] },
    });
    const before = h.runtimes.get(off.id)?.sessionId;
    await h.run(off.id, 'Migrate the call sites.');

    expect(h.compacted()).toEqual([]);
    expect(h.runtimes.get(off.id)?.sessionId).toBe(before);
    // Not even asked, which is the difference between off and refused: nothing was spent.
    expect((h.prompts.get(off.id) ?? []).some((p) => p.text === HANDOFF_PROMPT)).toBe(false);
  });

  it('is per agent, so a full Alice says nothing about Bob', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites.').end(),
          scenario('resumed').say('Read it.').end(),
        ],
        [bob.id]: fillsTo(4_000),
      },
    });
    const bobsSession = h.runtimes.get(bob.id)?.sessionId;
    await h.run(alice.id, 'Migrate the call sites.');
    await h.run(bob.id, 'Anything to add?');

    expect(h.compacted().map((event) => event.agentId)).toEqual([alice.id]);
    expect(h.runtimes.get(bob.id)?.sessionId).toBe(bobsSession);
  });
});

describe('a measured ceiling', () => {
  it('is used where one exists, and says that a person established it', async () => {
    const h = await harness({
      // A model somebody looked at, whose usable part is well under the window it advertises.
      ceilings: { [alice.id]: 150_000 },
      scripts: {
        [alice.id]: [
          fillsTo(130_000),
          scenario('handoff').say('Migrating call sites.').end(),
          scenario('resumed').say('Read it.').end(),
        ],
      },
    });
    await h.run(alice.id, 'Migrate the call sites.');

    const [compacted] = h.compacted();
    expect(compacted?.ceiling).toBe(150_000);
    // The flag ticket 09 carried through for exactly this: restarting a session off a guess is
    // a stronger claim than drawing that guess on a gauge, and the line separates the two.
    expect(compacted?.measured).toBe(true);
  });
});

describe('a ceiling the user moves while the team is up', () => {
  it('is used by the next turn, because a threshold is not a session parameter', async () => {
    const h = await harness({
      // Nothing established for this model, so the fallback applies: 120,000 of the 200,000
      // window, and a handoff asked for at 96,000. 90,000 is under that and stays put.
      scripts: {
        [alice.id]: [
          fillsTo(90_000),
          fillsTo(90_000),
          scenario('handoff').say('Migrating call sites.').end(),
          scenario('resumed').say('Read it.').end(),
        ],
      },
    });
    await h.run(alice.id, 'Migrate the call sites.');
    expect(h.compacted()).toHaveLength(0);

    // The user watches this model go vague sooner than blobot assumed, and says so. No restart
    // is owed: the model, the trust level and the persona are handed over at `session/new`, and
    // this is a number compared against after every turn.
    h.orchestrator.setContextCeiling(alice.id, 100_000);
    await h.run(alice.id, 'Carry on.');

    const [compacted] = h.compacted();
    expect(compacted?.ceiling).toBe(100_000);
    expect(compacted?.measured).toBe(true);
  });

  it('puts an agent back on the fallback when the user takes their number away', async () => {
    const h = await harness({
      // 90,000 is past 80% of this one and under 80% of the fallback, so the two answers differ
      // and the test is about which one is live rather than about arithmetic.
      ceilings: { [alice.id]: 100_000 },
      scripts: { [alice.id]: [fillsTo(90_000), fillsTo(90_000)] },
    });
    h.orchestrator.setContextCeiling(alice.id, undefined);
    await h.run(alice.id, 'Migrate the call sites.');
    expect(h.compacted()).toHaveLength(0);
  });
});

describe('the mailbox across a restart', () => {
  it('delivers a message that arrived during the compaction to the fresh session', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites; four left.').end(),
          scenario('resumed').say('Read it.').end(),
          scenario('answers').say('Yes, the checkout one is done.').end(),
        ],
        [bob.id]: scenario('asks')
          .messageAgent('Alice', 'How far did you get on the call sites?')
          .end(),
      },
    });
    await h.run(bob.id, 'Ask Alice where she is.');
    await h.run(alice.id, 'Migrate the call sites.');

    // The mailbox is the orchestrator's, so a session boundary is invisible to it: Alice
    // answers Bob after coming back, on a session that never saw the message arrive.
    expect(h.compacted()[0]?.how).toBe('handoff');
    const asked = h.prompts.get(alice.id) ?? [];
    expect(asked.some((prompt) => prompt.text.includes('How far did you get'))).toBe(true);
  });
});

describe('the turn budget', () => {
  it('does not charge the user for turns blobot asked for', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites.').end(),
          scenario('resumed').say('Read it.').end(),
        ],
      },
    });
    await h.run(alice.id, 'Migrate the call sites.');

    // One turn is what the user asked for. The handoff and the resume are blobot's, and
    // charging them would halt a team for asking *continue?* about work nobody requested.
    expect(h.orchestrator.turnsThisPrompt).toBe(1);
    expect(h.compacted()[0]?.how).toBe('handoff');
  });
});

describe('a prompt that arrives while blobot is compacting', () => {
  it('is queued and answered, not refused by the adapter', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites; four left in checkout.').end(),
          scenario('resumed').say('Read it.').end(),
          scenario('answers').say('Yes, the checkout ones are next.').end(),
        ],
      },
    });

    // Sent without awaiting the first prompt, which is what a person does: the turn they were
    // watching ended, so they typed the next thing. Blobot had quietly started a compaction.
    const first = h.orchestrator.promptFromUser([alice.id], 'Migrate the call sites.');
    await h.clock.runAll();
    const second = h.orchestrator.promptFromUser([alice.id], 'How far did you get?');
    await h.clock.runAll();
    await h.orchestrator.settled();
    await first;
    await second;

    // It used to throw here — "a turn is already in flight" — leaving a committed, delivered
    // message in the transcript with nothing left that would ever answer it.
    const asked = h.prompts.get(alice.id) ?? [];
    expect(asked.some((prompt) => prompt.text.includes('How far did you get?'))).toBe(true);
    expect(h.compacted()[0]?.how).toBe('handoff');
  });

  it('leaves it in the mailbox rather than marking it delivered and losing it', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenario('working').say('On it.').end(),
          scenario('answers').say('And the fixtures are done too.').end(),
        ],
      },
    });
    // Two prompts with nothing between them, so the second lands while the first holds the
    // session. That is the general case; a compaction turn is just the one blobot starts.
    const first = h.orchestrator.promptFromUser([alice.id], 'Migrate the call sites.');
    const second = h.orchestrator.promptFromUser([alice.id], 'And the fixtures?');

    // Undelivered while somebody holds the session, which is what makes the turn's own tail
    // pick it up. Marking it delivered and then failing to run a turn is how it was lost.
    expect(h.orchestrator.mailbox(alice.id).map((message) => message.body)).toEqual([
      'And the fixtures?',
    ]);

    await h.clock.runAll();
    await h.orchestrator.settled();
    await first;
    await second;

    expect(h.orchestrator.mailbox(alice.id)).toEqual([]);
    const asked = h.prompts.get(alice.id) ?? [];
    expect(asked.some((prompt) => prompt.text.includes('And the fixtures?'))).toBe(true);
  });

  it('does not start a compaction on an agent that is already holding a turn', async () => {
    const h = await harness({
      scripts: {
        [alice.id]: [
          scenarios['fills-up-and-keeps-going'],
          scenario('handoff').say('Migrating call sites.').end(),
          scenario('resumed').say('Read it.').end(),
        ],
      },
    });
    const first = h.orchestrator.promptFromUser([alice.id], 'Migrate the call sites.');
    await h.clock.runAll();
    await h.orchestrator.settled();
    await first;

    // Exactly one, however many turns ran: the guard means a second decision cannot land on
    // top of the first one's own turns.
    expect(h.compacted()).toHaveLength(1);
  });
});
