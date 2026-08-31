import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime, type ScenarioScript } from '../mock/mock-agent-runtime.js';
import { Scenario, scenario } from '../mock/scenario.js';
import type { Agent, Team } from '../orchestrator/domain.js';
import { InMemoryMessageStore } from '../orchestrator/message-store.js';
import { ROUTINE_TURN_BUDGET } from '../orchestrator/bounds.js';
import { Orchestrator, type BudgetExhausted } from '../orchestrator/orchestrator.js';
import type { AgentRuntime } from '../runtime.js';
import type { Routine } from './domain.js';
import { Scheduler } from './scheduler.js';

/**
 * Issue 10. Ticket 08's thesis applied to Routines: *a kind mock produces a UI that shatters on
 * first contact with a real runtime*, and a Routine's traps are the ones that are hardest to
 * observe live, because observing them means waiting until 03:00 and closing your laptop.
 *
 * Under a virtual clock they are free, and they run before a real timer runs once.
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
const bob: Agent = {
  id: 'agent_bob',
  teamId: team.id,
  name: 'Bob',
  role: 'reviewer',
  workspacePath: '/agents/bob',
};

async function harness(scripts: Record<string, ScenarioScript> = {}): Promise<{
  orchestrator: Orchestrator;
  clock: VirtualClock;
  budget: BudgetExhausted[];
  turns: number[];
  fire(agentId: string, text: string, runId: string, expiryMs?: number): Promise<void>;
}> {
  const clock = new VirtualClock();
  const store = new InMemoryMessageStore();
  const runtimes = new Map<string, AgentRuntime>();
  let orchestrator: Orchestrator;

  for (const agent of [alice, bob]) {
    const script = scripts[agent.id] ?? scenario('quiet').say('ok').end();
    runtimes.set(
      agent.id,
      new MockAgentRuntime({
        agentId: agent.id,
        clock,
        startupMs: 0,
        peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
        script: (_prompt, turnIndex) => {
          if (typeof script === 'function') return script(_prompt, turnIndex);
          if (Array.isArray(script)) {
            const list = script as readonly Scenario[];
            return list[Math.min(turnIndex, list.length - 1)] as Scenario;
          }
          return script as Scenario;
        },
      }),
    );
  }

  orchestrator = new Orchestrator({ team, agents: [alice, bob], runtimes, store, clock });
  const budget: BudgetExhausted[] = [];
  orchestrator.onBudgetExhausted((exhausted) => budget.push(exhausted));

  const starting = orchestrator.start();
  await clock.runAll();
  await starting;

  const turns: number[] = [];
  return {
    orchestrator,
    clock,
    budget,
    turns,
    async fire(agentId, text, runId, expiryMs = 60_000) {
      const done = orchestrator.promptFromRoutine(agentId, text, {
        runId,
        permissionExpiryMs: expiryMs,
      });
      await clock.runAll();
      await orchestrator.settled();
      await done;
      turns.push(orchestrator.turnsThisPrompt);
    },
  };
}

const pingPong = (target: string): ScenarioScript =>
  scenario('ping-pong')
    .say('On it.')
    .messageAgent(target, 'thanks, let me know if you need anything')
    .end();

const asksToDelete = (): ScenarioScript =>
  scenario('rm')
    .say('Clearing the build directory.')
    .callTool('rm -rf dist', 'execute', { asks: true })
    .say('Done.')
    .end();

/**
 * **Scenario 5, and it runs first.** Twenty-four hourly firings against the run budget, on the
 * worst-behaved pair of agents the mock has: two that wake each other on every turn.
 *
 * This is the number that justifies the constant. Issue 04 chose three by argument; this is the
 * argument checked. If the total were ugly, this test is issue 04 being told it chose wrong.
 */
