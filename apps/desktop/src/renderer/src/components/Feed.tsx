import type { UiAgent } from '../../../shared/api.js';
import type { FeedEntry, Pane } from '../model.js';

/**
 * Docked right, always visible — a third column rather than a tab or a drawer, because the
 * demo's claim is that you can watch two agents work at once, and a feed you have to open is a
 * feed you never see while something is happening.
 *
 * For an agent: that agent's events on top, the team's below a rule. For the team: undivided.
 */
export function Feed({
  entries,
  agents,
  pane,
}: {
  entries: readonly FeedEntry[];
  agents: readonly UiAgent[];
  pane: Pane;
}): React.JSX.Element {
  const name = (agentId?: string): string =>
    agents.find((agent) => agent.id === agentId)?.name ?? 'team';
  const mine =
    pane.kind === 'agent' ? entries.filter((entry) => entry.agentId === pane.agentId) : entries;
  const rest = pane.kind === 'agent' ? entries.filter((entry) => entry.agentId !== pane.agentId) : [];

  return (
    <div className="feed">
      <div className="feedhead">
        <span className="mono muted">ACTIVITY</span>
      </div>
      {mine.map((entry) => (
        <FeedLine key={entry.id} entry={entry} who={name(entry.agentId)} />
      ))}
      {rest.length > 0 && <hr style={{ margin: '10px 0' }} />}
      {rest.map((entry) => (
        <FeedLine key={entry.id} entry={entry} who={name(entry.agentId)} />
      ))}
    </div>
  );
}

function FeedLine({ entry, who }: { entry: FeedEntry; who: string }): React.JSX.Element {
  const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`fev${entry.emphasis === true ? ' hi' : ''}`}>
      <span className="t">{time}</span>
      <span className="who">{who}</span>
      <span>{entry.text}</span>
    </div>
  );
}
