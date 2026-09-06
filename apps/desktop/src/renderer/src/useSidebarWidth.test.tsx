/**
 * @vitest-environment jsdom
 *
 * Whether the file sidebar is open, and what is remembered about that.
 *
 * The width, the drag and the ceiling arithmetic are not here: jsdom has no layout, and
 * `test-dom.ts` records why a test that believed otherwise is worse than no test. What is worth
 * pinning is the default and the memory — it shipped closed, so the panel that is the *only*
 * rendering of which files an agent touched had to be asked for on every launch, and asking
 * every time is not asking.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSidebarWidth } from './useSidebarWidth.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A storage of our own, because this jsdom has none.
 *
 * Which is itself the reason every read and write in the hook is wrapped: a renderer without
 * storage still gets a sidebar, and the default it gets is the thing under test.
 */
const kept = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
    clear: () => kept.clear(),
  },
});

let host: HTMLElement | undefined;

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  host?.remove();
  host = undefined;
  window.localStorage.clear();
});

/** Mounts the hook and hands back its `open` and its toggle. */
function mount(startOpen = false): { open: () => boolean; toggle: () => void } {
  let sidebar!: ReturnType<typeof useSidebarWidth>;
  function Probe(): React.JSX.Element {
    sidebar = useSidebarWidth(280, startOpen);
    return <span>{String(sidebar.open)}</span>;
  }
  host = document.createElement('div');
  document.body.append(host);
  act(() => createRoot(host as HTMLElement).render(<Probe />));
  return { open: () => sidebar.open, toggle: () => act(() => sidebar.toggle()) };
}

describe('the file sidebar', () => {
  it('opens by default on a machine that has never shut it', () => {
    expect(mount().open()).toBe(true);
  });

  it('remembers being shut, and remembers being opened again', () => {
    const first = mount();
    first.toggle();
    expect(first.open()).toBe(false);
    expect(window.localStorage.getItem('blobot.sidebarOpen')).toBe('closed');

    // A fresh renderer: the decision is the thing that is kept, not the default.
    host?.remove();
    expect(mount().open()).toBe(false);

    const back = mount();
    back.toggle();
    expect(window.localStorage.getItem('blobot.sidebarOpen')).toBe('open');
    host?.remove();
    expect(mount().open()).toBe(true);
  });

  it('is opened by the launch flag even where this machine shut it', () => {
    // `--screen=files` is for a screenshot, which cannot click the toggle.
    window.localStorage.setItem('blobot.sidebarOpen', 'closed');
    expect(mount(true).open()).toBe(true);
  });
});
