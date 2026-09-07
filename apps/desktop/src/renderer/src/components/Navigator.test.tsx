/**
 * @vitest-environment jsdom
 *
 * What the navigator can reach.
 *
 * **Every hired agent, and the person rather than the seat.** `.scratch/rail/issues/05`. It used
 * to list one row per membership, so Alice on four teams was four rows — the sixteen-row list
 * this redesign refused, and worse in a search result, where rows have no grouping to tell them
 * apart. Selecting one opens their thread, which is what their rail row does.
 *
 * And a **thread is never findable as a team**: it is one thing, and it is already in the list
 * above under the agent's own name.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { UiAgent, UiRailAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { Navigator } from './Navigator.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// cmdk measures its list, and jsdom has no ResizeObserver. Same stub the composer's menu needs.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

// And it scrolls the highlighted row into view, which jsdom does not implement either. The
// composer's menu never hit this: it is short enough that cmdk had nothing to scroll.
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const OPEN: UiTeam = { id: 'open', name: 'portfolio', workspacePath: '/w', turnBudget: 10 };
const OPEN_AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds the UI', runtimeLabel: 'mock', workspacePath: '/w', accepts: { images: true, textFiles: true } },
];
const TEAMS: readonly UiTeamSummary[] = [
  {
    id: 'open',
    name: 'portfolio',
    workspacePath: '/w',
    workspaceKind: 'git',
    members: [{ id: 'alice', name: 'Alice' }],
  },
  {
    id: 'other',
    name: 'hermes-agent',
    workspacePath: '/h',
    workspaceKind: 'git',
    members: [{ id: 'mara', name: 'Mara' }],
  },
  {
    id: 'thread',
    name: 'Mara',
    workspacePath: '/home/x/blobot/mara',
    workspaceKind: 'git',
    threadFor: 'p_mara',
    members: [{ id: 'mara_1', name: 'Mara' }],
  },
];
const PROFILES: readonly UiRailAgent[] = [
  { id: 'p_alice', name: 'Alice', role: 'builds the UI', hiredAt: 1 },
  { id: 'p_mara', name: 'Mara', role: 'runs the pipeline', hiredAt: 2, threadId: 'thread' },
];

interface Drawn {
  readonly host: HTMLElement;
  readonly chosen: { agent?: string; team?: string };
}

function draw(): Drawn {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const chosen: { agent?: string; team?: string } = {};
  act(() => {
    createRoot(host).render(
      React.createElement(Navigator, {
        team: OPEN,
        teams: TEAMS,
        agents: OPEN_AGENTS,
        profiles: PROFILES,
        onClose: () => {},
        onSelectAgent: (profileId: string) => {
          chosen.agent = profileId;
        },
        onSelectTeam: (teamId: string) => {
          chosen.team = teamId;
        },
      }),
    );
  });
  return { host, chosen };
}

/** One row, by the value it carries: `agent:<profileId>`, `team:<id>`, `place:<name>`. cmdk
 *  draws items as divs with a `data-value`, and lowercases it. */
function row(drawn: Drawn, value: string): HTMLElement {
  const found = [...drawn.host.querySelectorAll('[cmdk-item]')].find(
    (item) => item.getAttribute('data-value')?.toLowerCase() === value.toLowerCase(),
  );
  if (found === undefined) throw new Error(`no row for ${value}`);
  return found as HTMLElement;
}

describe('the navigator', () => {
  it('finds every hired agent, whichever team they are on', () => {
    const drawn = draw();
    act(() => {
      row(drawn, 'agent:p_mara').click();
    });
    // The profile, because a row is the person: selecting it opens their thread.
    expect(drawn.chosen.agent).toBe('p_mara');
    drawn.host.remove();
  });

  it('lists a person once, never once per seat', () => {
    const drawn = draw();
    const agents = [...drawn.host.querySelectorAll('[cmdk-item]')].filter((item) =>
      item.getAttribute('data-value')?.startsWith('agent:'),
    );
    expect(agents).toHaveLength(2);
    drawn.host.remove();
  });

  it('says the role, and never a team, because a person on four teams has no one team', () => {
    const drawn = draw();
    expect(row(drawn, 'agent:p_mara').textContent).toContain('runs the pipeline');
    expect(row(drawn, 'agent:p_mara').textContent).not.toContain('hermes-agent');
    drawn.host.remove();
  });

  it('offers the teams themselves, including the one already open', () => {
    const drawn = draw();
    act(() => {
      row(drawn, 'team:other').click();
    });
    expect(drawn.chosen.team).toBe('other');
    drawn.host.remove();
  });

  it('does not list a thread as a team, which would be one thing under two names', () => {
    const drawn = draw();
    const teams = [...drawn.host.querySelectorAll('[cmdk-item]')]
      .map((item) => item.getAttribute('data-value') ?? '')
      .filter((value) => value.startsWith('team:'));
    expect(teams).toEqual(['team:open', 'team:other']);
    drawn.host.remove();
  });
});
