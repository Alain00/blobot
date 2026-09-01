import { describe, expect, it } from 'vitest';
import { Segmenter, chunkEnergy, type SegmentAction } from './segmenter.js';

const LOUD = 0.05;
const QUIET = 0.001;
const chunk = (tag: number): Uint8Array => new Uint8Array([tag]);
const kinds = (actions: readonly SegmentAction[]): string =>
  actions.map((action) => (action.kind === 'mark' ? '|' : String(action.chunk[0]))).join(' ');

function play(segmenter: Segmenter, energies: readonly number[], from = 0): SegmentAction[] {
  return energies.flatMap((energy, i) => segmenter.push(chunk(from + i), energy));
}

describe('cutting segments for a local engine', () => {
  it('never sends leading silence, keeps a little of it as pre-roll, and marks after the pause', () => {
    const segmenter = new Segmenter({ takes: 'segments', prerollMs: 200 });
    // Ten chunks of silence, twelve of voice, six of silence.
    const out = play(segmenter, [
      ...Array<number>(10).fill(QUIET),
      ...Array<number>(12).fill(LOUD),
      ...Array<number>(6).fill(QUIET),
    ]);
    // Pre-roll is the last two silent chunks, then the voice, then the six that close it.
    expect(kinds(out)).toBe('8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 |');
    expect(segmenter.open).toBe(false);
  });

  it('does not close a segment shorter than the minimum on a pause', () => {
    const segmenter = new Segmenter({ takes: 'segments', prerollMs: 0, minMs: 1_000 });
    const out = play(segmenter, [LOUD, LOUD, LOUD, QUIET, QUIET, QUIET, QUIET, QUIET, QUIET]);
    expect(out.some((action) => action.kind === 'mark')).toBe(false);
    expect(segmenter.open).toBe(true);
  });

  it('cuts at the quietest moment of the tail when it reaches the ceiling', () => {
    const segmenter = new Segmenter({ takes: 'segments', prerollMs: 0, maxMs: 1_000, lookbackMs: 300 });
    // Ten chunks of voice, with a dip at the eighth.
    const energies = [LOUD, LOUD, LOUD, LOUD, LOUD, LOUD, LOUD, 0.02, LOUD, LOUD];
    const out = play(segmenter, energies);
    expect(kinds(out)).toBe('0 1 2 3 4 5 6 7 | 8 9');
    // The remainder is already the next segment.
    expect(segmenter.open).toBe(true);
  });

  it('flushes what it holds on stop and closes the open segment', () => {
    const segmenter = new Segmenter({ takes: 'segments', prerollMs: 0, maxMs: 1_000, lookbackMs: 300 });
    const out = play(segmenter, [LOUD, LOUD, LOUD, LOUD, LOUD, LOUD, LOUD, LOUD]);
    expect(kinds(out)).toBe('0 1 2 3 4 5 6');
    expect(kinds(segmenter.flush())).toBe('7 |');
    expect(segmenter.open).toBe(false);
  });

  it('never marks a segment of pure silence', () => {
    const segmenter = new Segmenter({ takes: 'segments' });
    const out = play(segmenter, Array<number>(40).fill(QUIET));
    expect(out).toEqual([]);
    expect(segmenter.flush()).toEqual([]);
  });
});

describe('feeding a streaming provider', () => {
  it('sends everything, silence included, and still says where the pauses are', () => {
    const segmenter = new Segmenter({ takes: 'stream' });
    const out = play(segmenter, [QUIET, QUIET, ...Array<number>(12).fill(LOUD), ...Array<number>(6).fill(QUIET), QUIET]);
    expect(kinds(out)).toBe('0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 | 20');
  });
});

describe('the energy of a chunk', () => {
  it('is the RMS of the samples, 0..1', () => {
    expect(chunkEnergy(new Int16Array(0))).toBe(0);
    expect(chunkEnergy(new Int16Array(100).fill(0))).toBe(0);
    expect(chunkEnergy(new Int16Array(100).fill(16384))).toBeCloseTo(0.5, 3);
  });
});
