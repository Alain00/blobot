import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteStore, openDatabase, type OpenedDatabase, type Schedule } from '@blobot/core';
import {
  routineOrigins,
  routineRows,
  routineTargets,
  scheduledRoutines,
} from './routine-rows.js';

/**
 * Issue 06's row, which is one sentence made out of four tables. These are the questions the
 * screen asks that no other surface does: what order the list is in, what a proposal is as
 * opposed to a disarmed Routine, and what a Routine whose agent has gone says instead of lying.
 */

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/core/migrations', import.meta.url),
);

const daily: Schedule = { kind: 'daily', hour: 9, minute: 0 };
/** 09:00 on a Sunday, the same wall clock the runner's tests read against. */
const nine = new Date('2026-08-30T09:00:00').getTime();

let opened: OpenedDatabase;
let store: SqliteStore;
let ids = 0;

const routine = (fields: {
  agentId?: string;
  name: string;
  armed?: boolean;
  proposedBy?: string;
  reviewedAt?: number;
  missedFirings?: number;
}): string => {
  const id = `rt_${(ids += 1)}`;
  store.createRoutine({
    id,
    agentId: fields.agentId ?? 'agent_alice',
    name: fields.name,
    prompt: 'run the typecheck and say what broke',
    schedule: daily,
    armed: fields.armed ?? false,
    ...(fields.proposedBy === undefined ? {} : { proposedBy: fields.proposedBy }),
    ...(fields.reviewedAt === undefined ? {} : { reviewedAt: fields.reviewedAt }),
    createdAt: nine - 86_400_000,
  });
  if (fields.missedFirings !== undefined) store.setMissedFirings(id, fields.missedFirings);
  return id;
};

const ranAt = (routineId: string, at: number): string => {
  const id = `run_${(ids += 1)}`;
  store.recordRoutineRun({ id, routineId, firedAt: at, outcome: 'ran' });
  return id;
};

beforeEach(() => {
  opened = openDatabase({ path: ':memory:', migrationsFolder });
  store = new SqliteStore(opened.db);
  store.createTeam({
    id: 'team_1',
    name: 'checkout',
    workspacePath: '/repo',
    workspaceKind: 'git',
    turnBudget: 10,
    createdAt: 1,
  });
  for (const [id, name] of [
    ['agent_alice', 'Alice'],
    ['agent_bob', 'Bob'],
  ] as const) {
    store.createAgent({
      id,
      teamId: 'team_1',
      name,
      role: 'frontend',
      workspacePath: `/worktrees/${name.toLowerCase()}`,
      runtimeId: 'mock',
      createdAt: 1,
    });
  }
});

afterEach(() => opened.close());

describe('the list', () => {
  it('is sorted by last run, most recent first, so the night is at the top by morning', () => {
    routine({ name: 'weekly tidy', armed: true });
    const overnight = routine({ name: 'nightly typecheck', armed: true });
    const yesterday = routine({ name: 'branch report', armed: true });
    ranAt(yesterday, nine - 86_400_000);
    ranAt(overnight, nine - 3_600_000);

    expect(routineRows(store, nine).map((row) => row.name)).toEqual([
      'nightly typecheck',
      'branch report',
      'weekly tidy',
    ]);
  });

  it('says when an armed Routine next runs, and says nothing for a disarmed one', () => {
    routine({ name: 'armed', armed: true });
    routine({ name: 'disarmed', armed: false });

    const rows = routineRows(store, nine + 60_000);
    // Arming is the whole of what makes this line exist. A next run on a Routine that does not
    // fire would be the screen promising a firing that is not coming.
    expect(rows.find((row) => row.name === 'armed')?.nextRunAt).toBe(nine + 86_400_000);
    expect(rows.find((row) => row.name === 'disarmed')?.nextRunAt).toBeUndefined();
  });

  it('carries the shape and what it costs, and never an expression', () => {
    routine({ name: 'nightly typecheck', armed: true });

    const [row] = routineRows(store, nine);

    expect(row?.scheduleLabel).toBe('every day at 09:00');
    expect(row?.frequencyLabel).toBe('1 firing a day');
  });

  it('reports a firing nobody was there for, plainly and as a count', () => {
    routine({ name: 'nightly typecheck', armed: true, missedFirings: 4 });

    expect(routineRows(store, nine)[0]?.missedFirings).toBe(4);
  });

  it('leaves a Routine whose agent has gone unattributed rather than reassigning it', () => {
    routine({ name: 'nightly typecheck', armed: false });
    store.tombstoneAgent('agent_alice', nine);

    const [row] = routineRows(store, nine);

    // Kept and disarmed, saying who it belonged to and no longer claiming a recipient. blobot
    // does not decide who a message is for.
    expect(row?.agentName).toBeUndefined();
    expect(row?.teamName).toBeUndefined();
  });
});

