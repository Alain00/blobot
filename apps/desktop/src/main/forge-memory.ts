import type { UiPullRequest, UiWorkspaceStatus } from '../shared/api.js';

/**
 * The last thing the forge said about each agent's branch, held for as long as blobot is open.
 *
 * A workspace read has two halves at two prices: local git, asked whenever a turn settles, and a
 * `gh` round trip, asked on opening a team and on the user's refresh. Each read used to answer the
 * whole row, so a local read took the pull request off the tray after every turn, and opening a
 * team drew its tray in three steps. The pool keeps teams live in main, so main keeps what the
 * forge last said and hands it back with a local read.
 *
 * **Per branch, never per agent.** A pull request belongs to a head, and after a switch the
 * remembered answer is about a branch this worktree is no longer on. Nothing here is persisted:
 * a pull request opened in a browser while blobot was shut is what a restart should find.
 */
interface Answer {
  readonly branch: string;
  readonly pr?: UiPullRequest;
  readonly unavailable?: string;
}

export class ForgeMemory {
  readonly #teams = new Map<string, Map<string, Answer>>();

  /** A read that asked the forge replaces what was remembered; one that did not borrows it. */
  settle(
    teamId: string,
    rows: readonly UiWorkspaceStatus[],
    asked: boolean,
  ): readonly UiWorkspaceStatus[] {
    if (asked) {
      const answers = new Map<string, Answer>();
      for (const row of rows) {
        // A folder that is gone was never asked about, so its reason is not the forge's answer.
        if (row.branch === undefined || !row.present) continue;
        answers.set(row.agentId, {
          branch: row.branch,
          ...(row.pr === undefined ? {} : { pr: row.pr }),
          ...(row.unavailable === undefined ? {} : { unavailable: row.unavailable }),
        });
      }
      this.#teams.set(teamId, answers);
      return rows;
    }
    const answers = this.#teams.get(teamId);
    if (answers === undefined) return rows;
    return rows.map((row) => {
      const answer = answers.get(row.agentId);
      if (answer === undefined || !row.present || row.branch !== answer.branch) return row;
      const { pr, unavailable, ...local } = row;
      return {
        ...local,
        ...(answer.pr === undefined ? {} : { pr: answer.pr }),
        ...(answer.unavailable === undefined ? {} : { unavailable: answer.unavailable }),
      };
    });
  }
}
