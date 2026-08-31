/**
 * @vitest-environment jsdom
 *
 * The block that pays for an agent writing into its own persona.
 *
 * An agent changing what it will be told at the start of every session, off screen, is the
 * version of this feature that must not exist. So the claims held here are the ones that make
 * that not the case: the write opens in the turn that did it, it carries removal, and the line
 * stays saying what happened after the entry is gone.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { UiAgent } from '../../../shared/api.js';
import type { Item, Pane } from '../model.js';
import { stubGazeHost } from '../test-dom.js';
import { Conversation } from './Conversation.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

const AGENTS: readonly UiAgent[] = [
  {
    id: 'mara',
    name: 'Mara',
    role: 'writes',
    runtimeLabel: 'mock',
    workspacePath: '/w/mara',
    accepts: { images: true, textFiles: true },
  },
];

const entry = (id: string, ordinal: number, text: string, removed = false) => ({
  at: 500,
  id,
  ordinal,
  text,
  source: 'told' as const,
  removed,
});

function render(
  item: Item,
  pane: Pane = { kind: 'team' },
): { host: HTMLElement; removed: string[] } {
  const host = document.createElement('div');
  document.body.append(host);
  const removed: string[] = [];
  act(() => {
    createRoot(host).render(
      <Conversation
        pane={pane}
        agents={AGENTS}
        statuses={{}}
        items={[item]}
        onAnswerPermission={() => {}}
        routineArmed={{}}
        onDisarmRoutine={() => {}}
        onRemoveHandbookEntry={(entryId) => removed.push(entryId)}
      />,
    );
  });
  return { host, removed };
}

const recorded = (entries: ReturnType<typeof entry>[], withdrew: ReturnType<typeof entry>[] = []): Item => ({
  kind: 'handbook',
  id: 'w1',
  at: 10,
  agentId: 'mara',
  write: 'recorded',
  entries,
  withdrew,
});

describe('a Handbook write in the transcript', () => {
  it('is one line for the call, counted, and shut', () => {
    const { host } = render(
      recorded([entry('e1', 1, 'nothing ships on a Friday'), entry('e2', 2, 'the ICP is small agencies')]),
    );

    // One act, one line, whether it recorded one thing or four: `record_entry` takes a list.
    const line = host.querySelector('.hbwrite .route .lbl');
    expect(line?.textContent).toBe('Mara · wrote down 2 things');
    // Shut, like the compaction line: this is a thing that happened, not a thing to read.
    expect(host.querySelector('.hbwrite .note')).toBeNull();
  });

  it('names the agent only where the pane cannot', () => {
    const { host } = render(recorded([entry('e1', 1, 'one thing')]), {
      kind: 'agent',
      agentId: 'mara',
    });
    expect(host.querySelector('.hbwrite .route .lbl')?.textContent).toBe('wrote down 1 thing');
  });

  it('opens to the entries and their numbers, and removes from there', () => {
    const { host, removed } = render(recorded([entry('e1', 1, 'nothing ships on a Friday')]));

    act(() => {
      host.querySelector<HTMLButtonElement>('.hbwrite .route')?.click();
    });
    const row = host.querySelector('.hbwrite .hbentry');
    expect(row?.textContent).toContain('nothing ships on a Friday');
    // The number the persona draws it under, and the one the agent names to correct it.
    expect(row?.querySelector('.mono')?.textContent).toBe('1');

    act(() => {
      row?.querySelector<HTMLButtonElement>('button')?.click();
    });
    // Undone here, where it happened. Sending the reader to a panel to act would turn a
    // disclosure into a notification.
    expect(removed).toEqual(['e1']);
  });

  it('keeps a removed entry on the block, without a control', () => {
    const { host } = render(recorded([entry('e1', 1, 'no longer in the handbook', true)]));
    act(() => {
      host.querySelector<HTMLButtonElement>('.hbwrite .route')?.click();
    });

    const row = host.querySelector('.hbwrite .hbentry');
    expect(row?.textContent).toContain('removed');
    expect(row?.querySelector('button')).toBeNull();
  });

  it('says what a correction replaced, on the same block', () => {
    const { host } = render(
      recorded([entry('e2', 2, 'the ICP is two-person agencies')], [entry('e1', 1, 'the ICP is enterprise')]),
    );

    expect(host.querySelector('.hbwrite .route .lbl')?.textContent).toBe(
      'Mara · wrote down 1 thing, replacing 1',
    );
    act(() => {
      host.querySelector<HTMLButtonElement>('.hbwrite .route')?.click();
    });
    // One act: that one is wrong, this is right. Two separate lines could drift apart.
    expect(host.querySelector('.hbentry.gone')?.textContent).toContain('withdrawn');
  });

  it('says a full Handbook as a plain system line, because there is nothing to open', () => {
    const { host } = render({
      kind: 'handbook',
      id: 'w2',
      at: 20,
      agentId: 'mara',
      write: 'full',
      entries: [],
      withdrew: [],
    });

    // The one refusal in the app whose remedy belongs to somebody who is not in the room.
    expect(host.querySelector('.sysline')?.textContent).toBe(
      'Mara · handbook is full, nothing was recorded',
    );
    expect(host.querySelector('.hbwrite')).toBeNull();
  });
});
