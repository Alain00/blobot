import type { Routine } from './domain.js';
import { lastOccurrenceAtOrBefore, occurrencesBetween } from './schedule.js';

/**
 * How long after a due moment a firing may still run.
 *
 * This constant is where issue 02's answer lives. blobot has no server and no daemon, so a
 * schedule fires only while the app is open; the scheduler cannot ask whether the app was open at
 * 03:00, but it can ask whether it *noticed promptly*, and a moment nobody noticed within the
 * tolerance is a moment nobody was there for. A machine resuming from six hours' sleep and a
 * machine that was shut then produce exactly the same answer, which is what the ticket demanded
 * and the reason there is no clock-jump detection anywhere in this file.
 *
 * Comfortably more than the tick interval, so an ordinary tick never misses its own firing.
 */
export const FIRING_TOLERANCE_MS = 120_000;

/** What the scheduler found for one Routine at one instant. */
export interface Due {
  readonly routine: Routine;
  /**
   * The due moment to run now, when there is one. Absent means every occurrence since the last
   * run went unnoticed, and **a missed firing is never run late**: issue 02 refused catch-up in
   * every form, including as a per-Routine opt-in, because the remedy is `Run now` pressed by a
   * person who can see the state of the repository.
   */
  readonly moment?: number;
  /**
   * Firings that came and went with nobody there. Terminal, never a queue. The screen says
   * `missed 4 firings` and offers `Run now`.
   */
  readonly missed: number;
  /**
   * What the caller writes back to `lastSettledAt` once it has acted. Everything up to and
   * including this moment is now accounted for, ran or skipped, and will not be reported again.
   */
  readonly settledThrough: number;
}

/**
 * Decides **only what is due**. It owns no timer, calls no orchestrator, opens no window and
 * touches no database.
 *
 * Main owns the timer, the window check and the calling, exactly as main owns the pool and core
 * owns the wake policy. That split is what makes a week of firings testable in a millisecond:
 * nothing here reads `Date.now()`, and `schema.ts` already refuses SQL time defaults so a
 * checked-in scenario under a virtual clock stays honest.
 *
 * Main should tick repeatedly and briefly rather than setting one timer per Routine to a distant
 * moment. A long `setTimeout` does not survive a laptop suspending, and it would fire late, which
 * is the one thing issue 02 says must never happen.
 */
export class Scheduler {
  readonly #tolerance: number;

  constructor(options: { tolerance?: number } = {}) {
    this.#tolerance = options.tolerance ?? FIRING_TOLERANCE_MS;
  }

  /**
   * Every Routine with something to report at `now`: one to run, some missed, or both.
   *
   * A disarmed Routine is absent entirely. It does not fire and it does not accrue missed
   * firings, because it was never going to run and reporting that it did not would be blobot
   * counting a thing nobody asked for.
   */
  due(routines: readonly Routine[], now: number): Due[] {
    // The caller is expected to advance `lastSettledAt` to `settledThrough` for every entry it
    // is handed, including the ones with nothing but missed firings on them.
    const found: Due[] = [];
    for (const routine of routines) {
      if (!routine.armed) continue;

      // Never before the Routine existed, and never twice for one moment — whether that moment
      // ran or was missed. See `lastSettledAt`.
      const baseline = routine.lastSettledAt ?? routine.createdAt;
      const latest = lastOccurrenceAtOrBefore(routine.schedule, now);
      if (latest <= baseline) continue;

      const noticed = now - latest <= this.#tolerance;
      const total = occurrencesBetween(routine.schedule, baseline, now);
      const missed = noticed ? total - 1 : total;
      found.push({ routine, ...(noticed ? { moment: latest } : {}), missed, settledThrough: latest });
    }
    return found;
  }
}
