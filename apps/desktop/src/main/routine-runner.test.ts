import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ROUTINE_BUSY_CEILING_MS,
  ROUTINE_DISARM_AFTER,
  SqliteStore,
  VirtualClock,
  openDatabase,
  type AgentStatus,
  type OpenedDatabase,
  type Routine,
  type RoutineTurn,
  type Team,
} from '@blobot/core';
import { RoutineRunner, type RoutineHost, type RoutineTarget } from './routine-runner.js';

/**
 * Issue 10's other half: the scenarios the tick decides, where **no turn ever starts**. Scenario
 * 6 is the Workspace that vanished, three times, ending in a disarm in the reconcile's own words;
 * scenario 8 is a firing with no live window, on every platform.
 *
 * Under the same virtual clock as `core/src/routines/firing.test.ts`, and for the same reason:
 * observing these live means waiting until 03:00 and deleting a folder.
 */

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/core/migrations', import.meta.url),
);

const team: Team = {
  id: 'team_1',
  name: 'checkout',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};

/** A team that answers the two questions a firing asks of it, and remembers what it was told. */
class FakeTeam implements RoutineTarget {
  status: AgentStatus = 'idle';
  answer: RoutineTurn = { outcome: 'ran' };
  readonly prompts: { agentId: string; text: string; permissionExpiryMs: number }[] = [];
  /** Set to hold the turn open, so a second firing meets a run that has not finished. */
  hold?: Promise<void>;

  statusOf(): AgentStatus {
    return this.status;
  }

  async promptFromRoutine(
    agentId: string,
    text: string,
    run: { readonly runId: string; readonly permissionExpiryMs: number },
  ): Promise<RoutineTurn> {
    this.prompts.push({ agentId, text, permissionExpiryMs: run.permissionExpiryMs });
    if (this.hold !== undefined) await this.hold;
    return this.answer;
  }
}

class FakeHost implements RoutineHost {
  window = true;
  team: Team | undefined = team;
  live = new FakeTeam();
  /** What `open` throws instead of answering: a Workspace that moved, a runtime that is gone. */
  refusal: Error | undefined;
  readonly opened: string[] = [];
  readonly logs: string[] = [];

  hasWindow(): boolean {
    return this.window;
  }

  teamOfAgent(): Team | undefined {
    return this.team;
  }

  async open(one: Team): Promise<RoutineTarget> {
    this.opened.push(one.id);
    if (this.refusal !== undefined) throw this.refusal;
    return this.live;
  }

  onLog(line: string): void {
    this.logs.push(line);
  }
}

let opened: OpenedDatabase;
let store: SqliteStore;
let host: FakeHost;
let clock: VirtualClock;
let runner: RoutineRunner;
let ids = 0;

/** 09:00 on a Sunday, so `daily` and `weekly` both land where the test says they do. */
const nine = new Date('2026-08-30T09:00:00').getTime();

function nightly(overrides: Partial<Routine> = {}): Routine {
  const routine: Routine = {
    id: `rt_${(ids += 1)}`,
    agentId: 'agent_alice',
    name: 'nightly typecheck',
    prompt: 'run the typecheck and say what broke',
    schedule: { kind: 'daily', hour: 9, minute: 0 },
    armed: true,
    createdAt: nine - 86_400_000,
    lastSettledAt: nine - 86_400_000,
    ...overrides,
  };
  return store.createRoutine(routine);
}

/** Move the clock to a wall-clock moment, firing whatever was sleeping on the way. */
async function advanceTo(at: number): Promise<void> {
  await clock.advance(at - clock.now());
}

/** One tick at `at`, with every firing it started run to the end. */
async function tickAt(at: number): Promise<void> {
  await advanceTo(at);
  await runner.tick();
  await clock.runAll();
  await settled();
}

/** Firings run in the background, so a test waits for them rather than for the tick. */
async function settled(): Promise<void> {
  for (let attempt = 0; attempt < 50 && runner.inFlight > 0; attempt += 1) {
    await clock.runAll();
    await Promise.resolve();
  }
}

