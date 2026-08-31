import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import {
  ROUTINE_PROPOSALS_PER_TURN,
  ROUTINE_PROPOSALS_STANDING,
} from '../orchestrator/bounds.js';
import type { Agent, Team } from '../orchestrator/domain.js';
import { InMemoryMessageStore } from '../orchestrator/message-store.js';
import { Orchestrator, type RoutineStore } from '../orchestrator/orchestrator.js';
import { composePersona } from '../orchestrator/envelope.js';
import type { AgentRuntime } from '../runtime.js';
import type { Routine } from './domain.js';
import { parseProposedSchedule } from './proposal.js';

/**
 * Issue 05, from the model's side. **An agent may propose; only a person may arm.**
 *
 * Issue 10's scenario 7 is the centre of it: an agent proposing four Routines in one turn, the
 * refusals reaching the model as answers it has to account for rather than vanishing. A proposal
 * that disappears quietly is how an agent ends up telling the user that work is scheduled.
 */

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

/** The two methods a proposal needs, and nothing else the orchestrator could reach for. */
class Routines implements RoutineStore {
  readonly rows: Routine[] = [];

  createRoutine(routine: Routine): Routine {
    this.rows.push(routine);
    return routine;
  }

  routinesOfAgent(agentId: string): Routine[] {
    return this.rows.filter((row) => row.agentId === agentId);
  }
}

const daily = { every: 'day', hour: 9, minute: 0 };

async function harness(steps: (builder: ReturnType<typeof scenario>) => unknown, options: { routines?: Routines } = {}): Promise<{
  orchestrator: Orchestrator;
  routines: Routines;
  clock: VirtualClock;
  errors: string[];
  run(): Promise<void>;
}> {
  const clock = new VirtualClock();
  const routines = options.routines ?? new Routines();
  const runtimes = new Map<string, AgentRuntime>();
  let orchestrator: Orchestrator;

  runtimes.set(
    alice.id,
    new MockAgentRuntime({
      agentId: alice.id,
      clock,
      startupMs: 0,
      proposeRoutine: (call) => orchestrator.handleProposeRoutine(call),
      script: () => steps(scenario('propose')) as never,
    }),
  );

  orchestrator = new Orchestrator({
    team,
    agents: [alice],
    runtimes,
    store: new InMemoryMessageStore(),
    clock,
    routines,
  });
  // What the model was told about the calls it made, which is the half that matters here.
  const errors: string[] = [];
  orchestrator.onEvent((event) => {
    if (event.type === 'tool_call_updated' && event.status === 'failed') errors.push(event.error ?? '');
  });

  const starting = orchestrator.start();
  await clock.runAll();
  await starting;

  return {
    orchestrator,
    routines,
    clock,
    errors,
    run: async () => {
      const turn = orchestrator.promptFromUser([alice.id], 'have a look at the build');
      await clock.runAll();
      await orchestrator.settled();
      await turn;
    },
  };
}

