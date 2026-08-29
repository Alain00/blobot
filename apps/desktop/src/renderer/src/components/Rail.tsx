import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiTeam } from '../../../shared/api.js';
import type { Pane } from '../model.js';
import { Blob } from './Blob.js';
import { StatusWord } from './StatusWord.js';

/**
 * The team is an item in the rail, drawn as a group — not a second surface. Selecting it
 * renders into the same pane the agents do.
 */
export function Rail({
  team,
  agents,
  statuses,
  pane,
  onSelect,
}: {
  team: UiTeam;
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  pane: Pane;
  onSelect: (pane: Pane) => void;
}): React.JSX.Element {
  const teamStatus = foldTeamStatus(agents.map((agent) => statuses[agent.id] ?? 'idle'));
  return (
    <div className="rail">
      <div className="railhead">
        <span className="mono muted">TEAM</span>
      </div>
      <button
        className={`teamrow${pane.kind === 'team' ? ' sel' : ''}`}
        onClick={() => onSelect({ kind: 'team' })}
      >
        <span className="group">
          {agents.map((agent) => (
            <span key={agent.id}>
              <Blob name={agent.id} size={24} status={statuses[agent.id] ?? 'idle'} />
            </span>
          ))}
        </span>
        <span className="who">
          <span className="nm">
            <b>{team.name}</b>
          </span>
          <span className="sub">
            <span className="n">{agents.length} agents</span>
            <span style={{ flex: 1 }} />
            <StatusWord status={teamStatus.status} label={teamStatus.label} />
          </span>
        </span>
      </button>

      <div className="raillabel">Agents</div>
      {agents.map((agent) => {
        const status = statuses[agent.id] ?? 'idle';
        const selected = pane.kind === 'agent' && pane.agentId === agent.id;
        return (
          <button
            key={agent.id}
            className={`agentrow${selected ? ' sel' : ''}`}
            onClick={() => onSelect({ kind: 'agent', agentId: agent.id })}
          >
            <Blob name={agent.id} size={26} status={status} />
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
