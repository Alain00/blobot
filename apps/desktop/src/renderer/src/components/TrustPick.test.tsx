/**
 * @vitest-environment jsdom
 *
 * The one control here whose words are blobot's own, so the test is about the words.
 *
 * Two claims. A closed control still says what the agent will do, because the sentence under it
 * is the point of offering the choice to somebody who has never thought about it. And the menu
 * never grows a fourth row: the step above `trusting` is `bypassPermissions`, so the list is
 * closed by design rather than by nobody having got round to it.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { TrustLevel } from '../../../shared/api.js';
import { TrustPick } from './TrustPick.js';

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
  it('says what the agent will do without being opened', () => {
    expect(draw('normal').host.textContent).toContain(
      'Edits files and runs ordinary commands in its own copy',
    );
    expect(draw('careful').host.textContent).toContain('Asks before every edit and every command');
  });

  it('says what trusting still refuses, in the same breath as what it allows', () => {
    // The sentence carries the ceiling. There is no level above this one, and a user reading
    // the loosest option is entitled to know that before choosing it.
    const { host } = draw('trusting');
    expect(host.textContent).toContain('installs packages and fetches from the network');
    expect(host.textContent).toContain('Still asks before deleting, publishing');
  });

  it('shows the word alone on the closed control', () => {
    // The sentence lives under the trigger, not inside it: a field that wrapped to four lines
    // when it was set to `trusting` would be the only one in the column that did.
    const trigger = draw('trusting').host.querySelector('.selecttrigger');
    expect(trigger?.querySelector('span')?.textContent).toBe('trusting');
  });
});
