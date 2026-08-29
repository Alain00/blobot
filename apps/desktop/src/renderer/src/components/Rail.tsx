import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import type { Pane } from '../model.js';
import { Blob } from './Blob.js';
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
  pane,
  onSelect,
  onSelectTeam,
  onNewTeam,
}: {
  team: UiTeam;
  teams: readonly UiTeamSummary[];
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  pane: Pane;
  onSelect: (pane: Pane) => void;
  /** Absent in demo mode, where there is exactly one team and it is scripted. */
  onSelectTeam?: (teamId: string) => void;
  onNewTeam?: () => void;
}): React.JSX.Element {
  const teamStatus = foldTeamStatus(agents.map((agent) => statuses[agent.id] ?? 'idle'));
  // The running team may not be in the summary list at all — demo mode has no row for it —
  // so it is drawn from `team` and the list only supplies the others.
  const rows: readonly UiTeamSummary[] = [
    { id: team.id, name: team.name, workspacePath: team.workspacePath, agentCount: agents.length },
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
            <button
              key={row.id}
              className="teamrow off"
              // Switching stops this team's agents where they stand and starts the other's:
              // one orchestrator at a time. Disabled rather than silently inert in demo mode.
              disabled={onSelectTeam === undefined}
              onClick={() => onSelectTeam?.(row.id)}
              title={`Switch to ${row.name} — stops ${team.name}'s agents`}
            >
              <span className="ghost" aria-hidden="true" />
              <span className="who">
                <span className="nm">
                  <b>{row.name}</b>
                </span>
                <span className="sub">
                  <span className="n">{row.agentCount} agents</span>
                  <span style={{ flex: 1 }} />
                  <span className="stat">stopped</span>
                </span>
              </span>
            </button>
          );
        }

        return (
          <div key={row.id} className="teamgroup">
            <button
              className={`teamrow${pane.kind === 'team' ? ' sel' : ''}`}
              onClick={() => onSelect({ kind: 'team' })}
            >
              <span className="group">
                {agents.map((agent) => (
                  <span key={agent.id}>
                    <Blob name={agent.id} size={28} status={statuses[agent.id] ?? 'idle'} />
                  </span>
                ))}
              </span>
              <span className="who">
                <span className="nm">
                  <b>{row.name}</b>
                </span>
                <span className="sub">
                  <span className="n">{row.agentCount} agents</span>
                  <span style={{ flex: 1 }} />
                  <StatusWord status={teamStatus.status} label={teamStatus.label} />
                </span>
              </span>
            </button>

            {agents.map((agent) => {
              const status = statuses[agent.id] ?? 'idle';
              const selected = pane.kind === 'agent' && pane.agentId === agent.id;
              return (
                <button
                  key={agent.id}
                  className={`agentrow${selected ? ' sel' : ''}`}
                  onClick={() => onSelect({ kind: 'agent', agentId: agent.id })}
                >
                  <Blob name={agent.id} size={34} status={status} />
                  <span className="who">
                    <span className="nm">
                      <b>{agent.name}</b>
                    </span>
                    <span className="sub">
                      <span className="role">{agent.role}</span>
                      <span style={{ flex: 1 }} />
                      <StatusWord status={status} />
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
 * A team has a status too, folded from its members with ticket 09's precedence — so the team
 * item shouts when any agent is blocked on the user, even with the rail out of attention.
 */
function foldTeamStatus(statuses: readonly AgentStatus[]): {
  status: AgentStatus;
  label: string;
} {
  const count = (wanted: AgentStatus): number =>
    statuses.filter((status) => status === wanted).length;
  const order: AgentStatus[] = ['waiting', 'failed', 'working', 'responding', 'thinking', 'starting'];
  for (const status of order) {
    const n = count(status);
    if (n > 0) return { status, label: `${n} ${status}` };
  }
  return { status: 'idle', label: 'all idle' };
}
