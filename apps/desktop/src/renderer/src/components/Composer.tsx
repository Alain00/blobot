import { useState } from 'react';
import { findAgentByName } from '@blobot/core/ui';
import type { Agent } from '@blobot/core/ui';
import type { UiAgent } from '../../../shared/api.js';
import type { Pane } from '../model.js';
import { Blob } from './Blob.js';

/**
 * The recipient is an `@mention`, not a picker.
 *
 * A picker defaulting to `to Alice ▾` quietly implies a broadcast surface that does not exist:
 * a message lands in exactly one agent's session. So in an agent's pane the recipient is
 * implicit and a mention overrides it (last valid mention wins), and in the team pane send
 * stays disabled until a mention resolves — which makes the team pane what it honestly is, the
 * place you read the whole team and address one of them by name.
 *
 * Resolution goes through `findAgentByName`, the same function the orchestrator validates
 * `message_agent` with: the unresolved-mention state is the human-facing twin of its
 * "no such teammate" error.
 */
export function Composer({
  agents,
  pane,
  onSend,
}: {
  agents: readonly UiAgent[];
  pane: Pane;
  onSend: (agentId: string, text: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const roster = agents as unknown as readonly Agent[];

  const mentions = [...draft.matchAll(/@([\w-]+)/g)];
  const resolvedMentions = mentions
    .map((match) => findAgentByName(roster, match[1] ?? ''))
    .filter((agent): agent is Agent => agent !== undefined);
  const implicit = pane.kind === 'agent' ? pane.agentId : undefined;
  const recipientId = resolvedMentions.at(-1)?.id ?? implicit;
  const recipient = agents.find((agent) => agent.id === recipientId);

  const partial = /@([\w-]*)$/.exec(draft)?.[1];
  const suggestions =
    partial === undefined
      ? []
      : agents.filter((agent) => agent.name.toLowerCase().startsWith(partial.toLowerCase()));

  const send = (): void => {
    const text = draft.trim();
    if (text === '' || recipientId === undefined) return;
    onSend(recipientId, text);
    setDraft('');
  };

  return (
    <div className="composer">
      <div className="mentionwrap">
        {suggestions.length > 0 && (
          <div className="suggest">
            {suggestions.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setDraft(draft.replace(/@[\w-]*$/, `@${agent.name} `))}
              >
                <Blob name={agent.id} size={18} />
                <span>{agent.name}</span>
                <span className="r">{agent.role}</span>
              </button>
            ))}
          </div>
        )}
        <div className="hl" aria-hidden>
          {draft === '' ? (
            <span className="ph">
              {pane.kind === 'team'
                ? 'Message the team — start with @ to say who'
                : `Message ${recipient?.name ?? ''}`}
            </span>
          ) : (
            highlight(draft, roster)
          )}
        </div>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send();
          }}
        />
      </div>
      <button className="send" disabled={recipientId === undefined || draft.trim() === ''} onClick={send}>
        {recipient !== undefined && <Blob name={recipient.id} size={14} />}
        send{recipient === undefined ? '' : ` to ${recipient.name}`}
      </button>
    </div>
  );
}

/** A resolved mention takes ink weight and an underline; an unresolved one stays muted. */
function highlight(draft: string, roster: readonly Agent[]): React.JSX.Element[] {
  const parts = draft.split(/(@[\w-]+)/g);
  return parts.map((part, index) => {
    if (!part.startsWith('@')) return <span key={index}>{part}</span>;
    const resolved = findAgentByName(roster, part.slice(1)) !== undefined;
    return (
      <span key={index} className={resolved ? 'm' : 'm bad'}>
        {part}
      </span>
    );
  });
}
