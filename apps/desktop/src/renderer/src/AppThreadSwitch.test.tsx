/**
 * @vitest-environment jsdom
 *
 * Switching from one agent's **thread** to another, in the rail.
 *
 * The reported defect: pressing a second thread lit the row you came from for a frame, and the
 * transcript blanked with it. It is a thread-only failure, which is why `AppSwitch` could not
 * see it — a team with members sets no pane on the way in, so its selection moves exactly once,
 * when the snapshot lands. A thread's pane resolves to `{kind: 'agent'}`, and an agent pane on a
 * thread takes its selected row from `team.threadFor`, which until the snapshot arrives is the
 * *previous* thread's profile.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiSnapshot } from '../../shared/api.js';
import { stubGazeHost } from './test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();
Element.prototype.scrollIntoView = (): void => {};

vi.mock('./components/Markdown.js', () => ({
  Markdown: (props: { text: string }): React.JSX.Element =>
    React.createElement('div', null, props.text),
}));

const listeners = new Map<string, (...args: unknown[]) => void>();
let live: UiSnapshot;
/** Snapshot requests parked, so the window between the answer and the snapshot can be read. */
let held: ((snapshot: UiSnapshot) => void)[] = [];
let holding = false;

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
        // Main answering that the thread exists, with the Agent inside it — the answer that
        // used to move the pane before the team behind it had arrived.
        if (name === 'openThread') {
          return Promise.resolve({ ok: true, agentId: `a${String(args[0]).slice(1)}` });
        }
        if (name === 'workspaceStatus') {
          const who = String(args[0]).slice(1);
          return Promise.resolve([
            {
              agentId: `a${who}`,
              agentName: who,
              kind: 'git',
              branch: `blobot/t${who}/a${who}`,
              present: true,
              churn: { added: 0, removed: 0, files: 0 },
            },
          ]);
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

/** Two hired agents, each with a thread, and one of the two threads open. */
function snapshotOf(open: 'A' | 'B'): UiSnapshot {
  const teams = (['A', 'B'] as const).map((who) => ({
    id: `t${who}`,
    name: who,
    workspacePath: `/w/t${who}`,
    workspaceKind: 'git' as const,
    threadFor: `p${who}`,
    members: [{ id: `a${who}`, name: who }],
  }));
  return {
    team: {
      id: `t${open}`,
      name: open,
      workspacePath: `/w/t${open}`,
      workspaceKind: 'git',
      turnBudget: 10,
      threadFor: `p${open}`,
    } as NonNullable<UiSnapshot['team']>,
    teams,
    profiles: (['A', 'B'] as const).map((who) => ({
      id: `p${who}`,
      name: who,
      role: 'builds',
      hiredAt: 1_000,
      threadId: `t${who}`,
    })),
    agents: [
      {
        id: `a${open}`,
        name: open,
        role: 'builds',
        runtimeLabel: 'mock',
        workspacePath: `/w/t${open}/a${open}`,
        accepts: { images: true, textFiles: true },
      },
    ],
    statuses: { [`a${open}`]: 'idle' },
    commands: {},
    usage: {},
    handbooks: {},
    log: { running: [], tools: [], turns: [], compactions: [], pictures: [] },
    injection: {},
    messages: [],
    answers: [],
    moreAbove: false,
    permissions: [],
    unread: [],
    turnsThisPrompt: 0,
    demoMode: false,
    dictation: 'off',
  };
}

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  holding = false;
  held = [];
});

/** Whose row is lit. */
const selected = (host: HTMLElement): string | undefined =>
  host.querySelector('.railrow.sel .nm b')?.textContent ?? undefined;

const rowFor = (host: HTMLElement, name: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll('.railrow')].find(
    (row) => row.querySelector('.nm b')?.textContent === name,
  );
  if (found === undefined) throw new Error(`no rail row for ${name}`);
  return found as HTMLButtonElement;
};

describe('one thread to another', () => {
  it('never lights the row you came from', async () => {
    live = snapshotOf('A');
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(App));
    });
    // The launch pane is the team pane, and a thread has no team view: the resolve to
    // `{kind: 'agent'}` is what a snapshot does, so it is asked for here as main asks for it.
    await act(async () => {
      listeners.get('onTeamChanged')?.();
    });
    expect(selected(host)).toBe('A');

    // The snapshot for B is held, so what is asserted is the window main's answer opens: the
    // thread has been opened and the team on screen is still A's.
    holding = true;
    await act(async () => {
      rowFor(host, 'B').click();
    });
    expect(selected(host)).toBe('B');

    live = snapshotOf('B');
    await act(async () => held.splice(0).forEach((answer) => answer(live)));
    expect(selected(host)).toBe('B');
  });

  it('keeps the composer’s tray on screen while the next thread is on its way', async () => {
    live = snapshotOf('A');
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(App));
    });
    await act(async () => {
      listeners.get('onTeamChanged')?.();
    });
    expect(host.querySelector('.wsline')).not.toBeNull();

    // A profile pane has no tray, so taking one for the round trip unmounted it and the next
    // snapshot put it back: the blink.
    holding = true;
    await act(async () => {
      rowFor(host, 'B').click();
    });
    expect(host.querySelector('.wsline')).not.toBeNull();

    live = snapshotOf('B');
    await act(async () => held.splice(0).forEach((answer) => answer(live)));
    expect(host.querySelector('.wsline')).not.toBeNull();
  });

  it('draws a thread it has already shown with its tray filled, so nothing fades back in', async () => {
    live = snapshotOf('A');
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(App));
    });
    await act(async () => {
      listeners.get('onTeamChanged')?.();
    });
    expect(host.querySelector('.wsbranchpick')).not.toBeNull();

    holding = true;
    for (const who of ['B', 'A'] as const) {
      await act(async () => {
        rowFor(host, who).click();
      });
      live = snapshotOf(who);
      await act(async () => held.splice(0).forEach((answer) => answer(live)));
    }
    // Back on A: its git half was read on the first visit, so the tray mounts holding it.
    expect(host.querySelector('.wsbranchpick')?.getAttribute('title')).toBe('blobot/tA/aA');
    expect(host.querySelector('.wsarrive')).toBeNull();
  });
});
