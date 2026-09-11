import type { PlanLimitsUpdated, PlanLimitWindow } from '../../events.js';
import type { InjectableEvent } from '../../mock/mock-agent-runtime.js';
import type { SessionUpdate } from '../acp/wire.js';

/**
 * The windows blobot draws, by the bridge's key for each, in the order they are drawn.
 *
 * **A closed list.** Anything else the bridge sends under `unifiedWindows` is dropped, the way
 * the palette refuses what nobody vouched for: a key a vendor adds or renames would otherwise
 * change what is on screen without anyone deciding it. Adding one is a line here.
 */
const WINDOWS: readonly (readonly [key: string, durationMinutes: number])[] = [
  ['five_hour', 300],
  ['seven_day', 10_080],
];

/**
 * The Plan limit riding on a Claude `usage_update`, in blobot's shape.
 *
 * The bridge attaches `_meta["_claude/rateLimit"]` to the same update that carries the context
 * reading (observed in `first-demo/research/15-transcripts/cc1.jsonl`), so this runs beside the
 * shared translation rather than instead of it, and the gauge never learns this exists.
 *
 * Only the utilization and the reset of each known window survive. `status`, the overage fields
 * and the reason overage is off are advice or account detail, and blobot draws neither.
 */
export function planLimitsFrom(
  update: SessionUpdate,
): InjectableEvent<PlanLimitsUpdated> | undefined {
  if (update.sessionUpdate !== 'usage_update') return undefined;
  const meta = update._meta as Record<string, unknown> | undefined;
  const rateLimit = record(meta?.['_claude/rateLimit']);
  const unified = record(rateLimit?.['unifiedWindows']);
  if (unified === undefined) return undefined;
  const windows: PlanLimitWindow[] = [];
  for (const [key, durationMinutes] of WINDOWS) {
    const window = record(unified[key]);
    const utilization = window?.['utilization'];
    const resetsAt = window?.['resetsAt'];
    if (!finite(utilization) || !finite(resetsAt)) continue;
    // The bridge counts in epoch seconds; the vocabulary counts in millis, like every `at`.
    windows.push({ durationMinutes, utilization, resetsAt: resetsAt * 1000 });
  }
  return windows.length === 0 ? undefined : { type: 'plan_limits_updated', windows };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
