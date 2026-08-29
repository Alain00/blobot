import type { AgentEvent, AgentMessageCompleted } from './events.js';

/**
 * Core concatenates, and emits both.
 *
 * Raw-deltas-only would make persistence and the UI each reimplement concatenation and
 * drift; completed-only would throw away the streaming that makes the demo feel alive. So
 * this pass-through inserts an `agent_message_completed` whenever a `messageId` closes,
 * at the cost of one buffer.
 *
 * It lives in core, not in an adapter: every runtime, mock or real, gets the same
 * concatenation and the same close rule.
 */
export async function* assembleMessages(
  source: AsyncIterable<AgentEvent>,
): AsyncIterable<AgentEvent> {
  const assembler = new MessageAssembler();
  for await (const event of source) {
    for (const out of assembler.push(event)) yield out;
  }
  const trailing = assembler.flush();
  if (trailing !== undefined) yield trailing;
}

interface OpenMessage {
  readonly messageId: string;
  readonly agentId: string;
  readonly sessionId: string;
  text: string;
  at: number;
}

/** The synchronous core of {@link assembleMessages}, so a fold over an array can use it too. */
export class MessageAssembler {
  #open: OpenMessage | undefined;

  push(event: AgentEvent): AgentEvent[] {
    if (event.type === 'agent_message_delta') {
      if (this.#open !== undefined && this.#open.messageId !== event.messageId) {
        const closed = this.#close(event.at);
        this.#openWith(event);
        return closed === undefined ? [event] : [closed, event];
      }
      if (this.#open === undefined) this.#openWith(event);
      else {
        this.#open.text += event.text;
        this.#open.at = event.at;
      }
      return [event];
    }

    // A thought delta never closes a message: both runtimes share one `messageId` between
    // thinking and answer, so closing here would truncate an answer that resumes.
    // `usage_updated` and `agent_message_sent` are likewise not boundaries.
    if (closesMessage(event)) {
      const closed = this.#close(event.at);
      return closed === undefined ? [event] : [closed, event];
    }
    return [event];
  }

  /** Close whatever is still open at end of stream — a turn that died mid-sentence. */
  flush(): AgentMessageCompleted | undefined {
    return this.#close(this.#open?.at ?? 0);
  }

  #openWith(event: AgentEvent & { messageId: string; text: string }): void {
    this.#open = {
      messageId: event.messageId,
      agentId: event.agentId,
      sessionId: event.sessionId,
      text: event.text,
      at: event.at,
    };
  }

  #close(at: number): AgentMessageCompleted | undefined {
    const open = this.#open;
    if (open === undefined) return undefined;
    this.#open = undefined;
    return {
      type: 'agent_message_completed',
      agentId: open.agentId,
      sessionId: open.sessionId,
      at,
      messageId: open.messageId,
      text: open.text,
    };
  }
}

function closesMessage(event: AgentEvent): boolean {
  return (
    event.type === 'tool_call_started' ||
    event.type === 'turn_ended' ||
    event.type === 'error'
  );
}
