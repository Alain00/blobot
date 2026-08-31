import {
  ROUTINE_BUSY_CEILING_MS,
  ROUTINE_DISARM_AFTER,
  ROUTINE_PERMISSION_CEILING_MS,
  Scheduler,
  nextOccurrenceAfter,
  uuidv7,
  type AgentStatus,
  type Clock,
  type Routine,
  type RoutineOutcome,
  type RoutineTurn,
  type SqliteStore,
  type Team,
} from '@blobot/core';

/**
 * How often the tick asks what is due.
 *
 * Comfortably inside `FIRING_TOLERANCE_MS`, so an ordinary tick never misses its own firing, and
 * short enough that a machine waking from sleep notices within a minute of being usable. It is a
 * repeating question and never one `setTimeout` per Routine: a long timer does not survive a
 * laptop suspending, and it would fire late, which is the one thing issue 02 says must not happen.
 */
export const ROUTINE_TICK_MS = 30_000;

/** How often a firing that landed on a busy agent asks again. */
const BUSY_RETRY_MS = 5_000;

/** The half of a running team a firing needs. Narrow on purpose, so a test needs no Electron. */
export interface RoutineTarget {
  statusOf(agentId: string): AgentStatus;
  promptFromRoutine(
    agentId: string,
    text: string,
    run: { readonly runId: string; readonly permissionExpiryMs: number },
  ): Promise<RoutineTurn>;
}

/**
 * What the runner cannot know for itself: whether there is a window, who is on which team, and
 * how a team is brought to life. All three are main's, which is the whole of the split issue 09
 * drew — main owns the timer, the window check and the calling, and core owns what is due.
 */
export interface RoutineHost {
  /**
   * Whether there is a live window. Issue 02, on **every platform**: macOS keeps the process
   * after its last window closes, and a firing there would park a permission request in front of
   * nobody. Skipping without one buys platform parity and removes an unreachable UI state.
   */
  hasWindow(): boolean;
  /**
   * The team this Routine's agent is on, or `undefined` when the agent is off every roster.
   * Never a guess at a replacement: blobot does not decide who a message is for.
   */
  teamOfAgent(agentId: string): Team | undefined;
  /**
   * Bring the team live and hand back the half a firing needs. Starting a team the pool is not
   * holding is deliberate and safe: the pool never evicts a working team, so the user's open
   * work is protected by the pool's own rule rather than by this one refusing to run.
   *
   * Throws in the reconcile's own words when the Workspace has moved or gone, and by name when a
   * runtime is not installed. Both become the skip's reason verbatim.
   */
  open(team: Team): Promise<RoutineTarget>;
  /**
   * The run is over, however it ended. The counterpart to whatever `open` did to keep the team
   * live: a firing pins a pool slot for as long as it holds one, and this is what lets it go.
   */
  finished?(team: Team): void;
  onLog?(line: string): void;
  /** A run was recorded or a Routine disarmed itself: whatever draws them is out of date. */
  onChange?(): void;
}

export interface RoutineRunnerOptions {
  readonly store: SqliteStore;
  readonly clock: Clock;
  readonly host: RoutineHost;
  readonly scheduler?: Scheduler;
  readonly createId?: (now: number) => string;
  readonly tickMs?: number;
}

/** A firing that has not finished yet, so the next one can tell what to say about it. */
interface InFlight {
  started: boolean;
}

/**
 * The tick: what turns a due moment into a turn.
 *
 * It is the only thing in blobot that starts work nobody asked for at that second, so every
 * refusal it can make is written down here rather than inferred — issue 08's table is this class,
 * one branch per row, and each branch ends in a `routine_runs` row saying what happened in words
 * a person can read.
 *
 * Nothing here reads `Date.now()` or `setTimeout` directly. The clock is injected, which is what
 * lets a week of firings run in a millisecond and is the reason the vanished Workspace and the
 * missing window are checked-in scenarios rather than things somebody once tried by hand.
 */
