import { useCallback, useRef, useState } from 'react';

const KEY = 'blobot.railWidth';
const DEFAULT = 232;
/** Narrow enough to be a strip of names, wide enough that a long team name still reads. */
const MIN = 180;
const MAX = 460;

export interface RailWidth {
  readonly width: number;
  readonly dragging: boolean;
  readonly onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * The rail's width, dragged and remembered. Pointer capture rather than window listeners: the
 * pointer leaves the 9px handle on the first frame of any real drag, and without capture the
 * move events go to whatever is under it instead.
 *
 * Kept in `localStorage` because it is a preference about this screen, not a fact about the
 * teams, and the database is for things the orchestrator can act on.
 */
export function useRailWidth(): RailWidth {
  const [width, setWidth] = useState(stored);
  const [dragging, setDragging] = useState(false);
  const from = useRef(0);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    from.current = event.currentTarget.getBoundingClientRect().left + 4 - event.clientX;
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      setWidth(clamp(event.clientX + from.current));
    },
    [dragging],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragging(false);
      remember(width);
    },
    [width],
  );

  return { width, dragging, onPointerDown, onPointerMove, onPointerUp };
}

function clamp(width: number): number {
  return Math.round(Math.min(MAX, Math.max(MIN, width)));
}

function stored(): number {
  try {
    const saved = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(saved) && saved > 0 ? clamp(saved) : DEFAULT;
  } catch {
    // A renderer with storage denied still gets a rail.
    return DEFAULT;
  }
}

function remember(width: number): void {
  try {
    window.localStorage.setItem(KEY, String(width));
  } catch {
    // Nothing to do: the width is still applied for this session.
  }
}
