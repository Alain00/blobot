import { useEffect, useRef } from 'react';
import { ChevronRight, Clock, Pencil, Search, Settings, Trash2, Users } from 'lucide-react';
import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { foldTeamStatus, lastLineOf, type Item, type Pane } from '../model.js';
import { lastActive } from '../time.js';
import { useTeamOpening } from '../useTeamOpening.js';
import { Blob, SEEN } from './Blob.js';
import { TeamMark } from './TeamMark.js';
import { StatusWord } from './StatusWord.js';


/**
 * Every team the user has is a row here, not just the running one. The rail used to show the
 * active team alone, with the others as a list at the foot that only appeared once a second
 * team existed — so "how do I switch teams?" had no answer on screen. The set is the rail.
 *
 * Every row is drawn as its members' faces. The active team additionally carries its agents
 * underneath it, indented, because it is the one whose sessions are on screen.
 *
 * The rest used to be an anonymous dashed silhouette and the word `stopped`, from when
 * switching really did stop everything. `TeamPool` keeps the last few teams live, so that word
 * was a claim about a team that was often still working. A row says what its members are doing
 * and stays silent when they are doing nothing, which is the same rule the agent rows follow.
 */
/**
 * The mark on a team row. Smaller than the 34px an agent's face gets, because a team row is one
 * small line and an agent row is two: the rail is a list of agents under headings now, and the
 * heading is not the substance. It was the same box as an agent row down to the padding, and the
 * reason given was that a team row standing *taller* made the column read as two lists stacked.
 * Shorter does not do that — it does the opposite, which is the point.
 */
const MARK = 20;

