import { describe, expect, it } from 'vitest';
import { markLayout } from './TeamMark.js';

const SIZE = 46;

describe('a team mark', () => {
  it('arranges by how many there are: alone, a pair, a triangle, a square', () => {
    expect(markLayout(1, SIZE).slots).toHaveLength(1);
    expect(markLayout(2, SIZE).slots).toHaveLength(2);
    expect(markLayout(3, SIZE).slots).toHaveLength(3);
    expect(markLayout(4, SIZE).slots).toHaveLength(4);
  });

  it('puts a pair corner to corner and stands three on a triangle', () => {
    const [first, second] = markLayout(2, SIZE).slots;
    expect(first).toMatchObject({ x: 0, y: 0 });
    expect(second?.x).toBe(SIZE - (first?.size ?? 0));

    const [top, left, right] = markLayout(3, SIZE).slots;
    expect(top?.y).toBe(0);
    expect(left?.y).toBe(right?.y);
    expect(top?.x).toBeGreaterThan(left?.x ?? 0);
  });

  it('turns the last slot into a count once there are more than four', () => {
    expect(markLayout(4, SIZE).more).toBeUndefined();
    // Five members: three drawn, and the fourth slot says there are two more.
    expect(markLayout(5, SIZE).more).toBe(2);
    expect(markLayout(9, SIZE).more).toBe(6);
  });

  it('overlaps its members, so the mark reads as one clump', () => {
    const [first, second] = markLayout(2, SIZE).slots;
    // The pair sits corner to corner, so their overlap is the worst case in any arrangement.
    expect((first?.size ?? 0) * 2 - SIZE).toBeGreaterThan(SIZE * 0.25);
    expect(second?.x).toBeLessThan(first?.size ?? 0);
  });

  it('never lets a member leave the box, whatever the count', () => {
    for (const count of [1, 2, 3, 4, 7]) {
      for (const slot of markLayout(count, SIZE).slots) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.x + slot.size).toBeLessThanOrEqual(SIZE);
        expect(slot.y + slot.size).toBeLessThanOrEqual(SIZE);
      }
    }
  });
});
