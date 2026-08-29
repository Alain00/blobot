import { describe, expect, it } from 'vitest';
import type { AgentEvent, Message } from '@blobot/core/domain';
import { initialState, itemsFor, reduce, type AppState } from './model.js';

const identity = { agentId: 'alice', sessionId: 'session_alice' } as const;

function apply(events: (AgentEvent | Message)[]): AppState {
  return events.reduce<AppState>(
    (state, item) =>
      'type' in item
        ? reduce(state, { type: 'event', event: item })
        : reduce(state, { type: 'message', message: item }),
    initialState,
  );
}

const peerMessage: Message = {
  id: 'm1',
  teamId: 'team',
  fromAgentId: 'alice',
  toAgentId: 'bob',
  body: 'review this',
  context: 'on my branch',
  at: 10,
};

describe('a snapshot', () => {
  const snapshot = {
    team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 6 },
    teams: [],
    agents: [],
    statuses: {},
    messages: [peerMessage],
    answers: [{ id: 'a1', agentId: 'bob', text: 'on it', at: 20 }],
    turnsThisPrompt: 0,
    demoMode: false,
  };

  it('seeds the pane with the persisted transcript, so a restart is not an empty window', () => {
    const state = reduce(initialState, { type: 'snapshot', snapshot });
    // Both speakers, in time order: peer traffic without the replies is half a conversation.
    expect(state.items).toMatchObject([
      { kind: 'peer', fromId: 'alice', toId: 'bob' },
      { kind: 'agent', agentId: 'bob', text: 'on it', live: false },
    ]);
  });

  it('replaces what was on screen, because a team switch is a different transcript', () => {
    const before = apply([{ ...peerMessage, id: 'other', body: 'from the last team' }]);
    const after = reduce(before, {
      type: 'snapshot',
      snapshot: { ...snapshot, messages: [], answers: [] },
    });
    expect(after.items).toEqual([]);
    expect(after.feed).toEqual([]);
  });
});

describe('the conversation model', () => {
  it('grows one message from ragged deltas and settles on the completed text', () => {
    const state = apply([
      { type: 'agent_message_delta', messageId: 'm', text: 'Hello ', at: 1, ...identity },
      { type: 'agent_message_delta', messageId: 'm', text: 'there', at: 1, ...identity },
      { type: 'agent_message_completed', messageId: 'm', text: 'Hello there', at: 2, ...identity },
    ]);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ kind: 'agent', text: 'Hello there', live: false });
  });

  it('keeps an in-flight tool in the conversation and moves its completion to the feed', () => {
    const running = apply([
      {
        type: 'tool_call_started',
        toolCallId: 'call_1',
        title: 'read src/auth.ts',
        kind: 'read',
        at: 1,
        ...identity,
      },
    ]);
    expect(running.items.filter((item) => item.kind === 'tool')).toHaveLength(1);

    const done = reduce(running, {
      type: 'event',
      event: {
        type: 'tool_call_updated',
        toolCallId: 'call_1',
        status: 'completed',
        at: 2,
        ...identity,
      },
    });
    expect(done.items.filter((item) => item.kind === 'tool')).toHaveLength(0);
    expect(done.feed[0]?.text).toContain('read src/auth.ts');
  });

  it('does not render blobot\'s own tool as a tool call', () => {
    const state = apply([
      {
        type: 'tool_call_started',
        toolCallId: 'call_1',
        title: 'blobot_message_agent',
        kind: 'other',
        at: 1,
        ...identity,
      },
    ]);
    expect(state.items).toHaveLength(0);
  });

  it('shows a peer message in both panes and once in the team stream', () => {
    const state = apply([peerMessage]);
    expect(itemsFor(state.items, { kind: 'agent', agentId: 'alice' })).toHaveLength(1);
    expect(itemsFor(state.items, { kind: 'agent', agentId: 'bob' })).toHaveLength(1);
    expect(itemsFor(state.items, { kind: 'team' })).toHaveLength(1);
  });

  it('ignores the announcement, because the message record is what it renders', () => {
    const state = apply([
      peerMessage,
      { type: 'agent_message_sent', to: 'Bob', message: 'review this', at: 10, ...identity },
    ]);
    expect(state.items).toHaveLength(1);
  });
});
