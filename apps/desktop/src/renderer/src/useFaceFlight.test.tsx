/**
 * @vitest-environment jsdom
 *
 * The faces coming out of the folder, and where they come from.
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

/** Where the harness puts things, so the expected numbers below can be worked out by hand. */
const MARK = { left: 20, top: 100, size: 46 };
const ROW = { left: 24, top: 160, size: 34, pitch: 52 };

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
  const built = ids.map((id) => teamOf(id, 2));
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

describe('the faces coming out of the folder', () => {
  it('starts each face in the slot it occupied inside the folder', () => {
    open('one', 'two');

    // Two agents, so `peekLayout(2, 46)` places them at x=8 and x=15, y=6, 24px across. The
    // first face is at (24, 160) and 34px across, so it starts 4px right and 54px above where
    // it lands, at 24/34 of its size.
    expect(keyframes).toHaveBeenCalledTimes(2);
    const [first] = keyframes.mock.calls[0] as [{ transform: string }[], { delay: number }];
    expect(first[0]?.transform).toContain('translate(4px, -54px)');
    expect(first[0]?.transform).toContain('scale(0.70');
    expect(first[1]?.transform).toBe('none');

    // The second lands a row lower and a slot to the right: 20 + 15 - 24 = 11px, and one row
    // pitch further up.
    const [second, options] = keyframes.mock.calls[1] as [
      { transform: string }[],
      { delay: number; duration: number },
    ];
    expect(second[0]?.transform).toContain('translate(11px, -106px)');
    // Staggered, and inside the budget: the last face lands well under 250ms.
    expect(options.delay).toBeGreaterThan(0);
    expect(options.duration + options.delay).toBeLessThanOrEqual(250);
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
