import { describe, expect, it } from 'vitest';
import type { AgentEvent, Message } from '@blobot/core/domain';
import {
  addressedBy,
  continuesSpeaker,
  initialState,
  isPending,
  lastLineOf,
  itemsFor,
  commandMenu,
  reduce,
  slashPartial,
  stoppedBecause,
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
    usage: {},
    log: { tools: [], turns: [] },
    injection: {},
    messages: [peerMessage],
    answers: [{ id: 'a1', agentId: 'bob', text: 'on it', at: 20 }],
    turnsThisPrompt: 0,
    demoMode: false,
    permissions: [],
  };

  it('restores the activity column the way it was watched, without blobot\'s own tool', () => {
    const state = reduce(initialState, {
      type: 'snapshot',
      snapshot: {
        ...snapshot,
        log: {
          tools: [
            {
              toolCallId: 'call_1',
              agentId: 'alice',
              at: 10,
              title: 'mcp__blobot__message_agent',
              status: 'completed',
            },
            {
              toolCallId: 'call_2',
              agentId: 'alice',
              at: 11,
              title: 'git log\n  --oneline',
              status: 'completed',
            },
          ],
          turns: [],
        },
      },
    });
    expect(state.feed.map((entry) => entry.text)).toEqual(['git log --oneline completed']);
  });

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

  it('takes the refined title off a call that was announced before its arguments', () => {
    const running = apply([
      {
        type: 'tool_call_started',
        toolCallId: 'call_1',
        title: 'Terminal',
        kind: 'execute',
        at: 1,
        ...identity,
      },
      {
        type: 'tool_call_updated',
        toolCallId: 'call_1',
        status: 'in_progress',
        title: 'git log --oneline -5',
        at: 2,
        ...identity,
      },
    ]);
    expect(running.items[0]).toMatchObject({ kind: 'tool', title: 'git log --oneline -5' });

    const done = reduce(running, {
      type: 'event',
      event: {
        type: 'tool_call_updated',
        toolCallId: 'call_1',
        status: 'completed',
        at: 3,
        ...identity,
      },
    });
    expect(done.feed[0]?.text).toBe('git log --oneline -5 completed');
  });

  it('flattens a command that runs over several lines into one entry', () => {
    const long = 'echo "---A---" &&\n  git shortlog -sn --all |\n  head -15';
    const state = apply([
      {
        type: 'tool_call_started',
        toolCallId: 'call_1',
        title: long,
        kind: 'execute',
        at: 1,
        ...identity,
      },
    ]);
    const tool = state.items[0] as { title: string };
    expect(tool.title).toBe('echo "---A---" && git shortlog -sn --all | head -15');
    expect(tool.title).not.toContain('\n');
  });

  it('cuts a command too long for the column rather than letting it take the column', () => {
    const state = apply([
      {
        type: 'tool_call_started',
        toolCallId: 'call_1',
        title: `git log ${'--oneline '.repeat(20)}`,
        kind: 'execute',
        at: 1,
        ...identity,
      },
    ]);
    const tool = state.items[0] as { title: string };
    expect(tool.title).toHaveLength(80);
    expect(tool.title.endsWith('\u2026')).toBe(true);
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
    expect(state.items[0]).toMatchObject({ kind: 'system', text: 'turn stopped · the context window is full' });
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
  const asked: Item = { kind: 'user', id: 'u', at: 0, agentIds: ['alice'], text: 'who are u?' };

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
        usage: {},
        log: { tools: [], turns: [] },
        injection: {},
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

describe('who a message is addressed to', () => {
  const roster = [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ] as unknown as readonly import('@blobot/core/domain').Agent[];
  const ids = (draft: string): string[] => addressedBy(draft, roster).map((agent) => agent.id);

  it('takes the leading run, and sends the whole message to every one of them', () => {
    expect(ids('@Alice @Bob the page double-charges')).toEqual(['alice', 'bob']);
  });

  it('stops at the first ordinary word: a later mention is a reference', () => {
    expect(ids('@Bob about @Alice branch')).toEqual(['bob']);
  });

  // The behaviour "last valid mention wins" used to give, and the price of the new rule.
  it('no longer addresses a trailing mention', () => {
    expect(ids('ship it @Bob')).toEqual([]);
  });

  it('does not end the run on a name nobody has', () => {
    expect(ids('@alic @Bob hi')).toEqual(['bob']);
  });

  it('counts the same agent once, however many times it was named', () => {
    expect(ids('@Alice @alice @ALICE go')).toEqual(['alice']);
  });

  it('addresses nobody when the message starts with prose', () => {
    expect(ids('the page double-charges')).toEqual([]);
  });
});

describe('one thing typed, drawn once', () => {
  const at = 1_700_000_000_000;
  // What `@alice @bob …` commits: a row each, one timestamp, because it was typed once.
  const fanout: Item[] = [
    { kind: 'user', id: 'u1', at, agentIds: ['alice'], text: '@Alice @Bob look at this' },
    { kind: 'user', id: 'u2', at, agentIds: ['bob'], text: '@Alice @Bob look at this' },
  ];

  it('draws the two rows as one bubble in the team pane, tagged with both', () => {
    const drawn = itemsFor(fanout, { kind: 'team' });
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.kind === 'user' && drawn[0].agentIds).toEqual(['alice', 'bob']);
  });

  it('leaves an agent pane with the one message that is its own', () => {
    const drawn = itemsFor(fanout, { kind: 'agent', agentId: 'bob' });
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.kind === 'user' && drawn[0].agentIds).toEqual(['bob']);
  });

  it('keeps the same words apart when they were sent at different times', () => {
    const twice: Item[] = [
      { kind: 'user', id: 'u1', at, agentIds: ['alice'], text: 'again' },
      { kind: 'user', id: 'u2', at: at + 1, agentIds: ['alice'], text: 'again' },
    ];
    expect(itemsFor(twice, { kind: 'team' })).toHaveLength(2);
  });
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

describe('a handoff that was named and never sent', () => {
  const observed = (named: readonly string[]): AppState =>
    reduce(initialState, { type: 'silentHandoff', agentId: 'alice', named, at: 40 });

  it('states the two facts and offers nothing', () => {
    const [item] = observed(['Bob']).items;
    expect(item).toMatchObject({
      kind: 'system',
      agentId: 'alice',
      text: 'named Bob · no message sent',
    });
  });

  it('reads as a sentence when there are several', () => {
    expect(observed(['Bob', 'Carol']).items[0]).toMatchObject({
      text: 'named Bob and Carol · no message sent',
    });
    expect(observed(['Bob', 'Carol', 'Dave']).items[0]).toMatchObject({
      text: 'named Bob, Carol and Dave · no message sent',
    });
  });

  it('lands once, however many times the observation arrives', () => {
    const once = observed(['Bob']);
    const twice = reduce(once, {
      type: 'silentHandoff',
      agentId: 'alice',
      named: ['Bob'],
      at: 40,
    });
    expect(twice.items).toHaveLength(1);
  });
});

describe('the context gauge', () => {
  const usage = (used: number, size = 200_000, at = 10): AgentEvent => ({
    type: 'usage_updated',
    ...identity,
    at,
    used,
    size,
  });

  it('keeps the last reading per agent', () => {
    const state = apply([
      usage(4_000),
      usage(37_000, 1_000_000, 20),
      { ...usage(148_000), agentId: 'bob', sessionId: 'session_bob' },
    ]);
    expect(state.usage).toEqual({
      alice: { used: 37_000, size: 1_000_000 },
      bob: { used: 148_000, size: 200_000 },
    });
  });

  it('ignores the zero a cancelled turn reports, so stopping an agent does not empty it', () => {
    const state = apply([usage(37_000), usage(0, 200_000, 20)]);
    expect(state.usage.alice).toEqual({ used: 37_000, size: 200_000 });
  });

  it('takes a zero from an agent that has said nothing yet, because that one is true', () => {
    expect(apply([usage(0)]).usage.alice).toEqual({ used: 0, size: 200_000 });
  });

  it('is seeded by the snapshot, so a relaunch draws what the agent is carrying', () => {
    const state = reduce(initialState, {
      type: 'snapshot',
      snapshot: {
        team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 10 },
        teams: [],
        agents: [],
        statuses: {},
        commands: {},
        usage: { alice: { used: 37_000, size: 1_000_000 } },
        log: { tools: [], turns: [] },
        injection: {},
        messages: [],
        answers: [],
        permissions: [],
        turnsThisPrompt: 0,
        demoMode: false,
      },
    });
    expect(state.usage).toEqual({ alice: { used: 37_000, size: 1_000_000 } });
  });
});

describe('a turn that ended early', () => {
  const ended = (stopReason: 'end_turn' | 'max_tokens' | 'refusal' | 'max_turn_requests'): AgentEvent => ({
    type: 'turn_ended',
    ...identity,
    at: 30,
    turnId: 'turn_1',
    stopReason,
  });

  it('says why in the transcript, not only in the activity column', () => {
    const state = apply([ended('max_tokens')]);
    expect(state.items).toMatchObject([
      { kind: 'system', agentId: 'alice', text: 'turn stopped · the context window is full' },
    ]);
  });

  it('names a consequence rather than the protocol\'s mechanism', () => {
    // The three endings that arrive down the same path. `max tokens` was what the pane used to
    // draw, which names a mechanism and reads to a user as an agent that got worse for no
    // reason.
    expect(stoppedBecause('max_tokens')).toBe('turn stopped · the context window is full');
    expect(stoppedBecause('max_turn_requests')).toBe(
      'turn stopped · the runtime hit its own request limit',
    );
    expect(stoppedBecause('refusal')).toBe('turn stopped · declined to answer');
    expect(stoppedBecause('cancelled')).toBe('turn stopped · cancelled');
  });

  it('offers no remedy, because blobot does not manage the agent\'s context', () => {
    for (const reason of ['max_tokens', 'max_turn_requests', 'refusal'] as const) {
      expect(stoppedBecause(reason)).not.toMatch(/compact|continue|retry|try again/i);
    }
  });

  it('leaves an ordinary ending in the activity column, where a log belongs', () => {
    const state = apply([ended('end_turn')]);
    expect(state.items).toEqual([]);
    expect(state.feed[0]?.text).toBe('turn ended · end_turn');
  });
});

describe('the activity column, after a team switch', () => {
  const snapshot = (log: {
    tools: { toolCallId: string; agentId: string; at: number; title: string; status: string }[];
    turns: { turnId: string; agentId: string; at: number; stopReason: 'end_turn' | 'max_tokens' }[];
  }): AppState =>
    reduce(initialState, {
      type: 'snapshot',
      snapshot: {
        team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 10 },
        teams: [],
        agents: [],
        statuses: {},
        commands: {},
        usage: {},
        log,
        injection: {},
        messages: [],
        answers: [],
        permissions: [],
        turnsThisPrompt: 0,
        demoMode: false,
      },
    });

  it('comes back with the team, newest first, instead of emptying', () => {
    const state = snapshot({
      tools: [
        { toolCallId: 'call_1', agentId: 'alice', at: 10, title: 'read src/auth.ts', status: 'completed' },
      ],
      turns: [{ turnId: 'turn_1', agentId: 'alice', at: 20, stopReason: 'end_turn' }],
    });
    expect(state.feed.map((entry) => entry.text)).toEqual([
      'turn ended · end_turn',
      'read src/auth.ts completed',
    ]);
  });

  it('is keyed the way a live line is, so the same call is not logged twice', () => {
    const state = snapshot({
      tools: [
        { toolCallId: 'call_1', agentId: 'alice', at: 10, title: 'read src/auth.ts', status: 'completed' },
      ],
      turns: [],
    });
    expect(state.feed[0]?.id).toBe('call_1:done');
  });

  it('brings an unusual ending back into the transcript, not only into the column', () => {
    // An answer that stopped mid-sentence and came back without its reason read as an answer
    // that finished.
    const state = snapshot({
      tools: [],
      turns: [{ turnId: 'turn_1', agentId: 'alice', at: 20, stopReason: 'max_tokens' }],
    });
    expect(state.items).toMatchObject([
      { kind: 'system', agentId: 'alice', text: 'turn stopped · the context window is full' },
    ]);
    expect(state.feed[0]?.emphasis).toBe(true);
  });

  it('leaves an ordinary ending out of the transcript, as the live path does', () => {
    const state = snapshot({
      tools: [],
      turns: [{ turnId: 'turn_1', agentId: 'alice', at: 20, stopReason: 'end_turn' }],
    });
    expect(state.items).toEqual([]);
  });
});
