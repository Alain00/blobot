import { describe, expect, it } from 'vitest';
import { stopReasonOf, toolKind, translateSessionUpdate } from './translate.js';

describe('translating the bridge into the vocabulary', () => {
  it('turns message chunks into deltas, keeping the messageId', () => {
    expect(
      translateSessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        messageId: 'msg_011CeX',
        content: { type: 'text', text: 'ONG' },
      }),
    ).toEqual([{ type: 'agent_message_delta', messageId: 'msg_011CeX', text: 'ONG' }]);
  });

  it('keeps thinking on its own event type, sharing the answer messageId', () => {
    const messageId = 'msg_shared';
    const thought = translateSessionUpdate({
      sessionUpdate: 'agent_thought_chunk',
      messageId,
      content: { type: 'text', text: 'The user is asking' },
    });
    const answer = translateSessionUpdate({
      sessionUpdate: 'agent_message_chunk',
      messageId,
      content: { type: 'text', text: 'Hello' },
    });
    expect(thought[0]?.type).toBe('agent_thought_delta');
    expect(answer[0]?.type).toBe('agent_message_delta');
  });

  it('drops the four Claude-only update kinds and the command menu', () => {
    for (const sessionUpdate of [
      'plan',
      'current_mode_update',
      'session_info_update',
      'config_option_update',
      'available_commands_update',
      'user_message_chunk',
    ]) {
      expect(translateSessionUpdate({ sessionUpdate })).toEqual([]);
    }
  });

  it('opens a tool call with its stable id, title and normalized kind', () => {
    expect(
      translateSessionUpdate({
        sessionUpdate: 'tool_call',
        toolCallId: 'toolu_0188Mj',
        status: 'pending',
        title: 'mcp__blobot__message_agent',
        kind: 'other',
        rawInput: {},
      }),
    ).toEqual([
      {
        type: 'tool_call_started',
        toolCallId: 'toolu_0188Mj',
        title: 'mcp__blobot__message_agent',
        kind: 'other',
        rawInput: {},
      },
    ]);
  });

  it('reads an argument refinement with no status as still in flight', () => {
    const [event] = translateSessionUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'toolu_0188Mj',
      rawInput: { to: 'Bob' },
    });
    expect(event).toEqual({
      type: 'tool_call_updated',
      toolCallId: 'toolu_0188Mj',
      status: 'in_progress',
      rawInput: { to: 'Bob' },
    });
  });

  it('unwraps tool output from ACP content blocks', () => {
    const [event] = translateSessionUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'toolu_0188Mj',
      status: 'completed',
      content: [{ type: 'content', content: { type: 'text', text: 'delivered to Bob' } }],
    });
    expect(event).toMatchObject({ status: 'completed', output: 'delivered to Bob' });
  });

  it('carries a tool failure as a failure, not as an error event', () => {
    const events = translateSessionUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'toolu_x',
      status: 'failed',
      content: [{ type: 'content', content: { type: 'text', text: 'No such file' } }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'tool_call_updated',
      status: 'failed',
      error: 'No such file',
    });
  });

  it('normalizes ten ACP tool kinds onto blobot four', () => {
    expect(['read', 'search', 'fetch'].map(toolKind)).toEqual(['read', 'read', 'read']);
    expect(['edit', 'delete', 'move'].map(toolKind)).toEqual(['edit', 'edit', 'edit']);
    expect(toolKind('execute')).toBe('execute');
    expect([toolKind('think'), toolKind('switch_mode'), toolKind(undefined)]).toEqual([
      'other',
      'other',
      'other',
    ]);
  });

  it('reads the context gauge and the running cost', () => {
    expect(
      translateSessionUpdate({
        sessionUpdate: 'usage_update',
        used: 36785,
        size: 1_000_000,
        cost: { amount: 0.232279, currency: 'USD' },
      }),
    ).toEqual([{ type: 'usage_updated', used: 36785, size: 1_000_000, costUsd: 0.232279 }]);
  });

  it('keeps every stop reason the bridge can send, including the Claude-only three', () => {
    expect(
      ['end_turn', 'cancelled', 'max_tokens', 'max_turn_requests', 'refusal'].map(stopReasonOf),
    ).toEqual(['end_turn', 'cancelled', 'max_tokens', 'max_turn_requests', 'refusal']);
  });
});
