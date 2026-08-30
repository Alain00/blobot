import { describe, expect, it } from 'vitest';
import { peekLayout } from './TeamMark.js';

const SIZE = 46;

describe('the faces peeking out of a team folder', () => {
  it('shows the first three, and counts the rest', () => {
    expect(peekLayout(1, SIZE).slots).toHaveLength(1);
    expect(peekLayout(3, SIZE).slots).toHaveLength(3);
    // Four members: three peek and the front panel says there is one more.
    expect(peekLayout(4, SIZE).slots).toHaveLength(3);
    expect(peekLayout(4, SIZE).more).toBe(1);
    expect(peekLayout(9, SIZE).more).toBe(6);
  });

  it('says nothing about a count it is drawing in full', () => {
    for (const count of [1, 2, 3]) expect(peekLayout(count, SIZE).more).toBeUndefined();
  });

  it('overlaps them, so they read as a clump in a pocket', () => {
    const [first, second] = peekLayout(3, SIZE).slots;
    // Each covers most of the one behind it.
    expect(second?.x).toBeLessThan((first?.x ?? 0) + (first?.size ?? 0) / 2);
  });

  it('keeps the clump inside the folder, not merely inside the box', () => {
    // The folder runs from x=8 to x=92 of 100. A face that leaves it reads as standing beside a
    // folder rather than in one, which is why the faces are sized to the folder and not the box.
    for (const size of [46, 92, 160]) {
      const { slots } = peekLayout(7, size);
      const last = slots[slots.length - 1] as { x: number; size: number };
      const first = slots[0] as { x: number };
      expect(first.x).toBeGreaterThanOrEqual(Math.round(size * 0.08) - 1);
      expect(last.x + last.size).toBeLessThanOrEqual(Math.round(size * 0.92) + 1);
    }
  });

  it('centres the clump', () => {
    for (const count of [1, 2, 7]) {
      const { slots } = peekLayout(count, SIZE);
      const last = slots[slots.length - 1] as { x: number; size: number };
      const first = slots[0] as { x: number };
      expect(Math.abs(first.x - (SIZE - (last.x + last.size)))).toBeLessThanOrEqual(1);
    }
  });

  it('sits them high enough that the front panel crops rather than hides them', () => {
    // The front panel's top edge is at 50% of the box. A face has to start above it and reach
    // past it, or the folder is drawn over nothing.
    const [only] = peekLayout(1, SIZE).slots;
    expect(only?.y ?? 0).toBeLessThan(SIZE * 0.5);
    expect((only?.y ?? 0) + (only?.size ?? 0)).toBeGreaterThan(SIZE * 0.5);
  });
});
