/**
 * @vitest-environment jsdom
 *
 * The one place a vendor's path is allowed on screen, so the test is about the two rules that
 * keep it allowed: it is never coloured, and an id it does not know draws nothing.
 *
 * The second is the one that matters as the runtime list grows. Codex landed as a detection
 * before its mark did and drew nothing for a while, which is what this pins for the fourth:
 * a placeholder glyph in that gap would be blobot inventing a face for a product that has one.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeMark } from './RuntimeMark.js';

let host: HTMLDivElement | undefined;

function draw(runtimeId: string): HTMLDivElement {
  host = document.createElement('div');
  document.body.append(host);
  act(() => createRoot(host as HTMLDivElement).render(<RuntimeMark runtimeId={runtimeId} />));
  return host;
}

afterEach(() => {
  host?.remove();
  host = undefined;
});

describe('a runtime’s own mark', () => {
  it('draws the runtimes that have one', () => {
    for (const id of ['claude-code', 'opencode', 'codex', 'fx']) {
      expect(draw(id).querySelector('svg')).not.toBeNull();
      host?.remove();
    }
  });

  it('draws nothing at all for an id it does not know', () => {
    // Not an empty box holding the layout open either: the row is label-only until a mark
    // exists, which is the honest version of "this runtime landed before its logo did".
    expect(draw('gemini-cli').innerHTML).toBe('');
    expect(draw('').innerHTML).toBe('');
  });

  it('never carries a colour of its own, so it greys with the row it sits in', () => {
    for (const id of ['claude-code', 'opencode', 'codex', 'fx']) {
      const markup = draw(id).innerHTML;
      // The whole of the exception in DESIGN.md is that a vendor mark is *greyed*. A literal
      // fill or stroke here would be brand colour on screen, which the palette forbids.
      expect(markup).not.toMatch(/(fill|stroke)="#/i);
      expect(markup).toMatch(/currentColor/);
      host?.remove();
    }
  });
});
