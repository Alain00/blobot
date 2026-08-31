/**
 * @vitest-environment jsdom
 *
 * The one control here whose words are blobot's own, so the test is about the words.
 *
 * Two claims. Every level says what the agent will do, in words somebody who has never thought
 * about this can act on. And the menu never grows a fourth row: the step above `trusting` is
 * `bypassPermissions`, so the list is closed by design rather than by nobody having got round
 * to it.
 *
 * *2026-08-31: the first claim used to be "a closed control still says it", asserted against a
 * sentence under the trigger. That sentence moved onto the menu row, so the assertion is on the
 * copy table instead. The words are unchanged and still the thing under test; what is gone is
 * the claim about where they sit, which is now false on purpose.*
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { TrustLevel } from '../../../shared/api.js';
import { LEVELS, levelsFor, TrustPick } from './TrustPick.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const drawn: { unmount: () => void; host: HTMLElement }[] = [];
afterEach(() => {
  act(() => {
    for (const entry of drawn.splice(0)) {
      entry.unmount();
      entry.host.remove();
    }
  });
});

const ALL: readonly TrustLevel[] = ['careful', 'normal', 'trusting', 'unattended'];
const ATTENDED: readonly TrustLevel[] = ['careful', 'normal', 'trusting'];

function draw(
  value: TrustLevel,
  available: readonly TrustLevel[] = ALL,
): { host: HTMLElement; chosen: TrustLevel[] } {
  const chosen: TrustLevel[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount(), host });
  act(() => {
    root.render(
      <TrustPick value={value} available={available} onChange={(next) => chosen.push(next)} />,
    );
  });
  return { host, chosen };
}

describe('the trust picker', () => {
  const says = (id: TrustLevel): string =>
    LEVELS.find((level) => level.id === id)?.says ?? '';

  it('says what the agent will do, at every level', () => {
    expect(says('normal')).toContain('Edits files and runs ordinary commands in its own copy');
    expect(says('careful')).toContain('Asks before every edit and every command');
  });

  it('says what trusting still refuses, in the same breath as what it allows', () => {
    // The sentence carries the ceiling. There is no level above this one, and a user reading
    // the loosest option is entitled to know that while choosing it, which is why the sentence
    // is on the row rather than under the closed trigger.
    expect(says('trusting')).toContain('installs packages and fetches from the network');
    expect(says('trusting')).toContain('Still asks before deleting, publishing');
  });

  it('keeps every row’s sentence near the length of the others', () => {
    // The menu sizes to its longest row, so a sentence here is a layout decision as much as a
    // copy one: the fourth level's first draft was 156 characters and pushed the menu past the
    // dialog holding it. `.trustmenu` caps the width, so the failure is now wrapping rather
    // than overflow -- but a row that wraps to a paragraph beside three one-liners still reads
    // as the important one, and none of them is. A ceiling and no ratio, because `careful`
    // being the shortest by far is right rather than a violation.
    const longest = Math.max(...LEVELS.map((level) => level.says.length));
    expect(longest).toBeLessThanOrEqual(140);
  });

  it('says who answers at the fourth level, and what it refuses outright', () => {
    // The two facts a reader will otherwise supply wrongly for themselves. The first is the
    // whole of what `unattended` costs; the second is the failure they will actually meet
    // first, because a classifier that denies stops the work with nothing on screen.
    expect(says('unattended')).toContain('answered by the runtime, not by you');
    // Measured live before this sentence was written: under `auto` the classifier ran `chmod`,
    // pushed a branch and reached for `sudo` with no request reaching blobot. The refusal is a
    // deny list now, and the row has to say refused rather than asked, because at this level
    // asking is the one thing that cannot happen.
    expect(says('unattended')).toContain('are refused');
    expect(says('unattended')).not.toContain('asks before');
  });

  it('is four levels and stays four', () => {
    expect(LEVELS.map((level) => level.id)).toEqual([
      'careful',
      'normal',
      'trusting',
      'unattended',
    ]);
  });

  it('draws only the levels the runtime can express', () => {
    // Absent rather than disabled: a greyed row invites *why not*, and the honest answer names
    // a provider this component is not allowed to know about.
    expect(levelsFor(ATTENDED).map((level) => level.id)).toEqual([
      'careful',
      'normal',
      'trusting',
    ]);
    expect(levelsFor(ALL)).toHaveLength(4);
  });

  it('shows whichever level is set on the closed control, fourth included', () => {
    // The menu rows themselves are a Radix portal that exists only while open, so what a
    // closed picker can be asked is which word it is currently showing. `levelsFor` above is
    // what decides the rows, and it is tested as a function for that reason.
    const trigger = draw('unattended', ALL).host.querySelector('.selecttrigger');
    expect(trigger?.querySelector('span')?.textContent).toBe('unattended');
  });

  it('shows the word alone on the closed control', () => {
    // The sentence lives on the menu row, not inside the trigger: a field that wrapped to four
    // lines when it was set to `trusting` would be the only one in the row that did.
    const trigger = draw('trusting').host.querySelector('.selecttrigger');
    expect(trigger?.querySelector('span')?.textContent).toBe('trusting');
  });
});

