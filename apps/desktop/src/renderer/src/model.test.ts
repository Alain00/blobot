import { describe, expect, it } from 'vitest';
import type { AgentEvent, Message } from '@blobot/core/domain';
import type { UiAgentMessage, UiLog } from '../../shared/api.js';
import {
  addressedBy,
  compactionLine,
  continuesSpeaker,
  failuresIn,
  initialState,
  isPending,
  lastLineOf,
  itemsFor,
  paneAfterSnapshot,
  commandMenu,
  reduce,
  rowsOf,
  slashPartial,
  stoppedBecause,
  toolsIn,
  type AppState,
  type Item,
  type Row,
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
    moreAbove: false,
    statuses: {},
    commands: {},
    usage: {},
    log: { running: [], tools: [], turns: [], compactions: [] },
    injection: {},
    handbooks: {},
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
          running: [],
          tools: [
            {
              toolCallId: 'call_1',
              agentId: 'alice',
              at: 10,
              startedAt: 9,
              kind: 'other',
              title: 'mcp__blobot__message_agent',
              status: 'completed',
            },
            {
              toolCallId: 'call_2',
              agentId: 'alice',
              at: 11,
              startedAt: 10,
              kind: 'execute',
              title: 'git log\n  --oneline',
              status: 'completed',
            },
          ],
          turns: [],
          compactions: [],
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

/**
 * Ticket 02 cut the transcript into a window, and this is the only action that adds to the top
 * of one. It had no test of its own: the snapshot fixtures carry `moreAbove` and nothing ever
 * asserted on what happens when a page of history arrives.
 */
describe('a window of older transcript', () => {
  const older: Message = { ...peerMessage, id: 'm0', body: 'the first thing anybody said', at: 2 };

  it('prepends, so the live tail it was reading is still there', () => {
    const live = apply([
      { ...identity, type: 'agent_message_delta', messageId: 'live', at: 40, text: 'still writing' },
    ]);
    const state = reduce(live, {
      type: 'earlier',
      messages: [older],
      answers: [{ id: 'a0', agentId: 'bob', text: 'and the reply', at: 3 }],
      moreAbove: true,
    });
    // Oldest first, and the message that was mid-stream is still mid-stream at the bottom.
    expect(state.items).toMatchObject([
      { kind: 'peer', id: 'm0' },
      { kind: 'agent', agentId: 'bob', text: 'and the reply' },
      { kind: 'agent', agentId: 'alice', text: 'still writing', live: true },
    ]);
  });

  it('keeps the copy on screen where a page overlaps, because that one may be mid-stream', () => {
    const live = apply([
      { ...identity, type: 'agent_message_delta', messageId: 'live', at: 40, text: 'half a sentence' },
    ]);
    const streaming = live.items.at(-1) as Item & { id: string };
    const state = reduce(live, {
      type: 'earlier',
      messages: [],
      // The same id the live row is keyed by, as the store would return it once it settled.
      answers: [{ id: streaming.id, agentId: 'alice', text: 'half a sentence, finished', at: 40 }],
      moreAbove: false,
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ text: 'half a sentence', live: true });
  });

  it('takes the store’s word for whether anything is left above it', () => {
    const state = reduce(
      { ...initialState, moreAbove: true },
      { type: 'earlier', messages: [older], answers: [], moreAbove: false },
    );
    expect(state.moreAbove).toBe(false);
    expect(state.oldest).toBe(2);
  });

  it('never moves the cursor forward, so an empty page cannot ask for the same window twice', () => {
    const state = reduce(
      { ...initialState, oldest: 2, moreAbove: true },
      { type: 'earlier', messages: [], answers: [], moreAbove: false },
    );
    expect(state.oldest).toBe(2);
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

  it('keeps a call in the conversation once it finishes, and logs it to the feed as well', () => {
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
    // It used to leave the transcript here, which is why a turn's narration survived and the
    // work it narrated did not. It stays, settled, and `rowsOf` folds it out of the way.
    expect(done.items.filter((item) => item.kind === 'tool')).toMatchObject([
      { id: 'call_1', status: 'completed', toolKind: 'read' },
    ]);
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
        moreAbove: false,
        statuses: {},
        commands: {},
        usage: {},
        log: { running: [], tools: [], turns: [], compactions: [] },
        injection: {},
        handbooks: {},
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
        moreAbove: false,
        statuses: {},
        commands: {},
        usage: { alice: { used: 37_000, size: 1_000_000 } },
        log: { running: [], tools: [], turns: [], compactions: [] },
        injection: {},
        handbooks: {},
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
  const snapshot = (log: UiLog): AppState =>
    reduce(initialState, {
      type: 'snapshot',
      snapshot: {
        team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 10 },
        teams: [],
        agents: [],
        moreAbove: false,
        statuses: {},
        commands: {},
        usage: {},
        log,
        injection: {},
        handbooks: {},
        messages: [],
        answers: [],
        permissions: [],
        turnsThisPrompt: 0,
        demoMode: false,
      },
    });

  it('comes back with the team, newest first, instead of emptying', () => {
    const state = snapshot({
      running: [],
      tools: [
        {
          toolCallId: 'call_1',
          agentId: 'alice',
          at: 10,
          startedAt: 9,
          kind: 'read',
          title: 'read src/auth.ts',
          status: 'completed',
        },
      ],
      turns: [{ turnId: 'turn_1', agentId: 'alice', at: 20, stopReason: 'end_turn' }],
      compactions: [],
    });
    expect(state.feed.map((entry) => entry.text)).toEqual([
      'turn ended · end_turn',
      'read src/auth.ts completed',
    ]);
  });

  it('is keyed the way a live line is, so the same call is not logged twice', () => {
    const state = snapshot({
      running: [],
      tools: [
        {
          toolCallId: 'call_1',
          agentId: 'alice',
          at: 10,
          startedAt: 9,
          kind: 'read',
          title: 'read src/auth.ts',
          status: 'completed',
        },
      ],
      turns: [],
      compactions: [],
    });
    expect(state.feed[0]?.id).toBe('call_1:done');
  });

  it('brings an unusual ending back into the transcript, not only into the column', () => {
    // An answer that stopped mid-sentence and came back without its reason read as an answer
    // that finished.
    const state = snapshot({
      running: [],
      tools: [],
      turns: [{ turnId: 'turn_1', agentId: 'alice', at: 20, stopReason: 'max_tokens' }],
      compactions: [],
    });
    expect(state.items).toMatchObject([
      { kind: 'system', agentId: 'alice', text: 'turn stopped · the context window is full' },
    ]);
    expect(state.feed[0]?.emphasis).toBe(true);
  });

  it('leaves an ordinary ending out of the transcript, as the live path does', () => {
    const state = snapshot({
      running: [],
      tools: [],
      turns: [{ turnId: 'turn_1', agentId: 'alice', at: 20, stopReason: 'end_turn' }],
      compactions: [],
    });
    expect(state.items).toEqual([]);
  });
});

/**
 * The fold's seam. Everything here is about what stays *out* of a block: the grouping is how
 * "the live step never folds" is guaranteed, so each of these is a rule that would otherwise
 * have to be remembered at the render site.
 */
describe('folding a run of settled work', () => {
  const at = (n: number): number => 1_000 + n;
  const caption = (id: string, text: string, live = false): Item => ({
    kind: 'agent',
    id,
    at: at(Number(id)),
    agentId: 'alice',
    text,
    live,
  });
  const call = (
    id: string,
    status: 'running' | 'completed' | 'failed' = 'completed',
  ): Item => ({
    kind: 'tool',
    id,
    at: at(Number(id)),
    agentId: 'alice',
    title: `npm run ${id}`,
    toolKind: 'execute',
    status,
  });

  it('folds captions and the calls they introduce into one row', () => {
    const rows = rowsOf([
      caption('1', 'Now the selection store.'),
      call('2'),
      caption('3', 'Now the interaction wrapper.'),
      call('4'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('steps');
    expect(toolsIn((rows[0] as Extract<Row, { kind: 'steps' }>).items)).toBe(2);
  });

  it('leaves the answer out of the block, because the answer never folds', () => {
    const answer = caption('5', 'Zero errors. Build passes.');
    const rows = rowsOf([caption('1', 'Now the store.'), call('2'), call('3'), answer]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ kind: 'item', item: { id: '5' } });
  });

  it('never folds a call that is still running, so what is happening now is never hidden', () => {
    const rows = rowsOf([call('1'), call('2'), call('3', 'running')]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe('steps');
    expect(rows[1]).toMatchObject({ kind: 'item', item: { id: '3', status: 'running' } });
  });

  it('never folds a question nobody has answered', () => {
    const asking: Item = {
      kind: 'permission',
      id: 'perm_1',
      at: at(3),
      agentId: 'alice',
      toolCallId: 'tool_1',
      title: 'rm -rf dist',
      canAllow: true,
      canAllowAlways: true,
    };
    const rows = rowsOf([call('1'), call('2'), asking]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ kind: 'item', item: { id: 'perm_1' } });
  });

  it('never folds a live answer, or prose long enough to be one', () => {
    const essay = caption('3', 'x'.repeat(400));
    const rows = rowsOf([call('1'), call('2'), essay, call('4'), call('5')]);
    expect(rows.map((row) => row.kind)).toEqual(['steps', 'item', 'steps']);
  });

  it('leaves a lone call alone, where a fold costs more than it saves', () => {
    const rows = rowsOf([caption('1', 'Now the store.'), call('2')]);
    expect(rows.map((row) => row.kind)).toEqual(['item', 'item']);
  });

  it('does not fold two agents into one block', () => {
    const bob: Item = { ...(call('3') as Extract<Item, { kind: 'tool' }>), agentId: 'bob' };
    const rows = rowsOf([call('1'), call('2'), bob, { ...bob, id: '4' }]);
    expect(rows.map((row) => row.kind)).toEqual(['steps', 'steps']);
    expect((rows[1] as Extract<Row, { kind: 'steps' }>).agentId).toBe('bob');
  });

  it('counts a cancelled call as failed, because it reports completed with a null exit', () => {
    const cancelled: Item = { ...(call('2') as Extract<Item, { kind: 'tool' }>), exit: null };
    expect(failuresIn([call('1'), cancelled])).toBe(1);
  });

  it('does not count a rejection as a failure: it did not fail, it did not run', () => {
    const rejected: Item = {
      kind: 'permission',
      id: 'perm_1',
      at: at(2),
      agentId: 'alice',
      toolCallId: 'tool_1',
      title: 'rm -rf dist',
      canAllow: true,
      canAllowAlways: true,
      outcome: 'rejected',
    };
    expect(failuresIn([call('1'), rejected])).toBe(0);
  });
});

/**
 * The fold, on a transcript nobody watched happen.
 *
 * A restored pane is the ordinary case — a relaunch, a team switch — and until 2026-08-30 it had
 * no tool lines at all, so nothing in it grouped and every past turn came back as a flat wall of
 * captions. That is the shape the fold was built to fix, arriving by the door the fold could not
 * see.
 */
describe('a restored transcript', () => {
  const call = (
    id: string,
    startedAt: number,
    rest: Partial<UiLog['tools'][number]> = {},
  ): UiLog['tools'][number] => ({
    toolCallId: id,
    agentId: 'alice',
    at: startedAt + 1,
    startedAt,
    kind: 'execute',
    title: `npm run ${id}`,
    status: 'completed',
    ...rest,
  });

  const restored = (tools: UiLog['tools'][number][], answers: UiAgentMessage[]): AppState =>
    reduce(initialState, {
      type: 'snapshot',
      snapshot: {
        team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 10 },
        teams: [],
        agents: [],
        moreAbove: false,
        statuses: {},
        commands: {},
        usage: {},
        log: { running: [], tools, turns: [], compactions: [] },
        injection: {},
        handbooks: {},
        messages: [],
        answers,
        permissions: [],
        turnsThisPrompt: 0,
        demoMode: false,
      },
    });

  it('folds, because the calls come back with the captions', () => {
    const state = restored(
      [call('a', 2), call('b', 4)],
      [
        { id: 'm1', agentId: 'alice', at: 1, text: 'Now the store.' },
        { id: 'm2', agentId: 'alice', at: 3, text: 'Now the wrapper.' },
        { id: 'm3', agentId: 'alice', at: 9, text: 'Zero errors, and the build is green.' },
      ],
    );
    const rows = rowsOf(itemsFor(state.items, { kind: 'agent', agentId: 'alice' }));
    expect(rows.map((row) => row.kind)).toEqual(['steps', 'item']);
    expect(toolsIn((rows[0] as Extract<Row, { kind: 'steps' }>).items)).toBe(2);
    // Ordered by when each call started, so it sits under the line that introduced it.
    expect((rows[0] as Extract<Row, { kind: 'steps' }>).items.map((item) => item.id)).toEqual([
      'm1',
      'a',
      'm2',
      'b',
    ]);
  });

  it('says `exit null` only where a runtime reported one, and counts that as a failure', () => {
    const state = restored(
      // The cancelled call: `completed`, betrayed only by the explicit null.
      [call('a', 2, { exit: null }), call('b', 4)],
      [],
    );
    const tools = state.items.filter((item) => item.kind === 'tool');
    expect(tools).toMatchObject([{ id: 'a', exit: null }, { id: 'b' }]);
    expect(tools[1]).not.toHaveProperty('exit');
    expect(failuresIn(state.items)).toBe(1);
  });

  it('leaves blobot\'s own tool out, exactly as the live path and the feed do', () => {
    const state = restored([call('a', 2, { title: 'mcp__blobot__message_agent' }), call('b', 4)], []);
    expect(state.items.filter((item) => item.kind === 'tool')).toMatchObject([{ id: 'b' }]);
  });

  it('takes a kind it does not know as `other`, rather than guessing a verb', () => {
    const state = restored([call('a', 2, { kind: null }), call('b', 4, { kind: 'summarize' })], []);
    expect(state.items.filter((item) => item.kind === 'tool')).toMatchObject([
      { id: 'a', toolKind: 'other' },
      { id: 'b', toolKind: 'other' },
    ]);
  });
});

it('brings back a call that was in flight when the snapshot was read, and lets it finish', () => {
  // The renderer drops every event arriving before its first snapshot resolves, because until
  // then it does not know which team is on screen. So a call that started in that window was
  // never in `items`: the only place it exists is the store, which has its start and not its
  // end. Without this it was lost by both paths and a six-call turn read `ran 5`.
  const after = reduce(initialState, {
    type: 'snapshot',
    snapshot: {
      team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 10 },
      teams: [],
      agents: [
        { id: 'alice', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w', accepts: { images: true, textFiles: true } },
      ],
      moreAbove: false,
      statuses: {},
      commands: {},
      usage: {},
      log: {
        running: [
          {
            toolCallId: 'call_3',
            agentId: 'alice',
            startedAt: 5,
            title: 'src/scene/Interactive.tsx',
            kind: 'edit',
          },
        ],
        tools: [],
        turns: [],
        compactions: [],
      },
      injection: {},
      handbooks: {},
      messages: [],
      answers: [],
      permissions: [],
      turnsThisPrompt: 0,
      demoMode: false,
    },
  });
  expect(after.items).toMatchObject([
    { kind: 'tool', id: 'call_3', status: 'running', toolKind: 'edit' },
  ]);

  const done = reduce(after, {
    type: 'event',
    event: {
      type: 'tool_call_updated',
      toolCallId: 'call_3',
      status: 'completed',
      exit: 0,
      at: 6,
      agentId: 'alice',
      sessionId: 's',
    },
  });
  expect(done.items).toMatchObject([{ kind: 'tool', id: 'call_3', status: 'completed' }]);
  // And the completion reaches the activity column, which it could not when the item was gone.
  expect(done.feed[0]?.text).toContain('src/scene/Interactive.tsx');
});

describe('what an edit changed, on its way to the line', () => {
  const identity = { agentId: 'alice', sessionId: 's' } as const;
  const started = {
    type: 'tool_call_started' as const,
    toolCallId: 'c1',
    title: 'src/desk.tsx',
    kind: 'edit' as const,
    at: 1,
    ...identity,
  };

  it('takes the counts off the update that carries them, not the terminal one', () => {
    // A real Claude sends the diff mid-stream and the completion bare, so a reducer that only
    // read the way out would show nothing on every edit and still pass a naive test.
    const withDiff = reduce(apply([started]), {
      type: 'event',
      event: {
        type: 'tool_call_updated',
        toolCallId: 'c1',
        status: 'in_progress',
        changed: { added: 74, removed: 41 },
        at: 2,
        ...identity,
      },
    });
    const done = reduce(withDiff, {
      type: 'event',
      event: { type: 'tool_call_updated', toolCallId: 'c1', status: 'completed', exit: 0, at: 3, ...identity },
    });
    expect(done.items).toMatchObject([
      { kind: 'tool', id: 'c1', status: 'completed', changed: { added: 74, removed: 41 } },
    ]);
  });

  it('leaves a call that changed nothing without counts, which is not the same as zero', () => {
    const done = reduce(apply([started]), {
      type: 'event',
      event: { type: 'tool_call_updated', toolCallId: 'c1', status: 'completed', exit: 0, at: 3, ...identity },
    });
    expect(done.items[0]).not.toHaveProperty('changed');
  });
});

describe('a session blobot replaced', () => {
  const compacted = {
    type: 'context_compacted' as const,
    agentId: 'alice',
    sessionId: 's1',
    at: 40,
    used: 110_000,
    ceiling: 120_000,
    measured: false,
  };

  it('draws the pair of numbers, and says when the ceiling is an estimate', () => {
    // Ticket 09's two honest facts rather than one derived percentage, and the estimate said
    // out loud: restarting a session off a guess about a model is a stronger claim than
    // drawing that guess on a gauge, and the line must not conflate them.
    expect(compactionLine('command', 110_000, 120_000, false)).toBe(
      'context compacted · 110k of 120k estimated',
    );
    expect(compactionLine('command', 110_000, 120_000, true)).toBe(
      'context compacted · 110k of 120k',
    );
  });

  it('names the standing instructions only where they could have moved', () => {
    // On a runtime that re-asserts the persona every session this is not news, and a clause
    // that is always there is a clause nobody reads on the day it matters.
    expect(compactionLine('handoff', 110_000, 120_000, true, undefined, true)).toContain(
      'standing instructions re-read',
    );
    expect(compactionLine('handoff', 110_000, 120_000, true, undefined, false)).not.toContain(
      'standing instructions',
    );
  });

  it('leads a refusal with what did not happen, and offers no remedy', () => {
    const line = compactionLine('refused', 110_000, 120_000, true, 'the agent wrote no handoff');
    expect(line.startsWith('session kept')).toBe(true);
    expect(line).toContain('the agent wrote no handoff');
    // Ticket 05's rule survives: `/compact` is in the palette and nothing here suggests it.
    expect(line).not.toContain('/compact');
  });

  it('lands in the transcript with the note the agent wrote, so it can be opened', () => {
    const state = reduce(initialState, {
      type: 'event',
      event: {
        ...compacted,
        how: 'handoff',
        handoff: 'Migrating the old call sites; four left in checkout.',
        handoffPath: '/handoffs/alice-40.md',
      },
    });
    expect(state.items).toMatchObject([
      {
        kind: 'compaction',
        agentId: 'alice',
        how: 'handoff',
        handoff: 'Migrating the old call sites; four left in checkout.',
        handoffPath: '/handoffs/alice-40.md',
      },
    ]);
  });

  it('is emphasised in the activity column only when nothing happened', () => {
    const worked = reduce(initialState, { type: 'event', event: { ...compacted, how: 'command' } });
    const kept = reduce(initialState, {
      type: 'event',
      event: { ...compacted, how: 'refused', reason: 'the agent wrote no handoff' },
    });
    expect(worked.feed[0]?.emphasis).toBe(false);
    expect(kept.feed[0]?.emphasis).toBe(true);
  });

  it('comes back on a team switch, in the transcript and in the column alike', () => {
    const state = reduce(initialState, {
      type: 'snapshot',
      snapshot: {
        team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 10 },
        teams: [],
        agents: [],
        moreAbove: false,
        statuses: {},
        commands: {},
        usage: {},
        injection: {},
        handbooks: {},
        messages: [],
        answers: [],
        permissions: [],
        turnsThisPrompt: 0,
        demoMode: false,
        log: {
          running: [],
          tools: [],
          turns: [],
          compactions: [
            {
              agentId: 'alice',
              at: 40,
              how: 'handoff',
              used: 110_000,
              ceiling: 120_000,
              measured: false,
              handoff: 'Migrating the old call sites.',
            },
          ],
        },
      },
    });
    expect(state.items).toMatchObject([{ kind: 'compaction', how: 'handoff' }]);
    expect(state.feed[0]?.text).toContain('fresh session');
  });
});

/**
 * Issue 07's answer, and issue 11's. Both turn on the same one fact — that a turn was started by
 * a clock and not by the person the bubble is drawn as — which `promptFromRoutine` records on the
 * `messages` row. One fact, two uses.
 */
describe('a turn a clock started', () => {
  const base = {
    team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 6 },
    teams: [],
    agents: [],
    moreAbove: false,
    statuses: {},
    commands: {},
    usage: {},
    log: { running: [], tools: [], turns: [], compactions: [] },
    injection: {},
    handbooks: {},
    answers: [],
    turnsThisPrompt: 0,
    demoMode: false,
    permissions: [],
  };

  const { routineRunId: _run, ...ordinary } = {
    id: 'm_routine',
    teamId: 'team',
    fromAgentId: null,
    toAgentId: 'alice',
    body: 'run the typecheck and say what broke',
    at: 300,
    routineRunId: 'run_1',
  } as const;

  const fired = {
    id: 'm_routine',
    teamId: 'team',
    fromAgentId: null,
    toAgentId: 'alice',
    body: 'run the typecheck and say what broke',
    at: 300,
    routineRunId: 'run_1',
  } as const;

  it('draws the prompt in the user own voice, under a system line naming the Routine', () => {
    const state = reduce(initialState, {
      type: 'snapshot',
      snapshot: {
        ...base,
        messages: [fired],
        routineOrigins: { run_1: 'nightly typecheck' },
      },
    });

    // The words are the user's — they authored them and nobody else said them. What the bubble
    // gets wrong is *when*, and that is the whole of what the line above it discloses. No fourth
    // voice: `system` is not a voice, and it exists to carry exactly this kind of fact.
    expect(state.items.map((item) => item.kind)).toEqual(['system', 'user']);
    expect(state.items[0]).toMatchObject({
      kind: 'system',
      text: 'routine · nightly typecheck',
      agentId: 'alice',
    });
  });

  it('says nothing above an ordinary prompt', () => {
    const state = reduce(initialState, {
      type: 'snapshot',
      // Absent rather than `undefined`: a message nobody scheduled has no origin at all.
      snapshot: { ...base, messages: [ordinary] },
    });

    expect(state.items.map((item) => item.kind)).toEqual(['user']);
  });

  it('names it on a message that arrives live, not only on one that is restored', () => {
    const state = reduce(reduce(initialState, { type: 'snapshot', snapshot: { ...base, messages: [] } }), {
      type: 'message',
      message: fired,
      routineName: 'nightly typecheck',
    });

    expect(state.items.map((item) => item.kind)).toEqual(['system', 'user']);
    // Remembered, so a re-render and a page above it draw the same line the live one did.
    expect(state.routineOrigins).toEqual({ run_1: 'nightly typecheck' });
  });

  it('leaves an unread mark, and opening that agent pane is the only thing that clears it', () => {
    const state = reduce(initialState, {
      type: 'snapshot',
      snapshot: { ...base, messages: [], unread: ['alice', 'bob'] },
    });
    expect(state.unread).toEqual(['alice', 'bob']);

    const opened = reduce(state, { type: 'seen', agentId: 'alice' });

    expect(opened.unread).toEqual(['bob']);
  });
});

/**
 * Issue 05's 2026-08-30 amendment, and the control that pays for it.
 *
 * An agent arms what it schedules now, so the only thing standing between that and an agent
 * quietly giving itself a job at 03:00 is that **a person is told, where it happened**. These
 * are the claims that keeps: it opens in the turn that did it, it survives a relaunch, and it
 * never disappears once answered.
 */
describe('an agent that put itself on a schedule', () => {
  const base = {
    team: { id: 'team', name: 'checkout', workspacePath: '/repo', turnBudget: 6 },
    teams: [],
    agents: [],
    moreAbove: false,
    statuses: {},
    commands: {},
    usage: {},
    log: { running: [], tools: [], turns: [], compactions: [] },
    injection: {},
    handbooks: {},
    messages: [],
    answers: [],
    turnsThisPrompt: 0,
    demoMode: false,
    permissions: [],
  };

  const scheduled = {
    routineId: 'rt_1',
    agentId: 'alice',
    name: 'nightly typecheck',
    schedule: 'every day at 09:00',
    frequency: '1 firing a day',
    at: 400,
    armed: true,
  };

  it('opens a block in the transcript when it happens', () => {
    const state = reduce(reduce(initialState, { type: 'snapshot', snapshot: base }), {
      type: 'scheduled',
      scheduled,
    });

    expect(state.items).toMatchObject([
      { kind: 'routine', agentId: 'alice', name: 'nightly typecheck', frequency: '1 firing a day' },
    ]);
    expect(state.routineArmed).toEqual({ rt_1: true });
  });

  it('comes back with the transcript, because the Routine is the record', () => {
    // A disclosure the user could miss by being on another team when it happened would not be
    // one. Restored from the rows rather than from the event that announced it.
    const state = reduce(initialState, {
      type: 'snapshot',
      snapshot: { ...base, scheduled: [scheduled] },
    });

    expect(state.items).toMatchObject([{ kind: 'routine', routineId: 'rt_1' }]);
    expect(state.routineArmed).toEqual({ rt_1: true });
  });

  it('says so rather than vanishing once the user disarms it', () => {
    const opened = reduce(initialState, {
      type: 'snapshot',
      snapshot: { ...base, scheduled: [scheduled] },
    });

    const answered = reduce(opened, { type: 'routineArmed', routineId: 'rt_1', armed: false });

    // The transcript is a record of what happened here. A block that disappeared would take the
    // fact that an agent scheduled anything at all with it.
    expect(answered.items).toMatchObject([{ kind: 'routine', routineId: 'rt_1' }]);
    expect(answered.routineArmed).toEqual({ rt_1: false });
  });

  it('is written once, however many times it is announced', () => {
    const once = reduce(reduce(initialState, { type: 'snapshot', snapshot: base }), {
      type: 'scheduled',
      scheduled,
    });
    const twice = reduce(once, { type: 'scheduled', scheduled });

    expect(twice.items).toHaveLength(1);
  });

  /**
   * An agent writing into its own persona. The same three claims as above, for the same reason:
   * the write is only allowed because it is disclosed where it happened, so the disclosure has
   * to survive a team switch and must not be rewritten afterwards.
   */
  const write = {
    id: 'w1',
    agentId: 'alice',
    at: 500,
    kind: 'recorded' as const,
    entries: [
      { id: 'e1', ordinal: 1, text: 'nothing ships on a Friday', source: 'told' as const, at: 500, removed: false },
    ],
    withdrew: [],
  };

  it('opens a Handbook block in the turn that wrote it', () => {
    const state = reduce(reduce(initialState, { type: 'snapshot', snapshot: base }), {
      type: 'handbookWrite',
      write,
    });

    expect(state.items).toMatchObject([{ kind: 'handbook', agentId: 'alice', write: 'recorded' }]);
  });

  it('comes back with the transcript, and once however often it is announced', () => {
    const restored = reduce(initialState, {
      type: 'snapshot',
      snapshot: { ...base, handbook: [write] },
    });
    expect(restored.items).toMatchObject([{ kind: 'handbook', id: 'w1' }]);

    expect(reduce(restored, { type: 'handbookWrite', write }).items).toHaveLength(1);
  });

  it('keeps the line after the entry is removed, and drops only the control', () => {
    const opened = reduce(initialState, {
      type: 'snapshot',
      snapshot: { ...base, handbook: [write] },
    });

    const after = reduce(opened, { type: 'handbookRemoved', entryId: 'e1' });

    expect(after.items).toMatchObject([{ kind: 'handbook', id: 'w1' }]);
    expect(after.items[0]).toMatchObject({ entries: [{ id: 'e1', removed: true }] });
  });

  /**
   * The Handbook itself follows both live paths, because it is the one part of the persona that
   * changes while somebody is watching it. Standing instructions move only through a dialog that
   * refreshes the snapshot on its way out; nothing refreshes when an agent records something
   * mid-turn, so a panel and a gauge row read only at snapshot would both sit at nothing for the
   * whole of the session in which the agent was first briefed.
   */
  it('adds what was written and takes what the same call withdrew', () => {
    const opened = reduce(initialState, { type: 'snapshot', snapshot: base });

    const after = reduce(opened, { type: 'handbookWrite', write });
    expect(after.handbooks.alice?.map((entry) => entry.text)).toEqual([
      'nothing ships on a Friday',
    ]);

    // A correction is one act: what it adds and what it takes away land together.
    const corrected = reduce(after, {
      type: 'handbookWrite',
      write: {
        ...write,
        id: 'w2',
        entries: [
          {
            id: 'e2',
            ordinal: 2,
            text: 'they ship on Thursdays',
            source: 'noticed' as const,
            at: 500,
            removed: false,
          },
        ],
        withdrew: [write.entries[0]!],
      },
    });
    expect(corrected.handbooks.alice?.map((entry) => entry.text)).toEqual([
      'they ship on Thursdays',
    ]);
  });

  it('takes the entry out when the user removes it, whoever holds it', () => {
    const opened = reduce(reduce(initialState, { type: 'snapshot', snapshot: base }), {
      type: 'handbookWrite',
      write,
    });

    const after = reduce(opened, { type: 'handbookRemoved', entryId: 'e1' });
    expect(after.handbooks.alice).toEqual([]);

    // Already gone, so a second removal is a no-op rather than an error.
    expect(reduce(after, { type: 'handbookRemoved', entryId: 'e1' }).handbooks.alice).toEqual([]);
  });

  it('changes nothing when the Handbook was full, because nothing was recorded', () => {
    const opened = reduce(reduce(initialState, { type: 'snapshot', snapshot: base }), {
      type: 'handbookWrite',
      write,
    });

    const after = reduce(opened, {
      type: 'handbookWrite',
      write: { id: 'w9', agentId: 'alice', at: 900, kind: 'full' as const, entries: [], withdrew: [] },
    });

    expect(after.handbooks.alice?.map((entry) => entry.text)).toEqual([
      'nothing ships on a Friday',
    ]);
  });
});

/**
 * The `blobot:team` channel says more than "the team changed": a cold start reports every agent
 * as it comes up, and a Routine being proposed reports itself the same way. Resetting the pane
 * on all of those threw the agent the user had just clicked back to the team pane, mid-start,
 * which is exactly when a cold team sends the most of them.
 */
describe('which pane a snapshot leaves you in', () => {
  const roster = [{ id: 'alice' }, { id: 'bob' }];

  it('keeps the agent you clicked while the team is still coming up', () => {
    const open = { kind: 'agent', agentId: 'alice' } as const;

    expect(paneAfterSnapshot({ open, arrived: false, roster })).toEqual(open);
  });

  it('resets to the team when a different team arrives', () => {
    expect(
      paneAfterSnapshot({ open: { kind: 'agent', agentId: 'alice' }, arrived: true, roster }),
    ).toEqual({ kind: 'team' });
  });

  it('resets when the agent is no longer on the roster', () => {
    // An edit took them off the team. The pane they were in is not a place any more.
    expect(
      paneAfterSnapshot({
        open: { kind: 'agent', agentId: 'carol' },
        arrived: false,
        roster,
      }),
    ).toEqual({ kind: 'team' });
  });

  it('honours the navigator once the roster naming that agent has arrived', () => {
    expect(
      paneAfterSnapshot({ open: { kind: 'team' }, arrived: true, roster, wanted: 'bob' }),
    ).toEqual({ kind: 'agent', agentId: 'bob' });

    expect(
      paneAfterSnapshot({ open: { kind: 'team' }, arrived: true, roster, wanted: 'carol' }),
    ).toEqual({ kind: 'team' });
  });
});
