import type { StopReason, ToolCallStatus, ToolKind } from '../../events.js';
import type { InjectableEvent } from '../../mock/mock-agent-runtime.js';
import type { AvailableCommand } from '../../runtime.js';
import type { ContentBlock, SessionUpdate, ToolContent } from './wire.js';

/**
 * An ACP `session/update` in blobot's vocabulary.
 *
 * Shared by both adapters, because this is the *protocol's* shape rather than a provider's:
 * the Claude bridge emits eleven `sessionUpdate` kinds, OpenCode emits six, and OpenCode's
 * six are a strict subset. What differs between the two providers is what they put *inside*
 * these fields, and that is handled by the runtime that owns the connection.
 *
 * Blobot's vocabulary has room for five kinds. The rest are dropped here rather than
 * downstream, because an event only one provider can emit is the leak the vocabulary exists
 * to prevent (ticket 04):
 *
 * - `plan` (Claude's `TodoWrite`) and `current_mode_update`, `session_info_update`,
 *   `config_option_update` — provider-only state with no counterpart on the other side.
 * - `available_commands_update` — a slash-command menu, several KB on every turn. It is
 *   *captured* by the runtime rather than discarded (see `commandsFrom`), but it stays out of
 *   the vocabulary: an event would carry it through the recorder into SQLite.
 * - `user_message_chunk` — only ever replayed history, and our store is the transcript of
 *   record.
 *
 * Returns zero or more events, unstamped: identity and time belong to the runtime.
 */
export function translateSessionUpdate(update: SessionUpdate): InjectableEvent[] {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      return chunk(update, 'agent_message_delta');
    case 'agent_thought_chunk':
      return chunk(update, 'agent_thought_delta');
    case 'tool_call':
      return toolCallStarted(update);
    case 'tool_call_update':
      return toolCallUpdated(update);
    case 'usage_update':
      return usage(update);
    default:
      return [];
  }
}

/**
 * The command menu off an `available_commands_update`, in blobot's shape.
 *
 * Returns `undefined` for any other update, which is what distinguishes "this notification
 * says nothing about commands" from "this session advertises none" — an empty list is a real
 * answer and must be able to replace a full one.
 *
 * An entry with no name cannot be inserted into the composer, so it is dropped rather than
 * shown as a blank row.
 */
export function commandsFrom(update: SessionUpdate): AvailableCommand[] | undefined {
  if (update.sessionUpdate !== 'available_commands_update') return undefined;
  return (update.availableCommands ?? []).flatMap((command) => {
    const name = command.name;
    if (name === undefined || name === '') return [];
    const hint = command.input?.hint;
    return [
      {
        name,
        description: command.description ?? '',
        ...(hint === undefined || hint === '' ? {} : { hint }),
      },
    ];
  });
}

function chunk(
  update: SessionUpdate,
  type: 'agent_message_delta' | 'agent_thought_delta',
): InjectableEvent[] {
  const text = textOf(update.content);
  if (text.length === 0) return [];
  // Both chunk kinds share one `messageId`, which is why the assembler keys the answer buffer
  // on event type rather than on message identity.
  return [{ type, messageId: update.messageId ?? 'msg_unknown', text }];
}

function toolCallStarted(update: SessionUpdate): InjectableEvent[] {
  const toolCallId = update.toolCallId;
  if (toolCallId === undefined) return [];
  return [
    {
      type: 'tool_call_started',
      toolCallId,
      title: update.title ?? 'tool',
      kind: toolKind(update.kind),
      ...(update.rawInput === undefined ? {} : { rawInput: update.rawInput }),
    },
  ];
}

function toolCallUpdated(update: SessionUpdate): InjectableEvent[] {
  const toolCallId = update.toolCallId;
  if (toolCallId === undefined) return [];
  const status = toolStatus(update.status);
  const output = toolOutput(update);
  return [
    {
      type: 'tool_call_updated',
      toolCallId,
      status,
      ...(update.title === undefined ? {} : { title: update.title }),
      ...(update.kind === undefined ? {} : { kind: toolKind(update.kind) }),
      ...(update.rawInput === undefined ? {} : { rawInput: update.rawInput }),
      ...(output === undefined ? {} : { output }),
      // A tool failure is not an `error`: the model sees it and the turn continues.
      ...(status === 'failed' ? { error: output ?? 'the tool failed' } : {}),
    },
  ];
}

function usage(update: SessionUpdate): InjectableEvent[] {
  if (update.used === undefined || update.size === undefined) return [];
  return [
    {
      type: 'usage_updated',
      used: update.used,
      size: update.size,
      ...(update.cost?.amount === undefined ? {} : { costUsd: update.cost.amount }),
    },
  ];
}

/**
 * ACP names ten tool kinds; blobot's vocabulary has four, chosen because they are what both
 * runtimes can produce faithfully. Everything that reads collapses to `read`, everything that
 * changes a file to `edit`, and every MCP tool to `other` — which is why a client-supplied
 * tool is told apart by its name prefix rather than by its kind.
 */
export function toolKind(kind: string | undefined): ToolKind {
  switch (kind) {
    case 'read':
    case 'search':
    case 'fetch':
      return 'read';
    case 'edit':
    case 'delete':
    case 'move':
      return 'edit';
    case 'execute':
      return 'execute';
    default:
      return 'other';
  }
}

function toolStatus(status: string | undefined): ToolCallStatus {
  switch (status) {
    case 'pending':
    case 'in_progress':
    case 'completed':
    case 'failed':
      return status;
    default:
      // An update that carries only refined arguments has no status. It is still in flight.
      return 'in_progress';
  }
}

/**
 * The `session/prompt` reply's `stopReason`. `end_turn` and `cancelled` are shared with
 * OpenCode; the other three are Claude's, and they still have to reach the UI — a refusal
 * that renders as a silent stop is a bug report waiting to happen.
 */
export function stopReasonOf(raw: string | undefined): StopReason {
  switch (raw) {
    case 'end_turn':
    case 'cancelled':
    case 'max_tokens':
    case 'max_turn_requests':
    case 'refusal':
      return raw;
    default:
      return 'end_turn';
  }
}

function toolOutput(update: SessionUpdate): string | undefined {
  const fromContent = textOfToolContent(update.content);
  if (fromContent !== undefined) return fromContent;
  const raw = update.rawOutput;
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') return raw;
  const fromRaw = textOfToolContent(raw as readonly ToolContent[]);
  return fromRaw ?? JSON.stringify(raw);
}

function textOfToolContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const entry of content as readonly (ToolContent & ContentBlock)[]) {
    // `{type:'content', content:{type:'text'}}` is the ACP shape; a bare text block turns up
    // in `rawOutput`. A `terminal` block carries no text — we never advertised
    // `terminal_output`, so bash output arrives as content, not as a terminal handle.
    const text = entry.content?.type === 'text' ? entry.content.text : entry.text;
    if (typeof text === 'string' && text.length > 0) parts.push(text);
  }
  return parts.length === 0 ? undefined : parts.join('');
}

function textOf(content: unknown): string {
  if (content === undefined || content === null) return '';
  if (Array.isArray(content)) return textOfToolContent(content) ?? '';
  const block = content as ContentBlock;
  return block.type === 'text' && typeof block.text === 'string' ? block.text : '';
}
