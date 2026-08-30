import type { AgentEvent, AgentStatus, Message } from '@blobot/core/domain';
import type { UiSnapshot } from '../../shared/api.js';

/** What a conversation pane is showing: one agent's session, or the whole team's stream. */
export type Pane = { readonly kind: 'team' } | { readonly kind: 'agent'; readonly agentId: string };

export type Item =
  | { kind: 'user'; id: string; at: number; agentId: string; text: string }
  | { kind: 'agent'; id: string; at: number; agentId: string; text: string; live: boolean }
  | {
      kind: 'peer';
      id: string;
      at: number;
      fromId: string;
      toId: string;
      text: string;
      context?: string;
    }
  | {
      kind: 'tool';
      id: string;
      at: number;
      agentId: string;
      title: string;
      status: 'running' | 'completed' | 'failed';
      exit?: number | null;
    }
  | { kind: 'system'; id: string; at: number; agentId: string; text: string };

/**
 * Two items in a row from the same voice are one turn, and a turn is labelled once. Only the
 * agent voice groups: `user` is right-aligned and needs no name, and a peer enclosure carries a
 * route header that is the whole point of the container.
 */
export function continuesSpeaker(item: Item, previous: Item | undefined): boolean {
  if (previous === undefined) return false;
  if (item.kind !== 'agent') return false;
  return previous.kind === 'agent' && previous.agentId === item.agentId;
}

/**
 * Whether the transcript should show this agent as about to speak.
 *
 * Sending used to change nothing in the conversation: the blobatar started moving and the rail
 * changed a word, but the stream sat exactly as it was until the first delta landed, which on a
 * real runtime is several seconds of a screen that looks like the message went nowhere.
 *
 * It stops the moment there is a live message to watch instead, so the dots never sit under
 * text that is already streaming. `responding` is excluded for that reason, and `waiting` and
 * `failed` are excluded because those are states a human has to act on, not wait through.
 */
export function isPending(
  status: AgentStatus,
  items: readonly Item[],
  agentId: string,
): boolean {
  if (status !== 'starting' && status !== 'thinking' && status !== 'working') return false;
  return !items.some((item) => item.kind === 'agent' && item.agentId === agentId && item.live);
}

/** What an agent last said, for the rail's preview line. Undefined until it has spoken. */
export interface LastLine {
  readonly text: string;
  readonly at: number;
}

/**
 * The last thing this agent said, in its own words — never the user's, and never a peer's.
 * The rail row is that agent, so a line on it that somebody else wrote would be read as theirs.
 * Collapsed to one line here rather than in CSS: a preview of markdown that keeps its newlines
 * is a preview with a blank second half.
 */
export function lastLineOf(items: readonly Item[], agentId: string): LastLine | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as Item;
    if (item.kind !== 'agent' || item.agentId !== agentId) continue;
    const text = item.text.replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    return { text, at: item.at };
  }
  return undefined;
}

export interface FeedEntry {
  readonly id: string;
  readonly at: number;
  readonly agentId?: string;
  readonly text: string;
  readonly emphasis?: boolean;
}

export interface AppState {
  snapshot: UiSnapshot | undefined;
  turnsThisPrompt: number;
  statuses: Record<string, AgentStatus>;
  items: Item[];
  feed: FeedEntry[];
  budget: { used: number; budget: number } | undefined;
}

export type Action =
  | { type: 'snapshot'; snapshot: UiSnapshot }
  | { type: 'event'; event: AgentEvent }
  | { type: 'status'; agentId: string; status: AgentStatus }
  | { type: 'message'; message: Message }
  | { type: 'budget'; used: number; budget: number }
  | { type: 'turns'; turnsThisPrompt: number };

export const initialState: AppState = {
  snapshot: undefined,
  turnsThisPrompt: 0,
  statuses: {},
  items: [],
  feed: [],
  budget: undefined,
};

/**
 * blobot's own `message_agent` tool. Its lifecycle is real — a peer message *is* an MCP call —
 * but the conversation renders it as the dashed peer enclosure instead, from the orchestrator's
 * message record. Matching on the name is the seam ticket 04 warned about: the clean version is
 * for the adapter to tag its own tool so the UI never has to know a name at all.
 */
