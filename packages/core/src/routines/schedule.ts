import type { Schedule } from './domain.js';

const MINUTE = 60_000;

/**
 * The moment a schedule last came due, at or before `at`.
 *
 * Local time throughout, computed by moving a `Date` rather than by subtracting a constant: an
 * hour is 3,600,000ms and a *day* is not, twice a year, and a briefing that arrives at 08:00 for
 * half the year is the app being clever about something the user was not.
 */
export function lastOccurrenceAtOrBefore(schedule: Schedule, at: number): number {
  const d = new Date(at);
  d.setSeconds(0, 0);
  switch (schedule.kind) {
    case 'hourly': {
      d.setMinutes(schedule.minute);
      if (d.getTime() > at) d.setTime(d.getTime() - 60 * MINUTE);
      return d.getTime();
    }
    case 'daily': {
      d.setHours(schedule.hour, schedule.minute);
      if (d.getTime() > at) d.setDate(d.getDate() - 1);
      return d.getTime();
    }
    case 'weekly': {
      d.setHours(schedule.hour, schedule.minute);
      d.setDate(d.getDate() - ((d.getDay() - schedule.weekday + 7) % 7));
      if (d.getTime() > at) d.setDate(d.getDate() - 7);
      return d.getTime();
    }
  }
}

/** The moment a schedule next comes due, strictly after `at`. What the screen calls *next run*. */
export function nextOccurrenceAfter(schedule: Schedule, at: number): number {
  const previous = new Date(lastOccurrenceAtOrBefore(schedule, at));
  switch (schedule.kind) {
    case 'hourly':
      previous.setTime(previous.getTime() + 60 * MINUTE);
      return previous.getTime();
    case 'daily':
      previous.setDate(previous.getDate() + 1);
      return previous.getTime();
    case 'weekly':
      previous.setDate(previous.getDate() + 7);
      return previous.getTime();
  }
}

/**
 * How many times a schedule came due in `(after, to]`.
 *
 * Walks rather than divides, for the same reason as above, and **stops at `cap`**. A Routine
 * armed a year ago on a machine that was shut has an unbounded count and nobody needs the exact
 * figure: the screen says *missed 4 firings* to tell you it is not running, and past a couple of
 * dozen the sentence means the same thing however it ends.
 */
export function occurrencesBetween(
  schedule: Schedule,
  after: number,
  to: number,
  cap = 500,
): number {
  let count = 0;
  let moment = lastOccurrenceAtOrBefore(schedule, to);
  while (moment > after && count < cap) {
    count += 1;
    moment = lastOccurrenceAtOrBefore(schedule, moment - 1);
  }
  return count;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The schedule in the words the user chose it with. There is no expression to render, because
 * {@link Schedule} is a closed set of three shapes, which is the point of it being one.
 */
export function describeSchedule(schedule: Schedule): string {
  const mm = String(schedule.kind === 'hourly' ? schedule.minute : schedule.minute).padStart(2, '0');
  switch (schedule.kind) {
    case 'hourly':
      return `every hour, at ${mm} past`;
    case 'daily':
      return `every day at ${String(schedule.hour).padStart(2, '0')}:${mm}`;
    case 'weekly':
      return `every ${DAYS[schedule.weekday]} at ${String(schedule.hour).padStart(2, '0')}:${mm}`;
  }
}

/**
 * How often a shape fires, in the register the context gauge already uses: **a count, never a
 * price**, because blobot has none to quote.
 *
 * Issue 06's 2026-08-30 amendment, and it comes out of issue 10's scenario 5 rather than out of
 * taste. Measured: an hourly Routine spends 72 turns overnight and a daily one spends 3, against
 * the same per-run ceiling. The expensive variable is the shape, so a person choosing between
 * them is making a twenty-four-fold decision, and until this neither number was on screen.
 *
 * A week is not a day and the sentence says so rather than dividing into a fraction nobody reads.
 */
export function describeFrequency(schedule: Schedule): string {
  switch (schedule.kind) {
    case 'hourly':
      return '24 firings a day';
    case 'daily':
      return '1 firing a day';
    case 'weekly':
      return '1 firing a week';
  }
}