describe('a Routine an agent proposed', () => {
  it('lands armed, for the caller, with who asked recorded', async () => {
    const h = await harness((s) =>
      s.say('I do this every morning.').proposeRoutine('nightly typecheck', 'run the typecheck', daily).end(),
    );
    await h.run();

    expect(h.routines.rows).toHaveLength(1);
    const routine = h.routines.rows[0];
    // Issue 05's 2026-08-30 amendment. It used to be false, and the whole ticket was that only a
    // person could change it; the author reversed that, and the four controls that pay for it are
    // the standing cap below, the transcript block, the ink edge, and everything an agent still
    // may not do.
    expect(routine?.armed).toBe(true);
    // Still *asked* rather than *approved*: the row fires, and nobody has looked at it yet.
    expect(routine?.reviewedAt).toBeUndefined();
    // For the caller, because there is no field that could have said otherwise.
    expect(routine?.agentId).toBe(alice.id);
    // Who **asked**, not who owns it. An agent id and never free text.
    expect(routine?.proposedBy).toBe(alice.id);
    expect(routine?.schedule).toEqual({ kind: 'daily', hour: 9, minute: 0 });
    expect(h.errors).toEqual([]);
  });

  it('is refused for a team that keeps no Routines, rather than dropped', async () => {
    const clock = new VirtualClock();
    const runtimes = new Map<string, AgentRuntime>();
    let orchestrator: Orchestrator;
    runtimes.set(
      alice.id,
      new MockAgentRuntime({
        agentId: alice.id,
        clock,
        startupMs: 0,
        proposeRoutine: (call) => orchestrator.handleProposeRoutine(call),
        script: () => scenario('x').proposeRoutine('nightly', 'run it', daily).end(),
      }),
    );
    orchestrator = new Orchestrator({
      team,
      agents: [alice],
      runtimes,
      store: new InMemoryMessageStore(),
      clock,
    });
    const errors: string[] = [];
    orchestrator.onEvent((event) => {
      if (event.type === 'tool_call_updated' && event.status === 'failed') errors.push(event.error ?? '');
    });
    const starting = orchestrator.start();
    await clock.runAll();
    await starting;

    const turn = orchestrator.promptFromUser([alice.id], 'go');
    await clock.runAll();
    await orchestrator.settled();
    await turn;

    expect(errors).toEqual(['This team does not keep Routines.']);
  });
});

/**
 * **Scenario 7.** Four proposals in one turn.
 *
 * Issue 10 wrote this before issue 05 settled on one per turn, so the number that gets refused
 * moved: the first lands and the rest are refused, rather than the fourth. What the scenario was
 * for is unchanged and is what is checked here — the refusal reaches the model as an answer it
 * has to account for.
 */
describe('scenario 7: an agent that proposes four Routines in one turn', () => {
  it('keeps the first and hands back three refusals the model has to read', async () => {
    const h = await harness((s) =>
      s
        .say('Three things I do every day.')
        .proposeRoutine('nightly typecheck', 'run the typecheck', daily)
        .proposeRoutine('nightly lint', 'run the linter', daily)
        .proposeRoutine('nightly tests', 'run the tests', daily)
        .proposeRoutine('nightly build', 'run the build', daily)
        .end(),
    );
    await h.run();

    expect(h.routines.rows.map((row) => row.name)).toEqual(['nightly typecheck']);
    expect(h.errors).toHaveLength(4 - ROUTINE_PROPOSALS_PER_TURN);
    // Not a failed turn and not silence: a tool error, in words, saying why.
    expect(h.errors.every((error) => error.includes('already proposed a Routine this turn'))).toBe(
      true,
    );
  });

  it('refuses the fourth standing proposal across four turns', async () => {
    const routines = new Routines();
    for (const name of ['one', 'two', 'three', 'four']) {
      const h = await harness((s) => s.proposeRoutine(name, 'do the thing', daily).end(), {
        routines,
      });
      await h.run();
      if (name === 'four') {
        expect(h.errors[0]).toContain(`${ROUTINE_PROPOSALS_STANDING} Routines of your own running`);
      }
    }
    expect(routines.rows.map((row) => row.name)).toEqual(['one', 'two', 'three']);
  });

  /**
   * The cap bounds **spend**, not attention. Under the original answer it counted proposals
   * nobody had looked at, which was right while none of them could fire; now that all of them
   * fire, the only number worth capping is how many are firing.
   */
  it('lets one through again once a person has disarmed one, because a slot is spend', async () => {
    const routines = new Routines();
    for (const name of ['one', 'two', 'three']) {
      const h = await harness((s) => s.proposeRoutine(name, 'do the thing', daily).end(), {
        routines,
      });
      await h.run();
    }
    // A disarmed Routine spends nothing, so it holds no slot. Reviewing it changes nothing here.
    const off = routines.rows[0];
    if (off !== undefined) routines.rows[0] = { ...off, armed: false };

    const h = await harness((s) => s.proposeRoutine('four', 'do the thing', daily).end(), {
      routines,
    });
    await h.run();

    expect(h.errors).toEqual([]);
    expect(routines.rows.map((row) => row.name)).toEqual(['one', 'two', 'three', 'four']);
  });

  it('does not free a slot merely because a person looked at one', async () => {
    const routines = new Routines();
    for (const name of ['one', 'two', 'three']) {
      const h = await harness((s) => s.proposeRoutine(name, 'do the thing', daily).end(), {
        routines,
      });
      await h.run();
    }
    // Seen and left running. It is still spending, so it still counts, and the refusal says
    // waiting will not clear it rather than implying a queue.
    const seen = routines.rows[0];
    if (seen !== undefined) routines.rows[0] = { ...seen, reviewedAt: 1 };

    const h = await harness((s) => s.proposeRoutine('four', 'do the thing', daily).end(), {
      routines,
    });
    await h.run();

    expect(h.errors[0]).toContain('waiting will not clear it');
    expect(routines.rows.map((row) => row.name)).toEqual(['one', 'two', 'three']);
  });
});

