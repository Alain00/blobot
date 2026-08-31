/**
 * @vitest-environment jsdom
 *
 * Issue 06's screen, and the distinctions on it that a screenshot cannot make.
 *
 * Every claim here is about something the screen must not collapse: a proposal against a
 * disarmed Routine, a missed firing against a failure, and a Routine whose agent has gone
 * against one that simply is not running. Getting any of them wrong tells the user something
 * false about work that happens while they are not watching.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiRoutine } from '../../../shared/api.js';
import { Routines } from './Routines.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NIGHTLY: UiRoutine = {
  id: 'rt_1',
  name: 'nightly typecheck',
  prompt: 'run the typecheck and say what broke',
  schedule: { kind: 'daily', hour: 9, minute: 0 },
  scheduleLabel: 'every day at 09:00',
  frequencyLabel: '1 firing a day',
  armed: true,
  agentId: 'agent_alice',
  agentName: 'Alice',
  teamName: 'checkout',
  nextRunAt: Date.now() + 3_600_000,
  lastRun: { id: 'run_1', firedAt: Date.now() - 3_600_000, outcome: 'ran' },
};

/**
 * The same Routine with some of it taken away. `exactOptionalPropertyTypes` is on, so absent has
 * to be *absent* rather than `undefined` — which is the same distinction the rows themselves
 * make: no next run is not a next run of nothing.
 */
function without(over: Partial<UiRoutine>, ...drop: (keyof UiRoutine)[]): UiRoutine {
  const row: Record<string, unknown> = { ...NIGHTLY, ...over };
  for (const key of drop) delete row[key];
  return row as unknown as UiRoutine;
}

const drawn: { unmount: () => void }[] = [];
afterEach(() => {
  for (const one of drawn.splice(0)) act(() => one.unmount());
});

/** The screen against a stubbed main process, and what it sent back through the door. */
async function screen(
  rows: readonly UiRoutine[],
): Promise<{ text: string; host: HTMLElement; calls: Record<string, unknown[][]> }> {
  const calls: Record<string, unknown[][]> = { armed: [], deleted: [], ran: [] };
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    listRoutines: vi.fn(async () => rows),
    routineTargets: vi.fn(async () => [
      { agentId: 'agent_alice', agentName: 'Alice', teamName: 'checkout' },
    ]),
    setRoutineArmed: vi.fn(async (...args: unknown[]) => {
      calls['armed']?.push(args);
    }),
    deleteRoutine: vi.fn(async (...args: unknown[]) => {
      calls['deleted']?.push(args);
    }),
    runRoutineNow: vi.fn(async (...args: unknown[]) => {
      calls['ran']?.push(args);
      return { ok: true };
    }),
    routineRuns: vi.fn(async () => []),
    onTeamChanged: vi.fn(() => () => {}),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount() });
  await act(async () => {
    root.render(React.createElement(Routines, { onClose: () => {} }));
  });
  return { text: (host.textContent ?? '').replace(/\s+/g, ' ').trim(), host, calls };
}

/** The button whose visible label is exactly this. */
function button(host: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find(
    (one) => (one.textContent ?? '').trim() === label,
  ) as HTMLButtonElement | undefined;
}

/** Press it, and let the reload it starts finish. Every verb here reloads the list. */
async function press(host: HTMLElement, label: string): Promise<void> {
  await act(async () => {
    button(host, label)?.click();
  });
}

