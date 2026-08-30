import { useCallback, useState } from 'react';

const KEY = 'blobot.feedVisible';

/**
 * Whether the activity column is on screen, remembered across launches.
 *
 * Auto-collapsing it when empty was rejected while building, and still is: the feed would
 * reappear on the first tool call and shove the conversation sideways mid-turn. A toggle has
 * none of that problem, because the column only ever moves when the user asks it to.
 *
 * `localStorage` for the same reason as the rail's width: it is a preference about this screen,
 * not a fact about the teams, and the database is for things the orchestrator can act on.
 */
export function useFeedVisible(): { visible: boolean; toggle: () => void } {
  const [visible, setVisible] = useState(stored);

  const toggle = useCallback(() => {
    setVisible((was) => {
      remember(!was);
      return !was;
    });
  }, []);

  return { visible, toggle };
}

function stored(): boolean {
  try {
    // Absent means shown: the demo's claim is that you can watch two agents work at once.
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function remember(visible: boolean): void {
  try {
    window.localStorage.setItem(KEY, visible ? 'on' : 'off');
  } catch {
    // Nothing to do: the choice still holds for this session.
  }
}
