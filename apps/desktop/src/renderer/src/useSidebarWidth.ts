import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'blobot.sidebarWidth';
const OPEN_KEY = 'blobot.sidebarOpen';
const DEFAULT = 300;
/** Below this the panel is not narrow, it is shut. One gesture for smaller and for away. */
export const SIDEBAR_FLOOR = 220;
/** The reading measure the transcript is entitled to. `.col` is `max-width:900px`. */
const MEASURE = 900;

export interface SidebarWidth {
  /** 0 when it is shut. The grid column takes this number directly. */
  readonly width: number;
  readonly open: boolean;
  readonly dragging: boolean;
  readonly toggle: () => void;
  readonly onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * The file sidebar's width, dragged and remembered.
 *
 * `useRailWidth` is the prior art for all of it: pointer capture rather than window listeners,
 * because the pointer leaves the handle on the first frame of any real drag; `localStorage`
 * rather than the database, because it is a preference about this screen; and a `clamp` that
 * survives storage being denied.
 *
 * **The transcript keeps its measure and the sidebar gives.** The ceiling is
 * `window - rail - 900`, not half the window: at 1440px a half-window sidebar would leave the
 * transcript 488px, which makes the thing the app is *for* worse in order to dress its edge.
 * The floor wins when even that is impossible, because a narrow panel is better than an absent
 * one.
 *
 * One global width, not per team: a per-team sidebar width is a preference nobody has, and the
 * rail is global already.
 *
 * **Open by default, and shut is what is remembered.** It shipped closed, on the reasoning that a
 * flank should be asked for — and asking for it every single time is not asking, it is a chore.
 * The panel is the only rendering of which files an agent has touched, which is the test the
 * flanks rule now makes a flank pass, so the useful default is the one where that fact is on
 * screen. Closing it is a decision and is kept, exactly as the width and the chosen panel are,
 * and by the same mechanism.
 */
export function useSidebarWidth(railWidth: number, startOpen = false): SidebarWidth {
  const [width, setWidth] = useState(stored);
  // `--screen=files` still forces it open, which is now a redundancy rather than a lever: it
  // costs nothing and it survives someone shutting the panel on this machine.
  const [open, setOpen] = useState(() => startOpen || storedOpen());
  const [dragging, setDragging] = useState(false);
  const [room, setRoom] = useState(() => window.innerWidth);
  const from = useRef(0);

  useEffect(() => {
    const measure = (): void => setRoom(window.innerWidth);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const ceiling = Math.max(SIDEBAR_FLOOR, room - railWidth - MEASURE);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    from.current = event.clientX - (event.currentTarget.getBoundingClientRect().left + 4);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      // Tracks the pointer exactly and animates nothing. An animated drag is a panel that lags
      // your hand, which reads as the app being slow rather than as motion.
      setWidth(Math.round(Math.min(ceiling, window.innerWidth - (event.clientX - from.current))));
    },
    [dragging, ceiling],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragging(false);
      // Below the floor it snaps shut, and the snap is the one animated part of a drag, because
      // it is the app acting rather than the hand.
      if (width < SIDEBAR_FLOOR) {
        setOpen(false);
        rememberOpen(false);
        setWidth(DEFAULT);
        remember(DEFAULT);
        return;
      }
      remember(width);
    },
    [width],
  );

  return {
    width: open ? Math.min(Math.max(width, SIDEBAR_FLOOR), ceiling) : 0,
    open,
    dragging,
    toggle: () =>
      setOpen((was) => {
        rememberOpen(!was);
        return !was;
      }),
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}

function stored(): number {
  try {
    const saved = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(saved) && saved >= SIDEBAR_FLOOR ? saved : DEFAULT;
  } catch {
    // A renderer with storage denied still gets a sidebar.
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

/** Open unless this machine says otherwise. An absent value is a machine that never shut it. */
function storedOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== 'closed';
  } catch {
    // A renderer with storage denied gets the default, which is open.
    return true;
  }
}

function rememberOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    // Nothing to do: it is still open or shut for this session.
  }
}