export class RoutineRunner {
  readonly #store: SqliteStore;
  readonly #clock: Clock;
  readonly #host: RoutineHost;
  readonly #scheduler: Scheduler;
  readonly #createId: (now: number) => string;
  readonly #tickMs: number;
  readonly #inFlight = new Map<string, InFlight>();
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: RoutineRunnerOptions) {
    this.#store = options.store;
    this.#clock = options.clock;
    this.#host = options.host;
    this.#scheduler = options.scheduler ?? new Scheduler();
    this.#createId = options.createId ?? uuidv7;
    this.#tickMs = options.tickMs ?? ROUTINE_TICK_MS;
  }

  start(): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => void this.tick(), this.#tickMs);
    // Nothing keeps the process alive for a Routine. Issue 02 is that a Routine needs blobot to
    // be open, and a timer holding an app up after its last window would be the beginning of the
    // background daemon that ticket refused.
    this.#timer.unref?.();
  }

  stop(): void {
    if (this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /** Firings that have started and not finished. The pool has to be told, and so do tests. */
  get inFlight(): number {
    return this.#inFlight.size;
  }

  /**
   * One pass. Never awaits a turn: a firing that took four minutes would hold the next Routine's
   * moment past the tolerance and turn a firing blobot was present for into a missed one.
   */
  async tick(): Promise<void> {
    // The whole check, and the reason a macOS process with no window behaves exactly like a
    // Linux one that was shut: it settles nothing, so the firings it slept through are reported
    // as missed when a window comes back, which is what they were.
    if (!this.#host.hasWindow()) return;
    const now = this.#clock.now();
    for (const due of this.#scheduler.due(this.#store.allRoutines(), now)) {
      const routine = due.routine;
      if (due.moment === undefined) {
        // Nobody was there. Terminal, never a queue, and never a run: `Run now` is the remedy,
        // pressed by a person who can see the state of the repository.
        this.#store.setMissedFirings(routine.id, (routine.missedFirings ?? 0) + due.missed);
        if (due.missed > 0) this.#host.onChange?.();
      } else {
        // blobot was here for this one, whatever comes of it, so the missed streak has ended.
        this.#store.setMissedFirings(routine.id, 0);
        const held = this.#inFlight.get(routine.id);
        if (held === undefined) {
          void this.#fire(routine, due.moment);
        } else {
          // Coalesced. One instruction repeated is one instruction, and stacking a second run on
          // an agent that has not got through the first is how an hourly Routine becomes a queue.
          this.#skip(
            routine,
            due.moment,
            held.started ? 'the previous run had not finished' : 'the previous run had not started',
          );
        }
      }
      this.#store.settleRoutine(routine.id, due.settledThrough);
    }
  }

  /**
   * Fire this Routine now, because a person pressed `Run now`.
   *
   * Issue 02 made this the **whole of the missed-firing remedy**: blobot never catches up on
   * launch, so four firings never arrive at once, and what a shut laptop leaves behind is a count
   * and this verb. It is therefore not a debug affordance, and it is on every row — armed or not,
   * because a Routine the user is about to arm is one they want to try first.
   *
   * The schedule is untouched: `lastSettledAt` is what stops a scheduled moment being reported
   * twice, and a run at 09:20 was not the 09:00 moment. What it does answer is the missed count,
   * because `missed 4 firings` standing beside a run that just happened is stale rather than
   * informative, and the person who pressed this can see the state of the repository.
   *
   * Returns as soon as the turn is *started*, never when it ends. A firing is minutes and the
   * caller is an IPC handler; what happens afterwards reaches the screen through `onChange`.
   */
  runNow(routineId: string): { ok: true } | { ok: false; error: string } {
    const routine = this.#store.routineById(routineId);
    if (routine === undefined) return { ok: false, error: 'That routine is gone.' };
    if (this.#inFlight.has(routine.id)) return { ok: false, error: 'It is already running.' };
    this.#store.setMissedFirings(routine.id, 0);
    void this.#fire(routine, this.#clock.now(), { byHand: true });
    this.#host.onChange?.();
    return { ok: true };
  }

  /** One firing, from the moment it comes due to the row that says how it ended. */
  async #fire(routine: Routine, moment: number, options?: { byHand: true }): Promise<void> {
    const held: InFlight = { started: false };
    this.#inFlight.set(routine.id, held);
    let team: Team | undefined;
    try {
      team = this.#host.teamOfAgent(routine.agentId);
      if (team === undefined) {
        // Disarmed at once rather than after three, and kept, saying who it belonged to. This is
        // the one case that is not a world that might come back: an Agent taken off a roster is
        // gone with its AgentWorkspace, and its Routines have no recipient. Never reassigned to
        // whoever is left, because blobot does not decide who a message is for.
        this.#skip(routine, moment, 'its agent is no longer on this team');
        this.#disarm(routine, 'its agent is no longer on this team');
        return;
      }

      let target: RoutineTarget;
      try {
        target = await this.#host.open(team);
      } catch (error) {
        // The reconcile's own words for a Workspace that moved or went, and the runtime picker's
        // for a CLI that is no longer installed. Neither is rephrased here: this is the one place
        // that would be tempted to turn them into `could not run`.
        this.#skip(routine, moment, describe(error));
        return;
      }

      const runId = this.#createId(this.#clock.now());
      // Written now rather than at the end, carrying the outcome that would be true if blobot
      // stopped existing this second. A run interrupted by a quit *is* a turn that did not
      // finish, and a row written only on success would leave that firing looking as though it
      // never happened.
      this.#store.recordRoutineRun({
        id: runId,
        routineId: routine.id,
        firedAt: moment,
        outcome: 'stopped',
        reason: 'the run did not finish',
        // Issue 11's mark is **never earned by a turn the user started**, and `Run now` is one:
        // the person is looking at the screen they pressed it on. Seen at birth rather than
        // cleared afterwards, so it never clears the overnight runs standing beside it.
        ...(options?.byHand === true ? { seenAt: moment } : {}),
      });
      this.#host.onChange?.();

      const turn = await this.#start(routine, target, runId, moment, held);
      if (turn === undefined) {
        this.#settle(routine, runId, 'skipped', 'the agent was busy for the whole run');
        return;
      }
      if (turn.outcome === 'stopped') this.#settle(routine, runId, 'stopped', turn.reason);
      else this.#settle(routine, runId, 'ran');
    } catch (error) {
      this.#host.onLog?.(`[routine] ${routine.name}: ${describe(error)}`);
    } finally {
      this.#inFlight.delete(routine.id);
      if (team !== undefined) this.#host.finished?.(team);
    }
  }

  /**
   * Get the turn started, waiting out an agent that is mid-turn.
   *
   * A session runs one turn at a time, so a firing that lands on a busy agent waits rather than
   * being skipped or stacked. What it may not do is wait forever: the firing it holds back is its
   * own next one. `undefined` means it waited the whole ceiling and never got a look in.
   */
  async #start(
    routine: Routine,
    target: RoutineTarget,
    runId: string,
    moment: number,
    held: InFlight,
  ): Promise<RoutineTurn | undefined> {
    const deadline = moment + ROUTINE_BUSY_CEILING_MS;
    for (;;) {
      held.started = true;
      const turn = await target.promptFromRoutine(routine.agentId, routine.prompt, {
        runId,
        permissionExpiryMs: this.#permissionExpiryMs(routine, moment),
      });
      if (turn.outcome !== 'busy') return turn;
      held.started = false;
      if (this.#clock.now() >= deadline) return undefined;
      await this.#clock.sleep(BUSY_RETRY_MS);
    }
  }

  /**
   * How long a permission request raised inside this run may go unanswered.
   *
   * Issue 03: the earlier of a fixed ceiling and the Routine's own next due moment, because a
   * Routine that has come round again has answered the question itself. A parked run holds a
   * session, a bridge process and a pool slot, and the pool never evicts a working team.
   */
  #permissionExpiryMs(routine: Routine, moment: number): number {
    const next = nextOccurrenceAfter(routine.schedule, moment) - this.#clock.now();
    return Math.max(BUSY_RETRY_MS, Math.min(ROUTINE_PERMISSION_CEILING_MS, next));
  }

  /** A firing that never started a turn. Its row is written and closed in one go. */
  #skip(routine: Routine, moment: number, reason: string): void {
    const runId = this.#createId(this.#clock.now());
    this.#store.recordRoutineRun({
      id: runId,
      routineId: routine.id,
      firedAt: moment,
      outcome: 'skipped',
      reason,
    });
    this.#after(routine, 'skipped', reason);
  }

  /** A firing whose row is already there, now that the turn is over. */
  #settle(routine: Routine, runId: string, outcome: RoutineOutcome, reason?: string): void {
    this.#store.settleRoutineRun(runId, outcome, reason);
    this.#after(routine, outcome, reason);
  }

  /**
   * Issue 08's shared rule, in the one place every case passes through.
   *
   * Three firings in a row ending in anything but `ran` disarm the Routine, whatever the reasons
   * were. An instruction that dies the same death every night is not automation, it is a process
   * leak with a schedule attached — and the Routine is kept, disarmed, saying which reason it was.
   */
  #after(routine: Routine, outcome: RoutineOutcome, reason?: string): void {
    if (
      outcome !== 'ran' &&
      this.#store.consecutiveRoutineFailures(routine.id) >= ROUTINE_DISARM_AFTER
    ) {
      this.#disarm(routine, reason ?? outcome);
    }
    this.#host.onChange?.();
  }

  #disarm(routine: Routine, reason: string): void {
    this.#store.setRoutineArmed(routine.id, false);
    this.#host.onLog?.(`[routine] ${routine.name} disarmed: ${reason}`);
    this.#host.onChange?.();
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