describe('a proposal is not a disarmed Routine', () => {
  it('is one an agent asked for that nobody has answered', () => {
    routine({ name: 'asked for', proposedBy: 'agent_bob' });
    routine({ name: 'the user wrote this one' });

    const rows = routineRows(store, nine);

    expect(rows.find((row) => row.name === 'asked for')?.proposedByName).toBe('Bob');
    expect(rows.find((row) => row.name === 'the user wrote this one')?.proposedByName)
      .toBeUndefined();
  });

  /**
   * The gap issue 06 owed a column for. *Answered* was read as *armed or gone*, so a proposal a
   * person armed and later disarmed came back to the top of this screen as unanswered — a
   * question they had already answered twice, asked a third time.
   */
  it('stops being one once a person has answered it, whichever way they answered', () => {
    const armed = routine({ name: 'armed it', proposedBy: 'agent_bob', armed: true, reviewedAt: nine });
    const refused = routine({ name: 'disarmed it again', proposedBy: 'agent_bob', reviewedAt: nine });

    const rows = routineRows(store, nine);

    expect(rows.find((row) => row.id === armed)?.proposedByName).toBeUndefined();
    expect(rows.find((row) => row.id === refused)?.proposedByName).toBeUndefined();
  });
});

describe('who a Routine can be given to', () => {
  it('is every agent on every team, because a Routine is per agent and never per team', () => {
    expect(routineTargets(store).map((target) => `${target.agentName}/${target.teamName}`)).toEqual([
      'Alice/checkout',
      'Bob/checkout',
    ]);
  });
});

describe('what the transcript is told', () => {
  it('names the Routine behind a firing, so the prompt can say when it was delivered', () => {
    const id = routine({ name: 'nightly typecheck', armed: true });
    const runId = ranAt(id, nine);

    expect(routineOrigins(store, [{ routineRunId: runId }, {}])).toEqual({
      [runId]: 'nightly typecheck',
    });
  });

  it('still names a Routine the user has since deleted', () => {
    const id = routine({ name: 'nightly typecheck', armed: true });
    const runId = ranAt(id, nine);
    store.tombstoneRoutine(id, nine + 1);

    // The transcript is a record of what happened, and that turn ran because of this Routine.
    // An unattributed line would be blobot forgetting its own reason.
    expect(routineOrigins(store, [{ routineRunId: runId }])).toEqual({
      [runId]: 'nightly typecheck',
    });
  });
});

/**
 * Issue 05's 2026-08-30 amendment, control two: the transcript block, and where it comes from.
 * Read off the rows rather than an event log, so it survives a relaunch and a team switch.
 */
describe('the blocks the transcript restores', () => {
  it('carries only Routines an agent scheduled for itself', () => {
    routine({ name: 'the user wrote this one', armed: true });
    routine({ name: 'bob gave himself this', agentId: 'agent_bob', proposedBy: 'agent_bob', armed: true });

    const blocks = scheduledRoutines(store, ['agent_alice', 'agent_bob'], 0);

    // A Routine the user wrote needs no disclosure: they were there.
    expect(blocks.map((one) => one.name)).toEqual(['bob gave himself this']);
    expect(blocks[0]).toMatchObject({
      agentId: 'agent_bob',
      schedule: 'every day at 09:00',
      frequency: '1 firing a day',
      armed: true,
    });
  });

  it('says whether it is still running, rather than remembering that it was', () => {
    const id = routine({ name: 'bob gave himself this', proposedBy: 'agent_bob', armed: true });
    store.setRoutineArmed(id, false);

    // Two surfaces act on one row. A block whose control still said `disarm` after the user
    // disarmed it on the Routines screen would be the app disagreeing with itself.
    expect(scheduledRoutines(store, ['agent_alice'], 0)[0]?.armed).toBe(false);
  });

  it('is bounded by the window, so an old one does not reappear above this afternoon', () => {
    routine({ name: 'bob gave himself this', proposedBy: 'agent_bob', armed: true });

    expect(scheduledRoutines(store, ['agent_alice'], nine)).toEqual([]);
  });
});
