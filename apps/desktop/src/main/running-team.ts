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
  readonly branches: Record<string, string>;
  /** False when the agents are real. The rail says so, so nobody mistakes a mock for a hire. */
  readonly demoMode: boolean;
  /** What `--autoplay` sends, so a scripted team and a real one can each get a fair prompt. */
  readonly autoplayPrompt: string;
  close(): Promise<void> | void;
}
