import { describe, expect, it } from 'vitest';
import { _layout } from 'blobatar/internal';
import { SHAPE_NAMES, SHAPE_TRAITS, SHAPES, traitsFor } from './blobatar-shapes';

/**
 * The exclusion is a list of numbers read against bands the library owns, so the only honest
 * test of it is the library's own resolved shape. `_layout` reports what a name came out as,
 * which is why this asserts on names rather than on the constants: a retune of the bands inside
 * a minor would leave the constants looking right and the faces organic again.
 */
const names = Array.from({ length: 2000 }, (_, i) => `agent-${i}`);

const shapeOf = (name: string): string => _layout(name, { traits: SHAPE_TRAITS }).shape;

describe('the shapes blobot draws', () => {
  it('is never organic, whatever the name', () => {
    expect(names.filter((name) => shapeOf(name) === 'organic')).toEqual([]);
  });

  it('is organic for some names without it, so the test above is not vacuous', () => {
    expect(names.some((name) => _layout(name, {}).shape === 'organic')).toBe(true);
  });

  it('still draws every other silhouette', () => {
    expect(new Set(names.map(shapeOf)).size).toBe(SHAPES.length);
  });

  it('gives one name one shape', () => {
    expect(shapeOf('alice')).toBe(shapeOf('alice'));
  });
});

/**
 * The chosen half. A stored shape is a *name*, and the only honest test of the mapping is the
 * same one above: what the library says a face came out as, for every name in the roster and
 * against every silhouette offered. A band midpoint that drifted into its neighbour would leave
 * the constant looking right and one picker cell drawing another cell's shape.
 */
describe('a shape somebody chose', () => {
  it('is the shape they chose, whatever the name', () => {
    for (const shape of SHAPE_NAMES) {
      const drawn = new Set(names.map((name) => _layout(name, { traits: traitsFor(shape) }).shape));
      expect([...drawn]).toEqual([shape]);
    }
  });

  it('offers every silhouette the app draws, and no more', () => {
    expect(SHAPE_NAMES.length).toBe(SHAPES.length);
    expect(SHAPE_NAMES).not.toContain('organic');
  });

  it('leaves the face to the name when nobody chose one', () => {
    expect(traitsFor(undefined)).toBe(SHAPE_TRAITS);
  });

  it('leaves it to the name for a shape this version does not have', () => {
    // A row written by a later version, read by this one. The face the name gives is a face;
    // a silhouette of our choosing would be a fourth party deciding what an agent looks like.
    expect(traitsFor('rhombus')).toBe(SHAPE_TRAITS);
  });
});
