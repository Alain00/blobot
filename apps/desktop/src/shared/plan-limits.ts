import type { StoredMachinePlacement } from '@blobot/core/domain';

/** One window of a Plan limit, as the renderer receives it. */
export interface UiPlanLimitWindow {
  readonly durationMinutes: number;
  /** 0 to 1. */
  readonly utilization: number;
  /** Epoch millis. May be behind the clock: a reading outlives its window if nothing runs. */
  readonly resetsAt: number;
}

/**
 * The last Plan limit reading per login, app-wide, keyed by {@link planLimitLogin}.
 *
 * Not per team: a login on this computer is shared by every Agent of that runtime on every team,
 * so a reading one team took is as true while another is on screen. Held in main's memory and
 * never persisted, so a restart starts empty.
 */
export type UiPlanLimits = Readonly<Record<string, readonly UiPlanLimitWindow[]>>;

/**
 * Which login an Agent's Plan limit belongs to. Main files readings under it and the renderer
 * groups rows by it, so it is one function and never two that could drift.
 *
 * On this computer an Agent uses the operator's own login for its runtime, keyed by the runtime's
 * label because that is the one thing about the runtime both processes hold. In a sandbox the
 * vendor CLI keeps its login in that Agent's own guest home (`docs/machines.md`), so the login is
 * the Agent's and nobody else's.
 */
export function planLimitLogin(agent: {
  readonly id: string;
  readonly runtimeLabel: string;
  readonly machine?: StoredMachinePlacement;
}): string {
  return agent.machine?.kind === 'box' ? `agent:${agent.id}` : `local:${agent.runtimeLabel}`;
}
