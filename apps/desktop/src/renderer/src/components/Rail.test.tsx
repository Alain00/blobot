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
import type { Item } from '../model.js';
import { Rail } from './Rail.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// This surface draws animated blobatars, so a gaze driver mounts with them. See `test-dom.ts`.
stubGazeHost();

// The rail brings the open team's group into view when the team changes, and jsdom implements
// no scrolling at all. Stubbed rather than guarded in the component: the guard would be a line
// of production code that exists for the test environment.
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

// With a lead, because who leads is now said on a row rather than under a team name and the
// fixture has to be able to say it.
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
    icon: 'data:image/png;base64,iVBORw0KGgo=',
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

function draw(
  statuses: Record<string, AgentStatus>,
  unread: readonly string[] = [],
  items: readonly Item[] = [],
): Drawn {
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
        items,
        pane: { kind: 'team' },
        unread,
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
  it('draws a mark rather than an anonymous silhouette', () => {
    const drawn = draw({});
    const row = backgrounded(drawn);
    // A real mark. The ghost is gone: the mark is about the project, and a team with nobody
    // on it is still a folder.
    expect(row.querySelector('.mark')).not.toBeNull();
    expect(row.querySelector('.ghost')).toBeNull();
    // The member count that used to sit under the name went with the second line. It was the
    // number of rows the team opens into, which is a worse way of saying what those rows say.
    expect(drawn.text).not.toContain('2 agents');
    done(drawn);
  });

  it('gives the mark to the project icon, and a folder to a team without one', () => {
    const drawn = draw({});
    const row = backgrounded(drawn);
    // One question per slot, and it is *which project is this*. The icon answers it where there
    // is one; faces never could, since the same agents are on several teams and two teams
    // sharing a roster drew an identical stack. Who is on it is one click away, on the rows the
    // team opens into.
    expect(row.querySelector('.mark .teamicon')).not.toBeNull();
    expect(row.querySelector('.mark .teamfolder')).toBeNull();
    // The open team has none, so it wears the plain folder. No placeholder in either direction:
    // a team without an icon is not a team missing one.
    expect(drawn.host.querySelector('.teamgroup .teamicon')).toBeNull();
    expect(drawn.host.querySelector('.teamgroup .teamrow .mark .teamfolder')).not.toBeNull();
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

  it('says its members are busy with the dots, and does not also print the word', () => {
    // This asserted `2 working` until the word was withdrawn from every in-flight state. The
    // dots already say a turn is in flight, and a row that draws them and then spells WORKING
    // beside them is making the same claim twice in the narrowest column in the app. The count
    // went with the word: it was qualifying it, and there is nothing left to qualify.
    const drawn = draw({ mara: 'working', nils: 'working' });
    const row = backgrounded(drawn);
    expect(row.querySelector('.stat.is-working .dots')).not.toBeNull();
    expect(row.textContent?.toLowerCase()).not.toContain('working');
    // Still legible to anyone not reading the shape.
    expect(row.querySelector('.stat.is-working')?.getAttribute('aria-label')).toBe('2 working');
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

/**
 * The face as a second status channel, and the line drawn through the middle of the rail.
 *
 * An agent row is about one agent, so a pose on it is a true sentence. A team mark folds its
 * members' statuses into one word, and a pose is per face, so posing the mark would draw every
 * member asserting what the fold only ever claimed of somebody. The mark keeps the body
 * animation it already had.
 */
describe('status worn on the face', () => {
  /** The agent rows under the open team. */
  function agentRow(drawn: Drawn): HTMLElement {
    const row = drawn.host.querySelector('.agentrow');
    if (row === null) throw new Error('no agent row was drawn');
    return row as HTMLElement;
  }

  it('poses an agent row for the states a pose can carry', () => {
    // Inline SVG rather than an `<img>` is the tell: `animate` is what puts the parts where
    // CSS can reach them, and `expression` writes the pose onto the same element.
    const drawn = draw({ alice: 'thinking' });
    const svg = agentRow(drawn).querySelector('.blob svg');
    expect(svg).not.toBeNull();
    // `--mo-rock` is the seesaw, and `thinking` is the only pose in the roster that sets it.
    expect((svg as SVGElement).getAttribute('style')).toContain('--mo-rock');
    done(drawn);
  });

  it('leaves an agent row unposed for the states the body already carries', () => {
    // `working` and `responding` are a whole creature busy or talking, and there is no pose for
    // hands. `idle` is still, because still is what says nothing is happening. They are all
    // still alive, though: the rail's blobatars breathe at rest, so what is absent here is the
    // pose, not the face.
    for (const status of ['idle', 'working', 'responding', 'failed'] as const) {
      const svg = agentRow(draw({ alice: status })).querySelector('.blob svg');
      expect(svg).not.toBeNull();
      expect((svg as SVGElement).getAttribute('style') ?? '').not.toContain('--mo-rock');
    }
  });

  it('keeps the rail alive at rest, and lets a failed agent out of it', () => {
    // The floor: every rail face is animated, always, so an idle roster breathes. `failed` is
    // the one status that leaves, because grayscale with a pulse is a corpse — and it leaves
    // through `.b-failed`, which the stylesheet takes the amp back on.
    // The library puts its classes on an inner `<g>`, not on the `<svg>`, which is also what
    // both stylesheet rules below reach for.
    const alive = agentRow(draw({ alice: 'idle' })).querySelector('.blob svg .mo-root');
    expect(alive?.getAttribute('class')).toContain('mo-always');
    // `failed` still renders the animated face; the stylesheet takes the amp back through the
    // wrapper, which is the element that has to be there for it to have anything to hook onto.
    const dead = agentRow(draw({ alice: 'failed' }));
    expect(dead.querySelector('.b-failed .blob svg .mo-root')).not.toBeNull();
  });

  it('puts no face in a team mark at all, whatever its members are doing', () => {
    // The whole of the marks-are-about-the-project decision, in one assertion. A face here
    // would be one member's status claimed by a slot that stands for the whole team, and a
    // roster that cannot tell two teams apart in the first place.
    for (const status of ['thinking', 'starting', 'waiting'] as const) {
      const drawn = draw({ mara: status, nils: 'idle' });
      for (const mark of drawn.host.querySelectorAll('.mark')) {
        expect(mark.querySelector('.blob')).toBeNull();
      }
      done(drawn);
    }
  });
});

/**
 * The column's order is the store's, not a record of what you last clicked.
 *
 * The rail used to build its rows as "the running team, then everything else", so opening a
 * team moved it to the top and every other row shifted under the pointer. That was never an
 * ordering decision: the running team is drawn from the `team` prop rather than from its
 * summary row, and the hoist was how the two were spliced together.
 */
describe('where a team sits in the rail', () => {
  /** The names of the team rows, top to bottom. */
  function order(teams: readonly UiTeamSummary[], open: UiTeam): string[] {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(Rail, {
          team: open,
          teams,
          agents: OPEN_AGENTS,
          statuses: {},
          items: [],
          pane: { kind: 'team' },
          unread: [],
          onSelect: () => {},
          onSelectTeam: () => {},
        }),
      );
    });
    const names = [...host.querySelectorAll('.teamrow .nm')].map((node) => node.textContent ?? '');
    act(() => root.unmount());
    host.remove();
    return names;
  }

  it('keeps its place when it is the one open', () => {
    // `portfolio` is second in the store's order, and it is the team on screen. It stays
    // second: the row a user reaches for is where they last saw it.
    const listed = [TEAMS[1] as UiTeamSummary, TEAMS[0] as UiTeamSummary];
    expect(order(listed, OPEN)).toEqual(['hermes-agent', 'portfolio']);
  });

  it('is drawn from the conversation even so, members and all', () => {
    // The reason the hoist existed: the open row's faces come from `agents`, not from the
    // summary. Substituting in place has to keep doing that.
    const listed = [TEAMS[1] as UiTeamSummary, TEAMS[0] as UiTeamSummary];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(Rail, {
          team: OPEN,
          teams: listed,
          agents: OPEN_AGENTS,
          statuses: {},
          items: [],
          pane: { kind: 'team' },
          unread: [],
          onSelect: () => {},
          onSelectTeam: () => {},
        }),
      );
    });
    // One agent row, under the open team, drawn from `agents`.
    expect(host.querySelectorAll('.agentrow')).toHaveLength(1);
    expect(host.textContent).toContain('Alice');
    act(() => root.unmount());
    host.remove();
  });

  it('still leads the column when the store has no row for it, which is demo mode', () => {
    // The one case the prepend was for: `--demo`'s team is a TypeScript file and is in no
    // summary list, so there is no place to keep and the top is the only answer.
    expect(order([TEAMS[1] as UiTeamSummary], OPEN)).toEqual(['portfolio', 'hermes-agent']);
  });
});

