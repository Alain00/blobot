import { describe, expect, it } from 'vitest';
import type { UiAgent } from '../../shared/api.js';
import { planLimitRows, resetText, spent, windowName } from './plan-limits.js';

const agent = (id: string, runtimeLabel: string, box = false): UiAgent => ({
  id,
  name: id[0]?.toUpperCase() + id.slice(1),
  role: '',
  runtimeLabel,
  workspacePath: '/w',
  accepts: { images: true, textFiles: true },
  ...(box ? { machine: { kind: 'box' as const, limits: { maxCpus: 2, maxMemoryBytes: 1 } } } : {}),
});

const WINDOWS = [{ durationMinutes: 300, utilization: 0.41, resetsAt: 1 }];

describe('which rows', () => {
  it('draws one row for a login on this computer however many agents share it', () => {
    const rows = planLimitRows(
      [agent('alice', 'Claude Code'), agent('bob', 'Claude Code')],
      { 'local:Claude Code': WINDOWS },
    );
    expect(rows).toEqual([{ login: 'local:Claude Code', label: 'Claude Code', windows: WINDOWS }]);
  });

  it('gives a sandboxed agent its own row with its face, after every shared one', () => {
    const cara = agent('cara', 'Claude Code', true);
    const rows = planLimitRows([cara, agent('alice', 'Claude Code')], {
      'agent:cara': WINDOWS,
      'local:Claude Code': WINDOWS,
    });
    expect(rows.map((row) => [row.label, row.agent?.id])).toEqual([
      ['Claude Code', undefined],
      ['Cara', 'cara'],
    ]);
  });

  it('draws nothing for a login that never sent a reading', () => {
    expect(planLimitRows([agent('bob', 'OpenCode')], { 'local:Claude Code': WINDOWS })).toEqual([]);
  });
});

describe('how a window reads', () => {
  it('names a window by its length', () => {
    expect([300, 10_080, 1_440, 90].map(windowName)).toEqual(['5h', 'week', '1d', '90m']);
  });

  it('gives a fixed time today, a weekday on another day, and a past tense once it reset', () => {
    const now = new Date(2026, 8, 11, 10, 0).getTime(); // a Friday
    expect(resetText(new Date(2026, 8, 11, 14, 5).getTime(), now)).toBe('resets 14:05');
    expect(resetText(new Date(2026, 8, 14, 9, 0).getTime(), now)).toBe('resets Mon 09:00');
    expect(resetText(new Date(2026, 8, 11, 9, 20).getTime(), now)).toBe('reset 09:20');
  });

  it('floors the percent and keeps it between 0 and 100', () => {
    expect([0.419, 0.999, 1.2, -0.1].map(spent)).toEqual([41, 99, 100, 0]);
  });
});