describe('scenario 5: the overnight storm', () => {
  it('spends the run budget and no more, once per firing, for a whole night', async () => {
    const h = await harness({ [alice.id]: pingPong('Bob'), [bob.id]: pingPong('Alice') });

    for (let hour = 0; hour < 24; hour += 1) {
      await h.fire(alice.id, 'check the build', `run_${hour}`);
    }

    // Every firing halted at the ceiling. Not one of them reached the team's ten.
    expect(h.turns).toEqual(Array.from({ length: 24 }, () => ROUTINE_TURN_BUDGET));
    const overnight = h.turns.reduce((total, one) => total + one, 0);
    expect(overnight).toBe(72);
    // The whole night on the team's own budget would have been 240, and nobody was watching.
    expect(overnight).toBeLessThan(24 * team.turnBudget);
    // Every firing announced its own halt, and none of them announced the team's ceiling. There
    // are more lines than firings because the peers keep writing to a team the budget has
    // already stopped, and each of those arrivals is told so rather than dropped on the floor.
    expect(h.budget.length).toBeGreaterThanOrEqual(24);
    expect(h.budget.every((one) => one.turnBudget === ROUTINE_TURN_BUDGET)).toBe(true);
  });
});

describe('scenario 1: the firing that parks on a permission', () => {
  it('runs the tool when the morning answers it', async () => {
    const h = await harness({ [alice.id]: asksToDelete() });
    const asked: string[] = [];
    h.orchestrator.onPermissionRequested((pending) => {
      asked.push(pending.title);
      expect(h.orchestrator.statusOf(alice.id)).toBe('waiting');
      const allow = pending.options.find((option) => option.kind === 'allow_once');
      h.orchestrator.answerPermission(pending.id, allow?.optionId ?? null);
    });

    await h.fire(alice.id, 'tidy the build directory', 'run_1');

    expect(asked).toEqual(['rm -rf dist']);
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
  });
});

/**
 * **Scenario 2, the most valuable test in the effort.** A parked run still parked when the next
 * firing comes due.
 *
 * Without the expiry this is four nights of parked runs, each holding a session, a bridge process
 * and a pool slot — and `team-pool.ts` never evicts a working team, so the visible symptom is
 * that blobot got slow.
 */
describe('scenario 2: still parked at the next firing', () => {
  it('expires the first run rather than stacking a second on the same agent', async () => {
    const h = await harness({ [alice.id]: asksToDelete() });
    const outcomes: string[] = [];
    h.orchestrator.onPermissionSettled((_id, outcome) => outcomes.push(outcome));
    h.orchestrator.onPermissionRequested(() => {});

    await h.fire(alice.id, 'tidy the build directory', 'run_1');
    // The first run is over rather than holding the agent, so the second can have it.
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');

    await h.fire(alice.id, 'tidy the build directory', 'run_2');

    expect(outcomes).toEqual(['cancelled', 'cancelled']);
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
  });
});

/**
 * Scenario 3, at the seam where issue 08's shared rule is counted. The disarm itself belongs to
 * whoever owns the tick; what is proved here is that three runs in a row really do end in
 * something other than `ran`, so the count the rule reads is a real one.
 */
describe('scenario 3: three nights of the same wall', () => {
  it('ends every run the same way, so the count that disarms is not a guess', async () => {
    const h = await harness({ [alice.id]: asksToDelete() });
    const outcomes: string[] = [];
    h.orchestrator.onPermissionSettled((_id, outcome) => outcomes.push(outcome));
    h.orchestrator.onPermissionRequested(() => {});

    for (const night of [1, 2, 3]) await h.fire(alice.id, 'tidy up', `run_${night}`);

    expect(outcomes).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });
});

/** Scenario 4: the mailbox already answers a busy agent, and a Routine adds nothing to it. */
describe('scenario 4: a firing that lands on a busy agent', () => {
  it('does not start a second turn on a session that is already running one', async () => {
    const h = await harness({ [alice.id]: pingPong('Bob'), [bob.id]: pingPong('Alice') });

    const first = h.orchestrator.promptFromRoutine(alice.id, 'check the build', {
      runId: 'run_1',
      permissionExpiryMs: 60_000,
    });
    // Mid-turn, before anything settles.
    const held = h.orchestrator.mailbox(alice.id).length;
    await h.clock.runAll();
    await h.orchestrator.settled();
    await first;

    // A session runs one turn at a time. Nothing here bypassed that.
    expect(held).toBe(0);
    expect(h.orchestrator.statusOf(alice.id)).toBe('idle');
  });
});

