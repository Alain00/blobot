import { describe, expect, it } from 'vitest';
import type { Routine, Schedule } from './domain.js';
import { Scheduler } from './scheduler.js';
import {
  describeFrequency,
  describeSchedule,
  nextOccurrenceAfter,
  occurrencesBetween,
} from './schedule.js';

/** Local time, because every schedule is. Built this way so a test reads like a wall clock. */
const at = (iso: string): number => new Date(iso).getTime();

const routine = (over: Partial<Routine> & { schedule: Schedule }): Routine => ({
  id: 'r1',
  agentId: 'alice',
  name: 'nightly typecheck',
  prompt: 'run the typecheck and report failures',
  armed: true,
  createdAt: at('2026-08-01T00:00:00'),
  ...over,
});

const daily9 = { kind: 'daily', hour: 9, minute: 0 } as const;

describe('Scheduler', () => {
  it('fires a schedule the moment it comes due', () => {
    const yesterday = routine({ schedule: daily9, lastSettledAt: at('2026-08-29T09:00:00') });
    const due = new Scheduler().due([yesterday], at('2026-08-30T09:00:10'));
    expect(due).toHaveLength(1);
    expect(due[0]?.moment).toBe(at('2026-08-30T09:00:00'));
    expect(due[0]?.missed).toBe(0);
  });

  it('does not fire before the moment', () => {
    const yesterday = routine({ schedule: daily9, lastSettledAt: at('2026-08-30T09:00:00') });
    expect(new Scheduler().due([yesterday], at('2026-08-31T08:59:00'))).toEqual([]);
  });

  it('never fires twice for one moment', () => {
    const fired = routine({ schedule: daily9, lastSettledAt: at('2026-08-30T09:00:04') });
    expect(new Scheduler().due([fired], at('2026-08-30T09:00:40'))).toEqual([]);
  });

  it('never fires for a moment before the Routine existed', () => {
    const fresh = routine({ schedule: daily9, createdAt: at('2026-08-30T10:00:00') });
    expect(new Scheduler().due([fresh], at('2026-08-30T10:00:01'))).toEqual([]);
  });

  it('a disarmed Routine is absent, and accrues no missed firings', () => {
    const off = routine({ schedule: daily9, armed: false });
    expect(new Scheduler().due([off], at('2026-08-30T09:00:10'))).toEqual([]);
  });

  /**
   * Issue 02: a missed firing is skipped and recorded, never run late. Catch-up was refused in
   * every form, including as a per-Routine opt-in.
   */
  it('reports a firing nobody was there for as missed, and does not run it', () => {
    const yesterday = routine({ schedule: daily9, lastSettledAt: at('2026-08-29T09:00:00') });
    const due = new Scheduler().due([yesterday], at('2026-08-30T14:00:00'));
    expect(due[0]?.moment).toBeUndefined();
    expect(due[0]?.missed).toBe(1);
  });

  it('counts every firing that went by while the app was shut', () => {
    const off = routine({ schedule: daily9, lastSettledAt: at('2026-08-26T09:00:00') });
    const due = new Scheduler().due([off], at('2026-08-30T14:00:00'));
    expect(due[0]?.moment).toBeUndefined();
    expect(due[0]?.missed).toBe(4);
  });

  /**
   * The one behaviour the whole tolerance exists for: a machine resuming from six hours' sleep
   * must be indistinguishable from a machine that was shut. No clock-jump detection anywhere.
   */
  it('treats a resumed machine exactly like one that was shut', () => {
    const hourly = routine({
      schedule: { kind: 'hourly', minute: 0 },
      lastSettledAt: at('2026-08-30T02:00:00'),
    });
    const due = new Scheduler().due([hourly], at('2026-08-30T08:00:31'));
    expect(due[0]?.moment).toBe(at('2026-08-30T08:00:00'));
    // The five it slept through are missed, not queued behind the one it noticed.
    expect(due[0]?.missed).toBe(5);
  });

  it('runs the newest firing and misses the rest, never the other way round', () => {
    const hourly = routine({
      schedule: { kind: 'hourly', minute: 30 },
      lastSettledAt: at('2026-08-30T09:30:00'),
    });
    const due = new Scheduler().due([hourly], at('2026-08-30T12:30:20'));
    expect(due[0]?.moment).toBe(at('2026-08-30T12:30:00'));
    expect(due[0]?.missed).toBe(2);
  });

  it('a firing just outside the tolerance is missed, not run late', () => {
    const scheduler = new Scheduler({ tolerance: 60_000 });
    const one = routine({ schedule: daily9 });
    expect(scheduler.due([one], at('2026-08-30T09:00:59'))?.[0]?.moment).toBe(
      at('2026-08-30T09:00:00'),
    );
    expect(scheduler.due([one], at('2026-08-30T09:01:01'))?.[0]?.moment).toBeUndefined();
  });
});

