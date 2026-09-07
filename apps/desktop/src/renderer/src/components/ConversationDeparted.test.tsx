/**
 * @vitest-environment jsdom
 *
 * What the transcript says about somebody who is no longer on the team.
 *
 * `.scratch/team-addressing/issues/07`. Take a member off a team and every row they ever wrote
 * used to draw `mara_8f3545` — a database key in the reading column, under a blobatar whose hue
 * was derived from that key rather than from the face they had. The Agent is tombstoned rather
 * than deleted, so the rows survive with nothing on the live roster left to resolve them.
 *
 * The decision was not *whether* a name is available but **what the column should say**, and it
 * is the name and the face with the roster's own words beside them, once: an unmarked name reads
 * as a roster twice the size of the one the rail is showing, and a mark on every row repeats a
 * fact the reader learned on the first. Marked where a name is *introduced*, which for an
 * agent's own rows is exactly where the header draws — so the existing grouping rule is what
 * decides it and there is no second rule to keep in step.
 *
 * Three surfaces, because the ticket binds three: the row, the far end of a peer message, and
 * the fold's `messages with`.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiAgent, UiDepartedAgent } from '../../../shared/api.js';
import type { Item, Pane } from '../model.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();

vi.mock('./Markdown.js', () => ({
  Markdown: (props: { text: string }): React.JSX.Element =>
    React.createElement('div', { className: 'md' }, props.text),
}));

const { Conversation } = await import('./Conversation.js');

/** Still here. */
const ALICE: UiAgent = {
  id: 'alice_7ad081',
  name: 'Alice',
  role: 'builds',
  runtimeLabel: 'mock',
  workspacePath: '/w/alice',
  hue: 20,
  accepts: { images: true, textFiles: true },
};
/** Taken off the team, and the reason this file exists. */
const MARA: UiDepartedAgent = { id: 'mara_8f3545', name: 'Mara', hue: 200, shape: 'pebble' };

const hosts: HTMLElement[] = [];

function draw(
  items: readonly Item[],
  pane: Pane = { kind: 'team' },
  departed: readonly UiDepartedAgent[] = [MARA],
): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(Conversation, {
        pane,
        agents: [ALICE],
        departed,
        statuses: { [ALICE.id]: 'idle' },
        items,
        onAnswerPermission: () => {},
        routineArmed: {},
        onDisarmRoutine: () => {},
        onRemoveHandbookEntry: () => {},
      }),
    );
  });
  return host;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

const said = (id: string, agentId: string, at: number, text: string): Item => ({
  kind: 'agent',
  id,
  at,
  agentId,
  text,
  live: false,
});

describe('a member who has left the team', () => {
  it('is named, and never drawn as an agent id', () => {
    const host = draw([said('m1', MARA.id, 1_000, 'my Handbook here is empty')]);

    const names = [...host.querySelectorAll('.msg .hdr .nm')].map((node) => node.textContent);
    expect(names).toEqual(['Mara']);
    expect(host.textContent).not.toContain(MARA.id);
  });

  it('is marked once for a run, on the row that introduces the name', () => {
    const host = draw([
      said('m1', MARA.id, 1_000, 'my Handbook here is empty'),
      // The same speaker again, immediately after: grouped, so it draws no header at all and
      // therefore nothing to mark. The mark cannot repeat because the name does not.
      said('m2', MARA.id, 2_000, 'and nothing is blocked on me'),
      said('a1', ALICE.id, 3_000, 'noted'),
    ]);

    const tags = [...host.querySelectorAll('.msg .hdr .tag')].map((node) => node.textContent);
    expect(tags).toEqual(['off the team']);
    // Alice is on the team, and says nothing about it.
    const headers = [...host.querySelectorAll('.msg .hdr')].map((node) => node.textContent);
    expect(headers).toContain('Alice');
  });

  it('carries its own face rather than one derived from the row id', () => {
    const row = [said('m1', MARA.id, 1_000, 'my Handbook here is empty')];
    // The face the profile was saved with, against the one the id alone produces — which is
    // what the column drew before this, and is a different colour and a different silhouette
    // from the person the reader knows.
    const known = draw(row).querySelector('.msg .blob img')?.getAttribute('src');
    const derived = draw(row, { kind: 'team' }, []).querySelector('.msg .blob img')?.getAttribute('src');

    expect(known).toBeTruthy();
    expect(known).not.toBe(derived);
  });

  it('is named on the far end of a peer message', () => {
    const host = draw([
      {
        kind: 'peer',
        id: 'p1',
        at: 1_000,
        fromId: ALICE.id,
        toId: MARA.id,
        text: 'holding until Alain confirms',
      },
    ]);

    const line = host.querySelector('.peer .route');
    expect(line?.textContent).toContain('Mara');
    expect(line?.textContent).toContain('off the team');
    expect(host.textContent).not.toContain(MARA.id);
  });

  it("is named on the fold's message line", () => {
    // A run whose principal is Alice, with a turn Mara took inside it: two items over
    // `WORTH_FOLDING`, so the run shuts and names its partner on the line that swallowed it.
    const host = draw([
      { kind: 'user', id: 'u', at: 0, text: '@Alice go', agentIds: [ALICE.id] },
      said('a1', ALICE.id, 1_000, 'asking Mara'),
      {
        kind: 'peer',
        id: 'p1',
        at: 2_000,
        fromId: ALICE.id,
        toId: MARA.id,
        text: 'anything in flight?',
      },
      said('m1', MARA.id, 3_000, 'nothing in flight'),
      said('a2', ALICE.id, 4_000, 'done'),
    ]);

    const fold = host.querySelector('.ran .route');
    expect(fold?.textContent).toContain('Mara');
    expect(fold?.textContent).toContain('off the team');
    expect(host.textContent).not.toContain(MARA.id);
  });
});
