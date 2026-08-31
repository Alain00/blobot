/**
 * @vitest-environment jsdom
 *
 * The top edge of the loaded transcript.
 *
 * The transcript is a window now, so the pane has to be able to say which of two things the
 * top of the column is: where the team started, or where blobot stopped reading. The claims
 * held here are the ones that decide that — the control is absent when there is genuinely
 * nothing above, present when there is, and never offered when the pane has no way to fetch.
 *
 * What a test in jsdom cannot hold is the part that matters most on screen: that loading a
 * page does not move what the reader is looking at. jsdom has no layout, so `scrollHeight` is
 * zero and the anchor is unobservable. That one is verified in the real app.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { UiAgent } from '../../../shared/api.js';
import type { Item } from '../model.js';
import { Conversation } from './Conversation.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver, and the pane mounts two: the one that pins to the bottom and the
// one that holds the reader's place across a prepend. A stub that observes nothing is the right
// double here — this file is about what the control says and does, and the observers only ever
// act on measurements jsdom does not produce.
class NoLayout {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoLayout;

const AGENTS: readonly UiAgent[] = [
  {
    id: 'alice',
    name: 'Alice',
    role: 'builds the UI',
    runtimeLabel: 'claude code',
    workspacePath: '/w',
    accepts: { images: true, textFiles: true },
  },
];

const ITEMS: readonly Item[] = [
  { kind: 'agent', id: 'a1', at: 10, agentId: 'alice', text: 'the recent end', live: false },
];

function render(
  moreAbove: boolean,
  onLoadEarlier?: () => Promise<void>,
): { host: HTMLElement; control: HTMLButtonElement | null } {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <Conversation
        pane={{ kind: 'team' }}
        agents={AGENTS}
        statuses={{}}
        items={ITEMS}
        onAnswerPermission={() => {}}
        routineArmed={{}}
        onDisarmRoutine={() => {}}
        onRemoveHandbookEntry={() => {}}
        moreAbove={moreAbove}
        {...(onLoadEarlier === undefined ? {} : { onLoadEarlier })}
      />,
    );
  });
  return { host, control: host.querySelector('.earlier button') };
}

describe('the top of the loaded window', () => {
  it('says nothing when the top of the column is where the team started', () => {
    expect(render(false, async () => {}).control).toBeNull();
  });

  it('offers a way up when there is history above the window', () => {
    expect(render(true, async () => {}).control?.textContent).toBe('load earlier');
  });

  it('offers nothing when the pane has no way to fetch, rather than a control that does nothing', () => {
    expect(render(true).control).toBeNull();
  });

  it('waits in the control itself, and cannot be asked twice while it does', async () => {
    let calls = 0;
    let release = (): void => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { control } = render(true, () => {
      calls += 1;
      return pending;
    });

    await act(async () => {
      control?.click();
    });
    // The word changes and the control closes. A second click during a fetch would ask for the
    // same window twice and prepend it twice, which the reducer would dedupe and the reader
    // would still have watched happen.
    expect(control?.textContent).toBe('loading');
    expect(control?.disabled).toBe(true);
    await act(async () => {
      control?.click();
    });
    expect(calls).toBe(1);

    await act(async () => {
      release();
      await pending;
    });
    expect(control?.textContent).toBe('load earlier');
    expect(control?.disabled).toBe(false);
  });
});
