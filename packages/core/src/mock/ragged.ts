/**
 * Deltas arrive in bursts, not on a metronome: three fragments landed in the *same
 * millisecond* in the observed transcripts, then a 130ms gap. An evenly-paced mock produces
 * a UI that looks smooth in dev and janks in production, so raggedness is the default here.
 *
 * The pattern is a fixed rotation rather than seeded randomness — a failing test that
 * reports "seed 4823 broke" leaves you to reverse-engineer what that was.
 */

export interface Fragment {
  readonly text: string;
  /** Milliseconds to wait before emitting this fragment. Zero inside a burst. */
  readonly delayBeforeMs: number;
}

/** Fragments per burst, cycled. */
const BURST_SIZES = [3, 1, 2, 3, 2, 1] as const;
/** Gaps between bursts, cycled. Observed range was ~20–130ms. */
const BURST_GAPS = [45, 130, 20, 90, 60, 110] as const;

/**
 * Split `text` into ragged fragments. When `overMs` is given the gaps are scaled to fill
 * exactly that long — which is how an agent that takes ninety seconds to say anything is
 * written as one line of scenario.
 */
export function raggedFragments(text: string, overMs?: number): Fragment[] {
  const tokens = text.match(/\S+\s*/g) ?? (text.length > 0 ? [text] : []);
  if (tokens.length === 0) return [];

  const raw: { text: string; gap: number }[] = [];
  let tokenIndex = 0;
  let burst = 0;
  while (tokenIndex < tokens.length) {
    const size = BURST_SIZES[burst % BURST_SIZES.length] ?? 1;
    const gap = BURST_GAPS[burst % BURST_GAPS.length] ?? 45;
    for (let inBurst = 0; inBurst < size && tokenIndex < tokens.length; inBurst += 1) {
      raw.push({ text: tokens[tokenIndex] as string, gap: inBurst === 0 ? gap : 0 });
      tokenIndex += 1;
    }
    burst += 1;
  }

  if (overMs === undefined) {
    return raw.map((fragment) => ({ text: fragment.text, delayBeforeMs: fragment.gap }));
  }
  return scaleToDuration(raw, overMs);
}

function scaleToDuration(raw: { text: string; gap: number }[], overMs: number): Fragment[] {
  const total = raw.reduce((sum, fragment) => sum + fragment.gap, 0);
  if (total === 0) {
    // Every fragment landed in one burst; put the whole wait in front of the first.
    return raw.map((fragment, index) => ({
      text: fragment.text,
      delayBeforeMs: index === 0 ? overMs : 0,
    }));
  }
  const scaled = raw.map((fragment) => ({
    text: fragment.text,
    delayBeforeMs: Math.round((fragment.gap / total) * overMs),
  }));
  const drift = overMs - scaled.reduce((sum, fragment) => sum + fragment.delayBeforeMs, 0);
  const last = scaled[scaled.length - 1];
  if (last !== undefined && drift !== 0) {
    scaled[scaled.length - 1] = {
      text: last.text,
      delayBeforeMs: Math.max(0, last.delayBeforeMs + drift),
    };
  }
  return scaled;
}
