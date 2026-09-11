import { useCallback, useEffect, useRef, useState } from 'react';
import type { UiWorkspaceStatus } from '../../shared/api.js';

/**
 * Each agent's workspace, kept current, in two halves that follow different things.
 *
 * **git follows the work.** The local half is a couple of subprocesses in a directory, so it is
 * re-read whenever something finishes: an agent that just wrote three files should not be
 * described by a count taken before it started.
 *
 * **GitHub follows the user.** The forge half costs a `gh` and a network round trip, so it runs
 * on opening a team and on the refresh the user asks for, and on nothing else. There is no
 * timer here on purpose: a team left open in the background must not sit making requests
 * nobody wanted, and a pull request does not appear on its own anyway, because the only thing
 * that could open one is a person.
 */
export function useWorkspaces(
  teamId: string | undefined,
  /** Bumped when a turn finishes, so the local half follows the work without a poll. */
  revision: number,
): {
  readonly statuses: readonly UiWorkspaceStatus[];
  readonly looking: boolean;
  readonly refresh: () => void;
} {
  // The last rows read for each team this session. Every thread is a team, so without this every
  // switch drew the tray empty for the round trip and faded it back in, which is the blink.
  const seen = useRef(new Map<string, readonly UiWorkspaceStatus[]>());
  // Keyed by team, so rows are never drawn under another team's name however the reads interleave.
  const [answer, setAnswer] = useState<{ teamId?: string; rows: readonly UiWorkspaceStatus[] }>({
    rows: [],
  });
  const [looking, setLooking] = useState(false);

  const read = useCallback(
    (forge: boolean) => {
      if (teamId === undefined) return;
      if (forge) setLooking(true);
      const settle = (rows: readonly UiWorkspaceStatus[]): void => {
        seen.current.set(teamId, rows);
        setAnswer({ teamId, rows });
      };
      void window.blobot
        .workspaceStatus(teamId, forge)
        .then(settle)
        .catch(() => settle([]))
        .finally(() => {
          if (forge) setLooking(false);
        });
    },
    [teamId],
  );

  useEffect(() => {
    read(false);
    read(true);
  }, [read]);

  useEffect(() => {
    if (revision === 0) return;
    read(false);
  }, [revision, read]);

  // Answered in the render the team changes, from what this team last said, rather than a render
  // later from an effect: the footer mounts in that render, and a tray that mounts empty fades
  // its answer in. A read that lands replaces it without a word, the file tree's own rule for
  // being a second behind.
  const statuses =
    teamId === undefined
      ? []
      : answer.teamId === teamId
        ? answer.rows
        : (seen.current.get(teamId) ?? []);
  return { statuses, looking, refresh: () => read(true) };
}
