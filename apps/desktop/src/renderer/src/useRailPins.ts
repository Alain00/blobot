import { useCallback, useState } from 'react';

const KEY = 'blobot.railPins';

/**
 * Which rail rows the user pinned, in the order they pinned them.
 *
 * One list holding both kinds of id — a team id or an AgentProfile id — because the rail is one
 * list and a pin is a fact about a row rather than about what is behind it. Order is pin order
 * and never recency: the block exists so the projects and people a person returns to stay where
 * they left them, and re-sorting it under them would undo the whole point.
 *
 * `localStorage` rather than the database, on `useSidebarPanel`'s reasoning: it is a preference
 * about this column on this machine, and a schema migration for which rows are at the top is
 * the wrong trade. Storage being denied leaves an unpinned rail, which is where it started.
 */
export function useRailPins(): {
  readonly pinned: readonly string[];
  readonly toggle: (id: string) => void;
} {
  const [pinned, setPinned] = useState<readonly string[]>(stored);
  const toggle = useCallback((id: string) => {
    setPinned((current) => {
      const next = current.includes(id)
        ? current.filter((one) => one !== id)
        : [...current, id];
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // A pin that cannot be remembered is still a pin for this session.
      }
      return next;
    });
  }, []);
  return { pinned, toggle };
}

function stored(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    // A row whose team or agent has since been deleted simply matches nothing when the list is
    // assembled, so a stale id costs nothing and needs no reconciliation pass.
    return Array.isArray(parsed) ? parsed.filter((one): one is string => typeof one === 'string') : [];
  } catch {
    return [];
  }
}
