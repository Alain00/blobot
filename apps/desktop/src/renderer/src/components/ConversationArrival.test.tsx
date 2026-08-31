/**
 * @vitest-environment jsdom
 *
 * Where the transcript is when you get there.
 *
 * The scroll container is one node for every pane — switching panes replaces the items in it
 * and nothing else — so both facts it holds about the reader survive a switch that has nothing
 * to do with them: the pixel offset they had scrolled to, and whether they were following the
 * newest line. Neither is true of the place they have just arrived at.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { UiAgent } from '../../../shared/api.js';
import type { Item, Pane } from '../model.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();

/** The pane's follow is built on one of these, so the test needs to be able to fire it. */
const observers: (() => void)[] = [];
globalThis.ResizeObserver = class {
  constructor(callback: () => void) {
    observers.push(callback);
  }
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

const ITEMS: Item[] = [
  { kind: 'agent', id: 'one', at: 1, agentId: 'a', text: 'said a while ago', live: false },
];

/**
 * jsdom lays nothing out, so the three numbers this hook reads are supplied. `scrollTop` is a
 * plain writable property for the same reason: jsdom's own is inert on an element with no box.
 */
function measured(node: HTMLElement, height: number): void {
  Object.defineProperty(node, 'scrollHeight', { value: height, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(node, 'scrollTop', { value: 0, writable: true, configurable: true });
}

function draw(): { arriveAt: (place: string, pane?: Pane) => void; stream: HTMLElement; resize: () => void } {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const arriveAt = (place: string, pane: Pane = { kind: 'team' }): void => {
    act(() => {
      root.render(
        React.createElement(Conversation, {
          pane,
          place,
          agents: AGENTS,
          statuses: { a: 'idle' as const },
          items: ITEMS,
          onAnswerPermission: () => {},
          routineArmed: {},
          onDisarmRoutine: () => {},
          onRemoveHandbookEntry: () => {},
        }),
      );
    });
  };
  arriveAt('t1:');
  const stream = host.querySelector('.stream') as HTMLElement;
  measured(stream, 1000);
  return { arriveAt, stream, resize: () => act(() => observers.forEach((fire) => fire())) };
}

describe('arriving at a pane', () => {
  it('lands on the newest line rather than on the offset the last pane had', () => {
    const drawn = draw();

    // The reader goes back to read something, in the pane they are in.
    drawn.stream.scrollTop = 0;
    act(() => drawn.stream.dispatchEvent(new Event('scroll')));

    drawn.arriveAt('t1:a', { kind: 'agent', agentId: 'a' });

    expect(drawn.stream.scrollTop).toBe(1000);
  });

  it('follows the newest line again, however far up the last pane was left', () => {
    const drawn = draw();
    drawn.stream.scrollTop = 0;
    act(() => drawn.stream.dispatchEvent(new Event('scroll')));

    // Reading history stopped the follow, and that is a fact about a reader in *that*
    // transcript. Left to travel, an agent whose pane you have just opened would stream off
    // the bottom of the screen because you were reading something else a moment ago.
    drawn.resize();
    expect(drawn.stream.scrollTop).toBe(0);

    drawn.arriveAt('t1:a', { kind: 'agent', agentId: 'a' });
    // The column lays out over the next few frames — markdown, a code block, a blobatar. The
    // pin is what keeps the end in view for all of them.
    measured(drawn.stream, 2000);
    drawn.stream.scrollTop = 1000;
    drawn.resize();

    expect(drawn.stream.scrollTop).toBe(2000);
  });

  it('leaves the reader alone when the place has not changed', () => {
    const drawn = draw();
    drawn.stream.scrollTop = 0;
    act(() => drawn.stream.dispatchEvent(new Event('scroll')));

    // A message landing, a status moving, an agent coming up. None of them are an arrival.
    drawn.arriveAt('t1:');

    expect(drawn.stream.scrollTop).toBe(0);
  });
});
