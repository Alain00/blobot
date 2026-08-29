import { describe, expect, it } from 'vitest';
import type { AgentEvent } from './events.js';
import { assembleMessages } from './message-assembler.js';

const identity = { agentId: 'alice', sessionId: 'session_alice' } as const;

function delta(messageId: string, text: string, at: number): AgentEvent {
  return { type: 'agent_message_delta', messageId, text, at, ...identity };
}

function thought(messageId: string, text: string, at: number): AgentEvent {
  return { type: 'agent_thought_delta', messageId, text, at, ...identity };
}

async function* stream(events: AgentEvent[]): AsyncIterable<AgentEvent> {
  for (const event of events) yield event;
}

async function collect(events: AgentEvent[]): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of assembleMessages(stream(events))) out.push(event);
  return out;
}

describe('assembleMessages', () => {
  it('emits both the deltas and the concatenation', async () => {
    const out = await collect([
      delta('m1', 'Hello there', 1),
      delta('m1', ',', 1),
      delta('m1', ' friend.', 1),
      { type: 'turn_ended', turnId: 'turn_1', stopReason: 'end_turn', at: 2, ...identity },
    ]);

    expect(out.map((event) => event.type)).toEqual([
      'agent_message_delta',
      'agent_message_delta',
      'agent_message_delta',
      'agent_message_completed',
      'turn_ended',
    ]);
    expect(out[3]).toMatchObject({ messageId: 'm1', text: 'Hello there, friend.' });
  });

  it('does not let a thought delta close the answer it shares a messageId with', async () => {
    const out = await collect([
      thought('m1', 'thinking…', 1),
      delta('m1', 'Half ', 2),
      thought('m1', 'more thinking…', 3),
      delta('m1', 'an answer.', 4),
      { type: 'turn_ended', turnId: 'turn_1', stopReason: 'end_turn', at: 5, ...identity },
    ]);

    const completed = out.filter((event) => event.type === 'agent_message_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ text: 'Half an answer.' });
  });

  it('closes the open message when a tool call starts', async () => {
    const out = await collect([
      delta('m1', 'Let me look.', 1),
      {
        type: 'tool_call_started',
        toolCallId: 'call_1',
        title: 'read',
        kind: 'read',
        at: 2,
        ...identity,
      },
      delta('m2', 'Found it.', 3),
      { type: 'turn_ended', turnId: 'turn_1', stopReason: 'end_turn', at: 4, ...identity },
    ]);

    expect(out.map((event) => event.type)).toEqual([
      'agent_message_delta',
      'agent_message_completed',
      'tool_call_started',
      'agent_message_delta',
      'agent_message_completed',
      'turn_ended',
    ]);
  });

  it('keeps the half-sentence a dead turn left behind', async () => {
    const out = await collect([delta('m1', 'Pulling up the diff', 1)]);
    expect(out.at(-1)).toMatchObject({
      type: 'agent_message_completed',
      text: 'Pulling up the diff',
    });
  });
});