export function Rail({
  team,
  teams,
  agents,
  statuses,
  items,
  pane,
  unread,
  onSelect,
  onSelectTeam,
  onNewTeam,
  onEditTeam,
  onDeleteTeam,
  onOpenAgents,
  onOpenRoutines,
  onOpenSettings,
  onFind,
}: {
  team: UiTeam;
  teams: readonly UiTeamSummary[];
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  items: readonly Item[];
  pane: Pane;
  /**
   * Agents carrying a Routine run nobody has looked at. Issue 11's unread mark, and the reason
   * it is here rather than on the Routines screen alone: a Routine whose value is the *message*
   * lands in a pane the user has no reason to open, and a daily briefing nobody is told about
   * is a daily briefing that does not exist.
   */
  unread: readonly string[];
  onSelect: (pane: Pane) => void;
  /** Absent in demo mode, where there is exactly one team and it is scripted. */
  onSelectTeam?: (teamId: string) => void;
  onNewTeam?: () => void;
  onEditTeam?: (teamId: string) => void;
  onDeleteTeam?: (teamId: string) => void;
  /** Opens *your agents*. Absent in demo mode, whose agents are a TypeScript file. */
  onOpenAgents?: () => void;
  /** Opens *routines*. Absent in demo mode, whose team is a schedule nobody could keep. */
  onOpenRoutines?: () => void;
  /** Opens *settings*. Absent in demo mode, which configures nothing that outlives it. */
  onOpenSettings?: () => void;
  /** Opens the navigator. The same thing ctrl+k does, for the user who has not been told. */
  onFind?: () => void;
}): React.JSX.Element {
  const teamStatus = foldTeamStatus(agents.map((agent) => statuses[agent.id] ?? 'idle'));
  // The roster, not just the team: a team opens in two steps — its row arrives from the store,
  // its members arrive when the snapshot does — and the flight belongs to the step that puts
  // faces on screen. Keying on the team alone would run it against an empty column.
  // Only the open team can say this. `UiTeam.leadAgentId` is an Agent id and the conversation's
  // roster is right here to resolve it against; a backgrounded team's summary carries a
  // *profile* id, and the members it lists are Agents, so the two do not meet without plumbing
  // the rail does not have. No great loss: the question the lead answers is where an unaddressed
  // message lands, and that is a question about the team you are writing to.
  const lead = agents.find((agent) => agent.id === team.leadAgentId);
  const opening = useTeamOpening(`${team.id}:${agents.map((agent) => agent.id).join(',')}`);
  // The open team keeps its place in the order, so with a dozen teams that place can be below
  // the fold — and the rows the user is about to click are its agents. Brought into view when
  // the team changes rather than pinned there: a group stuck to the edge of the column floats
  // over the teams above and below it, which reads as the open team sitting on top of the list
  // rather than in it. `nearest` because a team already on screen must not be moved.
  const group = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    group.current?.scrollIntoView({ block: 'nearest' });
  }, [team.id]);
  // **A team keeps its place in the column when you open it.** The rail used to hoist the
  // running team to the top, which meant the order of the list depended on which row you last
  // clicked: a user reaching for the team they were on a minute ago found a different team
  // there. The store already answers this — `listTeams` orders by `createdAt`, and that order
  // is stable across every switch — so the rail simply renders it.
  //
  // The hoist was never an ordering decision. It was a *lookup* solved with one: the running
  // team is drawn from `team` rather than from its summary row, because the summary carries a
  // count of nothing the conversation has and demo mode has no row for it at all. So the
  // substitution happens in place, and the prepend survives only for the case that needed it.
  const open = teams.find((row) => row.id === team.id);
  const running: UiTeamSummary = {
    id: team.id,
    name: team.name,
    workspacePath: team.workspacePath,
    // The running team is drawn from `team`, which is the conversation's view of it and
    // carries no kind. The summary row has one, and demo mode has no row at all.
    workspaceKind: open?.workspaceKind ?? 'git',
    // From the conversation's team rather than the summary, for the same reason the name is:
    // an icon set a moment ago is on `team` before the row is re-read, and demo mode has no row.
    ...(team.icon === undefined ? {} : { icon: team.icon }),
    members: agents,
    ...(open?.lastActiveAt === undefined ? {} : { lastActiveAt: open.lastActiveAt }),
  };
  const rows: readonly UiTeamSummary[] =
    open === undefined
      ? [running, ...teams]
      : teams.map((row) => (row.id === team.id ? running : row));

  return (
    <div className="rail" ref={opening}>
      {/* Everything that scrolls, which is the list and the one control that stands in for it.
          The doors at the foot are outside this box so that they stay put: a user with a dozen
          teams would otherwise have to scroll to the end of them to reach a place that is not
          about any team. */}
      <div className="railscroll">
      {/* The navigator has a key and, until this, nothing else — which makes it a feature for
          whoever was told about it. A row at the top of the column it stands in for, wearing the
          shortcut it is teaching. It is a **button drawn as a field**, not a field: there is one
          search in this app and it lives in the navigator, and a second input here would either
          duplicate it or drift from it. */}
      {onFind !== undefined && (
        <button className="railfind" onClick={onFind} title="Find a team or an agent">
          <Search size={13} aria-hidden />
          <span>Search</span>
          <span style={{ flex: 1 }} />
          <span className="mono muted">{shortcut()}</span>
        </button>
      )}
      <div className="railhead">
        <span className="mono muted">TEAMS</span>
        <span style={{ flex: 1 }} />
        {onNewTeam !== undefined && (
          <button className="railadd mono" onClick={onNewTeam} title="New team">
            + new
          </button>
        )}
      </div>

      {rows.map((row) => {
        const running = row.id === team.id;
        if (!running) {
          // Folded from the same map the running team's rows read, which carries every live
          // team. A team the pool is not holding has no entries and folds to `idle`, so an
          // unloaded team and a loaded quiet one say the same thing: nothing.
          const rowStatus = foldTeamStatus(row.members.map((member) => statuses[member.id] ?? 'idle'));
          const busy = rowStatus.status !== 'idle';
          return (
            <TeamRow key={row.id} row={row} onEditTeam={onEditTeam} onDeleteTeam={onDeleteTeam}>
            <button
              className={`teamrow off${busy ? ' busy' : ''}`}
              // Switching no longer stops anything: `TeamPool` keeps the last few teams live,
              // and a team that was evicted resumes its sessions when it comes back. Disabled
              // rather than silently inert in demo mode, where there is only the one team.
              disabled={onSelectTeam === undefined}
              onClick={() => onSelectTeam?.(row.id)}
              title={`Switch to ${row.name}`}
            >
              <Twisty open={false} members={row.members.length} />
              {/* No silhouette for a team with nobody on it any more: the mark is about the
                  project rather than the roster, and a team with no members is still a folder. */}
              <TeamMark {...(row.icon === undefined ? {} : { icon: row.icon })} size={MARK} />
              <b className="nm">{row.name}</b>
              <span style={{ flex: 1 }} />
              {/* The right of the line says one thing at a time, and status outranks recency:
                  a team that is working is not also usefully described by when it last did.

                  Silent while it is quiet, exactly as the team on screen is. `idle` is the
                  resting state of a column of teams, and printing it on every row would be the
                  same word repeated as many times as the user has teams. It speaks the moment
                  one member is working, and `waiting` still inverts, which is the point of
                  keeping a word: a backgrounded team blocked on a permission has no other way
                  to reach the user.

                  The member count that used to sit here went with the second line and is not
                  missed: it is the number of rows the team opens into, which is a worse way of
                  saying what those rows say. */}
              {busy ? (
                <StatusWord status={rowStatus.status} label={rowStatus.label} />
              ) : (
                row.lastActiveAt !== undefined && (
                  // Issue 11's mark, folded onto the team row the way `StatusWord` folds, so a
                  // team the user is not on can carry it: a signal only visible once you are
                  // already on the team answers nothing. **Weight, never an inversion** —
                  // `waiting` owns the app's one inversion and this must lose to it, which
                  // weight against quiet does, legibly, with both in the column at once.
                  <span
                    className={`when${row.members.some((member) => unread.includes(member.id)) ? ' unread' : ''}`}
                  >
                    {lastActive(row.lastActiveAt)}
                  </span>
                )
              )}
            </button>
            </TeamRow>
          );
        }

        return (
          <div key={row.id} className="teamgroup open" ref={group}>
            <TeamRow row={row} onEditTeam={onEditTeam} onDeleteTeam={onDeleteTeam}>
            <button
              className={`teamrow${pane.kind === 'team' ? ' sel' : ''}`}
              onClick={() => onSelect({ kind: 'team' })}
            >
              <Twisty open members={agents.length} />
              <TeamMark {...(row.icon === undefined ? {} : { icon: row.icon })} size={MARK} />
              <b className="nm">{row.name}</b>
              <span style={{ flex: 1 }} />
              {/* Who leads used to be said here, as `led by Alice` on a second line. The line is
                  gone and the fact moved onto the lead's own row, which it can do now: a roster
                  visibly nested under its team is scoped by the section it sits in, so `LEAD`
                  there is not the claim about the *agent* that `DESIGN.md` refused. The same
                  agent still leads one team and not another, and still says so on one row and
                  not the other.

                  The folded status stays, silent while every member is idle, for the same
                  reason the rows below are: a team that says ALL IDLE over four rows saying
                  IDLE is four words of nothing. */}
              {teamStatus.status !== 'idle' && (
                <StatusWord status={teamStatus.status} label={teamStatus.label} />
              )}
            </button>
            </TeamRow>

            {/* The roster, in a box of its own because opening a team has to *make room* for it
                rather than shove the column down between two frames. The box's height is what
                animates, and the rows fade in, which is what covers the overlap while the teams
                below slide away. */}
            <div className="roster">
            {agents.map((agent) => {
              const status = statuses[agent.id] ?? 'idle';
              const last = lastLineOf(items, agent.id);
              const selected = pane.kind === 'agent' && pane.agentId === agent.id;
              return (
                <button
                  key={agent.id}
                  className={`agentrow${selected ? ' sel' : ''}`}
                  onClick={() => onSelect({ kind: 'agent', agentId: agent.id })}
                >
                  {/* The one surface wearing status on the face as well as on the body. A row
                      is about one agent, so "this agent is thinking" is a true sentence here;
                      the team mark above it stays unposed, because the mark folds its members'
                      statuses and a pose is per face, so posing it would draw four faces each
                      asserting what the fold only ever claimed of somebody. */}
                  {/* `SEEN` rather than the floor, because the rail is the column a person
                      looks at all day and the whole point of the layer is that the faces look
                      back. What actually moves here is `waiting` alone — `aimOf` gives that one
                      status the pointer and every other one nothing — so this is the excursion
                      of a blocked agent following you until you answer, not of a roster
                      swivelling in unison. */}
                  <Blob
                    name={agent.name}
										size={44}
                    status={status}
                    hue={agent.hue}
                    animated
                    travel={SEEN}
                  />
                  <span className="who">
                    <span className="nm">
                      <b>{agent.name}</b>
                      {/* Who leads, on the row it leads. It was `led by Alice` under the team's
                          name until the team's row became one line, and `DESIGN.md`'s reason for
                          putting it there was that leading is a fact about the *team* and not
                          about the agent — the same agent leads one team and not another, so it
                          cannot live on an agent's definition either.

                          That reason survives the move, because the roster is visibly nested
                          under its team now: a row inside this section is already scoped to this
                          team, so the word is read as "leads *here*" rather than as a rank the
                          agent carries around. It is still named rather than drawn, and it is a
                          mono label like every other one on these rows. */}
                      {agent.id === team.leadAgentId && <span className="mono lead">LEAD</span>}
                      <span className="grow" />
                      {/* When it last spoke, where a chat app puts it. Absent, rather than
                          zero, for an agent that has not said anything yet. */}
                      {last !== undefined && (
                        <span className="when">{lastActive(last.at)}</span>
                      )}
                    </span>
                    <span className="sub">
                      {/* The last thing it said, and the role only until it has said
                          something. The role cannot simply go: blobot's names are the user's
                          own ("Alice"), not job titles like Grok's "Inbox Manager", so on a
                          fresh team nothing else on the row says what this agent is for. */}
                      {last === undefined ? (
                        <span className="role">{agent.role}</span>
                      ) : (
                        // Full ink when the last thing this agent said came from a Routine run
                        // the user has not looked at. The row already holds the content; what
                        // was missing is only that nobody had seen it. Not a dot and not a
                        // count: a dot is a new element in a column whose job is quiet, and two
                        // unread reports and five are the same decision.
                        <span className={`preview${unread.includes(agent.id) ? ' unread' : ''}`}>
                          {last.text}
                        </span>
                      )}
                      <span style={{ flex: 1 }} />
                      {/* Idle is the resting state of every row on a quiet team, so spelling it
                          out four times says nothing. The word appears when there is something
                          to say — and `waiting` still inverts, which is the whole point of
                          keeping a word rather than a dot. */}
                      {status !== 'idle' && <StatusWord status={status} />}
                    </span>
                  </span>
                </button>
              );
            })}
            </div>
          </div>
        );
      })}
      </div>

      {/* The doors that are not the list, at the foot of the column, where a sidebar puts the
          places it is not about.

          They stood above TEAMS until this, on the grounds that it is the order the model reads
          in: agents exist, and teams are formed out of them. That is true of the model and was
          wrong on screen. Two headed rows over the list pushed the teams down and read as a
          second list stacked on the first — the exact failure the team row was shortened to
          avoid — and the order an app is built out of is not the order its column is read in.
          This column is about teams, so the teams start at the top of it.

          **Not headings, so not mono.** A heading names what is under it and there is nothing
          under these. They are rows you press, drawn like `Search` at the other end of the
          column, which is the only other thing here that is a door rather than a list item.

          Each is named for what is behind it. *Settings* is a third door and not a lid over the
          other two: an agent is the roster and a Routine is standing work that can put an
          unread mark on a row in this very column, and neither is a preference. What is behind
          *Settings* is the machine — which runtimes are on it and whether they are ready — and
          that had no place of its own before, reachable only from inside the hire dialog. */}
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
 * One row at the foot of the rail. A chevron on the right because it leads somewhere, which is
 * the one thing these have in common with the team rows above and the reason they can sit in
 * the same column without being mistaken for them: the team rows carry a mark and a status, and
 * these carry a glyph and a word.
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
  return navigator.userAgent.includes('Mac OS X') ? '\u2318K' : 'CTRL K';
}