describe('schedule arithmetic', () => {
  it('walks the calendar rather than adding a constant', () => {
    // A day is not 86,400,000ms across a DST boundary, and a 9am briefing stays at 9am.
    const next = nextOccurrenceAfter(daily9, at('2026-08-30T09:00:00'));
    expect(new Date(next).getHours()).toBe(9);
    expect(new Date(next).getDate()).toBe(31);
  });

  it('finds the same weekday a week on', () => {
    const weekly = { kind: 'weekly', weekday: 1, hour: 9, minute: 0 } as const;
    const next = nextOccurrenceAfter(weekly, at('2026-08-30T12:00:00'));
    expect(new Date(next).getDay()).toBe(1);
  });

  it('caps the missed count rather than walking a year', () => {
    const hourly = { kind: 'hourly', minute: 0 } as const;
    expect(occurrencesBetween(hourly, at('2020-01-01T00:00:00'), at('2026-08-30T00:00:00'), 500)).toBe(
      500,
    );
  });

  it('says the schedule in the words it was chosen with, and never in cron', () => {
    expect(describeSchedule(daily9)).toBe('every day at 09:00');
    expect(describeSchedule({ kind: 'hourly', minute: 5 })).toBe('every hour, at 05 past');
    expect(describeSchedule({ kind: 'weekly', weekday: 1, hour: 9, minute: 30 })).toBe(
      'every Monday at 09:30',
    );
  });

  /**
   * Issue 06's amendment. The twenty-four-fold difference issue 10's scenario 5 measured, said
   * where the shape is chosen: a count of firings, and never a price, because blobot has none.
   */
  it('says what the shape costs, as a count of firings', () => {
    expect(describeFrequency({ kind: 'hourly', minute: 0 })).toBe('24 firings a day');
    expect(describeFrequency(daily9)).toBe('1 firing a day');
    // A week is not a day, and the sentence changes its unit rather than printing a fraction.
    expect(describeFrequency({ kind: 'weekly', weekday: 1, hour: 9, minute: 30 })).toBe(
      '1 firing a week',
    );
  });
});

describe('a firing is accounted for exactly once', () => {
  const daily = { kind: 'daily', hour: 9, minute: 0 } as const;

  /**
   * The bug this field exists to prevent: with only a *fired* mark, a missed firing never
   * advances anything, so every tick for the rest of the Routine's life reports it again and
   * writes another `routine_runs` row.
   */
  it('stops reporting a missed firing once the caller has settled it', () => {
    const scheduler = new Scheduler();
    const one = routine({ schedule: daily, lastSettledAt: at('2026-08-29T09:00:00') });
    const [first] = scheduler.due([one], at('2026-08-30T14:00:00'));
    if (first === undefined) throw new Error('expected a missed firing');
    expect(first.missed).toBe(1);

    const settled = { ...one, lastSettledAt: first.settledThrough };
    expect(scheduler.due([settled], at('2026-08-30T14:01:00'))).toEqual([]);
  });

  it('settles a run the same way, so a tick a second later does not fire it twice', () => {
    const scheduler = new Scheduler();
    const one = routine({ schedule: daily, lastSettledAt: at('2026-08-29T09:00:00') });
    const [found] = scheduler.due([one], at('2026-08-30T09:00:05'));
    if (found === undefined) throw new Error('expected a due firing');
    expect(found.moment).toBe(at('2026-08-30T09:00:00'));

    const settled = { ...one, lastSettledAt: found.settledThrough };
    expect(scheduler.due([settled], at('2026-08-30T09:00:35'))).toEqual([]);
  });
});