const runsOf = (routine: Routine): { outcome: string; reason?: string }[] =>
  store.routineRunsOf(routine.id).map((run) => ({
    outcome: run.outcome,
    ...(run.reason === undefined ? {} : { reason: run.reason }),
  }));

beforeEach(() => {
  opened = openDatabase({ path: ':memory:', migrationsFolder });
  store = new SqliteStore(opened.db);
  store.createTeam({ ...team, createdAt: 1 });
  store.createAgent({
    id: 'agent_alice',
    teamId: team.id,
    name: 'Alice',
    role: 'frontend',
    workspacePath: '/worktrees/alice',
    runtimeId: 'claude-code',
    createdAt: 1,
  });
  host = new FakeHost();
  clock = new VirtualClock(nine - 86_400_000);
  runner = new RoutineRunner({
    store,
    clock,
    host,
    createId: () => `run_${(ids += 1)}`,
    tickMs: 30_000,
  });
});

afterEach(() => opened.close());

describe('the ordinary firing', () => {
  it('starts the turn once, records it, and does not fire the same moment twice', async () => {
    const routine = nightly();

    await tickAt(nine + 10_000);
    await tickAt(nine + 40_000);

    expect(host.live.prompts.map((one) => one.text)).toEqual([routine.prompt]);
    expect(runsOf(routine)).toEqual([{ outcome: 'ran' }]);
    expect(store.routineById(routine.id)?.armed).toBe(true);
  });

  it('leaves a disarmed Routine alone', async () => {
    const routine = nightly({ armed: false });

    await tickAt(nine + 10_000);

    expect(host.live.prompts).toEqual([]);
    expect(runsOf(routine)).toEqual([]);
  });
});

/**
 * **Scenario 8.** A firing with no live window, on every platform.
 *
 * The tick settles nothing without one, which is what makes a macOS process that outlived its
 * last window behave exactly like a Linux app that was shut: the firings it slept through come
 * back as *missed* when a window returns, because that is what they were. A firing into a
 * destroyed window would park issue 03's permission request in front of nobody.
 */
describe('scenario 8: a firing with no live window', () => {
  it('starts nothing, and the firing is missed rather than run late', async () => {
    const routine = nightly();
    host.window = false;

    await tickAt(nine + 10_000);

    expect(host.live.prompts).toEqual([]);
    expect(runsOf(routine)).toEqual([]);

    // The window comes back an hour later. The firing is not run late: catch-up was refused in
    // every form, and `Run now` is the remedy a person presses.
    host.window = true;
    await tickAt(nine + 3_600_000);

    expect(host.live.prompts).toEqual([]);
    expect(store.routineById(routine.id)?.missedFirings).toBe(1);
    // Not a failure and not a run: a laptop that was shut is the ordinary condition.
    expect(runsOf(routine)).toEqual([]);
    expect(store.routineById(routine.id)?.armed).toBe(true);
  });

  it('does not disarm a Routine for three nights of a shut laptop', async () => {
    const routine = nightly();
    host.window = false;
    for (const night of [0, 1, 2, 3]) await tickAt(nine + night * 86_400_000 + 10_000);

    host.window = true;
    await tickAt(nine + 4 * 86_400_000 - 3_600_000);

    expect(store.routineById(routine.id)?.missedFirings).toBe(4);
    expect(store.routineById(routine.id)?.armed).toBe(true);
    expect(store.consecutiveRoutineFailures(routine.id)).toBe(0);
  });

  it('clears the missed count the next time blobot is there for a firing', async () => {
    const routine = nightly();
    host.window = false;
    await tickAt(nine + 10_000);
    host.window = true;

    await tickAt(nine + 86_400_000 + 10_000);

    expect(store.routineById(routine.id)?.missedFirings).toBeUndefined();
    expect(runsOf(routine)).toEqual([{ outcome: 'ran' }]);
  });
});

/**
 * **Scenario 6.** The Workspace that vanished, three times, ending in a disarm with the
 * reconcile's own words.
 *
 * The reason is not rephrased on its way through: a team whose folder has been moved already says
 * so instead of being called *not a git repository*, and that sentence is the one the run keeps.
 */
