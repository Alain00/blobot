import { describe, expect, it } from 'vitest';
import { peekLayout } from './TeamMark.js';

const SIZE = 46;

describe('the faces in a team mark', () => {
  it('shows up to three, and past that gives the last slot to the count', () => {
    expect(peekLayout(1, SIZE).slots).toHaveLength(1);
    expect(peekLayout(3, SIZE).slots).toHaveLength(3);
    // Four members: two faces and a `+2`. The old folder could show three and label a fourth on
    // its front panel, because the panel was a surface the faces did not occupy. A bare stack
    // has no such surface, so the count is one of the three slots and stands for itself too.
    expect(peekLayout(4, SIZE).slots).toHaveLength(3);
    expect(peekLayout(4, SIZE).more).toBe(2);
    expect(peekLayout(9, SIZE).more).toBe(7);
  });

  it('says nothing about a count it is drawing in full', () => {
    for (const count of [1, 2, 3]) expect(peekLayout(count, SIZE).more).toBeUndefined();
  });

  it('overlaps them, so they read as a stack rather than three things in a row', () => {
    const [first, second] = peekLayout(3, SIZE).slots;
    // Each covers most of the one behind it.
    expect(second?.x).toBeLessThan((first?.x ?? 0) + (first?.size ?? 0) / 2);
  });

  it('fills the box, because the faces are the mark and there is no folder to fit inside', () => {
    // They used to be sized to the folder — x=8 to x=92 of 100 — so that none hung past its
    // sides and read as standing beside a container rather than in one. There is no container.
    for (const size of [46, 92, 160]) {
      const { slots } = peekLayout(7, size);
      const last = slots[slots.length - 1] as { x: number; size: number };
      const first = slots[0] as { x: number };
      expect(first.x).toBeGreaterThanOrEqual(0);
      expect(last.x + last.size).toBeLessThanOrEqual(size);
    }
  });

  it('centres the stack, in both directions', () => {
    for (const count of [1, 2, 7]) {
      const { slots } = peekLayout(count, SIZE);
      const last = slots[slots.length - 1] as { x: number; size: number };
      const first = slots[0] as { x: number; y: number; size: number };
      expect(Math.abs(first.x - (SIZE - (last.x + last.size)))).toBeLessThanOrEqual(1);
      // Vertically too. They used to sit high, so the folder's front panel at y=50% cropped
      // them; a face is drawn whole now.
      expect(Math.abs(first.y - (SIZE - (first.y + first.size)))).toBeLessThanOrEqual(1);
    }
  });
});
