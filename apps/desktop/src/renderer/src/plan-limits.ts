import type { UiAgent } from '../../shared/api.js';
import {
  planLimitLogin,
  type UiPlanLimits,
  type UiPlanLimitWindow,
} from '../../shared/plan-limits.js';

/**
 * One login's Plan limit, ready to draw.
 *
 * `agent` is present exactly when the login is one Agent's own, which is a sandbox: the row wears
 * that Agent's face. A login on this computer is shared, belongs to no single place in the
 * roster, and is named by its runtime instead.
 */
export interface PlanLimitRow {
  readonly login: string;
  readonly label: string;
  readonly agent?: UiAgent;
  readonly windows: readonly UiPlanLimitWindow[];
}

/**
 * The rows for these agents: one per distinct login that has a reading, shared logins first,
 * then sandboxed Agents in roster order. A login with no reading has no row, never an empty one.
 */
export function planLimitRows(agents: readonly UiAgent[], readings: UiPlanLimits): PlanLimitRow[] {
  const shared: PlanLimitRow[] = [];
  const own: PlanLimitRow[] = [];
  const seen = new Set<string>();
  for (const agent of agents) {
    const login = planLimitLogin(agent);
    const windows = readings[login];
    if (seen.has(login) || windows === undefined || windows.length === 0) continue;
    seen.add(login);
    if (agent.machine?.kind === 'box') own.push({ login, label: agent.name, agent, windows });
    else shared.push({ login, label: agent.runtimeLabel, windows });
  }
  return [...shared, ...own];
}

/** `5h`, `week`. A window's name is its length, so nothing here is a vendor's word for it. */
export function windowName(durationMinutes: number): string {
  if (durationMinutes === 10_080) return 'week';
  if (durationMinutes % 1_440 === 0) return `${durationMinutes / 1_440}d`;
  if (durationMinutes % 60 === 0) return `${durationMinutes / 60}h`;
  return `${durationMinutes}m`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * When a window resets, as a fixed time and never a countdown: `resets 14:00` today,
 * `resets Fri 09:00` on another day. A relative time would be a moving figure in a panel.
 *
 * Once the reset is behind the clock it reads `reset 14:00`, and the caller draws no percent,
 * because blobot knows the window reset and does not know what it reads now.
 */
export function resetText(resetsAt: number, now: number): string {
  const at = new Date(resetsAt);
  const today = new Date(now);
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate();
  const when = sameDay ? time : `${DAYS[at.getDay()]} ${time}`;
  return resetsAt <= now ? `reset ${when}` : `resets ${when}`;
}

/** Floored, like the gauge, so a window that is not yet spent never reads as spent. */
export function spent(utilization: number): number {
  return Math.max(0, Math.min(100, Math.floor(utilization * 100)));
}