describe('scenario 6: the Workspace that vanished', () => {
  it('skips in the reconcile own words, and disarms on the third night', async () => {
    const routine = nightly();
    host.refusal = new Error('/repo is no longer a directory blobot can reach.');

    for (const night of [0, 1, 2]) await tickAt(nine + night * 86_400_000 + 10_000);

    expect(host.live.prompts).toEqual([]);
    expect(runsOf(routine)).toEqual(
      Array.from({ length: ROUTINE_DISARM_AFTER }, () => ({
        outcome: 'skipped',
        reason: '/repo is no longer a directory blobot can reach.',
      })),
    );
    expect(store.routineById(routine.id)?.armed).toBe(false);
    expect(host.logs.some((line) => line.includes('disarmed'))).toBe(true);

    // Disarmed is disarmed: the fourth night starts nothing and writes nothing.
    await tickAt(nine + 3 * 86_400_000 + 10_000);
    expect(runsOf(routine)).toHaveLength(ROUTINE_DISARM_AFTER);
  });

  it('does not disarm while the failures are broken up by a run', async () => {
    const routine = nightly();
    host.refusal = new Error('the folder is gone');
    await tickAt(nine + 10_000);
    host.refusal = undefined;
    await tickAt(nine + 86_400_000 + 10_000);
    host.refusal = new Error('the folder is gone');
    await tickAt(nine + 2 * 86_400_000 + 10_000);
    await tickAt(nine + 3 * 86_400_000 + 10_000);

    expect(store.routineById(routine.id)?.armed).toBe(true);
    expect(store.consecutiveRoutineFailures(routine.id)).toBe(2);
  });
});

/** A runtime that is no longer installed is refused by name, and the name is what is recorded. */
describe('a runtime that is not installed', () => {
  it('keeps the launch refusal verbatim', async () => {
    const routine = nightly();
    host.refusal = new Error('Claude Code (Alice) is not installed on this machine.');

    await tickAt(nine + 10_000);

    expect(runsOf(routine)).toEqual([
      { outcome: 'skipped', reason: 'Claude Code (Alice) is not installed on this machine.' },
    ]);
  });
});

describe('an agent that is no longer on the team', () => {
  it('disarms at once, keeps the Routine, and never picks somebody else', async () => {
    const routine = nightly();
    host.team = undefined;

    await tickAt(nine + 10_000);

    expect(host.opened).toEqual([]);
    expect(runsOf(routine)).toEqual([
      { outcome: 'skipped', reason: 'its agent is no longer on this team' },
    ]);
    // Kept, and off. One firing rather than three, because this world is not coming back.
    expect(store.routineById(routine.id)?.armed).toBe(false);
  });
});

describe('a firing that ends badly', () => {
  it('records the stop reason the run itself reported', async () => {
    const routine = nightly();
    host.live.answer = { outcome: 'stopped', reason: 'needed permission for git push' };

    await tickAt(nine + 10_000);

    expect(runsOf(routine)).toEqual([
      { outcome: 'stopped', reason: 'needed permission for git push' },
    ]);
  });

  it('leaves the crash-consistent row behind when blobot never comes back', async () => {
    const routine = nightly();
    let release: () => void = () => {};
    host.live.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    await advanceTo(nine + 10_000);
    await runner.tick();
    await Promise.resolve();

    // The turn is still going. The row is already there, saying what is true if the app dies now.
    expect(runsOf(routine)).toEqual([{ outcome: 'stopped', reason: 'the run did not finish' }]);
    release();
    await settled();
    expect(runsOf(routine)).toEqual([{ outcome: 'ran' }]);
  });
});

/**
 * A firing that lands on an agent that is mid-turn waits, because a session runs one turn at a
 * time. The second firing coalesces rather than stacking: one instruction repeated is one
 * instruction.
 */
