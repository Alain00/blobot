import { describe, expect, it } from 'vitest';
import { trustLevelsFor } from './runtime-for.js';

/**
 * The seam that decides how many rows the agent form draws.
 *
 * Tested here rather than through the picker because the picker's menu is a Radix portal that
 * exists only while it is open: a closed control can be asked which word it is showing and
 * nothing else. This is where the answer is actually made.
 */
describe('which trust levels a runtime can express', () => {
  it('gives Claude the fourth, because it is the only one with a classifier', () => {
    expect(trustLevelsFor('claude-code')).toEqual([
      'careful',
      'normal',
      'trusting',
      'unattended',
    ]);
  });

  it('gives the other three runtimes three levels', () => {
    for (const runtimeId of ['opencode', 'codex', 'fx']) {
      expect(trustLevelsFor(runtimeId)).toEqual(['careful', 'normal', 'trusting']);
    }
  });

  it('gives an unknown runtime the three every runtime can express', () => {
    // Not a throw, unlike `runtimeFor`: refusing to draw a picker is not the right answer to a
    // runtime blobot cannot place, and the launch is refused by name anyway.
    expect(trustLevelsFor('something-else')).toEqual(['careful', 'normal', 'trusting']);
  });
});
