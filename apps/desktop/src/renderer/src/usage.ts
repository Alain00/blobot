/**
 * A context reading in words. Shared, because the same two numbers are now drawn in two places.
 *
 * The activity column's `CONTEXT` block and the composer's ring answer the same question from
 * opposite ends — *how full is this window* and *how full is the window I am about to write
 * into* — so they must not round differently. One file, two callers, no third way to say `37k`.
 */

/** A token count at a glance: `37k`, `1m`. Never rounded up to a window it has not reached. */
export function tokens(count: number): string {
  if (count >= 1_000_000) return `${Math.floor(count / 100_000) / 10}m`.replace('.0m', 'm');
  if (count >= 1_000) return `${Math.floor(count / 1_000)}k`;
  return `${count}`;
}

/**
 * Floored, so a context that is not yet full never reads as full.
 *
 * Against the working ceiling rather than the advertised window, since ticket 09. The window is
 * still drawn, as the right-hand half of `used/size`, because it is what the runtime said; this
 * is the figure a reader acts on, and the two are not the same question. An agent past its
 * ceiling never reaches here — that case is words, not a number.
 */
export function percent(used: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return Math.min(100, Math.floor((used / ceiling) * 100));
}