const OWN_TOOL = /(^|_)message_agent$/;

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'snapshot':
      // A snapshot replaces the pane rather than adding to it: it arrives at launch and on
      // every team switch, and a persisted transcript is only visible if it is seeded here.
      // Messages and answers are merged by time: a restored pane that showed the peer traffic
      // and not the replies would read as a conversation with half the speakers missing.
      // Tool lines are not restored — they are what the agent is doing *now*.
      return {
        ...state,
        snapshot: action.snapshot,
        statuses: { ...action.snapshot.statuses },
        turnsThisPrompt: action.snapshot.turnsThisPrompt,
        items: [
          ...action.snapshot.messages.map(toItem),
          ...action.snapshot.answers.map(
            (answer): Item => ({
              kind: 'agent',
              id: answer.id,
              at: answer.at,
              agentId: answer.agentId,
              text: answer.text,
              live: false,
            }),
          ),
        ].sort((left, right) => left.at - right.at),
        feed: [],
        budget: undefined,
      };
    case 'turns':
      return { ...state, turnsThisPrompt: action.turnsThisPrompt };
    case 'status':
      return { ...state, statuses: { ...state.statuses, [action.agentId]: action.status } };
    case 'budget':
      return { ...state, budget: { used: action.used, budget: action.budget } };
    case 'message':
      return applyMessage(state, action.message);
    case 'event':
      return applyEvent(state, action.event);
  }
}

function applyMessage(state: AppState, message: Message): AppState {
  if (state.items.some((item) => item.id === message.id)) return state;
  return { ...state, items: [...state.items, toItem(message)] };
}

/** One committed Message as the pane draws it: the user's voice, or a peer's. */
function toItem(message: Message): Item {
  return message.fromAgentId === null
      ? {
          kind: 'user',
          id: message.id,
          at: message.at,
          agentId: message.toAgentId,
          text: message.body,
        }
      : {
          kind: 'peer',
          id: message.id,
          at: message.at,
          fromId: message.fromAgentId,
          toId: message.toAgentId,
          text: message.body,
          ...(message.context === undefined ? {} : { context: message.context }),
        };
}

