import { describe, expect, it } from 'vitest';
import type { SessionUpdate } from '../acp/wire.js';
import { planLimitsFrom } from './plan-limits.js';

/** The frame as a real bridge sent it: `first-demo/research/15-transcripts/cc1.jsonl:24`. */
const OBSERVED = {
  sessionUpdate: 'usage_update',
  used: 32281,
  size: 1000000,
  _meta: {
    '_claude/rateLimit': {
      status: 'allowed',
      resetsAt: 1788021600,
      rateLimitType: 'five_hour',
      overageStatus: 'rejected',
      overageDisabledReason: 'org_level_disabled',
      isUsingOverage: false,
      unifiedWindows: {
        five_hour: { utilization: 0.41, resetsAt: 1788021600 },
        seven_day: { utilization: 0.14, resetsAt: 1788242400 },
      },
    },
  },
} as unknown as SessionUpdate;

const withWindows = (unifiedWindows: unknown): SessionUpdate =>
  ({
    sessionUpdate: 'usage_update',
    used: 1,
    size: 2,
    _meta: { '_claude/rateLimit': { unifiedWindows } },
  }) as unknown as SessionUpdate;

describe('a Claude Plan limit', () => {
  it('reads both windows off the observed frame, by duration, in millis', () => {
    expect(planLimitsFrom(OBSERVED)).toEqual({
      type: 'plan_limits_updated',
      windows: [
        { durationMinutes: 300, utilization: 0.41, resetsAt: 1788021600_000 },
        { durationMinutes: 10_080, utilization: 0.14, resetsAt: 1788242400_000 },
      ],
    });
  });

  it('carries nothing but the windows: no status, no overage', () => {
    const event = planLimitsFrom(OBSERVED);
    expect(Object.keys(event ?? {}).sort()).toEqual(['type', 'windows']);
    for (const window of event?.windows ?? []) {
      expect(Object.keys(window).sort()).toEqual(['durationMinutes', 'resetsAt', 'utilization']);
    }
  });

  it('drops a window it does not know, rather than drawing a vendor key', () => {
    const event = planLimitsFrom(
      withWindows({
        seven_day_opus: { utilization: 0.9, resetsAt: 1788242400 },
        five_hour: { utilization: 0.2, resetsAt: 1788021600 },
      }),
    );
    expect(event?.windows).toEqual([
      { durationMinutes: 300, utilization: 0.2, resetsAt: 1788021600_000 },
    ]);
  });

  it('sends nothing when no window it knows is readable', () => {
    expect(planLimitsFrom(withWindows({ seven_day_opus: { utilization: 0.9, resetsAt: 1 } }))).toBeUndefined();
    expect(planLimitsFrom(withWindows({ five_hour: { utilization: '41%', resetsAt: 1 } }))).toBeUndefined();
    expect(planLimitsFrom(withWindows(null))).toBeUndefined();
    expect(planLimitsFrom({ sessionUpdate: 'usage_update', used: 1, size: 2 })).toBeUndefined();
  });

  it('reads only a usage update', () => {
    expect(
      planLimitsFrom({ ...OBSERVED, sessionUpdate: 'agent_message_chunk' } as SessionUpdate),
    ).toBeUndefined();
  });
});
