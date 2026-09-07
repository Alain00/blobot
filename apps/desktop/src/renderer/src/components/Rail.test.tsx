/**
 * @vitest-environment jsdom
 *
 * What the rail draws, now that it is one list of two kinds of thing.
 *
 * `.scratch/rail/`. The claims are the ones a rendering can break, which is a smaller set than
 * it used to be: the ordering, the pinning, the mixing and the `+N` are `railRowsOf`'s, tested
 * as a pure function in `model.test.ts`, and what is left here is that both kinds actually draw,
 * that a team's mark is its members' faces capped at three, that the pinned block is separated,
 * and that the invisible right-click menu has anything in it at all.
 *
 * The one claim inherited outright from the version this replaces: **the rail never says
 * `stopped`**. Every row but the active one printed that word and drew a dashed silhouette, from
 * the era when switching teams really did stop the one you were leaving — a false claim about a
 * team that was often still working, and nothing could have caught it because nothing rendered.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiRailAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { Rail } from './Rail.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// This surface draws animated blobatars, so a gaze driver mounts with them. See `test-dom.ts`.
stubGazeHost();

// The rail brings the open row into view when the team changes, and jsdom implements no
// scrolling at all. Stubbed rather than guarded in the component: the guard would be a line of
// production code that exists for the test environment.
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const OPEN: UiTeam = {
  id: 'open',
  name: 'portfolio',
  workspacePath: '/w',
  turnBudget: 10,
  leadAgentId: 'alice',
};
const OPEN_AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w/a', accepts: { images: true, textFiles: true } },
];

/** The team on screen, plus one the pool may or may not be holding. */
const TEAMS: readonly UiTeamSummary[] = [
  {
    id: 'open',
    name: 'portfolio',
    workspacePath: '/w',
    workspaceKind: 'git',
    members: [{ id: 'alice', name: 'Alice' }],
    lastActiveAt: 300,
  },
  {
    id: 'other',
    name: 'hermes-agent',
    workspacePath: '/h',
    workspaceKind: 'git',
    icon: 'data:image/png;base64,iVBORw0KGgo=',
    members: [
      { id: 'mara', name: 'Mara' },
      { id: 'nils', name: 'Nils' },
    ],
    lastActiveAt: 200,
    lastLine: 'pushed the branch',
  },
];

/** One hired agent with a thread, and one nobody has ever spoken to. */
const PROFILES: readonly UiRailAgent[] = [
  { id: 'p_ida', name: 'Ida', role: 'reviews', hiredAt: 50, threadId: 'thread' },
  { id: 'p_omar', name: 'Omar', role: 'writes', hiredAt: 400 },
];
const THREAD: UiTeamSummary = {
  id: 'thread',
  name: 'Ida',
  workspacePath: '/home/x/blobot/ida',
  workspaceKind: 'git',
  threadFor: 'p_ida',
  members: [{ id: 'ida_1', name: 'Ida' }],
  lastActiveAt: 250,
  lastLine: 'the diff looks fine to me',
};

interface Drawn {
  readonly text: string;
  readonly host: HTMLElement;
}

function draw(
  options: {
    statuses?: Record<string, AgentStatus>;
    unread?: readonly string[];
    pinned?: readonly string[];
    teams?: readonly UiTeamSummary[];
    profiles?: readonly UiRailAgent[];
    agents?: readonly UiAgent[];
    team?: UiTeam;
    actions?: boolean;
  } = {},
): Drawn {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(Rail, {
        team: options.team ?? OPEN,
        teams: options.teams ?? [...TEAMS, THREAD],
        profiles: options.profiles ?? PROFILES,
        agents: options.agents ?? OPEN_AGENTS,
        statuses: options.statuses ?? {},
        pane: { kind: 'team' },
        unread: options.unread ?? [],
        pinned: options.pinned ?? [],
        onSelect: () => {},
        onSelectTeam: () => {},
        onSelectAgent: () => {},
        ...(options.actions === true
          ? {
              onEditTeam: () => {},
              onDeleteTeam: () => {},
              onDeleteThread: () => {},
              onRetireAgent: () => {},
              onTogglePin: () => {},
            }
          : {}),
      }),
    );
  });
  return { text: (host.textContent ?? '').replace(/\s+/g, ' ').trim(), host };
}

function done(drawn: Drawn): void {
  drawn.host.remove();
}