describe('the screen', () => {
  it('says what it cannot do, once, at the head', async () => {
    const { text } = await screen([NIGHTLY]);

    // The one place the limitation is stated. blobot is a desktop app and not a daemon, and a
    // schedule it cannot keep is worse than one it can.
    expect(text).toContain('blobot runs these while it is open. It does not run them in the background.');
  });

  it('says the shape and what the shape costs, and never says cron', async () => {
    const { text } = await screen([NIGHTLY]);

    expect(text).toContain('every day at 09:00');
    expect(text).not.toContain('cron');
  });

  it('offers run now on every row, because it is the whole of the missed-firing remedy', async () => {
    const { host, calls } = await screen([
      without({ armed: false, missedFirings: 4 }, 'nextRunAt'),
    ]);

    await press(host, 'run now');

    expect(calls['ran']).toEqual([['rt_1']]);
  });

  it('reports a missed firing plainly, because a shut laptop is the ordinary condition', async () => {
    const { text } = await screen([{ ...NIGHTLY, missedFirings: 4 }]);

    expect(text).toContain('missed 4 firings');
  });

  it('offers arm on a disarmed Routine and disarm on an armed one', async () => {
    const armed = await screen([NIGHTLY]);
    expect(button(armed.host, 'disarm')).toBeDefined();

    const off = await screen([without({ armed: false }, 'nextRunAt')]);
    await press(off.host, 'arm');

    // The only place authority enters a Routine, and the loudest control on the screen.
    expect(off.calls['armed']).toEqual([['rt_1', true]]);
  });

  it('refuses to arm a Routine whose agent has gone, and says so instead of guessing', async () => {
    const { host, text } = await screen([
      without({ armed: false }, 'nextRunAt', 'agentName', 'teamName'),
    ]);

    expect(text).toContain('its agent is no longer on a team');
    // Never reassigned to whoever is left: blobot does not decide who a message is for.
    expect(button(host, 'arm')?.disabled).toBe(true);
  });
});

/**
 * Issue 05's 2026-08-30 amendment. An agent arms what it schedules, so nothing here is waiting
 * for permission — but a person still has not looked at it, and that is the second half of the
 * control that pays for the amendment. The ink edge means *you have not seen this*, never *this
 * is waiting for you*: it has been running the whole time it has been sitting there.
 */
describe('a Routine an agent scheduled for itself', () => {
  const scheduled: UiRoutine = without(
    { id: 'rt_2', name: 'branch report', armed: true, proposedByName: 'Bob' },
    'lastRun',
  );

  it('says who scheduled it and that it is running, with the prompt in full', async () => {
    const { host, text } = await screen([scheduled]);

    // It gave itself this, and it has been running while nobody was looking. Both said plainly:
    // the ink edge means *you have not seen this*, never *this is waiting for you*.
    expect(text).toContain('Bob scheduled this · running');
    expect(host.querySelector('.proposal')).not.toBeNull();
    // In full rather than clamped: a person is being asked to read what an agent gave itself.
    expect(host.querySelector('.proposedprompt')?.textContent).toBe(
      'run the typecheck and say what broke',
    );
  });

  it('offers two verbs and only two, and they are the two answers', async () => {
    const { host } = await screen([scheduled]);

    const verbs = [...(host.querySelector('.proposalacts')?.querySelectorAll('button') ?? [])].map(
      (one) => (one.textContent ?? '').trim(),
    );
    // The question changed from *may this run* to *should it go on running*. Both are answers,
    // and there is still no third that quietly leaves it unanswered.
    expect(verbs).toEqual(['keep', 'disarm']);
  });

  it('sits above the list rather than being sorted into it', async () => {
    const { host } = await screen([NIGHTLY, scheduled]);

    const sheet = host.querySelector('.agentssheet');
    const order = [...(sheet?.children ?? [])].map((child) => child.className);
    expect(order.indexOf('proposal')).toBeLessThan(order.indexOf('roster'));
  });

  it('takes the authority back on disarm, and answers it either way', async () => {
    const off = await screen([scheduled]);
    await press(off.host, 'disarm');
    expect(off.calls['armed']).toEqual([['rt_2', false]]);

    // `keep` answers without changing anything. Main marks it reviewed on either call, which is
    // what clears the ink edge: a person looked, and said which.
    const kept = await screen([scheduled]);
    await press(kept.host, 'keep');
    expect(kept.calls['armed']).toEqual([['rt_2', true]]);
    expect(kept.calls['deleted']).toEqual([]);
  });
});
