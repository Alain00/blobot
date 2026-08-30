import { describe, expect, it } from 'vitest';
import { lineChange } from './line-diff.js';

/**
 * The two shapes are the point. A real Claude sends the same edit twice — once as the strings
 * the tool was called with, and once widened with surrounding context — and both have to give
 * the number the runtime's own structured patch gives.
 */
describe('counting what an edit changed', () => {
  it('agrees with itself on the narrow diff and the widened one', () => {
    // `beta` becomes three lines. Claude's own patch for this reads -beta +beta one/two/three.
    const narrow = lineChange('beta\n', 'beta one\nbeta two\nbeta three\n');
    const widened = lineChange(
      'alpha\nbeta\ngamma\ndelta\nepsilon',
      'alpha\nbeta one\nbeta two\nbeta three\ngamma\ndelta\nepsilon',
    );
    expect(narrow).toEqual({ added: 3, removed: 1 });
    expect(widened).toEqual(narrow);
  });

  it('counts a deletion, in both shapes', () => {
    expect(lineChange('delta\n', '')).toEqual({ added: 0, removed: 1 });
    expect(
      lineChange('beta two\nbeta three\ngamma\ndelta\nepsilon', 'beta two\nbeta three\ngamma\nepsilon'),
    ).toEqual({ added: 0, removed: 1 });
  });

  it('says nothing when nothing changed, rather than zero', () => {
    expect(lineChange('same\n', 'same\n')).toBeUndefined();
    expect(lineChange('', '')).toBeUndefined();
  });

  it('counts a rewritten line as one of each, which is what a diff shows', () => {
    expect(lineChange('a\nb\nc\n', 'a\nB\nc\n')).toEqual({ added: 1, removed: 1 });
  });

  it('counts a pure addition and a whole new file', () => {
    expect(lineChange('a\nc\n', 'a\nb\nc\n')).toEqual({ added: 1, removed: 0 });
    // A `Write` of a new file: no before at all, and the split's trailing empty line cancels.
    expect(lineChange('', 'one\ntwo\nthree\n')).toEqual({ added: 3, removed: 0 });
  });

  it('is not fooled by a moved block into calling it unchanged', () => {
    expect(lineChange('a\nb\nc\n', 'b\nc\na\n')).toEqual({ added: 1, removed: 1 });
  });

  /**
   * The guard, and why it says nothing rather than guessing. The trimming is what keeps this
   * from firing on an ordinary edit to a large file: only the changed region is measured.
   */
  it('trims context first, so a small edit in a huge file is still counted', () => {
    const lines = Array.from({ length: 20_000 }, (_, index) => `line ${index}`);
    const edited = [...lines];
    edited[10_000] = 'line 10000, changed';
    expect(lineChange(lines.join('\n'), edited.join('\n'))).toEqual({ added: 1, removed: 1 });
  });

  it('reports nothing when the changed region itself is enormous', () => {
    const before = Array.from({ length: 2_000 }, (_, index) => `a${index}`).join('\n');
    const after = Array.from({ length: 2_000 }, (_, index) => `b${index}`).join('\n');
    expect(lineChange(before, after)).toBeUndefined();
  });
});