describe('a firing that lands while the last one is still going', () => {
  it('coalesces the second firing rather than starting a second run', async () => {
    const routine = nightly({ schedule: { kind: 'hourly', minute: 0 } });
    let release: () => void = () => {};
    host.live.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    await advanceTo(nine + 10_000);
    await runner.tick();
    await Promise.resolve();
    await advanceTo(nine + 3_600_000 + 10_000);
    await runner.tick();
    await Promise.resolve();

    expect(host.live.prompts).toHaveLength(1);
    expect(runsOf(routine).map((run) => run.reason)).toContain(
      'the previous run had not finished',
    );
    release();
    await settled();
  });

  it('gives up after the busy ceiling rather than holding its own next firing forever', async () => {
    const routine = nightly();
    host.live.answer = { outcome: 'busy' };

    await advanceTo(nine + 10_000);
    await runner.tick();
    await clock.runAll();
    await settled();

    expect(runsOf(routine)).toEqual([
      { outcome: 'skipped', reason: 'the agent was busy for the whole run' },
    ]);
    // It asked more than once. A busy agent is a reason to wait, not a reason to skip.
    expect(host.live.prompts.length).toBeGreaterThan(1);
  });
});

describe('the permission expiry a run carries', () => {
  it('is the earlier of the ceiling and the Routine own next due moment', async () => {
    nightly({ schedule: { kind: 'hourly', minute: 0 } });

    await tickAt(nine + 10_000);

    // An hourly Routine comes round in an hour, and the ceiling is half of that, so the ceiling
    // wins. What matters is that neither is *forever*, which is what a user's own turn gets.
    const expiry = host.live.prompts[0]?.permissionExpiryMs ?? 0;
    expect(expiry).toBeGreaterThan(0);
    expect(expiry).toBeLessThanOrEqual(3_600_000);
  });
});

/**
 * Issue 06's second most important verb, and issue 02's whole remedy for a laptop that was shut.
 * blobot never catches up on launch, so what a missed night leaves behind is a count and this.
 */
describe('run now', () => {
  it('fires a disarmed Routine, because a Routine about to be armed is one you want to try', async () => {
    const routine = nightly({ armed: false });
    await advanceTo(nine + 10_000);

    expect(runner.runNow(routine.id)).toEqual({ ok: true });
    await settled();

    expect(host.live.prompts).toHaveLength(1);
    expect(runsOf(routine)).toEqual([{ outcome: 'ran' }]);
    // Running it by hand is not arming it. Only a person at the control does that.
    expect(store.routineById(routine.id)?.armed).toBe(false);
  });

  it('answers the missed count and leaves the schedule alone', async () => {
    const routine = nightly();
    // Four nights with the laptop shut, noticed by the tick that has a window again.
    host.window = false;
    for (const night of [0, 1, 2, 3]) await tickAt(nine + night * 86_400_000 + 10_000);
    host.window = true;
    await tickAt(nine + 4 * 86_400_000 - 3_600_000);
    expect(store.routineById(routine.id)?.missedFirings).toBe(4);
    const settledThrough = store.routineById(routine.id)?.lastSettledAt;

    runner.runNow(routine.id);
    await settled();

    // `missed 4 firings` beside a run that just happened is stale rather than informative.
    // Absent rather than zero, which is how none is stored.
    expect(store.routineById(routine.id)?.missedFirings).toBeUndefined();
    // The schedule is untouched: a run at 09:20 was not the 09:00 moment, and `lastSettledAt` is
    // the only thing stopping a scheduled moment being reported twice.
    expect(store.routineById(routine.id)?.lastSettledAt).toBe(settledThrough);
  });

  it('is seen the moment it is written, because the user is looking at the screen', async () => {
    const routine = nightly();
    await advanceTo(nine + 10_000);

    runner.runNow(routine.id);
    await settled();

    // Issue 11: the unread mark is never earned by a turn the user started, and this is one.
    expect(store.unseenRoutineRuns(['agent_alice'])).toEqual([]);
  });

  it('refuses a second one while the first is still going, rather than stacking', async () => {
    const routine = nightly();
    let release = (): void => {};
    host.live.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await advanceTo(nine + 10_000);

    runner.runNow(routine.id);
    await Promise.resolve();
    expect(runner.runNow(routine.id)).toEqual({ ok: false, error: 'It is already running.' });

    release();
    await settled();
    expect(host.live.prompts).toHaveLength(1);
  });
});
