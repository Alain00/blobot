import { useLayoutEffect, useRef } from 'react';
import { peekLayout } from './components/TeamMark.js';

/**
 * Under the 250ms an interface may spend on something a person does tens of times a day, and
 * the strong ease-out from `DESIGN.md`'s two curves rather than a third invented here.
 */
const DURATION = 190;
const EASE_OUT = 'cubic-bezier(0.23,1,0.32,1)';
/** Per face, and squeezed on a large roster so the last one still lands inside the budget. */
const STAGGER = 30;
const STAGGER_TOTAL = 90;

/**
 * The team you just opened, coming out of its folder.
 *
 * A team row is a folder holding its members' faces; opening the team empties it and lists those
 * members as rows underneath. This is the sentence that connects the two states: each row's face
 * starts where that member was sitting in the folder, at the size it was, and travels to where it
 * now lives. Nothing here is decorative — it is the only thing that says the rows *are* the
 * folder's contents, which is otherwise a claim the layout makes and never demonstrates.
 *
 * **It is a FLIP, and the first half of it is arithmetic rather than measurement.** The usual
 * shape of this — capture rects before the click, replay them after — is wrong here, because a
 * team switch is asynchronous: a cold team takes seconds to open, and a rect captured before the
 * click has had a whole rail's worth of reflow to go stale. The source is *derivable* instead.
 * The folder is still on screen, `peekLayout` is the same pure function that placed the faces
 * inside it, and between them they give an exact source rect at the moment the animation starts.
 * There is nothing to capture and nothing to go stale.
 *
 * **Only opening travels.** The team being left has had its rows removed from the document by
 * the time this runs, so there is nothing to animate them from, and chasing that would mean
 * captured rects and the staleness above. It is also the right asymmetry: leaving is the system
 * responding and should be over instantly, arriving is what the person asked for.
 *
 * Cancelling first, and `Animation` rather than a keyframe class, because A → B → C is an
 * ordinary thing to do in a column of teams: a CSS animation restarts from zero on re-trigger,
 * where this replaces cleanly mid-flight. The status animations are untouched — they sit on the
 * `.blob` inside, and this moves the wrapper around it.
 */
export function useFaceFlight(key: string): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const seen = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const rail = ref.current;
    if (rail === null) return;

    // The first paint of a session is not an opening: nothing was shut a moment ago, and a
    // launch that begins by throwing faces across the rail is answering a question nobody asked.
    const previous = seen.current;
    seen.current = key;
    if (previous === undefined || previous === key) return;

    // `DESIGN.md`'s rule, and this is the one channel the stylesheet cannot withdraw for us.
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

    const mark = rail.querySelector('.mark.open');
    const faces = [...rail.querySelectorAll<HTMLElement>('[data-face]')];
    if (mark === null || faces.length === 0) return;

    const box = mark.getBoundingClientRect();
    if (box.width === 0) return;
    const { slots } = peekLayout(faces.length, box.width);
    const stagger = Math.min(STAGGER, Math.round(STAGGER_TOTAL / Math.max(faces.length - 1, 1)));

    faces.forEach((face, index) => {
      // Past the third there was no slot of their own: the folder said `+N` about them, and the
      // pocket they come out of is the last one drawn.
      const slot = slots[Math.min(index, slots.length - 1)];
      const to = face.getBoundingClientRect();
      if (slot === undefined || to.width === 0) return;

      for (const running of face.getAnimations()) running.cancel();
      face.animate(
        [
          {
            // Top-left, so the offsets are the difference between two rects and nothing else.
            // `fill: backwards` leaves no trace of it once the face has landed.
            transformOrigin: '0 0',
            transform:
              `translate(${box.left + slot.x - to.left}px, ${box.top + slot.y - to.top}px) ` +
              `scale(${slot.size / to.width})`,
          },
          { transformOrigin: '0 0', transform: 'none' },
        ],
        { duration: DURATION, delay: index * stagger, easing: EASE_OUT, fill: 'backwards' },
      );
    });
  }, [key]);

  return ref;
}
