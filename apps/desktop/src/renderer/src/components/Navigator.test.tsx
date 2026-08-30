/**
 * @vitest-environment jsdom
 *
 * What the navigator can reach.
 *
 * The rail can only offer panes for the team it is drawing, so the claim worth testing is the
 * one the rail cannot make: an agent on a team that is *not* open is findable by name, and
 * choosing them names both the team to open and the agent to land on. That pair is the whole
 * feature — a navigator that switched the team and dropped you on the transcript would have
 * answered a question nobody asked.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { UiAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
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
  { id: 'alice', name: 'Alice', role: 'builds the UI', runtimeLabel: 'mock', workspacePath: '/w' },
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
];

interface Drawn {
  readonly host: HTMLElement;
  readonly chosen: { agent?: readonly [string, string]; team?: string };
}

function draw(): Drawn {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const chosen: { agent?: readonly [string, string]; team?: string } = {};
  act(() => {
    createRoot(host).render(
      React.createElement(Navigator, {
        team: OPEN,
        teams: TEAMS,
        agents: OPEN_AGENTS,
        onClose: () => {},
        onSelectAgent: (teamId: string, agentId: string) => {
          chosen.agent = [teamId, agentId];
        },
        onSelectTeam: (teamId: string) => {
          chosen.team = teamId;
        },
      }),
    );
  });
  return { host, chosen };
}

/** One row, by the value it carries: `agent:<team>:<id>`, `team:<id>`, `place:<name>`. cmdk
 *  draws items as divs with a `data-value`, and lowercases it. */
function row(drawn: Drawn, value: string): HTMLElement {
  const found = [...drawn.host.querySelectorAll('[cmdk-item]')].find(
    (item) => item.getAttribute('data-value')?.toLowerCase() === value.toLowerCase(),
  );
  if (found === undefined) throw new Error(`no row for ${value}`);
  return found as HTMLElement;
}

describe('the navigator', () => {
  it('finds an agent on a team that is not open', () => {
    const drawn = draw();
    act(() => {
      row(drawn, 'agent:other:mara').click();
    });
    // Both halves: which team to open, and who to be looking at when it does.
    expect(drawn.chosen.agent).toEqual(['other', 'mara']);
    drawn.host.remove();
  });

  it('says which team an agent is on, and does not repeat the open one', () => {
    const drawn = draw();
    // The team is the only thing telling two agents of the same name apart, so an agent
    // elsewhere carries it.
    expect(row(drawn, 'agent:other:mara').textContent).toContain('hermes-agent');
    // And the open team's own people do not, because every row would then say it. They carry
    // the role instead, which is the fact the rail row beside them is already showing.
    expect(row(drawn, 'agent:open:alice').textContent).toContain('builds the UI');
    expect(row(drawn, 'agent:open:alice').textContent).not.toContain('portfolio');
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
});