/**
 * A team row is one small line now, so everything the second line carried had to go somewhere or
 * go. `led by Alice` went to the lead's own row, which it can do because the roster is visibly
 * nested under its team: a row inside this section is scoped to this team, so `LEAD` there is
 * not the claim about the *agent* that `DESIGN.md` refused when it put the fact on the team.
 */
describe('who leads', () => {
  it('says LEAD on the lead’s row, and on no other', () => {
    const drawn = draw({});
    const rows = [...drawn.host.querySelectorAll('.agentrow')];
    expect(rows.length).toBeGreaterThan(0);
    const labelled = rows.filter((row) => row.querySelector('.lead') !== null);
    expect(labelled).toHaveLength(1);
    expect(labelled[0]?.textContent).toContain('Alice');
    done(drawn);
  });

  it('never says it on the team’s own row again', () => {
    const drawn = draw({});
    expect(drawn.text).not.toContain('led by');
    expect(drawn.host.querySelector('.teamrow .lead')).toBeNull();
    done(drawn);
  });
});

/**
 * Issue 11. A Routine whose value is the *message* lands in a pane the user has no reason to
 * open, and a daily briefing nobody is told about is a daily briefing that does not exist.
 *
 * The constraint that makes it hard is what these check: `waiting` already spends the app's one
 * contrast inversion and issue 03 made that the load-bearing way a parked run reaches the user,
 * so this must lose to it — legibly, with both in the column at once.
 */
