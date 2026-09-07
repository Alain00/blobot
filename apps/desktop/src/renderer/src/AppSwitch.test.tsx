/**
 * @vitest-environment jsdom
 *
 * Leaving a team, at the level leaving happens.
 *
 * `.scratch/live-steps/issues/11`, and the reason it is a whole file: every other suite in this
 * app mounts one team and never leaves it, so nothing anywhere asserted that the transcript
 * column belongs to the team the rail is pointing at. The reported defect was a pane that kept
 * the previous team's live blocks after the switch, and the shape of the hole it fell through is
 * exactly that none of the mounted-once suites could see a second team at all.
 *
 * `App` rather than `Conversation`, because a switch is not something a pane does to itself: it
 * is a snapshot arriving, the reducer replacing what the pane holds, and the pane drawing what
 * is left. Every one of those has to be in the frame for the claim to mean anything.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiSnapshot } from '../../shared/api.js';
import { stubGazeHost } from './test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();
// The rail scrolls its selected row into view on every team change, which is the one browser
// API this whole surface needs and jsdom does not have. It throws inside a passive effect
// without it, which is a stack with none of this file's frames in it.
Element.prototype.scrollIntoView = (): void => {};

vi.mock('./components/Markdown.js', () => ({
  Markdown: (props: { text: string }): React.JSX.Element =>
    React.createElement('div', null, props.text),
}));

const listeners = new Map<string, (...args: unknown[]) => void>();
/** What the next snapshot answers with, unless a test is holding the answers itself. */
let live: UiSnapshot;
/**
 * Snapshot requests parked rather than answered, so a test can answer them in an order main
 * would not have chosen. Two are in flight across every real switch.
 */
let held: ((snapshot: UiSnapshot) => void)[] = [];
let holding = false;

/**
 * Main, reduced to the two things a switch is: a channel to subscribe to and a snapshot to ask
 * for. Everything else answers with the emptiest true thing its caller can take — this file is
 * about which team the pane is showing, and a proxy keeps it from becoming a second preload.
 */
const blobot = new Proxy(
  {},
  {
    get(_target, name: string) {
      return (...args: unknown[]) => {
        if (name.startsWith('on')) {
          listeners.set(name, args[0] as (...rest: unknown[]) => void);
          return () => listeners.delete(name);
        }
        if (name === 'snapshot') {
          if (!holding) return Promise.resolve(live);
          return new Promise<UiSnapshot>((resolve) => held.push(resolve));
        }
        if (name.startsWith('workspace') || name.startsWith('list') || name.startsWith('read')) {
          return Promise.resolve([]);
        }
        return Promise.resolve({ ok: true });
      };
    },
  },
);
(globalThis as unknown as { window: { blobot: unknown } }).window.blobot = blobot;

const { App } = await import('./App.js');

function snapshotOf(
  teamId: string,
  agentIds: readonly string[],
  messages: UiSnapshot['messages'],
  status: 'working' | 'idle' = 'working',
): UiSnapshot {
  return {
    team: {
      id: teamId,
      name: teamId,
      workspacePath: `/w/${teamId}`,
      workspaceKind: 'git',
      turnBudget: 10,
    } as NonNullable<UiSnapshot['team']>,
    teams: [],
    profiles: [],
    agents: agentIds.map((id) => ({
      id,
      name: id,
      role: 'builds',
      runtimeLabel: 'mock',
      workspacePath: `/w/${teamId}/${id}`,
      accepts: { images: true, textFiles: true },
    })),
    statuses: Object.fromEntries(agentIds.map((id) => [id, status])),
    commands: {},
    usage: {},
    handbooks: {},
    log: { running: [], tools: [], turns: [], compactions: [], pictures: [] },
    injection: {},
    messages,
    answers: [],
    moreAbove: false,
    permissions: [],
    unread: [],
    turnsThisPrompt: 0,
    demoMode: false,
    dictation: 'off',
  };
}

/** The prompt that opened the turn, so the run has an addressed agent and a live block to be. */
const ASKED = [
  { id: 'm1', at: 1_000, teamId: 'one', fromUser: true, toAgentId: 'a', body: 'go' },
] as unknown as UiSnapshot['messages'];

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  holding = false;
  held = [];
});

/** A team on screen, mid-turn: one agent with a call open, so the pane holds a live block. */
async function openTeamOne(): Promise<HTMLElement> {
  live = snapshotOf('one', ['a'], ASKED);
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(App));
  });
  await act(async () => {
    listeners.get('onEvent')?.('one', {
      type: 'tool_call_started',
      agentId: 'a',
      callId: 't1',
      title: 'edit thing',
      kind: 'edit',
      at: 2_000,
    });
  });
  expect(host.querySelectorAll('.col .msg.live').length).toBe(1);
  return host;
}

/** Everything the transcript column is drawing, of any voice. */
const drawn = (host: HTMLElement): number =>
  host.querySelectorAll('.col .msg, .col .tool').length;

describe('a team that goes away', () => {
  it('takes its transcript and its live blocks with it', async () => {
    const host = await openTeamOne();

    live = snapshotOf('two', ['m'], [], 'idle');
    await act(async () => {
      listeners.get('onTeamChanged')?.();
    });

    expect(drawn(host)).toBe(0);
  });

  /**
   * The one that reproduced. Main pushes `blobot:team` from a dozen places and every push is a
   * fresh `snapshot()`, so a switch always has two in flight; the reducer replaces the pane
   * wholesale, so whichever answer lands *last* is what the transcript is. An overtaken answer
   * is not a stale detail to be corrected on the next push — it is the previous team's whole
   * conversation, live blocks included, put back into a pane that had moved on.
   */
  it('does not come back when an overtaken snapshot answers last', async () => {
    const host = await openTeamOne();
    const stale = live;

    holding = true;
    await act(async () => {
      listeners.get('onTeamChanged')?.();
      listeners.get('onTeamChanged')?.();
    });
    expect(held.length).toBe(2);

    const [first, second] = held;
    // The newer answer lands first, and the older one — still describing the team that went
    // away — lands after it.
    await act(async () => second?.(snapshotOf('two', ['m'], [], 'idle')));
    await act(async () => first?.(stale));

    expect(drawn(host)).toBe(0);
  });
});
