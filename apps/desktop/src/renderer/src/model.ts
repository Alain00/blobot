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
      return {
        ...state,
        snapshot: action.snapshot,
        statuses: { ...action.snapshot.statuses },
        turnsThisPrompt: action.snapshot.turnsThisPrompt,
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
  const item: Item =
    message.fromAgentId === null
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
  return { ...state, items: [...state.items, item] };
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
    case 'turn_ended':
      return {
        ...state,
        feed: pushFeed(state.feed, {
          id: `${event.turnId}:${event.agentId}:${event.at}`,
          at: event.at,
          agentId: event.agentId,
          text: `turn ended · ${event.stopReason}`,
          emphasis: event.stopReason !== 'end_turn',
        }),
      };
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
