import { useCallback, useEffect, useState } from 'react';
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
  const [statuses, setStatuses] = useState<readonly UiWorkspaceStatus[]>([]);
  const [looking, setLooking] = useState(false);

  const read = useCallback(
    (forge: boolean) => {
      if (teamId === undefined) return;
      if (forge) setLooking(true);
      void window.blobot
        .workspaceStatus(teamId, forge)
        .then((rows) => setStatuses(rows))
        .catch(() => setStatuses([]))
        .finally(() => {
          if (forge) setLooking(false);
        });
    },
    [teamId],
  );

  // A different team is a different set of workspaces, and the old team's rows must not sit on
  // screen under the new team's name while the read is in flight.
  useEffect(() => {
    setStatuses([]);
    read(false);
    read(true);
  }, [read]);

  useEffect(() => {
    if (revision === 0) return;
    read(false);
  }, [revision, read]);

  return { statuses, looking, refresh: () => read(true) };
}
