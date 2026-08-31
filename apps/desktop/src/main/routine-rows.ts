import {
  describeFrequency,
  describeSchedule,
  nextOccurrenceAfter,
  type Routine,
  type SqliteStore,
} from '@blobot/core';
import type {
  UiRoutine,
  UiRoutineRun,
  UiRoutineTarget,
  UiScheduledRoutine,
} from '../shared/api.js';

/**
 * Issue 06's screen, composed where the database is.
 *
 * A row is one sentence made out of four tables — the Routine, its Agent, that Agent's Team, and
 * the last `routine_runs` row — and the renderer holds no database handle, which is the rule that
 * decides this lives here. It is a plain function over a store so that a test needs no Electron.
 *
 * **Sorted by last run, most recent first.** That is issue 07's *what happened while I was away*
 * answered without a digest screen: the things that ran overnight are at the top in the morning,
 * in order, already. A sort is cheaper than a surface and cannot go stale. A Routine that has
 * never run sorts by when it was made, under everything that has.
 */
export function routineRows(store: SqliteStore, now: number): UiRoutine[] {
  return store
    .allRoutines()
    .map((routine) => toRow(store, routine, now))
    .sort((left, right) => sortKey(right) - sortKey(left));
}

/** When this row last had something to say. What the screen is ordered on. */
function sortKey(row: UiRoutine): number {
  return row.lastRun?.firedAt ?? 0;
}

function toRow(store: SqliteStore, routine: Routine, now: number): UiRoutine {
  // Live only. A tombstoned agent answers `undefined`, which is exactly the state the row has to
  // draw: the Routine was disarmed and kept rather than reassigned, because blobot does not
  // decide who a message is for.
  const agent = store.agentById(routine.agentId);
  const team = agent === undefined ? undefined : store.teamById(agent.teamId);
  const [lastRun] = store.routineRunsOf(routine.id, 1);
  const proposer = routine.proposedBy === undefined ? undefined : store.agentById(routine.proposedBy);
  return {
    id: routine.id,
    name: routine.name,
    prompt: routine.prompt,
    schedule: routine.schedule,
    scheduleLabel: describeSchedule(routine.schedule),
    frequencyLabel: describeFrequency(routine.schedule),
    armed: routine.armed,
    agentId: routine.agentId,
    ...(agent === undefined ? {} : { agentName: agent.name }),
    ...(agent?.hue === undefined ? {} : { agentHue: agent.hue }),
    ...(team === undefined ? {} : { teamName: team.name }),
    // A disarmed Routine has no next run, and saying one would be the screen promising a firing
    // that is not coming. The whole of what arming grants is that this line exists.
    ...(routine.armed ? { nextRunAt: nextOccurrenceAfter(routine.schedule, now) } : {}),
    ...(lastRun === undefined ? {} : { lastRun: toRunRow(lastRun) }),
    ...(routine.missedFirings === undefined || routine.missedFirings === 0
      ? {}
      : { missedFirings: routine.missedFirings }),
    // A proposal is one nobody has answered. Issue 06 made that separation load-bearing, and
    // `reviewedAt` is what makes it a fact on the row rather than a guess at *armed or gone*:
    // one the user armed and later disarmed is a decision they made, not a question outstanding.
    ...(routine.proposedBy !== undefined && routine.reviewedAt === undefined
      ? { proposedByName: proposer?.name ?? 'an agent' }
      : {}),
  };
}

export function toRunRow(run: {
  id: string;
  firedAt: number;
  outcome: UiRoutineRun['outcome'];
  reason?: string;
}): UiRoutineRun {
  return {
    id: run.id,
    firedAt: run.firedAt,
    outcome: run.outcome,
    ...(run.reason === undefined ? {} : { reason: run.reason }),
  };
}

/**
 * Everyone a Routine could be given to: every agent on every team.
 *
 * Per agent and never per team, which is the whole of what issue 09 stored. An AgentWorkspace, a
 * session and a mailbox are things a Team gives an Agent, and none of them can be shared, so the
 * same person hired onto two teams appears twice here and their Routines do not travel.
 */
export function routineTargets(store: SqliteStore): UiRoutineTarget[] {
  return store.listTeams().flatMap((team) =>
    store.agentsOfTeam(team.id).map((agent) => ({
      agentId: agent.id,
      agentName: agent.name,
      ...(agent.hue === undefined ? {} : { agentHue: agent.hue }),
      teamName: team.name,
    })),
  );
}

/**
 * Which Routine each firing in a transcript window belongs to, by run id.
 *
 * Issue 07's disclosure needs a *name*, and `messages.routine_run_id` is a link rather than a
 * flag on purpose: two screens ask two questions of it — which Routine, and has that run been
 * seen — and a boolean answers neither. Built for the window that is actually on screen, so a
 * transcript with no Routine in it costs one empty object.
 */
export function routineOrigins(
  store: SqliteStore,
  messages: readonly { routineRunId?: string }[],
): Record<string, string> {
  const origins: Record<string, string> = {};
  for (const message of messages) {
    const runId = message.routineRunId;
    if (runId === undefined || origins[runId] !== undefined) continue;
    const name = store.routineNameOfRun(runId);
    if (name !== undefined) origins[runId] = name;
  }
  return origins;
}

/**
 * The Routines this team's agents scheduled for themselves, for the transcript blocks.
 *
 * Read from the rows rather than from an event log, which is what makes the block survive a
 * relaunch and a team switch: the Routine **is** the record. A disclosure you could miss by
 * being on another team when it happened would not be one.
 *
 * Bounded by `since`, which is the oldest moment the transcript window reaches, so the blocks
 * arrive with the turns they belong to rather than every one the team has ever made.
 */
export function scheduledRoutines(
  store: SqliteStore,
  agentIds: readonly string[],
  since: number,
): UiScheduledRoutine[] {
  return agentIds
    .flatMap((agentId) => store.routinesOfAgent(agentId))
    .filter((routine) => routine.proposedBy !== undefined && routine.createdAt >= since)
    .map((routine) => ({
      routineId: routine.id,
      agentId: routine.agentId,
      name: routine.name,
      schedule: describeSchedule(routine.schedule),
      frequency: describeFrequency(routine.schedule),
      at: routine.createdAt,
      // Live rather than remembered: a block whose control still said `disarm` after the user
      // disarmed it on the Routines screen would be two surfaces disagreeing about one row.
      armed: routine.armed,
    }));
}
