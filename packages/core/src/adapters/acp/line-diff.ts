/**
 * How many lines an edit added and removed, from the before and after that ACP hands us.
 *
 * Protocol-level, not provider-level: `{type:'diff', path, oldText, newText}` is ACP's own
 * content block, and a real Claude sends it on every edit (`.scratch/first-demo/build.md`,
 * measured 2026-08-30). So this sits in the shared half, and a runtime that sends the block
 * gets counts without an adapter of its own knowing anything.
 *
 * It has to be a real diff rather than a line count, because the same edit arrives twice in two
 * shapes: first the narrow one, `beta\n` becoming three lines, and then a widened one carrying
 * the surrounding context, where most of what is present did not change. Counting lines would
 * make the second reading absurd. An LCS gives the same answer for both, which is the test.
 */
export interface LineChange {
  readonly added: number;
  readonly removed: number;
}

/**
 * Past this many changed lines on either side the quadratic cost stops being worth paying, and
 * nothing is reported. A missing count is honest; a wrong one is not, and neither is a frame
 * dropped inside a turn. Common prefixes and suffixes are trimmed first, so this bounds the
 * genuinely changed region rather than the file — the widened diff of a 5,000 line file whose
 * edit touched three lines trims to three.
 */
const MAX_CHANGED_LINES = 1_500;

export function lineChange(oldText: string, newText: string): LineChange | undefined {
  if (oldText === newText) return undefined;
  const before = oldText.split('\n');
  const after = newText.split('\n');

  // Trim what both sides share at each end. This is what makes a context-widened diff cheap,
  // and it never changes the answer: an unchanged line is neither added nor removed.
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }

  const oldRest = before.slice(head, before.length - tail);
  const newRest = after.slice(head, after.length - tail);
  if (oldRest.length === 0 && newRest.length === 0) return undefined;
  if (oldRest.length > MAX_CHANGED_LINES || newRest.length > MAX_CHANGED_LINES) return undefined;

  const common = longestCommonSubsequence(oldRest, newRest);
  return { added: newRest.length - common, removed: oldRest.length - common };
}

/**
 * The length of the longest common subsequence, in two rows rather than a full table: only the
 * count is wanted, never the alignment, so the whole matrix is never needed at once.
 */
function longestCommonSubsequence(left: readonly string[], right: readonly string[]): number {
  let previous = new Uint32Array(right.length + 1);
  let current = new Uint32Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] =
        left[i - 1] === right[j - 1]
          ? (previous[j - 1] as number) + 1
          : Math.max(previous[j] as number, current[j - 1] as number);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  return previous[right.length] as number;
}