// The context menu is portalled to the body, so it outlives the host it came from. Cleared
// between tests, or the next `document.querySelector('.rowmenu')` reads the last one.
afterEach(() => {
  for (const node of document.querySelectorAll('.rowmenu, [data-radix-popper-content-wrapper]')) {
    node.remove();
  }
});

/** The rows' names, top to bottom. Both kinds, because they are one list. */
function names(drawn: Drawn): string[] {
  return [...drawn.host.querySelectorAll('.railrow .nm b')].map((node) => node.textContent ?? '');
}

describe('one list, two kinds', () => {
  it('draws a row for every team and every hired agent, and none for a thread', () => {
    const drawn = draw();
    // `Ida` appears once — as the person, never as the Team her conversation is. A thread is the
    // only Team the user never sees as one.
    expect(names(drawn)).toEqual(['Omar', 'portfolio', 'Ida', 'hermes-agent']);
    expect(drawn.text).not.toContain('/home/x/blobot/ida');
    done(drawn);
  });

  it('gives both kinds the same row, so neither reads as a heading over the other', () => {
    const drawn = draw();
    const rows = [...drawn.host.querySelectorAll('.railrow')];
    expect(rows).toHaveLength(4);
    // One class, one shape. The old rail had `.teamrow` at one line and `.agentrow` at two.
    expect(drawn.host.querySelectorAll('.teamrow')).toHaveLength(0);
    expect(drawn.host.querySelectorAll('.agentrow')).toHaveLength(0);
    // And no twisty: the chevron promised a roster underneath, and nothing opens one now.
    expect(drawn.host.querySelectorAll('.twisty')).toHaveLength(0);
    done(drawn);
  });

  it('says what was last said on a row, with no speaker in front of it', () => {
    const drawn = draw();
    const previews = [...drawn.host.querySelectorAll('.railrow .preview')].map(
      (node) => node.textContent ?? '',
    );
    expect(previews).toContain('the diff looks fine to me');
    expect(previews).toContain('pushed the branch');
    // Drawn both ways in the prototype; the author took the words alone.
    expect(drawn.text).not.toContain('Ida: the diff');
    done(drawn);
  });

  it('shows an agent’s role until they have said something', () => {
    const drawn = draw();
    // blobot's names are the user's own ("Omar"), not job titles, so on a fresh hire nothing
    // else on the row says what this agent is for.
    expect(drawn.text).toContain('writes');
    done(drawn);
  });
});

describe('the mark', () => {
  it('draws a team as its members’ faces, capped at three', () => {
    const crowd: UiTeamSummary = {
      ...(TEAMS[1] as UiTeamSummary),
      members: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase() })),
    };
    const drawn = draw({ teams: [crowd], profiles: [], team: { ...OPEN, id: 'other' } });
    const mark = drawn.host.querySelector('.railrow .mark');
    // Four faces are texture at mark size and twelve are a pattern; the prototype is the
    // argument. Past three the count goes on the second line instead.
    expect(mark?.querySelectorAll('.markface')).toHaveLength(3);
    expect(drawn.text).toContain('+2');
    done(drawn);
  });

  it('drops the +N the moment there is a status, because the right says one thing at a time', () => {
    const crowd: UiTeamSummary = {
      ...(TEAMS[1] as UiTeamSummary),
      members: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase() })),
    };
    const drawn = draw({
      teams: [crowd],
      profiles: [],
      team: { ...OPEN, id: 'other' },
      statuses: { a: 'working' },
    });
    expect(drawn.text).not.toContain('+2');
    done(drawn);
  });

  it('keeps the project icon as a sticker on the faces, never instead of them', () => {
    const drawn = draw();
    const mark = drawn.host.querySelector('.railrow .mark .teamicon')?.parentElement;
    // DESIGN.md's rule survives in the same box: the faces say who is on the team, the icon
    // says which project. A team with an icon still draws its roster.
    expect(mark?.querySelectorAll('.markface').length).toBeGreaterThan(0);
    expect(mark?.querySelector('.teamfolder')).toBeNull();
    done(drawn);
  });

  it('keeps the folder for a team with nobody on it', () => {
    const { icon: _icon, ...bare } = TEAMS[1] as UiTeamSummary;
    const empty: UiTeamSummary = { ...bare, members: [] };
    const drawn = draw({ teams: [empty], profiles: [], team: { ...OPEN, id: 'other' } });
    expect(drawn.host.querySelector('.mark .teamfolder')).not.toBeNull();
    done(drawn);
  });
});

