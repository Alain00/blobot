import type { Agent, Orchestrator, SqliteStore, Team } from '@blobot/core';

/**
 * A team that is running right now: rows from the database, plus the live objects built
 * around them. Demo mode and a real team the user created produce the same shape, which is
 * why the renderer cannot tell them apart except by `demoMode`.
 */
export interface RunningTeam {
  readonly team: Team;
  readonly agents: readonly Agent[];
  readonly orchestrator: Orchestrator;
  readonly store: SqliteStore;
  readonly runtimeLabels: Record<string, string>;
  /** What blobot knows about each model's usable context, in tokens. Absent means unmeasured. */
  readonly contextCeilings: Record<string, number>;
  readonly branches: Record<string, string>;
  /** False when the agents are real. The rail says so, so nobody mistakes a mock for a hire. */
  readonly demoMode: boolean;
  /** What `--autoplay` sends, so a scripted team and a real one can each get a fair prompt. */
  readonly autoplayPrompt: string;
  close(): Promise<void> | void;
}

/**
 * Whether anyone on the team is mid-turn.
 *
 * Derived from the status fold rather than tracked separately, so it cannot disagree with the
 * blobatar the user is looking at. `failed` counts as quiet: a dead agent is not doing work
 * that evicting the team would throw away.
 */
export function isWorking(live: RunningTeam): boolean {
  return live.agents.some((agent) => {
    const status = live.orchestrator.statusOf(agent.id);
    return status !== 'idle' && status !== 'failed';
  });
}
