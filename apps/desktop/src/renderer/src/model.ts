import { findAgentByName } from '@blobot/core/domain';
import type { Agent, AgentEvent, AgentStatus, Message } from '@blobot/core/domain';
import type {
  UiPermissionOutcome,
  UiPermissionRequest,
  UiCommand,
  UiSnapshot,
} from '../../shared/api.js';

/** What a conversation pane is showing: one agent's session, or the whole team's stream. */
export type Pane = { readonly kind: 'team' } | { readonly kind: 'agent'; readonly agentId: string };

export type Item =
  /**
   * Something the user said. `agentIds` rather than one id, because one thing typed once can
   * address several agents — the store has a row each, and the team pane draws the bubble the
   * user actually sent. See {@link itemsFor}, which is where the rows become the one bubble.
   */
  | { kind: 'user'; id: string; at: number; agentIds: readonly string[]; text: string }
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
      /**
       * `asking` is a call that has not started: the runtime is waiting for a human. The line
       * is not drawn in that state, because the permission block underneath it *is* the line,
       * and a tool that says `running` while nothing is running is the exact lie ticket 08
       * spent a mock on.
       */
      status: 'asking' | 'running' | 'completed' | 'failed';
      exit?: number | null;
    }
  | { kind: 'system'; id: string; at: number; agentId: string; text: string }
  /**
   * A tool call an agent is blocked on. It is an item rather than a banner because it belongs
   * where the turn stopped: two agents can be waiting at once, and the team pane has to say
   * which one is asking and what about.
   */
  | {
      kind: 'permission';
      id: string;
      at: number;
      agentId: string;
      /** The call this is about, which is the tool line it stands in for. */
      toolCallId: string;
      title: string;
      canAllow: boolean;
      canAllowAlways: boolean;
      /** Absent while it is still standing there. Present is a record of what you answered. */
      outcome?: UiPermissionOutcome;
    };

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
  /** The slash menu each agent offers, by agent id. Per session, so it is not on `UiAgent`. */
  commands: Record<string, readonly UiCommand[]>;
  items: Item[];
  feed: FeedEntry[];
  budget: { used: number; budget: number } | undefined;
}

export type Action =
  | { type: 'snapshot'; snapshot: UiSnapshot }
  | { type: 'event'; event: AgentEvent }
  | { type: 'status'; agentId: string; status: AgentStatus }
  | { type: 'commands'; agentId: string; commands: readonly UiCommand[] }
  | { type: 'message'; message: Message }
  | { type: 'budget'; used: number; budget: number }
  | { type: 'turns'; turnsThisPrompt: number }
  | { type: 'permission'; request: UiPermissionRequest; at: number }
  | { type: 'permissionSettled'; id: string; outcome: UiPermissionOutcome };

