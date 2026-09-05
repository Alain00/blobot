/**
 * @vitest-environment jsdom
 *
 * What the fold takes, and what the reader is given a chance to see it take.
 *
 * `rowsOf` regroups on every delta and `WORTH_FOLDING` is 2, so the second call to complete
 * lifts the first out of its own row and into `RAN n TOOLS`. That has always been a cut between
 * two frames: the line the reader was looking at is replaced by a count one higher. `.went` is
 * that same line drawn once more on its way up into the header that now counts it.
 *
 * Three facts, and the last two are the ones that keep it inside `DESIGN.md`'s rule that data
 * does not move for style:
 *
 * - a swallow leaves a ghost, and the ghost is gone one flight later;
 * - a fold that arrives already full leaves none, because it swallowed nothing while anyone was
 *   watching -- a restored transcript, a team switch and `load earlier` all mount this way;
 * - only a *running* call carries the arrival class, so every settled line in a restored
 *   transcript mounts still.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiAgent } from '../../../shared/api.js';
import type { Item } from '../model.js';
import { FLIGHT } from './Conversation.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

vi.mock('./Markdown.js', () => ({
  Markdown: (props: { text: string }): React.JSX.Element =>
    React.createElement('div', null, props.text),
}));

const { Conversation } = await import('./Conversation.js');

const AGENTS: readonly UiAgent[] = [
  { id: 'a', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w/a', accepts: { images: true, textFiles: true } },
];

/** One call, at whichever point in its life the caller asks for. */
function call(id: string, status: 'running' | 'completed'): Item {
  return { kind: 'tool', id, at: Number(id.slice(1)) * 1000, agentId: 'a', title: `edit ${id}`, toolKind: 'edit', status };
}

/** The prompt that opened the turn, so the run has an addressed agent to belong to. */
const ASKED: Item = { kind: 'user', id: 'u', at: 0, text: 'go', agentIds: ['a'] };

function mount(): {
  draw: (items: readonly Item[]) => void;
  ghosts: () => number;
  arriving: () => number;
  done: () => void;
} {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const draw = (items: readonly Item[]): void => {
    act(() => {
      root.render(
        React.createElement(Conversation, {
          pane: { kind: 'team' },
          agents: AGENTS,
          statuses: { a: 'responding' },
          items,
          onAnswerPermission: () => {},
          routineArmed: {},
          onDisarmRoutine: () => {},
          onRemoveHandbookEntry: () => {},
        }),
      );
    });
  };
  return {
    draw,
    ghosts: () => host.querySelectorAll('.went .tool').length,
    arriving: () => host.querySelectorAll('.tool.now').length,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a step being filed into the fold', () => {
  it('is drawn once more on its way up, and is gone one flight later', () => {
    const { draw, ghosts, done } = mount();

    // The real lifecycle, which is the only one that produces a ghost: a call is a loose line
    // while it runs, stays loose while it is the only one, and is taken when a second lands.
    draw([ASKED, call('t1', 'running')]);
    draw([ASKED, call('t1', 'completed')]);
    draw([ASKED, call('t1', 'completed'), call('t2', 'running')]);
    expect(ghosts()).toBe(0);

    // Both were standing loose, so both are drawn going in. The fold is born by this frame,
    // which is exactly the case a diff inside `Steps` could never see.
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed')]);
    expect(ghosts()).toBe(2);

    // The timer is the authority, not `animationend`: a window that is not painting must not be
    // left with a ghost sitting on top of live text.
    act(() => vi.advanceTimersByTime(FLIGHT));
    expect(ghosts()).toBe(0);

    done();
  });

  it('never draws a line the reader was not looking at', () => {
    const { draw, ghosts, done } = mount();

    // `t2` never stood as a line of its own: it arrived and was folded in one frame. A ghost
    // for it would be blobot animating something out of a place it was never in.
    draw([ASKED, call('t1', 'completed')]);
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed')]);

    expect(ghosts()).toBe(1);
    done();
  });

  it('holds at most two in the air, so a fast run is not a column of scrolling text', () => {
    const { draw, ghosts, done } = mount();

    draw([ASKED, call('t1', 'running')]);
    draw([ASKED, call('t1', 'completed'), call('t2', 'running')]);
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed')]);
    expect(ghosts()).toBe(2);

    // A third swallow inside the same flight. The oldest is dropped rather than queued: three
    // lines stacked under one header is the slot machine this cap exists to refuse.
    act(() => vi.advanceTimersByTime(FLIGHT / 2));
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed'), call('t3', 'running')]);
    draw([ASKED, ...['t1', 't2', 't3'].map((id) => call(id, 'completed'))]);

    expect(ghosts()).toBe(2);
    done();
  });

  it('leaves none on a fold that arrived already full', () => {
    const { draw, ghosts, done } = mount();

    // A restored transcript, a team switch, `load earlier`. Nothing was swallowed here while
    // anybody was looking, and ghosts flying out of settled data is the record moving.
    draw([ASKED, ...['t1', 't2', 't3'].map((id) => call(id, 'completed'))]);

    expect(ghosts()).toBe(0);
    done();
  });
});

describe('a step arriving', () => {
  it('animates only while it is running, so settled lines mount still', () => {
    const { draw, arriving, done } = mount();

    draw([ASKED, call('t1', 'running')]);
    expect(arriving()).toBe(1);

    // The same call, finished. It is a record now, and a record does not move.
    draw([ASKED, call('t1', 'completed')]);
    expect(arriving()).toBe(0);

    done();
  });
});
