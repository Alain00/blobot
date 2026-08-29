import { describe, expect, it } from 'vitest';
import { raggedFragments } from './ragged.js';

describe('raggedFragments', () => {
  it('reconstructs the text exactly', () => {
    const text = 'The retry loop has no backoff — two retries hit the same limit.';
    expect(raggedFragments(text).map((fragment) => fragment.text).join('')).toBe(text);
  });

  it('bursts: several fragments with no delay between them, then a gap', () => {
    const fragments = raggedFragments('one two three four five six');
    expect(fragments.filter((fragment) => fragment.delayBeforeMs === 0).length).toBeGreaterThan(0);
    expect(Math.max(...fragments.map((fragment) => fragment.delayBeforeMs))).toBeGreaterThanOrEqual(
      100,
    );
  });

  it('is deterministic — no seed to reverse-engineer from a failing test', () => {
    expect(raggedFragments('a b c d e')).toEqual(raggedFragments('a b c d e'));
  });

  it('stretches to fill an explicit duration', () => {
    const fragments = raggedFragments('one two three four five six seven', 90_000);
    const total = fragments.reduce((sum, fragment) => sum + fragment.delayBeforeMs, 0);
    expect(total).toBe(90_000);
  });

  it('handles an empty string', () => {
    expect(raggedFragments('')).toEqual([]);
  });
});
