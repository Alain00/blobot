/**
 * @vitest-environment jsdom
 *
 * A turn that is still a turn while nothing is open, and a step that has already folded.
 *
 * Two reports from the author, one afternoon apart, and one cause under both. The live block used
 * to exist only while a call was open, so between two batches an agent's calls settled, its steps
 * folded and the block came off the screen — leaving three dots in a gutter under a shut fold,
 * which is what *"nothing is shown"* looks like. And `liveRunIn`'s batch walk reaches backwards
 * over contiguous calls until it meets the principal's own prose, which an agent that reasons
 * instead of narrating never writes, so the next call to open hauled the whole settled run back
 * out of its fold.
 *
 * What is *not* here: the reasoning itself. The state is the block standing; the tokens are not
 * drawn and not kept.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent } from '../../../shared/api.js';
import type { Item } from '../model.js';
import { DWELL } from './Conversation.js';
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
  {
    id: 'a',
    name: 'Alice',
    role: 'builds',
    runtimeLabel: 'mock',
    workspacePath: '/w/a',
    accepts: { images: true, textFiles: true },
  },
];

const ASKED: Item = { kind: 'user', id: 'u', at: 0, text: 'go', agentIds: ['a'] };

function call(id: string, status: 'running' | 'completed'): Item {
  return {
    kind: 'tool',
    id,
    at: Number(id.slice(1)) * 1000,
    agentId: 'a',
    title: `edit ${id}`,
    toolKind: 'edit',
    status,
  };
}

function mount(): {
  draw: (items: readonly Item[], status?: AgentStatus) => void;
  blocks: () => number;
  faces: () => number;
  live: () => number;
  done: () => void;
} {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const draw = (items: readonly Item[], status: AgentStatus = 'working'): void => {
    act(() => {
      root.render(
        React.createElement(Conversation, {
          pane: { kind: 'team' },
          agents: AGENTS,
          statuses: { a: status },
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
    blocks: () => host.querySelectorAll('.msg.live').length,
    faces: () => host.querySelectorAll('.msg.live > span > .blob').length,
    live: () => host.querySelectorAll('.msg.live .tool').length,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a turn with nothing open', () => {
  it('keeps its block standing between two batches', () => {
    const { draw, blocks, live, done } = mount();

    // Two calls run and finish. Two is `WORTH_FOLDING`, so the steps are inside a fold now and
    // the block has nothing left in it -- which is where it used to come off the screen.
    draw([ASKED, call('t1', 'running'), call('t2', 'running')]);
    expect(live()).toBe(2);
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed')], 'thinking');
    // Past the floor every live step gets, so what is left is what the model is holding rather
    // than what the screen owes the reader.
    act(() => vi.advanceTimersByTime(DWELL));

    // Exactly one block, and it is empty. The turn is still a turn and says so where it is.
    expect(blocks()).toBe(1);
    expect(live()).toBe(0);

    done();
  });

  it('draws nothing once the turn has ended', () => {
    const { draw, blocks, done } = mount();

    draw([ASKED, call('t1', 'completed'), call('t2', 'completed')], 'thinking');
    expect(blocks()).toBe(1);

    // Idle is a settled transcript. A face over a dead turn is the thing `LiveNow` exists to
    // prevent, and an empty block must not be the way it gets back in.
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed')], 'idle');
    expect(blocks()).toBe(0);

    done();
  });

  it('keeps its face when it has no steps, whatever it is grouped under', () => {
    const { draw, faces, done } = mount();

    // Grouped under its own fold, the block used to drop the blobatar and leave three dots in a
    // gutter. With no steps under it the face is the only thing carrying the fact.
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed')], 'thinking');
    expect(faces()).toBe(1);

    done();
  });
});

describe('a step that has been folded', () => {
  it('stays folded when the next call opens with no narration between', () => {
    const { draw, live, done } = mount();

    draw([ASKED, call('t1', 'running')]);
    draw([ASKED, call('t1', 'completed'), call('t2', 'running')]);
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed')]);
    act(() => vi.advanceTimersByTime(DWELL));

    // A third opens. The agent reasoned rather than narrated, so nothing in the items bounds the
    // batch, and the backwards walk would take both settled calls back out of the fold.
    draw([ASKED, call('t1', 'completed'), call('t2', 'completed'), call('t3', 'running')]);
    expect(live()).toBe(1);

    done();
  });

  it('still keeps a batch together, because those calls never left the block', () => {
    const { draw, live, done } = mount();

    // Three opened at once. One returning must not drop it out of the block as a loose line --
    // that is what the backwards walk is for, and the rule above must not cost it.
    draw([ASKED, call('t1', 'running'), call('t2', 'running'), call('t3', 'running')]);
    draw([ASKED, call('t1', 'completed'), call('t2', 'running'), call('t3', 'running')]);
    expect(live()).toBe(3);

    done();
  });
});