describe('a Routine run nobody has looked at', () => {
  const spoke = [
    {
      kind: 'agent' as const,
      id: 'a1',
      at: 10,
      agentId: 'alice',
      text: 'here is this morning’s summary',
      live: false,
    },
  ];

  it('draws the line the rail already has at full ink, and adds no element', () => {
    const drawn = draw({}, ['alice'], spoke);
    const preview = drawn.host.querySelector('.agentrow .preview');

    expect(preview?.className).toContain('unread');
    // Not a dot and not a count: a dot is a new element in a column whose job is quiet, and two
    // unread reports and five are the same decision.
    expect(drawn.host.querySelectorAll('.agentrow .dot')).toHaveLength(0);
    expect(drawn.text).not.toContain('1 unread');
    done(drawn);
  });

  it('leaves the line quiet when there is nothing unread', () => {
    const drawn = draw({}, [], spoke);
    expect(drawn.host.querySelector('.agentrow .preview.unread')).toBeNull();
    done(drawn);
  });

  it('never inverts, because waiting owns the app’s one inversion', () => {
    const drawn = draw({}, ['alice'], spoke);
    // `StatusWord` is what inverts, and nothing here draws one: an unread mark is not a status.
    expect(drawn.host.querySelector('.agentrow .preview.unread .stat')).toBeNull();
    done(drawn);
  });

  it('does not leak into an ordinary turn the user started', () => {
    // The same agent and the same preview line, with no mark: an agent finishing work the user
    // started is not unread, it is finished. The mark is earned by origin, and marking every
    // turn would put one on almost every row within a day and make the signal worthless.
    const drawn = draw({}, [], spoke);
    expect(drawn.host.querySelector('.preview')?.textContent).toContain('summary');
    expect(drawn.host.querySelector('.preview.unread')).toBeNull();
    done(drawn);
  });
});

/**
 * The two things you can do to a team, which stopped being two buttons.
 *
 * Worth a test because what replaced them is invisible: the row draws nothing about editing or
 * deleting, and the words only exist once somebody right-clicks. A regression here is not a
 * misdrawn row, it is an action with no way in at all — and the previous version, two
 * always-mounted buttons, could not have had this failure.
 */
describe('the actions on a team row', () => {
  function withActions(): Drawn {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(Rail, {
          team: OPEN,
          teams: TEAMS,
          agents: OPEN_AGENTS,
          statuses: {},
          items: [],
          pane: { kind: 'team' },
          unread: [],
          onSelect: () => {},
          onSelectTeam: () => {},
          onEditTeam: () => {},
          onDeleteTeam: () => {},
        }),
      );
    });
    return { text: (host.textContent ?? '').replace(/\s+/g, ' ').trim(), host };
  }

  it('draws nothing at rest, and never the word delete', () => {
    const drawn = withActions();
    // No control on the row at all now — not even one hidden behind a hover reveal. The rail
    // is teams and nothing else, which is the whole of what the right-click bought.
    for (const row of drawn.host.querySelectorAll('.teamrowwrap')) {
      expect(row.querySelectorAll('.rowacts').length).toBe(0);
    }
    expect(drawn.text.toLowerCase()).not.toContain('delete');
    done(drawn);
  });

  it('names both actions on a right-click, against the row that was clicked', () => {
    const drawn = withActions();
    const row = drawn.host.querySelector('.teamrowwrap') as HTMLElement;
    act(() => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
    });
    // Portalled, so the menu is not inside the rail's own subtree — read the document.
    const menu = document.querySelector('.rowmenu');
    expect(menu).not.toBeNull();
    const words = (menu?.textContent ?? '').replace(/\s+/g, ' ');
    // Named rows rather than glyphs, which is the whole reason for the trade: a bin icon says
    // "delete" and a row says "delete blobatar".
    expect(words).toContain('Delete');
    expect(words).toContain('Who is on');
    // And the row the menu belongs to says so, since the menu lands under the pointer rather
    // than attached to anything the eye can follow back.
    expect(row.getAttribute('data-state')).toBe('open');
    done(drawn);
  });
});