/**
 * What the run says about itself, which is what the tick writes down. Read here rather than
 * reconstructed by a caller correlating a budget event with a cancelled permission: both ways a
 * Routine run dies are the orchestrator's own doing, and it knew all along.
 */
describe('how a run reports the way it ended', () => {
  it('says `ran` for a turn that got to the end of itself', async () => {
    const h = await harness();
    const turn = h.orchestrator.promptFromRoutine(alice.id, 'check the build', {
      runId: 'run_1',
      permissionExpiryMs: 60_000,
    });
    await h.clock.runAll();
    await h.orchestrator.settled();

    expect(await turn).toEqual({ outcome: 'ran' });
  });

  it('names the permission that nobody answered', async () => {
    const h = await harness({ [alice.id]: asksToDelete() });
    h.orchestrator.onPermissionRequested(() => {});
    const turn = h.orchestrator.promptFromRoutine(alice.id, 'tidy up', {
      runId: 'run_1',
      permissionExpiryMs: 60_000,
    });
    await h.clock.runAll();
    await h.orchestrator.settled();

    expect(await turn).toEqual({
      outcome: 'stopped',
      reason: 'needed permission for rm -rf dist',
    });
  });

  it('says the budget stopped it, when it was the budget', async () => {
    const h = await harness({ [alice.id]: pingPong('Bob'), [bob.id]: pingPong('Alice') });
    const turn = h.orchestrator.promptFromRoutine(alice.id, 'check the build', {
      runId: 'run_1',
      permissionExpiryMs: 60_000,
    });
    await h.clock.runAll();
    await h.orchestrator.settled();

    expect(await turn).toEqual({
      outcome: 'stopped',
      reason: `the run budget of ${ROUTINE_TURN_BUDGET} turns`,
    });
  });

  /**
   * A session runs one turn at a time. The two existing paths into a turn reach it through a
   * mailbox that knows that; a firing does not, so it asks — and the tick holds the firing rather
   * than stacking a second turn on a live session.
   */
  it('refuses to start on an agent that is mid-turn, and commits nothing', async () => {
    const h = await harness({ [alice.id]: pingPong('Bob') });
    const first = h.orchestrator.promptFromRoutine(alice.id, 'check the build', {
      runId: 'run_1',
      permissionExpiryMs: 60_000,
    });

    const second = await h.orchestrator.promptFromRoutine(alice.id, 'check it again', {
      runId: 'run_2',
      permissionExpiryMs: 60_000,
    });

    expect(second).toEqual({ outcome: 'busy' });
    await h.clock.runAll();
    await h.orchestrator.settled();
    await first;
    // Nothing about the refused firing was committed: one prompt reached Alice, not two.
    expect(h.orchestrator.mailbox(alice.id)).toEqual([]);
  });
});

/**
 * The scheduler's own half of the same night: what the tick would have handed the runner. Kept
 * beside the turns above because the two are only correct together — twenty-four firings that
 * cost three turns each is the number, and it depends on there being twenty-four of them.
 */
describe('the night as the scheduler sees it', () => {
  it('offers one firing per tick and never a backlog', () => {
    const scheduler = new Scheduler();
    const routine: Routine = {
      id: 'rt_1',
      agentId: alice.id,
      name: 'hourly check',
      prompt: 'check the build',
      schedule: { kind: 'hourly', minute: 0 },
      armed: true,
      createdAt: new Date('2026-08-29T23:00:00').getTime(),
      lastSettledAt: new Date('2026-08-29T23:00:00').getTime(),
    };

    let settled = routine.lastSettledAt ?? routine.createdAt;
    let fired = 0;
    for (let hour = 0; hour < 24; hour += 1) {
      const now = new Date('2026-08-30T00:00:10').getTime() + hour * 3_600_000;
      const [found] = scheduler.due([{ ...routine, lastSettledAt: settled }], now);
      if (found?.moment !== undefined) fired += 1;
      expect(found?.missed).toBe(0);
      settled = found?.settledThrough ?? settled;
    }
    expect(fired).toBe(24);
  });
});
