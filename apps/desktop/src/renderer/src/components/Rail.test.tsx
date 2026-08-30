/**
 * @vitest-environment jsdom
 *
 * What a rail row claims about a team the user is not looking at.
 *
 * Worth a test because the thing it replaces was not wrong by a subtle margin: every row but
 * the active one printed the literal word `stopped` and drew a dashed silhouette, from the era
 * when switching teams really did stop the one you were leaving. `TeamPool` has kept the last
 * few teams live since, so that row was asserting something false about a team that was often
 * still working, and nothing here could have caught it because nothing here rendered.
 *
 * The claims: a row draws its members, it says what they are doing, and it says nothing when
 * they are doing nothing.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { Rail } from './Rail.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPEN: UiTeam = { id: 'open', name: 'portfolio', workspacePath: '/w', turnBudget: 10 };
const OPEN_AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w/a' },
];

/** The team on screen, plus one the pool may or may not be holding. Two rows, one of each. */
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
    members: [
      { id: 'mara', name: 'Mara' },
      { id: 'nils', name: 'Nils' },
    ],
  },
];

interface Drawn {
  readonly text: string;
  readonly host: HTMLElement;
}

function draw(statuses: Record<string, AgentStatus>): Drawn {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(Rail, {
        team: OPEN,
        teams: TEAMS,
        agents: OPEN_AGENTS,
        statuses,
        items: [],
        pane: { kind: 'team' },
        onSelect: () => {},
        onSelectTeam: () => {},
      }),
    );
  });
  return { text: (host.textContent ?? '').replace(/\s+/g, ' ').trim(), host };
}

function done(drawn: Drawn): void {
  drawn.host.remove();
}

/** The row for the team that is not on screen. */
function backgrounded(drawn: Drawn): HTMLElement {
  const row = drawn.host.querySelector('.teamrow.off');
  if (row === null) throw new Error('no backgrounded row was drawn');
  return row as HTMLElement;
}

describe('a team the user is not looking at', () => {
  it('draws its members rather than an anonymous silhouette', () => {
    const drawn = draw({});
    const row = backgrounded(drawn);
    // A mark of real faces, not the ghost. The ghost is now only for a team with nobody on it.
    expect(row.querySelector('.mark')).not.toBeNull();
    expect(row.querySelector('.ghost')).toBeNull();
    expect(row.querySelectorAll('.mark > .blob')).toHaveLength(2);
    expect(drawn.text).toContain('2 agents');
    done(drawn);
  });

  it('never says stopped, which is a claim the rail cannot make', () => {
    // Not just absent from the quiet case: the word is gone. Whether the pool happens to be
    // holding a team is not something the user chose, so the rail does not report it either
    // way — and reporting it wrongly is what this row did.
    for (const statuses of [{}, { mara: 'working' as const, nils: 'idle' as const }]) {
      const drawn = draw(statuses);
      expect(drawn.text.toLowerCase()).not.toContain('stopped');
      done(drawn);
    }
  });

  it('says what its members are doing, folded, while they are doing something', () => {
    const drawn = draw({ mara: 'working', nils: 'working' });
    const row = backgrounded(drawn);
    expect(row.textContent).toContain('2 working');
    // Contrast is the attention channel, and a row with something to say spends it.
    expect(row.className).toContain('busy');
    done(drawn);
  });

  it('inverts for waiting, the one state that needs a human on a team nobody is watching', () => {
    // The case the filter used to swallow whole: a backgrounded team blocked on a permission
    // request sits there until somebody opens it, and this row is the only thing that can say
    // so. `.is-waiting` is the app's one inversion.
    const drawn = draw({ mara: 'waiting', nils: 'idle' });
    expect(backgrounded(drawn).querySelector('.stat.is-waiting')).not.toBeNull();
    done(drawn);
  });

  it('stays silent while every member is idle', () => {
    // Same rule the agent rows follow: idle is the resting state of a quiet app, and a column
    // of teams each printing IDLE is that word repeated as many times as the user has teams.
    const drawn = draw({ mara: 'idle', nils: 'idle' });
    expect(backgrounded(drawn).querySelector('.stat')).toBeNull();
    done(drawn);
  });

  it('is silent, not stopped, when the pool is not holding it at all', () => {
    // No entries for its members, which is exactly what an unloaded team contributes. It folds
    // to idle, because an unloaded team has nothing in flight.
    const drawn = draw({});
    expect(backgrounded(drawn).querySelector('.stat')).toBeNull();
    done(drawn);
  });
});
