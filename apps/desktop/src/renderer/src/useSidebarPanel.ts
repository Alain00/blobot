import { useCallback, useState } from 'react';
import type { SidebarPanelKind } from './components/SidebarShell.js';

const KEY = 'blobot.sidebarPanel';

/**
 * Which panel the sidebar is showing: the folder, or what has changed in it.
 *
 * **One global preference**, like the sidebar's own width and for the same reason. Per team or
 * per agent, switching agents to compare their changes would find the panel flipped back, which
 * is an annoyance nobody asked for in exchange for a memory nobody wanted.
 *
 * `localStorage` rather than the database: it is a preference about this screen, and a schema
 * migration for which of two buttons is pressed is the wrong trade. Storage being denied leaves
 * the tree, which is where the sidebar started.
 */
export function useSidebarPanel(): [SidebarPanelKind, (panel: SidebarPanelKind) => void] {
  const [panel, setPanel] = useState<SidebarPanelKind>(stored);
  const choose = useCallback((next: SidebarPanelKind) => {
    setPanel(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // A preference that cannot be remembered is still a preference for this session.
    }
  }, []);
  return [panel, choose];
}

function stored(): SidebarPanelKind {
  try {
    return window.localStorage.getItem(KEY) === 'git' ? 'git' : 'tree';
  } catch {
    return 'tree';
  }
}
