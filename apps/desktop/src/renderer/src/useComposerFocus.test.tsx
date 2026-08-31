/**
 * @vitest-environment jsdom
 *
 * The gate that makes a face turning toward the composer legal.
 *
 * The motion itself is two-thirds of a pixel and nothing here can see it. What is worth pinning
 * is the *when*: DESIGN.md's two budgets differ by whether a thing can start on its own, so a
 * pending face that looked at the composer while nobody was in it would be ambient motion on a
 * budget already spent on status. These claims are that it answers focus and only focus, and
 * that moving between two fields of one composer does not flick it off and back on.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import React, { useEffect, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useComposerFocus } from './useComposerFocus.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement | undefined;

afterEach(() => {
  host?.remove();
  host = undefined;
});

interface Watched {
  /** Every value the hook has returned, in order, so a flicker is visible rather than averaged. */
  readonly seen: (Element | null)[];
  readonly field: HTMLTextAreaElement;
  readonly send: HTMLButtonElement;
  readonly outside: HTMLButtonElement;
  readonly composer: HTMLElement;
}

/**
 * A composer with two focusable things in it and one outside, which is the shape that matters:
 * the field and the send button are one composer, and tabbing between them must read as staying.
 */
function watch(): Watched {
  host = document.createElement('div');
  document.body.append(host);

  host.innerHTML =
    '<div class="composer"><textarea></textarea><button class="send"></button></div>' +
    '<button class="elsewhere"></button>';

  const seen: (Element | null)[] = [];
  function Probe(): React.JSX.Element {
    const composer = useComposerFocus();
    const [, force] = useState(0);
    useEffect(() => {
      seen.push(composer);
      force((n) => n);
    }, [composer]);
    return React.createElement('span');
  }

  const mount = document.createElement('div');
  host.append(mount);
  act(() => {
    createRoot(mount).render(React.createElement(Probe));
  });

  return {
    seen,
    field: host.querySelector('textarea') as HTMLTextAreaElement,
    send: host.querySelector('.send') as HTMLButtonElement,
    outside: host.querySelector('.elsewhere') as HTMLButtonElement,
    composer: host.querySelector('.composer') as HTMLElement,
  };
}

/** Focus, then let the deferred read past `focusout` run. */
async function focus(el: HTMLElement | null): Promise<void> {
  await act(async () => {
    if (el === null) (document.activeElement as HTMLElement | null)?.blur();
    else el.focus();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

describe('the composer, while the user is in it', () => {
  it('is nothing until somebody focuses it', () => {
    const watched = watch();
    expect(watched.seen.at(-1)).toBeNull();
  });

  it('is the composer once the field has focus', async () => {
    const watched = watch();
    await focus(watched.field);
    expect(watched.seen.at(-1)).toBe(watched.composer);
  });

  it('is nothing again when focus leaves it', async () => {
    const watched = watch();
    await focus(watched.field);
    await focus(watched.outside);
    expect(watched.seen.at(-1)).toBeNull();
  });

  it('never reports a control outside the composer as the composer', async () => {
    const watched = watch();
    await focus(watched.outside);
    expect(watched.seen.at(-1)).toBeNull();
  });

  it('does not flick off and back on when focus moves inside one composer', async () => {
    const watched = watch();
    await focus(watched.field);
    const settled = watched.seen.length;
    await focus(watched.send);

    // `focusout` fires with `activeElement` at `body`, so the pair really does pass through
    // null. What this pins is that nothing downstream ever sees it: React batches the two
    // updates into one render, so a face does not snap home and back for a frame every time a
    // user tabs to send. It is the reason the hook needs no deferral, and the reason to notice
    // if that ever stops being true.
    expect(watched.seen.slice(settled)).not.toContain(null);
    expect(watched.seen.at(-1)).toBe(watched.composer);
  });
});
