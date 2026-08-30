import { Pencil, Trash2 } from 'lucide-react';
import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { foldTeamStatus, lastLineOf, type Item, type Pane } from '../model.js';
import { lastActive } from '../time.js';
import { Blob } from './Blob.js';
import { TeamMark } from './TeamMark.js';
import { StatusWord } from './StatusWord.js';

/**
 * Every team the user has is a row here, not just the running one. The rail used to show the
 * active team alone, with the others as a list at the foot that only appeared once a second
 * team existed — so "how do I switch teams?" had no answer on screen. The set is the rail.
 *
 * The active team is drawn as a group of blobatars and carries its agents underneath it,
 * indented; the rest are names and counts. Only the running team has statuses, sessions or
 * blobatars to draw, because only one orchestrator runs at a time.
 */
export function Rail({
  team,
  teams,
  agents,
  statuses,
  items,
  pane,
  onSelect,
  onSelectTeam,
  onNewTeam,
  onEditTeam,
  onDeleteTeam,
}: {
  team: UiTeam;
  teams: readonly UiTeamSummary[];
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  items: readonly Item[];
  pane: Pane;
  onSelect: (pane: Pane) => void;
  /** Absent in demo mode, where there is exactly one team and it is scripted. */
  onSelectTeam?: (teamId: string) => void;
  onNewTeam?: () => void;
  onEditTeam?: (teamId: string) => void;
  onDeleteTeam?: (teamId: string) => void;
}): React.JSX.Element {
  const teamStatus = foldTeamStatus(agents.map((agent) => statuses[agent.id] ?? 'idle'));
  // The running team may not be in the summary list at all — demo mode has no row for it —
  // so it is drawn from `team` and the list only supplies the others.
  const open = teams.find((row) => row.id === team.id);
  const rows: readonly UiTeamSummary[] = [
    {
      id: team.id,
      name: team.name,
      workspacePath: team.workspacePath,
      // The running team is drawn from `team`, which is the conversation's view of it and
      // carries no kind. The summary row has one, and demo mode has no row at all.
      workspaceKind: open?.workspaceKind ?? 'git',
      agentCount: agents.length,
    },
    ...teams.filter((other) => other.id !== team.id),
  ];

  return (
    <div className="rail">
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
          return (
            <TeamRow key={row.id} row={row} onEditTeam={onEditTeam} onDeleteTeam={onDeleteTeam}>
            <button
              className="teamrow off"
              // Switching no longer stops anything: `TeamPool` keeps the last few teams live,
              // and a team that was evicted resumes its sessions when it comes back. Disabled
              // rather than silently inert in demo mode, where there is only the one team.
              disabled={onSelectTeam === undefined}
              onClick={() => onSelectTeam?.(row.id)}
              title={`Switch to ${row.name}`}
            >
              <span className="ghost" aria-hidden="true" />
              <span className="who">
                <span className="nm">
                  <b>{row.name}</b>
                </span>
                <span className="sub">
                  {/* `stopped` says it is not running; it does not say which of two stopped
                      teams you were last in. That is what a human picks between. */}
                  <span className="n">
                    {row.agentCount} agents
                    {row.lastActiveAt === undefined ? '' : ` · ${lastActive(row.lastActiveAt)}`}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span className="stat">stopped</span>
                </span>
              </span>
            </button>
            </TeamRow>
          );
        }

        return (
          <div key={row.id} className="teamgroup">
            <TeamRow row={row} onEditTeam={onEditTeam} onDeleteTeam={onDeleteTeam}>
            <button
              className={`teamrow${pane.kind === 'team' ? ' sel' : ''}`}
              onClick={() => onSelect({ kind: 'team' })}
            >
              <TeamMark agents={agents} status={teamStatus.status} size={46} />
              <span className="who">
                <span className="nm">
                  <b>{row.name}</b>
                </span>
                {/* No count on the running team: its members are enumerated directly beneath
                    it, and the folded status is the thing that needs the width. */}
                {/* Silent while every member is idle, for the same reason the rows are: a
                    team that says ALL IDLE over four rows saying IDLE is four words of
                    nothing. It speaks the moment one member is not. */}
                {teamStatus.status !== 'idle' && (
                  <span className="sub">
                    <span style={{ flex: 1 }} />
                    <StatusWord status={teamStatus.status} label={teamStatus.label} />
                  </span>
                )}
              </span>
            </button>
            </TeamRow>

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
                  <Blob name={agent.id} size={34} status={status} hue={agent.hue} />
                  <span className="who">
                    <span className="nm">
                      <b>{agent.name}</b>
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
                        <span className="preview">{last.text}</span>
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
        );
      })}
    </div>
  );
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
