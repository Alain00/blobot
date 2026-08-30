import { describe, expect, it } from 'vitest';
import type { AgentEvent, Message } from '@blobot/core/domain';
import {
  continuesSpeaker,
  initialState,
  isPending,
  lastLineOf,
  itemsFor,
  commandMenu,
  reduce,
  slashPartial,
  type AppState,
  type Item,
} from './model.js';

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
    commands: {},
    messages: [peerMessage],
    answers: [{ id: 'a1', agentId: 'bob', text: 'on it', at: 20 }],
    turnsThisPrompt: 0,
    demoMode: false,
    permissions: [],
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

  it('leaves an ordinary turn end in the feed alone', () => {
    const state = apply([
      { type: 'turn_ended', turnId: 't1', stopReason: 'end_turn', at: 3, ...identity },
    ]);
    expect(state.items).toHaveLength(0);
    expect(state.feed).toHaveLength(1);
  });

  it('puts a turn that stopped for any other reason in the conversation as well', () => {
    const state = apply([
      { type: 'turn_ended', turnId: 't1', stopReason: 'max_tokens', at: 3, ...identity },
    ]);
    expect(state.items[0]).toMatchObject({ kind: 'system', text: 'turn stopped · max tokens' });
    expect(state.feed[0]?.emphasis).toBe(true);
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

describe('one turn, labelled once', () => {
  const answer = (agentId: string): Item => ({
    kind: 'agent',
    id: `${agentId}-${Math.random()}`,
    at: 1,
    agentId,
    text: 'hi',
    live: false,
  });
  const asked: Item = { kind: 'user', id: 'u', at: 0, agentId: 'alice', text: 'who are u?' };

  it('groups a second answer from the same agent', () => {
    expect(continuesSpeaker(answer('alice'), answer('alice'))).toBe(true);
  });

  it('does not group across agents, or after anything else', () => {
    expect(continuesSpeaker(answer('bob'), answer('alice'))).toBe(false);
    expect(continuesSpeaker(answer('alice'), asked)).toBe(false);
    expect(continuesSpeaker(answer('alice'), undefined)).toBe(false);
  });

  it('never groups the other voices: they carry their own container', () => {
    expect(continuesSpeaker(asked, asked)).toBe(false);
  });
});

describe('the rail preview', () => {
  it('is the agent\'s own last line, collapsed to one', () => {
    const state = apply([
      { type: 'agent_message_delta', messageId: 'a1', text: 'first\nanswer', at: 1, ...identity },
      { type: 'agent_message_completed', messageId: 'a1', text: 'first\nanswer', at: 1, ...identity },
      { type: 'agent_message_delta', messageId: 'a2', text: 'second\n\nanswer', at: 2, ...identity },
      {
        type: 'agent_message_completed',
        messageId: 'a2',
        text: 'second\n\nanswer',
        at: 2,
        ...identity,
      },
    ]);
    expect(lastLineOf(state.items, 'alice')).toEqual({ text: 'second answer', at: 2 });
  });

  it('never borrows another voice: a peer message is not Bob speaking', () => {
    const state = apply([peerMessage]);
    expect(lastLineOf(state.items, 'bob')).toBeUndefined();
  });

  it('is undefined for an agent that has not said anything', () => {
    expect(lastLineOf([], 'alice')).toBeUndefined();
  });
});

describe('the pending indicator', () => {
  const live: Item = { kind: 'agent', id: 'a', at: 1, agentId: 'alice', text: 'so', live: true };

  it('shows while the agent is starting, thinking or working', () => {
    for (const status of ['starting', 'thinking', 'working'] as const) {
      expect(isPending(status, [], 'alice')).toBe(true);
    }
  });

  it('stops once there is a live message to watch instead', () => {
    expect(isPending('working', [live], 'alice')).toBe(false);
    // Another agent streaming says nothing about this one.
    expect(isPending('working', [live], 'bob')).toBe(true);
  });

  it('never shows for the states a human has to clear', () => {
    for (const status of ['idle', 'responding', 'waiting', 'failed'] as const) {
      expect(isPending(status, [], 'alice')).toBe(false);
    }
  });
});

describe('a permission block', () => {
  const request = {
    id: 'perm_1',
    agentId: 'alice',
    toolCallId: 'tool_1',
    title: 'rm -rf dist',
    canAllow: true,
    canAllowAlways: true,
  };
  const started: AgentEvent = {
    ...identity,
    at: 10,
    type: 'tool_call_started',
    toolCallId: 'tool_1',
    title: 'rm -rf dist',
    kind: 'execute',
  };

  it('takes over the tool line, so nothing says `running` while nothing is running', () => {
    const asked = reduce(apply([started]), { type: 'permission', request, at: 20 });
    expect(asked.items).toMatchObject([
      { kind: 'tool', id: 'tool_1', status: 'asking' },
      { kind: 'permission', id: 'perm_1', title: 'rm -rf dist', canAllow: true },
    ]);
  });

  it('starts the call and records the answer once it is allowed', () => {
    const asked = reduce(apply([started]), { type: 'permission', request, at: 20 });
    const allowed = reduce(asked, { type: 'permissionSettled', id: 'perm_1', outcome: 'allowed' });
    expect(allowed.items).toMatchObject([
      { kind: 'tool', id: 'tool_1', status: 'running' },
      { kind: 'permission', id: 'perm_1', outcome: 'allowed' },
    ]);
  });

  it('starts the call on an always answer too, and says the rule was left behind', () => {
    const asked = reduce(apply([started]), { type: 'permission', request, at: 20 });
    const allowed = reduce(asked, {
      type: 'permissionSettled',
      id: 'perm_1',
      outcome: 'allowed_always',
    });
    expect(allowed.items).toMatchObject([
      { kind: 'tool', id: 'tool_1', status: 'running' },
      { kind: 'permission', id: 'perm_1', outcome: 'allowed_always' },
    ]);
  });

  it('leaves a rejected call for the failed tool event to clear, and says you rejected it', () => {
    const asked = reduce(apply([started]), { type: 'permission', request, at: 20 });
    const rejected = reduce(asked, { type: 'permissionSettled', id: 'perm_1', outcome: 'rejected' });
    const failed = reduce(rejected, {
      type: 'event',
      event: {
        ...identity,
        at: 30,
        type: 'tool_call_updated',
        toolCallId: 'tool_1',
        status: 'failed',
        error: 'the user did not allow this',
      },
    });
    expect(failed.items).toMatchObject([{ kind: 'permission', id: 'perm_1', outcome: 'rejected' }]);
    expect(failed.feed[0]?.text).toContain('failed');
  });

  it('arrives once, however many times the same request is announced', () => {
    const once = reduce(apply([started]), { type: 'permission', request, at: 20 });
    const twice = reduce(once, { type: 'permission', request, at: 21 });
    expect(twice.items.filter((item) => item.kind === 'permission')).toHaveLength(1);
  });

  it('comes back with the pane, because the turn behind it is still standing there', () => {
    const state = reduce(initialState, {
      type: 'snapshot',
      snapshot: {
        team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 10 },
        teams: [],
        agents: [],
        statuses: {},
        commands: {},
        messages: [],
        answers: [],
        permissions: [request],
        turnsThisPrompt: 0,
        demoMode: false,
      },
    });
    expect(state.items).toMatchObject([{ kind: 'permission', id: 'perm_1' }]);
  });
});

/**
 * The two announcements race: a permission request travels a callback, the tool's own event
 * travels the turn's queue. Observed the wrong way round on the first run of the demo, where
 * the block appeared under a line that said `running`.
 */
it('holds the tool line when the request arrives before the call it is about', () => {
  const asked = reduce(initialState, {
    type: 'permission',
    request: {
      id: 'perm_1',
      agentId: 'alice',
      toolCallId: 'tool_1',
      title: 'rm -rf dist',
      canAllow: true,
      canAllowAlways: true,
    },
    at: 20,
  });
  const state = reduce(asked, {
    type: 'event',
    event: {
      agentId: 'alice',
      sessionId: 'session_alice',
      at: 21,
      type: 'tool_call_started',
      toolCallId: 'tool_1',
      title: 'rm -rf dist',
      kind: 'execute',
    },
  });
  expect(state.items).toMatchObject([
    { kind: 'permission', id: 'perm_1' },
    { kind: 'tool', id: 'tool_1', status: 'asking' },
  ]);
});

describe('the composer\'s slash menu', () => {
  const offered = [
    { name: 'code-review', description: 'Review the changes' },
    { name: 'compact', description: 'Free up context' },
  ];
  const menu = (draft: string, over = {}): ReturnType<typeof commandMenu> =>
    commandMenu({ draft, dismissed: false, recipientName: 'Alice', offered, ...over });

  it('opens on a slash that begins the message', () => {
    expect(menu('/').suggestions).toHaveLength(2);
    expect(menu('/co').suggestions.map((c) => c.name)).toEqual(['code-review', 'compact']);
    expect(menu('/comp').suggestions.map((c) => c.name)).toEqual(['compact']);
  });

  it('leaves prose alone, which is the whole reason for the position rule', () => {
    // A path and a conjunction are not somebody reaching for a menu. `@` can afford to match
    // anywhere; `/` cannot.
    for (const draft of ['look at src/auth.ts', 'and/or', 'ask Bob then /review']) {
      expect(slashPartial(draft)).toBeUndefined();
      expect(menu(draft).suggestions).toEqual([]);
      expect(menu(draft).note).toBeUndefined();
    }
  });

  it('closes once the argument starts, because the command is already chosen', () => {
    expect(slashPartial('/code-review ')).toBeUndefined();
    expect(slashPartial('/code-review src/auth.ts')).toBeUndefined();
  });

  it('says a command needs a recipient before it can have one', () => {
    const { suggestions, note } = menu('/', { recipientName: undefined });
    expect(suggestions).toEqual([]);
    // The team pane's honest answer, and the same precondition send already has.
    expect(note).toBe('Say who with @ first. Commands belong to one teammate.');
  });

  it('says an empty menu is an answer rather than a wait', () => {
    const { suggestions, note } = menu('/', { offered: [] });
    expect(suggestions).toEqual([]);
    expect(note).toBe('Alice has not offered any commands yet');
  });

  it('treats a typo as a closed menu, not as an empty state', () => {
    // Otherwise every mistyped command claims Enter and refuses to send.
    const { suggestions, note } = menu('/revieww');
    expect(suggestions).toEqual([]);
    expect(note).toBeUndefined();
  });

  it('stays shut after Escape until the next keystroke', () => {
    expect(menu('/', { dismissed: true })).toEqual({ suggestions: [] });
  });
});