describe('what a row says about what is happening', () => {
  it('never says stopped, which is a claim the rail cannot make', () => {
    for (const statuses of [{}, { mara: 'working' as const, nils: 'idle' as const }]) {
      const drawn = draw({ statuses });
      expect(drawn.text.toLowerCase()).not.toContain('stopped');
      done(drawn);
    }
  });

  it('says its members are busy with the dots, and does not also print the word', () => {
    const drawn = draw({ statuses: { mara: 'working', nils: 'working' } });
    const row = [...drawn.host.querySelectorAll('.railrow')].find(
      (one) => one.textContent?.includes('hermes-agent') === true,
    );
    expect(row?.querySelector('.stat.is-working .dots')).not.toBeNull();
    expect(row?.textContent?.toLowerCase()).not.toContain('working');
    // Still legible to anyone not reading the shape.
    expect(row?.querySelector('.stat.is-working')?.getAttribute('aria-label')).toBe('2 working');
    done(drawn);
  });

  it('inverts for waiting, which is the only way a backgrounded team reaches the user', () => {
    // The case that made `08` a ticket: an agent row says nothing about its seats, so the team
    // row is the *only* carrier — and with nobody listening a permission request is cancelled
    // rather than delayed.
    const drawn = draw({ statuses: { mara: 'waiting', nils: 'idle' } });
    expect(drawn.host.querySelector('.stat.is-waiting')).not.toBeNull();
    done(drawn);
  });

  it('stays silent while everything is idle', () => {
    const drawn = draw({ statuses: { mara: 'idle', nils: 'idle', ida_1: 'idle' } });
    expect(drawn.host.querySelector('.railrow .stat')).toBeNull();
    done(drawn);
  });

  it('says nothing on an agent row about the teams that agent is on', () => {
    // Ida is `waiting` inside hermes-agent, and her own row is about her thread. A signal you
    // cannot act on from the place it appears is worse than no signal: pressing her row opens
    // her conversation, which is not where the request is.
    const drawn = draw({
      teams: [...TEAMS, THREAD, {
        id: 'third',
        name: 'atlas',
        workspacePath: '/a',
        workspaceKind: 'git',
        members: [{ id: 'ida_2', name: 'Ida', profileId: 'p_ida' }],
      }],
      statuses: { ida_2: 'waiting' },
    });
    const idaRow = [...drawn.host.querySelectorAll('.railrow')].find(
      (row) => row.querySelector('.nm b')?.textContent === 'Ida',
    );
    expect(idaRow?.querySelector('.stat')).toBeNull();
    // And the team she is waiting inside carries it, inverted.
    const atlas = [...drawn.host.querySelectorAll('.railrow')].find(
      (row) => row.querySelector('.nm b')?.textContent === 'atlas',
    );
    expect(atlas?.querySelector('.stat.is-waiting')).not.toBeNull();
    done(drawn);
  });
});

/**
 * Issue 11's mark, unchanged by this redesign except in where it lands. A Routine whose value is
 * the *message* arrives in a pane the user has no reason to open, and a daily briefing nobody is
 * told about is a daily briefing that does not exist.
 */
describe('a Routine run nobody has looked at', () => {
  it('draws the line the rail already has at full ink, and adds no element', () => {
    const drawn = draw({ unread: ['ida_1'] });
    const idaRow = [...drawn.host.querySelectorAll('.railrow')].find(
      (row) => row.querySelector('.nm b')?.textContent === 'Ida',
    );
    expect(idaRow?.querySelector('.preview')?.className).toContain('unread');
    // Not a dot and not a count: a dot is a new element in a column whose job is quiet, and two
    // unread reports and five are the same decision.
    expect(drawn.host.querySelectorAll('.railrow .dot')).toHaveLength(0);
    expect(drawn.text).not.toContain('1 unread');
    done(drawn);
  });

  it('never inverts, because waiting owns the app’s one inversion', () => {
    const drawn = draw({ unread: ['ida_1'] });
    expect(drawn.host.querySelector('.preview.unread .stat')).toBeNull();
    done(drawn);
  });

  it('leaves the line quiet when there is nothing unread', () => {
    const drawn = draw();
    expect(drawn.host.querySelector('.railrow .preview.unread')).toBeNull();
    done(drawn);
  });
});