function applyEvent(state: AppState, event: AgentEvent): AppState {
  switch (event.type) {
    case 'agent_message_delta': {
      const items = [...state.items];
      const index = lastIndexOf(
        items,
        (item) => item.kind === 'agent' && item.agentId === event.agentId && item.live,
      );
      if (index >= 0) {
        const existing = items[index] as Extract<Item, { kind: 'agent' }>;
        items[index] = { ...existing, text: existing.text + event.text };
      } else {
        items.push({
          kind: 'agent',
          id: `${event.messageId}:${event.at}`,
          at: event.at,
          agentId: event.agentId,
          text: event.text,
          live: true,
        });
      }
      return { ...state, items };
    }
    case 'agent_message_completed': {
      const items = [...state.items];
      const index = lastIndexOf(
        items,
        (item) => item.kind === 'agent' && item.agentId === event.agentId && item.live,
      );
      if (index < 0) return state;
      const existing = items[index] as Extract<Item, { kind: 'agent' }>;
      items[index] = { ...existing, text: event.text, live: false };
      return { ...state, items };
    }
    case 'tool_call_started': {
      if (OWN_TOOL.test(event.title)) return state;
      return {
        ...state,
        items: [
          ...state.items,
          {
            kind: 'tool',
            id: event.toolCallId,
            at: event.at,
            agentId: event.agentId,
            title: event.title,
            status: 'running',
          },
        ],
      };
    }
    case 'tool_call_updated': {
      if (event.status !== 'completed' && event.status !== 'failed') return state;
      const index = state.items.findIndex(
        (item) => item.kind === 'tool' && item.id === event.toolCallId,
      );
      if (index < 0) return state;
      const existing = state.items[index] as Extract<Item, { kind: 'tool' }>;
      // Tool activity is the seam: the in-flight line lives in the conversation and leaves it
      // when the tool finishes; the completion goes to the feed. The conversation shows what
      // the agent is doing *now*, the feed is the log.
      return {
        ...state,
        items: state.items.filter((item) => item !== existing),
        feed: pushFeed(state.feed, {
          id: `${event.toolCallId}:done`,
          at: event.at,
          agentId: event.agentId,
          // A cancelled tool reports `completed` with `exit: null`, so the exit code is
          // printed rather than trusted.
          text: `${existing.title} ${event.status}${event.exit === null ? ' (exit null)' : ''}`,
        }),
      };
    }
    case 'turn_ended': {
      // A turn that ended the ordinary way is log, and the log is the feed. A turn that
      // stopped for any other reason is part of the conversation — the reader is looking at
      // an answer that just stopped being written, and the reason belongs next to it rather
      // than in a column they may not be watching.
      const unusual = event.stopReason !== 'end_turn';
      return {
        ...state,
        items: unusual
          ? [
              ...state.items,
              {
                kind: 'system',
                id: `${event.turnId}:${event.agentId}:${event.at}:stopped`,
                at: event.at,
                agentId: event.agentId,
                text: `turn stopped · ${event.stopReason.replace(/_/g, ' ')}`,
              },
            ]
          : state.items,
        feed: pushFeed(state.feed, {
          id: `${event.turnId}:${event.agentId}:${event.at}`,
          at: event.at,
          agentId: event.agentId,
          text: `turn ended · ${event.stopReason}`,
          emphasis: unusual,
        }),
      };
    }
    case 'error':
      return {
        ...state,
        items: [
          ...state.items,
          {
            kind: 'system',
            id: `${event.agentId}:${event.at}:error`,
            at: event.at,
            agentId: event.agentId,
            text: event.message,
          },
        ],
        feed: pushFeed(state.feed, {
          id: `${event.agentId}:${event.at}:error`,
          at: event.at,
          agentId: event.agentId,
          text: event.message,
          emphasis: true,
        }),
      };
    // Thinking has no pane of its own yet, usage has no gauge yet, and the peer message is
    // rendered from its record rather than from this announcement.
    case 'agent_thought_delta':
    case 'usage_updated':
    case 'agent_message_sent':
      return state;
  }
}

function pushFeed(feed: FeedEntry[], entry: FeedEntry): FeedEntry[] {
  if (feed.some((existing) => existing.id === entry.id)) return feed;
  return [entry, ...feed].slice(0, 200);
}

function lastIndexOf(items: readonly Item[], predicate: (item: Item) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as Item)) return index;
  }
  return -1;
}

/**
 * An agent's pane is that agent's session as the runtime sees it — so a peer message appears
 * in both panes, once as `sent to Bob` and once as `from Alice`. That is not a duplication bug:
 * both sessions genuinely contain it. The team stream is the derived view, so it is the one
 * that de-duplicates, showing each peer message once at its crossing.
 */
export function itemsFor(items: readonly Item[], pane: Pane): Item[] {
  const visible =
    pane.kind === 'team'
      ? [...items]
      : items.filter((item) =>
          item.kind === 'peer'
            ? item.fromId === pane.agentId || item.toId === pane.agentId
            : item.agentId === pane.agentId,
        );
  return visible.sort((left, right) => left.at - right.at);
}

/**
 * A team has a status too, folded from its members with ticket 09's precedence — so the team
 * item shouts when any agent is blocked on the user, even with the rail out of attention.
 */
export function foldTeamStatus(statuses: readonly AgentStatus[]): {
  status: AgentStatus;
  label: string;
} {
  const count = (wanted: AgentStatus): number =>
    statuses.filter((status) => status === wanted).length;
  const order: AgentStatus[] = ['waiting', 'failed', 'working', 'responding', 'thinking', 'starting'];
  for (const status of order) {
    const n = count(status);
    if (n > 0) return { status, label: `${n} ${status}` };
  }
  return { status: 'idle', label: 'all idle' };
}
