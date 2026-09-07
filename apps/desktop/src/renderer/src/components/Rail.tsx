import { useEffect, useRef } from 'react';
import * as Menu from '@radix-ui/react-context-menu';
import {
  ChevronRight,
  Clock,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import type { AgentStatus, MachinePower } from '@blobot/core/domain';
import type { UiAgent, UiRailAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { railRowsOf, type Pane, type RailRow } from '../model.js';
import { lastActive } from '../time.js';
import { Blob, SEEN } from './Blob.js';
import { MachinePowerDot } from './MachinePowerDot.js';
import { TeamMark } from './TeamMark.js';
import { StatusWord } from './StatusWord.js';

/**
 * The rail: **one list of two kinds of thing**, ordered by recency, with a pin.
 *
 * `.scratch/rail/`. It used to be a list of teams with the open team's roster nested underneath
 * it, so an agent appeared on screen as a child of a project, and only while that project was the
 * one being read. Three costs fell out of that: switching to another team hid every agent on the
 * one you left, twenty hired agents were invisible until they were put on something, and the
 * model the app is built on — agents exist independently of teams, ADR-0001 — was contradicted by
 * the first column the user looks at.
 *
 * So **every hired agent is a row**, from the moment they are hired, and pressing one opens their
 * **thread**: that agent's own conversation, with its own folder, branch and history, and none of
 * the furniture that describes a team. **Every team is one row** that opens the team and no
 * longer opens a roster.
 *
 * Both wear the same shape, which is what makes them peers in the literal sense: a 34px mark, the
 * name and the time on the first line, the last thing said on the second. The 20px team row went
 * with the reason for it — it was drawn small because it *headed* a roster, and shortness was how
 * the column avoided reading as two lists stacked. There is one list now.
 *
 * What each row draws is `railRowsOf`'s, in `model.ts`. This file renders it.
 */
/**
 * The mark on every row, of either kind. One size, because one row shape: an agent's face and a
 * team's cluster share a left edge and a height, and neither reads as a heading over the other.
 */
const MARK = 34;

export function Rail({
  team,
  teams,
  profiles,
  agents,
  statuses,
  pane,
  unread,
  pinned,
  onSelect,
  onSelectTeam,
  onSelectAgent,
  onTogglePin,
  onNewTeam,
  onEditTeam,
  onDeleteTeam,
  onDeleteThread,
  onRetireAgent,
  onOpenAgents,
  onOpenRoutines,
  onOpenSettings,
  onFind,
}: {
  team: UiTeam;
  teams: readonly UiTeamSummary[];
  /** Every hired agent. Absent in demo mode, whose agents are a TypeScript file. */
  profiles?: readonly UiRailAgent[];
  /** The open team's roster. Its faces stand in for the open row's mark before the summary is
   *  re-read; power comes from the summaries, so every loaded team's dot is drawn, not just this
   *  one's. */
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  pane: Pane;
  /**
   * Agents carrying a Routine run nobody has looked at. Issue 11's unread mark, and the reason
   * it is here rather than on the Routines screen alone: a Routine whose value is the *message*
   * lands in a pane the user has no reason to open, and a daily briefing nobody is told about
   * is a daily briefing that does not exist.
   */
  unread: readonly string[];
  /** Row ids the user pinned, in pin order. Team ids and profile ids in one list. */
  pinned: readonly string[];
  onSelect: (pane: Pane) => void;
  /** Absent in demo mode, where there is exactly one team and it is scripted. */
  onSelectTeam?: (teamId: string) => void;
  /** Opens an agent's thread. Absent in demo mode, which has no profiles behind its agents. */
  onSelectAgent?: (profileId: string) => void;
  onTogglePin?: (id: string) => void;
  onNewTeam?: () => void;
  onEditTeam?: (teamId: string) => void;
  onDeleteTeam?: (teamId: string) => void;
  /** Deletes one agent's conversation and leaves them hired. `.scratch/rail/issues/06`. */
  onDeleteThread?: (teamId: string) => void;
  /**
   * Retires an agent: they stop being somebody you can put on a team, and the conversation goes
   * with them. The caller opens the dialog that says both and takes the answer — nothing here
   * retires anybody, which is what keeps the app's most invisible control off its heaviest act.
   */
  onRetireAgent?: (profileId: string) => void;
  /** Opens *your agents*. Absent in demo mode, whose agents are a TypeScript file. */
  onOpenAgents?: () => void;
  /** Opens *routines*, the second door. Absent in demo mode. */
  onOpenRoutines?: () => void;
  /** Opens *settings*, the third door. Absent in demo mode. */
  onOpenSettings?: () => void;
  /** Opens the navigator. The same thing ctrl+k does, for the user who has not been told. */
  onFind?: () => void;
}): React.JSX.Element {
  // The open row keeps its place in the order, so with a dozen rows that place can be below the
  // fold. Brought into view when the team changes rather than pinned there: a row stuck to the
  // edge of the column would read as sitting on top of the list rather than in it. `nearest`,
  // because a row already on screen must not be moved.
  const here = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    here.current?.scrollIntoView({ block: 'nearest' });
  }, [team.id]);

  /**
   * The open team, drawn from `team` rather than from its summary row.
   *
   * The substitution the old rail made for its hoist, kept for the reason that survived it: the
   * conversation's view of the open team carries a name and an icon set a moment ago, before the
   * summary row has been re-read, and demo mode has no summary row for it at all.
   */
  const open = teams.find((row) => row.id === team.id);
  const running: UiTeamSummary = {
    id: team.id,
    name: team.name,
    workspacePath: team.workspacePath,
    workspaceKind: open?.workspaceKind ?? 'git',
    ...(team.icon === undefined ? {} : { icon: team.icon }),
    ...(team.threadFor === undefined ? {} : { threadFor: team.threadFor }),
    members: open?.members ?? agents.map((agent) => ({ id: agent.id, name: '' })),
    ...(open?.lastActiveAt === undefined ? {} : { lastActiveAt: open.lastActiveAt }),
    ...(open?.lastLine === undefined ? {} : { lastLine: open.lastLine }),
  };
  const summaries: readonly UiTeamSummary[] =
    open === undefined
      ? [running, ...teams]
      : teams.map((row) => (row.id === team.id ? running : row));

  const rows = railRowsOf({
    teams: summaries,
    profiles: profiles ?? [],
    statuses,
    unread,
    pinned,
  });
  // Where the pinned block ends. A hairline and no heading: the block's *position* is the state,
  // and a mono `PINNED` would be signage for something already visible. Without any separator the
  // order looks arbitrary the first time a pinned row outranks something more recent.
  const pins = rows.filter((row) => row.pinned).length;

  const selectedId =
    pane.kind === 'thread'
      ? pane.profileId
      : pane.kind === 'agent'
        ? (team.threadFor ?? team.id)
        : team.id;

  return (
    // Nothing here opens any more, so nothing here animates. `useTeamOpening` grew the roster's
    // box and staggered its rows in, which was one gesture with one subject — a team making room
    // for its members. There is no roster: pressing a row switches the pane and the list does not
    // change shape, so an animation would be smoothing a change the interface is not making.
    <div className="rail">
      {/* Everything that scrolls, which is the list and the one control that stands in for it.
          The doors at the foot are outside this box so that they stay put: a user with a dozen
          teams would otherwise have to scroll past them to reach a place that is not about any
          one of them. */}
      <div className="railscroll">
        {/* The navigator has a key and, until this, nothing else — which makes it a feature for
            whoever was told about it. A row at the top of the column it stands in for, wearing
            the shortcut it is teaching. It is a **button drawn as a field**, not a field: there
            is one search in this app and it lives in the navigator, and a second input here
            would either duplicate it or drift from it. */}
        {onNewTeam !== undefined && (
          <div className="railbar">
            <button className="railadd" onClick={onNewTeam} title="New team" aria-label="New team">
              <Plus size={16} aria-hidden />
            </button>
          </div>
        )}
        {onFind !== undefined && (
          <button className="railfind" onClick={onFind} title="Find a team or an agent">
            <Search size={13} aria-hidden />
            <span>Search</span>
            <span style={{ flex: 1 }} />
            <span className="mono muted">{shortcut()}</span>
          </button>
        )}

        {rows.map((row, index) => {
          // The power dot belongs to the Agent behind a thread, on **every live thread** and not
          // only the one being read. It was drawn from the open team's roster, so opening
          // another team put out the light on an agent that was still awake — the same false
          // claim `STOPPED` on every rail row used to make. `railRowsOf` carries it now, from
          // the summary the main process fills for each loaded team.
          const power = row.kind === 'agent' ? row.power : undefined;
          return (
          <div key={`${row.kind}:${row.id}`}>
            {index === pins && pins > 0 && <div className="railpinline" aria-hidden />}
            <RowMenu
              row={row}
              onEditTeam={onEditTeam}
              onDeleteTeam={onDeleteTeam}
              onDeleteThread={onDeleteThread}
              onRetireAgent={onRetireAgent}
              onTogglePin={onTogglePin}
            >
              <Row
                row={row}
                selected={row.id === selectedId}
                {...(row.id === selectedId ? { anchor: here } : {})}
                {...(power === undefined ? {} : { power })}
                onOpen={() => {
                  if (row.kind === 'team') onSelectTeam?.(row.id);
                  else onSelectAgent?.(row.id);
                }}
                onSelectOpenTeam={() => onSelect({ kind: 'team' })}
                isOpenTeam={row.kind === 'team' && row.id === team.id}
              />
            </RowMenu>
          </div>
          );
        })}
      </div>

      {/* The doors that are not the list, at the foot of the column, where a sidebar puts the
          places it is not about. Not headings, so not mono: a heading names what is under it and
          there is nothing under these. Each is named for what is behind it. */}
      {(onOpenAgents !== undefined ||
        onOpenRoutines !== undefined ||
        onOpenSettings !== undefined) && (
        <div className="railfoot">
          {onOpenAgents !== undefined && (
            <Door icon={<Users size={13} aria-hidden />} label="Agents" onClick={onOpenAgents} />
          )}
          {onOpenRoutines !== undefined && (
            <Door icon={<Clock size={13} aria-hidden />} label="Routines" onClick={onOpenRoutines} />
          )}
          {onOpenSettings !== undefined && (
            <Door
              icon={<Settings size={13} aria-hidden />}
              label="Settings"
              onClick={onOpenSettings}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One row, of either kind.
 *
 * Two lines and one shape: the mark, the name and the time above, the last thing said below. **No
 * speaker prefix** on that second line, on either kind — drawn both ways in the prototype, and
 * the author took the words alone.
 *
 * The right of the line says one thing at a time, and status outranks recency: a row that is
 * working is not also usefully described by when it last did. `waiting` still inverts, which is
 * the whole point of keeping a word — a backgrounded team blocked on a permission has no other
 * way to reach the user, and an agent row deliberately says nothing about its seats, so the team
 * row is the only carrier. Unread is **weight, never an inversion**, because `waiting` owns the
 * app's one inversion and this has to lose to it with both in the column at once.
 */
function Row({
  row,
  selected,
  anchor,
  power,
  onOpen,
  onSelectOpenTeam,
  isOpenTeam,
}: {
  row: RailRow;
  selected: boolean;
  anchor?: React.RefObject<HTMLDivElement | null>;
  power?: MachinePower;
  onOpen: () => void;
  onSelectOpenTeam: () => void;
  isOpenTeam: boolean;
}): React.JSX.Element {
  return (
    <div ref={anchor}>
      <button
        className={`railrow${selected ? ' sel' : ''}`}
        onClick={isOpenTeam ? onSelectOpenTeam : onOpen}
      >
        {row.kind === 'team' ? (
          <TeamMark
            {...(row.team.icon === undefined ? {} : { icon: row.team.icon })}
            members={row.team.members}
            size={MARK}
          />
        ) : (
          // `SEEN` rather than the floor, because the rail is the column a person looks at all
          // day and the whole point of the layer is that the faces look back. Two things move at
          // that excursion and only ever one at a time: `waiting` claiming the pointer, and
          // `wander`, which is a face glancing around the room while nothing else is aiming it.
          <span className="machineavatar mark" style={{ width: MARK, height: MARK }}>
            <Blob
              name={row.agent.name}
              size={MARK}
              {...(row.status === undefined ? {} : { status: row.status.status })}
              hue={row.agent.hue}
              shape={row.agent.shape}
              animated={power === undefined || power === 'awake'}
              wander
              travel={SEEN}
            />
            {power !== undefined && <MachinePowerDot power={power} />}
          </span>
        )}
        <span className="who">
          <span className="nm">
            <b>{row.name}</b>
            <span className="grow" />
            {/* When it last happened, where a chat app puts it. The status takes this slot
                when there is one, because the right of a row says one thing at a time. */}
            {row.status === undefined && row.at !== undefined && (
              <span className="when">{lastActive(row.at)}</span>
            )}
          </span>
          <span className="sub">
            {row.last === undefined ? (
              // A row with nothing said in it yet. An agent's role is what says what they are
              // for, because blobot's names are the user's own ("Alice") rather than job titles;
              // a team with no words in it has nothing to say and says nothing.
              row.kind === 'agent' ? <span className="role">{row.agent.role}</span> : <span />
            ) : (
              <span className={`preview${row.unread ? ' unread' : ''}`}>{row.last}</span>
            )}
            <span style={{ flex: 1 }} />
            {/* Members past the three the mark can hold, in mono, and dropped the moment there
                is a status: a stack capped at three must never be the thing claiming a team of
                nine is three people, and the right of a row says one thing at a time. */}
            {row.kind === 'team' && row.more !== undefined && (
              <span className="mono muted">+{row.more}</span>
            )}
            {row.status !== undefined && (
              <StatusWord status={row.status.status} label={row.status.label} />
            )}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * One row at the foot of the rail. A chevron on the right because it leads somewhere, which is
 * the one thing these have in common with the rows above and the reason they can sit in the same
 * column without being mistaken for them: those carry a mark and a status, these a glyph and a
 * word.
 */
function Door({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button className="raildoor" onClick={onClick}>
      {icon}
      <span>{label}</span>
      <span style={{ flex: 1 }} />
      <ChevronRight size={13} aria-hidden />
    </button>
  );
}

/** What to call the navigator's key on this machine. Mac has one word for it and nothing else does. */
function shortcut(): string {
  return navigator.userAgent.includes('Mac OS X') ? '⌘K' : 'CTRL K';
}

/**
 * What you can do to a row, on the row itself, under a right-click.
 *
 * **The whole row is the trigger, and there is no button.** That is the trade taken knowingly: a
 * right-click menu is the most invisible control an interface has, and nothing on screen says
 * these actions exist. What it buys is a rail with nothing on it but its rows — no glyph
 * appearing under the pointer on every row the user crosses, in the column DESIGN.md asks to be
 * the quiet one. Nothing here is the only door to what it does: a team's own pane carries its
 * edit and its delete, and *your agents* carries retiring.
 *
 * A row is a button, so the menu wraps it rather than living inside it: nesting would make one
 * unclickable control out of two.
 */
function RowMenu({
  row,
  onEditTeam,
  onDeleteTeam,
  onDeleteThread,
  onRetireAgent,
  onTogglePin,
  children,
}: {
  row: RailRow;
  onEditTeam: ((teamId: string) => void) | undefined;
  onDeleteTeam: ((teamId: string) => void) | undefined;
  onDeleteThread: ((teamId: string) => void) | undefined;
  onRetireAgent: ((profileId: string) => void) | undefined;
  onTogglePin: ((id: string) => void) | undefined;
  children: React.ReactNode;
}): React.JSX.Element {
  const threadId = row.kind === 'agent' ? row.agent.threadId : undefined;
  const items =
    row.kind === 'team'
      ? [onEditTeam, onDeleteTeam].some((one) => one !== undefined)
      : (threadId !== undefined && onDeleteThread !== undefined) || onRetireAgent !== undefined;
  if (!items && onTogglePin === undefined) return <>{children}</>;
  return (
    <Menu.Root>
      {/* `asChild` so the wrapper stays the one div the rest of the rail's rules are written
          against, rather than the menu adding a layer between the row and the list. */}
      <Menu.Trigger asChild>
        <div className="railrowwrap">{children}</div>
      </Menu.Trigger>
      <Menu.Portal>
        {/* The app's one menu object, borrowed outright: a second menu that looked like a
            different menu would be saying the two are different kinds of thing. */}
        <Menu.Content className="selectmenu rowmenu">
          {onTogglePin !== undefined && (
            <Menu.Item className="selectitem" onSelect={() => onTogglePin(row.id)}>
              {row.pinned ? <PinOff size={13} aria-hidden /> : <Pin size={13} aria-hidden />}
              <span>{row.pinned ? 'Unpin' : 'Pin'}</span>
            </Menu.Item>
          )}
          {row.kind === 'team' && onEditTeam !== undefined && (
            <Menu.Item className="selectitem" onSelect={() => onEditTeam(row.id)}>
              <Pencil size={13} aria-hidden />
              <span>Who is on {row.name}</span>
            </Menu.Item>
          )}
          {row.kind === 'team' && onDeleteTeam !== undefined && (
            <Menu.Item className="selectitem" onSelect={() => onDeleteTeam(row.id)}>
              <Trash2 size={13} aria-hidden />
              <span>Delete {row.name}</span>
            </Menu.Item>
          )}
          {/* The one destructive act in this map that is genuinely undoable in the sense that
              matters: the agent stays hired, the row stays, and saying hello makes a new thread.
              Absent until there *is* a conversation, because there is nothing to delete. */}
          {row.kind === 'agent' && threadId !== undefined && onDeleteThread !== undefined && (
            <Menu.Item className="selectitem" onSelect={() => onDeleteThread(threadId)}>
              <Trash2 size={13} aria-hidden />
              <span>Delete this conversation</span>
            </Menu.Item>
          )}
          {/* The heaviest thing on this menu, so it is last, it is the only one that opens a
              dialog, and it is the only one drawn in the danger colour: the agent stops being
              somebody you can put on a team and the conversation is deleted with them, priced
              and acknowledged in `RetireAgent` before anything happens. One word, because the
              row it is on says who — the menu came off that row and the dialog names them again
              before anything is destroyed. A row with no conversation still carries it: an agent
              you never spoke to is exactly the one worth deleting, and until this the menu on
              that row was a single `Pin`. */}
          {row.kind === 'agent' && onRetireAgent !== undefined && (
            <Menu.Item className="selectitem danger" onSelect={() => onRetireAgent(row.id)}>
              <Trash2 size={13} aria-hidden />
              <span>Delete</span>
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