describe('the pinned block', () => {
  it('lifts pinned rows to the top in pin order, and rules a line under them', () => {
    const drawn = draw({ pinned: ['other', 'p_ida'] });
    expect(names(drawn).slice(0, 2)).toEqual(['hermes-agent', 'Ida']);
    // A hairline and no heading: the block's position is the state, and a mono `PINNED` would
    // be signage for something already visible.
    expect(drawn.host.querySelectorAll('.railpinline')).toHaveLength(1);
    expect(drawn.text).not.toContain('PINNED');
    done(drawn);
  });

  it('draws no separator when nothing is pinned', () => {
    const drawn = draw();
    expect(drawn.host.querySelector('.railpinline')).toBeNull();
    done(drawn);
  });

  it('marks a pinned row in no way at rest', () => {
    const drawn = draw({ pinned: ['other'] });
    const row = drawn.host.querySelector('.railrow');
    expect(row?.className).not.toContain('pin');
    done(drawn);
  });
});

/**
 * What you can do to a row, which is invisible until somebody right-clicks.
 *
 * Worth a test because a regression here is not a misdrawn row, it is an action with no way in
 * at all — and the version this replaces, two always-mounted buttons, could not have had that
 * failure.
 */
describe('the actions on a row', () => {
  function menuOf(drawn: Drawn, name: string): string {
    const row = [...drawn.host.querySelectorAll('.railrowwrap')].find(
      (one) => one.querySelector('.nm b')?.textContent === name,
    ) as HTMLElement;
    act(() => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
    });
    // Portalled, so the menu is not inside the rail's own subtree — read the document.
    const menu = document.querySelector('.rowmenu');
    expect(menu).not.toBeNull();
    expect(row.getAttribute('data-state')).toBe('open');
    return (menu?.textContent ?? '').replace(/\s+/g, ' ');
  }

  /** The menu's rows, one string each. `Delete` is a whole row, not a word inside another. */
  function itemsOf(drawn: Drawn, name: string): string[] {
    menuOf(drawn, name);
    return [...document.querySelectorAll('.rowmenu .selectitem')].map((one) =>
      (one.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  it('draws nothing at rest, and never the word delete', () => {
    const drawn = draw({ actions: true });
    for (const row of drawn.host.querySelectorAll('.railrowwrap')) {
      expect(row.querySelectorAll('.rowacts').length).toBe(0);
    }
    expect(drawn.text.toLowerCase()).not.toContain('delete');
    done(drawn);
  });

  it('offers a team its roster, its deletion and a pin', () => {
    const drawn = draw({ actions: true });
    const words = menuOf(drawn, 'hermes-agent');
    // Named rows rather than glyphs, which is the whole reason for the trade: a bin icon says
    // "delete" and a row says "delete hermes-agent".
    expect(words).toContain('Delete hermes-agent');
    expect(words).toContain('Who is on');
    expect(words).toContain('Pin');
    done(drawn);
  });

  it('offers an agent with a conversation the deletion of that conversation, and of the agent', () => {
    const drawn = draw({ actions: true });
    const words = menuOf(drawn, 'Ida');
    expect(words).toContain('Delete this conversation');
    // One word, last, and the only row in the danger colour: it ends the agent and the
    // conversation both, behind the dialog that prices it.
    expect(itemsOf(drawn, 'Ida')).toContain('Delete');
    expect(document.querySelector('.rowmenu .selectitem.danger')?.textContent).toBe('Delete');
    // Never a roster and never a team's deletion: a thread is not a team in this vocabulary.
    expect(words).not.toContain('Who is on');
    done(drawn);
  });

  it('offers an agent nobody has spoken to its own deletion, and no conversation to delete', () => {
    const drawn = draw({ actions: true });
    const words = menuOf(drawn, 'Omar');
    // Absent rather than disabled: there is no conversation, so there is nothing to destroy.
    expect(words).not.toContain('conversation');
    // The agent is still there to delete, which is what this row used to be missing: with no
    // conversation behind it the whole menu was a single `Pin`.
    expect(itemsOf(drawn, 'Omar')).toContain('Delete');
    expect(words).toContain('Pin');
    done(drawn);
  });
});