/**
 * One team row, and the two things you can do to it.
 *
 * The actions appear on hover and on keyboard focus rather than sitting there permanently: the
 * rail is a list of teams to *work in*, and a delete button on every row at rest would be the
 * loudest thing in a column whose job is to be quiet. They are icons because a label here would
 * repeat the row it is on, which is the rule the composer's send button already follows.
 *
 * A row is a button, so these cannot live inside it: nesting them would make one unclickable
 * control out of three.
 */
function TeamRow({
  row,
  onEditTeam,
  onDeleteTeam,
  children,
}: {
  row: UiTeamSummary;
  onEditTeam: ((teamId: string) => void) | undefined;
  onDeleteTeam: ((teamId: string) => void) | undefined;
  children: React.ReactNode;
}): React.JSX.Element {
  if (onEditTeam === undefined && onDeleteTeam === undefined) return <>{children}</>;
  return (
    <div className="teamrowwrap">
      {children}
      <span className="rowacts">
        {onEditTeam !== undefined && (
          <button
            className="iconbtn sm"
            onClick={() => onEditTeam(row.id)}
            title={`Who is on ${row.name}`}
            aria-label={`Who is on ${row.name}`}
          >
            <Pencil size={13} aria-hidden />
          </button>
        )}
        {onDeleteTeam !== undefined && (
          <button
            className="iconbtn sm"
            onClick={() => onDeleteTeam(row.id)}
            title={`Delete ${row.name}`}
            aria-label={`Delete ${row.name}`}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The chevron in the gutter of a team row.
 *
 * A team row already *was* a disclosure — its roster slides out underneath when the team is
 * opened — and nothing on screen said so. The rail's other section, YOUR AGENTS, has worn a
 * chevron since it was written, so the column already had the glyph and used it on the one row
 * that is not a team.
 *
 * **It is an indicator and not a control**, which is why it is not a button and why the row
 * around it stays one click target. Exactly one team is open, because the open team is the one
 * whose sessions are on screen; there is no "open but collapsed", and a twisty the user could
 * press to collapse the team they are reading would have to invent that state.
 *
 * A team with nobody on it keeps the gutter and loses the glyph. The slot is what puts every
 * team mark on one left edge; the glyph is a promise of rows underneath, and an empty team has
 * none to show.
 */
function Twisty({ open, members }: { open: boolean; members: number }): React.JSX.Element {
  return (
    <span className={`twisty${open ? ' on' : ''}`} aria-hidden="true">
      {members > 0 && <ChevronRight size={12} />}
    </span>
  );
}