export const initialState: AppState = {
  snapshot: undefined,
  turnsThisPrompt: 0,
  statuses: {},
  commands: {},
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
        // Replaced rather than merged, and it can be: the snapshot carries every live team's
        // agents, not just the one on screen. So this both seeds the rail's other rows and
        // forgets a team the pool has since unloaded, which is the correct thing to forget.
        statuses: { ...action.snapshot.statuses },
        commands: { ...action.snapshot.commands },
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
          // A question nobody has answered is still being asked, so it comes back with the
          // pane. It sorts to the end because that is where the turn is standing.
          ...action.snapshot.permissions.map(
            (request): Item => ({
              kind: 'permission',
              id: request.id,
              at: Date.now(),
              agentId: request.agentId,
              toolCallId: request.toolCallId,
              title: request.title,
              canAllow: request.canAllow,
              canAllowAlways: request.canAllowAlways,
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
    case 'commands':
      // Replace, never merge. A provider's advertisement is authoritative all the way down:
      // merging here would undo the same rule the adapter keeps.
      return { ...state, commands: { ...state.commands, [action.agentId]: action.commands } };
    case 'budget':
      return { ...state, budget: { used: action.used, budget: action.budget } };
    case 'permission': {
      if (state.items.some((item) => item.id === action.request.id)) return state;
      return {
        ...state,
        items: [
          ...state.items.map((item) =>
            item.kind === 'tool' && item.id === action.request.toolCallId
              ? { ...item, status: 'asking' as const }
              : item,
          ),
          {
            kind: 'permission',
            id: action.request.id,
            at: action.at,
            agentId: action.request.agentId,
            toolCallId: action.request.toolCallId,
            title: action.request.title,
            canAllow: action.request.canAllow,
            canAllowAlways: action.request.canAllowAlways,
          },
        ],
      };
    }
    case 'permissionSettled': {
      const index = state.items.findIndex(
        (item) => item.kind === 'permission' && item.id === action.id,
      );
      if (index < 0) return state;
      const existing = state.items[index] as Extract<Item, { kind: 'permission' }>;
      // Allowed, the call finally starts, so its line comes back. Rejected, the runtime reports
      // a failed tool a moment later and the line leaves the conversation the usual way.
      const items = state.items.map((item) =>
        item.kind === 'tool' &&
        item.status === 'asking' &&
        (action.outcome === 'allowed' || action.outcome === 'allowed_always')
          ? { ...item, status: 'running' as const }
          : item,
      );
      // Answered rather than removed: the transcript should still say a question was asked and
      // what you said to it, in the place it interrupted.
      items[index] = { ...existing, outcome: action.outcome };
      return { ...state, items };
    }
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
          agentIds: [message.toAgentId],
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
      // The two announcements race. A permission request travels a callback and the tool's own
      // event travels the turn's queue, so either can reach the renderer first, and a call the
      // user is being asked about must not print `running` whichever way round they land.
      const asked = state.items.some(
        (item) =>
          item.kind === 'permission' &&
          item.toolCallId === event.toolCallId &&
          item.outcome === undefined,
      );
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
            status: asked ? 'asking' : 'running',
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
            : item.kind === 'user'
              ? item.agentIds.includes(pane.agentId)
              : item.agentId === pane.agentId,
        );
  return oneBubblePerThingTyped(visible.sort((left, right) => left.at - right.at));
}

/**
 * The rows the user's fan-out committed, drawn as the one message they typed.
 *
 * `@alice @bob` is two `messages` rows — that is ticket 05, and it does not bend — and two
 * identical bubbles a millisecond apart read as a rendering fault. So the *view* groups what the
 * store rightly keeps apart: same text, same timestamp, one bubble, tagged with everybody it
 * went to. Filtering runs first, so an agent's own pane keeps seeing one message addressed to
 * one agent, which is what it is from where that pane stands.
 *
 * Grouping on `(text, at)` is a heuristic and worth naming as one: the timestamp is a single
 * read of the clock in `promptFromUser`, so a genuine second dispatch of identical words would
 * have to land inside the same millisecond to be merged wrongly.
 */
function oneBubblePerThingTyped(items: readonly Item[]): Item[] {
  const grouped: Item[] = [];
  for (const item of items) {
    const previous = grouped.at(-1);
    if (
      item.kind === 'user' &&
      previous?.kind === 'user' &&
      previous.at === item.at &&
      previous.text === item.text
    ) {
      grouped[grouped.length - 1] = {
        ...previous,
        agentIds: [...previous.agentIds, ...item.agentIds],
      };
      continue;
    }
    grouped.push(item);
  }
  return grouped;
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

/**
 * What the composer's `/` menu shows, and why it shows nothing when it shows nothing.
 *
 * Pure, and separate from the component, because every interesting question here is a decision
 * rather than a rendering: when a `/` is a command and when it is prose, whose commands they
 * are, and which of the two empty states the user is looking at.
 */
export interface CommandMenu {
  readonly suggestions: readonly UiCommand[];
  /** Shown instead of rows, and never selectable: Enter must keep sending. */
  readonly note?: string;
}

/**
 * Who a message is addressed to: the **leading run** of mentions.
 *
 * Mentions before the first ordinary word are the recipients — the To: line, where the eye
 * already looks. A mention anywhere after that is a *reference*, so `ask @bob about @alice's
 * branch` reaches Bob alone, which is the misfire the rule exists to prevent.
 *
 * This replaced ticket 12's **last valid mention wins**, and its second reopen records that.
 * `ship it @bob` no longer sends to Bob: keeping it would have meant two addressing rules, the
 * second existing only to preserve a behaviour that was hours old.
 *
 * Naming several is a fan-out, not a broadcast. Each named agent gets the whole message, mention
 * tokens and all — splitting `@alice do the UI, @bob do the API` into clauses would be blobot
 * deciding which half is whose, which is inference, and Bob seeing what Alice was asked is what
 * stops him doing it twice.
 *
 * An unresolved mention inside the run does not end it: `@alic @bob hi` reaches Bob, and the
 * field draws `@alic` as the dud it is.
 */
export function addressedBy(draft: string, roster: readonly Agent[]): Agent[] {
  const leading = /^[\s]*((?:@[\w-]+\s*)+)/.exec(draft)?.[1];
  if (leading === undefined) return [];
  const named = [...leading.matchAll(/@([\w-]+)/g)].map((match) =>
    findAgentByName(roster, match[1] ?? ''),
  );
  const found = named.filter((agent): agent is Agent => agent !== undefined);
  // The same agent twice is one recipient: two rows would be the same words delivered to one
  // session twice, and the second is not a second instruction.
  return found.filter((agent, index) => found.findIndex((it) => it.id === agent.id) === index);
}

/**
 * Whether a mention at this offset is addressing the message or merely naming somebody.
 *
 * The field draws the difference, because an underline that means "this is going to them" must
 * not appear over a name that is only being talked about.
 */
export function isAddressing(draft: string, offset: number): boolean {
  const leading = /^[\s]*((?:@[\w-]+\s*)+)/.exec(draft)?.[0];
  return leading !== undefined && offset < leading.length;
}

/**
 * A slash command is only a slash command at the very start of the message.
 *
 * That is what the CLI parses — blobot passes the user's text through verbatim, so `/foo`
 * arrives as the first characters — and it is the only rule that survives contact with prose:
 * `src/auth.ts` and `and/or` are not somebody reaching for a menu. A space ends it, because
 * what follows is the command's argument.
 */
export function slashPartial(draft: string): string | undefined {
  return /^\/([\w:-]*)$/.exec(draft)?.[1];
}

export function commandMenu(options: {
  readonly draft: string;
  readonly dismissed: boolean;
  /** Undefined in the team pane until a mention resolves. */
  readonly recipientName: string | undefined;
  readonly offered: readonly UiCommand[];
}): CommandMenu {
  const partial = slashPartial(options.draft);
  if (partial === undefined || options.dismissed) return { suggestions: [] };

  // A command belongs to a session, and in the team pane there is no session until the message
  // is addressed. This is the precondition send already has, said out loud.
  if (options.recipientName === undefined) {
    return { suggestions: [], note: 'Say who with @ first. Commands belong to one teammate.' };
  }
  // A real answer, not a spinner: a session that has not held a turn may offer none. It is
  // never primed with a throwaway prompt to make the menu look populated, because that spends
  // a real turn of the user's tokens on decoration.
  if (options.offered.length === 0) {
    return { suggestions: [], note: `${options.recipientName} has not offered any commands yet` };
  }

  // A typo is not an empty state. It closes the menu, exactly as `@zz` does.
  return {
    suggestions: options.offered.filter((command) =>
      command.name.toLowerCase().startsWith(partial.toLowerCase()),
    ),
  };
}
