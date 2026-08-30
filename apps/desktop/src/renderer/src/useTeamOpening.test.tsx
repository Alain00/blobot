/**
 * @vitest-environment jsdom
 *
 * Opening a team: the room its roster takes up, and where its faces come from.
 *
 * A screenshot cannot see motion, so what is asserted here is the arithmetic: the source rect
 * the animation starts at is the slot that face occupied *inside the folder*, at the size it
 * was there. Get that wrong by a few pixels and the effect is not a subtly worse animation, it
 * is a face that jumps before it travels — the illusion is the two states being the same
 * position, and nothing else about it survives the seam being visible.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiAgent, UiTeam, UiTeamSummary } from '../../shared/api.js';
import { Rail } from './components/Rail.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The rail scrolls the open team's group into view, and jsdom implements no scrolling.
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

/** Where the harness puts things, so the expected numbers below can be worked out by hand. */
const MARK = { left: 20, top: 100, size: 46 };
const ROW = { left: 24, top: 160, size: 34, pitch: 52 };
const ROSTER_HEIGHT = 110;

/** The three kinds of thing this animates, told apart by what their keyframes touch. */
function calls(kind: 'height' | 'transform' | 'opacity'): [Record<string, unknown>[], KeyframeAnimationOptions][] {
  return (keyframes.mock.calls as [Record<string, unknown>[], KeyframeAnimationOptions][]).filter(
    ([frames]) => {
      const first = frames[0] ?? {};
      if (kind === 'height') return 'height' in first;
      if (kind === 'transform') return 'transform' in first;
      return !('height' in first) && !('transform' in first) && 'opacity' in first;
    },
  );
}

const keyframes = vi.fn();

beforeEach(() => {
  keyframes.mockClear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  Element.prototype.animate = function (frames: unknown, options: unknown) {
    keyframes(frames, options);
    return { cancel: () => {} } as unknown as Animation;
  } as unknown as typeof Element.prototype.animate;
  Element.prototype.getAnimations = () => [];
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('roster') ? ROSTER_HEIGHT : 0;
    },
  });
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (this.classList.contains('mark')) {
      return box(MARK.left, MARK.top, MARK.size);
    }
    const face = this.getAttribute('data-face');
    if (face !== null) {
      const index = Number(face.slice(1)) - 1;
      return box(ROW.left, ROW.top + index * ROW.pitch, ROW.size);
    }
    return box(0, 0, 0);
  };
});

function box(left: number, top: number, size: number): DOMRect {
  return {
    left,
    top,
    width: size,
    height: size,
    right: left + size,
    bottom: top + size,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function teamOf(id: string, members: number): { team: UiTeam; agents: UiAgent[]; row: UiTeamSummary } {
  const agents = Array.from({ length: members }, (_, index) => ({
    id: `a${index + 1}`,
    name: `Agent ${index + 1}`,
    role: 'builds',
    runtimeLabel: 'mock',
    workspacePath: `/w/${index}`,
  }));
  return {
    team: { id, name: id, workspacePath: '/w', turnBudget: 10 },
    agents,
    row: {
      id,
      name: id,
      workspacePath: '/w',
      workspaceKind: 'git',
      members: agents.map((agent) => ({ id: agent.id, name: agent.name })),
    },
  };
}

/** Renders the rail, then re-renders it with a different team open, as a switch would. */
function open(...ids: readonly string[]): void {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const built = ids.map((id) => teamOf(id, id === 'four' ? 4 : 2));
  for (const one of built) {
    act(() => {
      root.render(
        React.createElement(Rail, {
          team: one.team,
          teams: built.map((other) => other.row),
          agents: one.agents,
          statuses: {},
          items: [],
          pane: { kind: 'team' },
          onSelect: () => {},
          onSelectTeam: () => {},
        }),
      );
    });
  }
  act(() => root.unmount());
  host.remove();
}

describe('opening a team', () => {
  it('starts each face in the slot it occupied inside the folder', () => {
    open('one', 'two');

    const faces = calls('transform');
    expect(faces).toHaveLength(2);

    // Two agents, so `peekLayout(2, 46)` places them at x=8 and x=15, y=6, 24px across. The
    // first face is at (24, 160) and 34px across, so it starts 4px right and 54px above where
    // it lands, at 24/34 of its size.
    const [first] = faces[0] as [{ transform: string }[], KeyframeAnimationOptions];
    expect(first[0]?.transform).toContain('translate(4px, -54px)');
    expect(first[0]?.transform).toContain('scale(0.70');
    expect(first[1]?.transform).toBe('none');

    // The second lands a row lower and a slot to the right: 20 + 15 - 24 = 11px, and one row
    // pitch further up.
    const [second, options] = faces[1] as [{ transform: string }[], KeyframeAnimationOptions];
    expect(second[0]?.transform).toContain('translate(11px, -106px)');
    // Staggered, and inside the budget: the last face lands well under 250ms.
    expect(options.delay ?? 0).toBeGreaterThan(0);
    expect((options.duration as number) + (options.delay as number)).toBeLessThanOrEqual(250);
  });

  it('grows the room the roster takes, so the teams below slide rather than jump', () => {
    open('one', 'two');
    const [frames] = calls('height')[0] as [{ height: string }[], KeyframeAnimationOptions];
    expect(frames[0]?.height).toBe('0px');
    expect(frames[1]?.height).toBe(`${ROSTER_HEIGHT}px`);
  });

  it('fades each row in, which is what covers the overlap while that happens', () => {
    open('one', 'two');
    const text = calls('opacity');
    expect(text).toHaveLength(2);
    expect(text[0]?.[0][0]?.opacity).toBe(0);
    expect(text[0]?.[0][1]?.opacity).toBe(1);
  });

  it('fades in a face the folder only counted, and never one it was showing', () => {
    // Four members: `peekLayout` gives three slots and says `+1` about the fourth. The three
    // that were on screen are continuous with themselves and must not fade — the travel only
    // reads as travel if the face is the same face. The fourth was never there.
    open('one', 'four');
    const faces = calls('transform');
    expect(faces).toHaveLength(4);
    for (const index of [0, 1, 2]) {
      expect(faces[index]?.[0][0]).not.toHaveProperty('opacity');
    }
    expect(faces[3]?.[0][0]?.opacity).toBe(0);
  });

  it('does not fly on the first paint of a session', () => {
    // Nothing was shut a moment ago, so there is nothing for the faces to have come out of.
    open('one');
    expect(keyframes).not.toHaveBeenCalled();
  });

  it('leaves the faces alone for a reader who asked for less motion', () => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    open('one', 'two');
    expect(keyframes).not.toHaveBeenCalled();
  });
});
