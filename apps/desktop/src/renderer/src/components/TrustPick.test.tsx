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
import { LEVELS, TrustPick } from './TrustPick.js';

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

function draw(value: TrustLevel): { host: HTMLElement; chosen: TrustLevel[] } {
  const chosen: TrustLevel[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount(), host });
  act(() => {
    root.render(<TrustPick value={value} onChange={(next) => chosen.push(next)} />);
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

  it('is three levels and stays three', () => {
    expect(LEVELS.map((level) => level.id)).toEqual(['careful', 'normal', 'trusting']);
  });

  it('shows the word alone on the closed control', () => {
    // The sentence lives on the menu row, not inside the trigger: a field that wrapped to four
    // lines when it was set to `trusting` would be the only one in the row that did.
    const trigger = draw('trusting').host.querySelector('.selecttrigger');
    expect(trigger?.querySelector('span')?.textContent).toBe('trusting');
  });
});