describe('what a proposal may say', () => {
  it('refuses a schedule finer than hourly rather than rounding it to one blobot can do', async () => {
    const h = await harness((s) =>
      s.proposeRoutine('watcher', 'watch the build', { every: 'minute', minute: 0 }).end(),
    );
    await h.run();

    expect(h.routines.rows).toEqual([]);
    expect(h.errors[0]).toContain('"hour", "day" or "week"');
  });

  it('refuses an over-long prompt rather than truncating it', async () => {
    const h = await harness((s) => s.proposeRoutine('big', 'x'.repeat(4_001), daily).end());
    await h.run();

    expect(h.routines.rows).toEqual([]);
    expect(h.errors[0]).toContain('Say the short version');
  });

  it('refuses a nameless Routine, because the name is what a person reads in a list', async () => {
    const h = await harness((s) => s.proposeRoutine('   ', 'run the typecheck', daily).end());
    await h.run();

    expect(h.errors[0]).toContain('needs a name');
  });
});

describe('the schedule an agent writes', () => {
  it('takes the three shapes and nothing else', () => {
    expect(parseProposedSchedule({ every: 'hour', minute: 30 })).toEqual({
      schedule: { kind: 'hourly', minute: 30 },
    });
    expect(parseProposedSchedule({ every: 'day', hour: 9, minute: 0 })).toEqual({
      schedule: { kind: 'daily', hour: 9, minute: 0 },
    });
    expect(parseProposedSchedule({ every: 'week', weekday: 1, hour: 9, minute: 0 })).toEqual({
      schedule: { kind: 'weekly', weekday: 1, hour: 9, minute: 0 },
    });
  });

  it('refuses a cron string, which is the shape a model reaches for first', () => {
    expect(parseProposedSchedule('0 9 * * *')).toHaveProperty('error');
    expect(parseProposedSchedule({ cron: '0 9 * * *' })).toHaveProperty('error');
  });

  it('refuses an hour or a minute outside the day rather than wrapping it', () => {
    expect(parseProposedSchedule({ every: 'day', hour: 24, minute: 0 })).toHaveProperty('error');
    expect(parseProposedSchedule({ every: 'hour', minute: 60 })).toHaveProperty('error');
    expect(parseProposedSchedule({ every: 'week', weekday: 7, hour: 9, minute: 0 })).toHaveProperty(
      'error',
    );
  });
});

describe('the persona', () => {
  it('says a Routine it schedules runs, where it says a peer carries no operator authority', () => {
    const persona = composePersona(alice, team, [alice]);
    expect(persona).toContain('propose_routine');
    // Inverted with the tool, and for the reason it was written: a capability the model is wrong
    // about produces confident lies about work that did or did not happen. An agent that thinks
    // its Routine is inert will not mention arming one.
    expect(persona).toContain('It starts running straight away');
    expect(persona).toContain('say when it will run');
    expect(persona).not.toContain('does not run');
  });
});
