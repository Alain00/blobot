import type { Agent, PlanLimitsUpdated } from '@blobot/core';
import { describe, expect, it } from 'vitest';
import { PlanLimitReadings } from './plan-limits.js';

const member = (id: string, teamId: string, box = false): Agent => ({
  id,
  teamId,
  name: id,
  role: '',
  workspacePath: '/w',
  ...(box ? { machine: { kind: 'box' as const, limits: { maxCpus: 2, maxMemoryBytes: 1 } } } : {}),
});

const reading = (agentId: string, utilization: number): PlanLimitsUpdated => ({
  type: 'plan_limits_updated',
  agentId,
  sessionId: 's',
  at: 0,
  windows: [{ durationMinutes: 300, utilization, resetsAt: 1_000 }],
});

describe('Plan limit readings', () => {
  it('files a local agent under its runtime, so another team on that login reads the same', () => {
    const readings = new PlanLimitReadings();
    const one = { agents: [member('alice', 'one')], runtimeLabels: { alice: 'Claude Code' } };
    const two = { agents: [member('bob', 'two')], runtimeLabels: { bob: 'Claude Code' } };
    readings.observe(one, reading('alice', 0.41));
    readings.observe(two, reading('bob', 0.43));
    expect(readings.all()).toEqual({
      'local:Claude Code': [{ durationMinutes: 300, utilization: 0.43, resetsAt: 1_000 }],
    });
  });

  it('files a sandboxed agent under itself, apart from the shared login', () => {
    const readings = new PlanLimitReadings();
    const team = {
      agents: [member('alice', 'one'), member('cara', 'one', true)],
      runtimeLabels: { alice: 'Claude Code', cara: 'Claude Code' },
    };
    readings.observe(team, reading('alice', 0.41));
    readings.observe(team, reading('cara', 0.08));
    expect(Object.keys(readings.all()).sort()).toEqual(['agent:cara', 'local:Claude Code']);
  });

  it('files nothing for an agent that is not on the team', () => {
    const readings = new PlanLimitReadings();
    expect(readings.observe({ agents: [], runtimeLabels: {} }, reading('ghost', 1))).toBe(false);
    expect(readings.all()).toEqual({});
  });
});
