import { useLayoutEffect, useRef } from 'react';

/**
 * Under the 250ms an interface may spend on something a person does tens of times a day, and
 * the strong ease-out from `DESIGN.md`'s two curves rather than a third invented here.
 */
const DURATION = 190;
const EASE_OUT = 'cubic-bezier(0.23,1,0.32,1)';
/** Per row, and squeezed on a large roster so the last one still lands inside the budget. */
const STAGGER = 30;
const STAGGER_TOTAL = 90;

/**
 * The team you just opened: making room for its roster.
 *
 * **Two things move, and they are one gesture.** The roster's box grows from nothing, so the
 * teams below it slide out of the way instead of being shoved down between two frames. And each
 * row fades in, staggered, which is what covers the overlap while that is happening — the rows
 * are painted where they will end up from the first frame, deliberately, so nothing is clipped
 * on its way into a box that is still short.
 *
 * **There used to be a third: the faces flew out of the team's folder into their rows.** It was
 * the best thing here — the only part of the interface that *said* the rows are the folder's
 * contents rather than merely laying them out that way. It is gone with the folder. A team's
 * mark is now its project icon where it has one and a bare stack of faces where it does not, so
 * the flight could only ever run on half the teams, and a face travelling out of a favicon is
 * not a sentence. Half a gesture that fires on some rows and not others is worse than none: the
 * user would be learning which teams animate, which is not a fact about anything.
 *
 * **Only opening moves.** The team being left has had its rows removed from the document by the
 * time this runs. It is also the right asymmetry: leaving is the system responding and should be
 * over instantly, arriving is what the person asked for.
 *
 * Cancelling first, and `Animation` rather than a keyframe class, because A → B → C is an
 * ordinary thing to do in a column of teams: a CSS animation restarts from zero on re-trigger,
 * where this replaces cleanly mid-flight.
 */
export function useTeamOpening(key: string): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const seen = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const rail = ref.current;
    if (rail === null) return;

    // The first paint of a session is not an opening: nothing was shut a moment ago, and a
    // launch that begins by animating the rail is answering a question nobody asked.
    const previous = seen.current;
    seen.current = key;
    if (previous === undefined || previous === key) return;

    // `DESIGN.md`'s rule, and this is the one channel the stylesheet cannot withdraw for us.
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

    const roster = rail.querySelector<HTMLElement>('.roster');
    if (roster === null) return;
    const rows = [...roster.querySelectorAll<HTMLElement>('.agentrow')];
    const stagger = Math.min(STAGGER, Math.round(STAGGER_TOTAL / Math.max(rows.length - 1, 1)));

    // The room the roster takes up. `height` is the one thing here that is not a `transform`,
    // and it is unavoidable: what has to move is everything *below* the roster, and nothing but
    // its height can move that. One box, a handful of rows, once per switch.
    if (roster.offsetHeight > 0) {
      const tall = `${roster.offsetHeight}px`;
      for (const running of roster.getAnimations()) running.cancel();
      roster.animate([{ height: '0px' }, { height: tall }], {
        duration: DURATION,
        easing: EASE_OUT,
        fill: 'backwards',
      });
    }

    rows.forEach((row, index) => {
      for (const running of row.getAnimations()) running.cancel();
      row.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: DURATION,
        delay: index * stagger,
        easing: EASE_OUT,
        fill: 'backwards',
      });
    });
  }, [key]);

  return ref;
}
