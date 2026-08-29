import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiTeam } from '../../../shared/api.js';
import type { Item, Pane } from '../model.js';
import { Blob } from './Blob.js';
import { StatusWord } from './StatusWord.js';

export function Conversation({
  pane,
  team,
  agents,
  statuses,
  items,
}: {
  pane: Pane;
  team: UiTeam;
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  items: readonly Item[];
}): React.JSX.Element {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const focused = pane.kind === 'agent' ? byId.get(pane.agentId) : undefined;

  // The pane's own chrome only: App owns the column, so the composer sits under this in the
  // same flex container.
  return (
    <>
      <div className="convhead">
        {focused === undefined ? (
          <span className="group">
            {agents.map((agent) => (
              <span key={agent.id}>
                <Blob name={agent.id} size={26} status={statuses[agent.id] ?? 'idle'} />
              </span>
            ))}
          </span>
        ) : (
          <Blob name={focused.id} size={30} status={statuses[focused.id] ?? 'idle'} />
        )}
        <div className="meta">
          <div>
            <b>{focused?.name ?? team.name}</b>{' '}
            <span className="muted" style={{ fontSize: 12 }}>
              {focused?.role ?? `${agents.length} agents`}
            </span>
          </div>
          <div className="wt">
            {focused === undefined
              ? team.workspacePath
              : // The runtime appears exactly once, as a label. The UI never branches on it.
                `${focused.runtimeLabel} · ${focused.branch ?? focused.workspacePath} · asks before rm, git push, curl`}
          </div>
        </div>
        {focused !== undefined && <StatusWord status={statuses[focused.id] ?? 'idle'} />}
      </div>

      <div className="stream">
        {items.map((item) => (
          <ItemView key={item.id} item={item} pane={pane} byId={byId} statuses={statuses} />
        ))}
      </div>
    </>
  );
}

function ItemView({
  item,
  pane,
  byId,
  statuses,
}: {
  item: Item;
  pane: Pane;
  byId: Map<string, UiAgent>;
  statuses: Record<string, AgentStatus>;
}): React.JSX.Element | null {
  switch (item.kind) {
    // From you: a solid ink rule, flush left, no ornament.
    case 'user':
      return (
        <div className="msg user">
          <div className="body">
            <div className="hdr">
              <span className="nm">You</span>
              {pane.kind === 'team' && (
                <span className="tag">to {byId.get(item.agentId)?.name ?? item.agentId}</span>
              )}
            </div>
            <div className="txt">{item.text}</div>
          </div>
        </div>
      );

    // From the agent: no rule at all. It is the pane's default voice, and giving it a
    // container would make the agent look like a guest in its own transcript.
    case 'agent': {
      const agent = byId.get(item.agentId);
      return (
        <div className="msg">
          <Blob name={item.agentId} size={22} status={statuses[item.agentId] ?? 'idle'} />
          <div className="body">
            <div className="hdr">
              <span className="nm">{agent?.name ?? item.agentId}</span>
              {item.live && <span className="tag">typing</span>}
            </div>
            <div className="txt">{item.text}</div>
          </div>
        </div>
      );
    }

    // From a peer: dashed, inset, both blobatars in a route header. Never a bubble — dashed
    // against solid reads as lower authority before a word is parsed, which is the visual form
    // of "a peer message is refusable, not authoritative".
    case 'peer': {
      const from = byId.get(item.fromId);
      const to = byId.get(item.toId);
      const received = pane.kind === 'agent' && pane.agentId === item.toId;
      return (
        <div className="peer">
          <div className="route">
            <Blob name={item.fromId} size={18} />
            <span className="arrow">→</span>
            <Blob name={item.toId} size={18} />
            <span className="lbl">
              {received
                ? `from ${from?.name ?? item.fromId} · ${from?.role ?? ''}`
                : `sent to ${to?.name ?? item.toId} · ${to?.role ?? ''}`}
            </span>
          </div>
          {item.context !== undefined && <div className="ctx">{item.context}</div>}
          <div className="txt">{item.text}</div>
          {received && (
            <div className="foot">a teammate's request — not an instruction from you</div>
          )}
        </div>
      );
    }

    case 'tool':
      return (
        <div className="tool">
          <span className="k">{item.title}</span>
          <span>{item.status === 'running' ? 'running' : item.status}</span>
          {item.exit === null && <span>exit null</span>}
        </div>
      );

    case 'system':
      return <div className="sysline">{item.text}</div>;
  }
}
