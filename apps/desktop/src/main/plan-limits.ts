import type { PlanLimitsUpdated } from '@blobot/core';
import { planLimitLogin, type UiPlanLimits, type UiPlanLimitWindow } from '../shared/plan-limits.js';
import type { RunningTeam } from './running-team.js';

/**
 * The last Plan limit reading per login, for the whole app and for as long as it is open.
 *
 * Held here rather than on a team, because the login is not a team's: a reading one team's Claude
 * agent took is the same account every other local Claude agent is spending. In memory only, and
 * deliberately so: a reading is stale the moment its window resets, and one read back after a
 * restart would be a figure nobody can vouch for. See `.scratch/plan-limits/`.
 */
export class PlanLimitReadings {
  readonly #readings = new Map<string, readonly UiPlanLimitWindow[]>();

  /**
   * Files a reading under the login behind the agent that sent it. False when that agent is not on
   * the team, which files nothing: a reading nobody can place is not somebody's.
   */
  observe(team: Pick<RunningTeam, 'agents' | 'runtimeLabels'>, event: PlanLimitsUpdated): boolean {
    const agent = team.agents.find((candidate) => candidate.id === event.agentId);
    if (agent === undefined) return false;
    const login = planLimitLogin({
      id: agent.id,
      runtimeLabel: team.runtimeLabels[agent.id] ?? 'unknown',
      ...(agent.machine === undefined ? {} : { machine: agent.machine }),
    });
    this.#readings.set(
      login,
      event.windows.map(({ durationMinutes, utilization, resetsAt }) => ({
        durationMinutes,
        utilization,
        resetsAt,
      })),
    );
    return true;
  }

  all(): UiPlanLimits {
    return Object.fromEntries(this.#readings);
  }
}
