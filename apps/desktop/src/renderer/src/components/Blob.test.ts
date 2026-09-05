/**
 * Where a face looks, and how far.
 *
 * Both rules are pure and both are load-bearing in a way nothing on screen can catch: the gaze
 * writes sub-pixel amounts, so a wrong answer here does not look broken, it looks like nothing.
 * The two claims are that `waiting` takes the pointer whatever the call site asked for, and
 * that a face wearing status keeps its excursion under the status signal.
 */
import { describe, expect, it } from 'vitest';
import type { AgentStatus } from '@blobot/core/domain';
import { SEEN, TRAVEL, aimOf, wanderPoint } from './Blob.js';

/** Every status the fold can produce, so a new one cannot quietly slip past these rules. */
const STATUSES: readonly AgentStatus[] = [
  'idle',
  'starting',
  'thinking',
  'working',
  'responding',
  'waiting',
  'failed',
];

/**
 * The `thinking` seesaw, in viewBox units, from the library's own note. The floor is measured
 * against it rather than against a pixel count, because a viewBox unit is 1% of the face at
 * every size and a pixel count is only true at one.
 */
const THINKING_SWING = 8.4;

describe('where a face looks', () => {
  it('gives waiting the pointer, because the state means eyes on you', () => {
    expect(aimOf('waiting', undefined)).toBe('pointer');
  });

  it('overrides the call site there, rather than letting a surface aim a blocked agent away', () => {
    const elsewhere = { x: 10, y: 10 };
    expect(aimOf('waiting', elsewhere)).toBe('pointer');
    expect(aimOf('waiting', 'rest')).toBe('pointer');
  });

  it('claims no other status, so the pointer never becomes an ambient default', () => {
    for (const status of STATUSES.filter((s) => s !== 'waiting')) {
      expect(aimOf(status, undefined)).toBeNull();
    }
  });

  it('defers to the call site everywhere else', () => {
    const target = { x: 4, y: 2 };
    expect(aimOf('working', target)).toBe(target);
    expect(aimOf(undefined, 'pointer')).toBe('pointer');
    expect(aimOf('idle', 'rest')).toBe('rest');
  });

  it('collapses an unaimed face to null rather than leaving the driver unasked', () => {
    // The library distinguishes the two: omitted means "I aim this myself", and a hook that was
    // handed `undefined` would never write over an imperative call. Null is the answer that
    // makes the wander possible rather than the one that ignores it: a declared target is
    // re-applied only when it changes, so `null` hands the eyes to `useWander`'s imperative
    // calls and takes them straight back the moment a status has something to say.
    expect(aimOf(undefined, undefined)).toBeNull();
  });
});

describe('how far a face looks', () => {
  it('keeps the default under the signal it sits beneath', () => {
    // A face nobody asked for more on is a floor, the way the idle layer is: attention read
    // beneath motion that reads as working, rather than a second channel beside it.
    expect(TRAVEL).toBeLessThan(THINKING_SWING / 2);
  });

  it('lets the surfaces that mean to be seen past that on purpose, because a gaze nobody notices is not a channel', () => {
    // The reversal is the point, so it is pinned rather than left to a comment: lowering this
    // back under the signal should fail here and be argued for, not slipped in.
    expect(SEEN).toBeGreaterThan(THINKING_SWING);
  });

  it('keeps them well short of the limb, where a face turns away instead of toward', () => {
    // At 24 the mark reaches the edge of the head and the eye arrives there at almost no width.
    // Half of that is a turn a person reads as being looked at.
    expect(SEEN).toBeLessThanOrEqual(12);
  });
});

/**
 * Where a wandering face looks.
 *
 * The timer and the driver are not testable in jsdom -- there is no layout, no `getBBox` and no
 * pointer, and `stubGazeHost` answers no to everything on purpose -- so the seam is the one pure
 * function: a box and a source of randomness in, a point in the room out. What is worth pinning
 * is that it always lands outside the near field, where `DEADZONE` eases the excursion to
 * nothing, and that it reaches every direction rather than one quadrant.
 */
describe('a face glancing around the room', () => {
  /** A rail-sized face, part of the way down the column. */
  const FACE = { left: 12, top: 200, width: 44, height: 44 } as DOMRect;

  /** A `roll` that plays the numbers it is given, in order. */
  const rolls = (...values: number[]): (() => number) => {
    let index = 0;
    return () => values[index++ % values.length] as number;
  };

  it('never lands on itself, whatever it rolls', () => {
    // The angle sweeps the circle and the distance takes both ends of its range, including the
    // shortest, which is the roll a near field could swallow.
    for (const angle of [0, 0.125, 0.25, 0.5, 0.75, 0.9]) {
      for (const reach of [0, 0.5, 0.999]) {
        const point = wanderPoint(FACE, rolls(angle, reach));
        const away = Math.hypot(
          point.x - (FACE.left + FACE.width / 2),
          point.y - (FACE.top + FACE.height / 2),
        );
        // Well past `DEADZONE`, which is a fraction of the face's own radius: inside it the
        // excursion eases to zero and the glance would be a face not moving.
        expect(away).toBeGreaterThan(FACE.width);
      }
    }
  });

  it('reaches every direction, so a column of faces cannot share one', () => {
    const quadrants = new Set(
      [0.1, 0.35, 0.6, 0.85].map((angle) => {
        const point = wanderPoint(FACE, rolls(angle, 0.5));
        const right = point.x > FACE.left + FACE.width / 2;
        const down = point.y > FACE.top + FACE.height / 2;
        return `${right ? 'r' : 'l'}${down ? 'd' : 'u'}`;
      }),
    );

    expect(quadrants.size).toBe(4);
  });
});
