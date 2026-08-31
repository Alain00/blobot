import { describe, expect, it } from 'vitest';
import { _layout } from 'blobatar/internal';
import { SHAPE_TRAITS, SHAPES } from './blobatar-shapes';

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
