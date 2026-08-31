import { findAgentByName } from '@blobot/core/domain';
import type {
  Agent,
  AgentEvent,
  AgentStatus,
  Message,
  StopReason,
  ToolKind,
} from '@blobot/core/domain';
import type {
  UiAgentMessage,
  UiAttachment,
  UiPermissionOutcome,
  UiPermissionRequest,
  UiCommand,
  UiInjection,
  UiLog,
  UiHandbookEntry,
  UiHandbookWrite,
  UiScheduledRoutine,
  UiSnapshot,
  UiUsage,
} from '../../shared/api.js';

/** What a conversation pane is showing: one agent's session, or the whole team's stream. */
export type Pane = { readonly kind: 'team' } | { readonly kind: 'agent'; readonly agentId: string };

export type Item =
  /**
   * Something the user said. `agentIds` rather than one id, because one thing typed once can
   * address several agents — the store has a row each, and the team pane draws the bubble the
   * user actually sent. See {@link itemsFor}, which is where the rows become the one bubble.
   */
  | {
      kind: 'user';
      id: string;
      at: number;
      agentIds: readonly string[];
      text: string;
      /** What went with it. Drawn in the bubble, because a message must not lose half of itself. */
      attachments?: readonly UiAttachment[];
    }
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
       * What the call is, in the four words blobot has for it. The runtimes both send this and
       * the renderer used to drop it, so every call in the transcript was a shell string with
       * no verb in front of it. It is the column that makes a folded run of calls scannable.
       */
      toolKind: ToolKind;
      /**
       * `asking` is a call that has not started: the runtime is waiting for a human. The line
       * is not drawn in that state, because the permission block underneath it *is* the line,
       * and a tool that says `running` while nothing is running is the exact lie ticket 08
       * spent a mock on.
       */
      status: 'asking' | 'running' | 'completed' | 'failed';
      exit?: number | null;
      /**
       * What the edit changed, in lines. Absent is not zero, and the three ways it can be
       * absent — nothing changed, the diff was too large to measure, the runtime sends no diff
       * block — all draw the same nothing.
       */
      changed?: { added: number; removed: number };
    }
  | { kind: 'system'; id: string; at: number; agentId: string; text: string }
  /**
   * blobot chose a moment and something came of it.
   *
   * Its own kind rather than a `system` line, for one reason: on a handoff it carries the note
   * the agent wrote for itself, and that note is the whole argument for preferring a restart to
   * an opaque `/compact`. A line that only said a session had been replaced would be asking the
   * reader to take blobot's word for what survived.
   */
  | {
      kind: 'compaction';
      id: string;
      at: number;
      agentId: string;
      how: 'command' | 'handoff' | 'refused';
      /** Occupancy when blobot decided, and what it decided against. Both drawn, as ticket 09
       *  draws the gauge: two honest numbers rather than one derived percentage. */
      used: number;
      ceiling: number;
      /** False when nobody measured this model and the ceiling is blobot's own estimate. */
      measured: boolean;
      /** The fresh session took the agent's standing instructions as they stand now. */
      personaRefreshed?: boolean;
      /** What the agent wrote. Present on `handoff`, and what the row discloses. */
      handoff?: string;
      handoffPath?: string;
      reason?: string;
    }
  /**
   * An agent put itself on a schedule, and it is already running.
   *
   * Issue 05's 2026-08-30 amendment reversed *only a person may arm one*, and this block is the
   * second of the four controls that pay for it: **the user is told, where it happened.** It is
   * an item rather than a banner for the same reason a permission request is — it belongs in the
   * turn that did it, and the team pane has to say which agent.
   *
   * It carries `disarm` and nothing else. blobot has never interrupted the user and this does not
   * start; what it refuses is to let an agent arm something off screen.
   */
  | {
      kind: 'routine';
      id: string;
      at: number;
      agentId: string;
      routineId: string;
      name: string;
      /** In blobot's own words, and beside it what the shape costs. A count, never a price. */
      schedule: string;
      frequency: string;
    }
  /**
   * An agent wrote to its own Handbook, or was refused because it is full.
   *
   * The disclosure that pays for the write. An agent changing its own persona off screen is the
   * version of this feature that must not exist, so the block opens in the turn that did it and
   * carries removal: the whole justification is that you see it happen and can undo it **there**.
   *
   * It is one line for the call rather than one per entry, because `record_entry` takes a list
   * and the turn produced one act. Nothing marks the rail for it: that mark is earned by origin,
   * and a turn you started is not unread.
   */
  | {
      kind: 'handbook';
      id: string;
      at: number;
      agentId: string;
      /** `full` wrote nothing, and is the one refusal in the app that leaves the room. */
      write: 'recorded' | 'full';
      entries: readonly UiHandbookEntry[];
      withdrew: readonly UiHandbookEntry[];
    }
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
  /** How full each agent's context is, by agent id. Absent means it has never reported. */
  usage: Record<string, UiUsage>;
  /** What blobot itself put into each agent's turn. Snapshot-only: nothing streams it. */
  injection: Record<string, UiInjection>;
  /**
   * Each agent's Handbook, live. Unlike `injection` this **does** stream: an agent records into
   * its own mid-turn, and three surfaces read it — the panel under the composer, the notice card
   * above it, and the gauge's handbook row, which is the sum of exactly these entries.
   */
  handbooks: Record<string, readonly UiHandbookEntry[]>;
  /**
   * Agents carrying a Routine run the user has not looked at. Issue 11's unread mark.
   *
   * A set of agent ids and never a count: two unread reports and five are the same decision, and
   * a count answers a question nobody asked. It arrives with the snapshot and is cleared here
   * the moment the pane opens rather than waiting for main to answer, because the mark is about
   * what the user is looking at and they are looking at it now.
   */
  unread: readonly string[];
  /**
   * Which Routine each firing in this pane belongs to, by run id. Issue 07's disclosure: a
   * prompt the user wrote but did not say at 03:00 gets a `system` line above it saying so.
   */
  routineOrigins: Record<string, string>;
  /**
   * Whether each Routine an agent scheduled is still running, by routine id.
   *
   * Held beside the items rather than on them, because two surfaces act on one row: the block in
   * the transcript and the Routines screen. A block whose control still said `disarm` after the
   * user disarmed it elsewhere would be the app disagreeing with itself about one Routine.
   */
  routineArmed: Record<string, boolean>;
  /**
   * Whether the team said anything above what the pane is holding.
   *
   * The transcript is a window now, not the whole history, so the pane has to be able to say
   * which of the two it is showing. False means the top of the column really is the beginning.
   */
  moreAbove: boolean;
  /**
   * The cursor for reaching that history: the oldest time this pane holds *from the store*.
   *
   * Deliberately not the oldest `at` in `items`. A tool line sits at the moment its call
   * started and a stopped-turn line at the moment the turn ended, and neither is a row the
   * transcript window is cut by — paging from one of those would ask for a range the store
   * already answered and hand the pane a page it has.
   */
  oldest: number | undefined;
}

export type Action =
  | { type: 'snapshot'; snapshot: UiSnapshot }
  /**
   * A window of older transcript, prepended.
   *
   * A separate action from `snapshot` on purpose, and the comment on that case says why: a
   * snapshot *replaces* the pane, which is what it is for. This is the one thing that adds to
   * the top of one, and it must never be expressed as a snapshot of a wider window — that would
   * throw away the live tail, the pending rows and the permission blocks standing in it.
   */
  | {
      type: 'earlier';
      messages: readonly Message[];
      answers: readonly UiAgentMessage[];
      moreAbove: boolean;
      routineOrigins?: Record<string, string>;
    }
  | { type: 'event'; event: AgentEvent }
  | { type: 'status'; agentId: string; status: AgentStatus }
  | { type: 'commands'; agentId: string; commands: readonly UiCommand[] }
  | { type: 'message'; message: Message; routineName?: string }
  /** That agent's pane is open, which is the only thing that clears issue 11's unread mark. */
  | { type: 'seen'; agentId: string }
  /** An agent put itself on a schedule. It is running by the time this arrives. */
  | { type: 'scheduled'; scheduled: UiScheduledRoutine }
  /** The user answered one of those blocks, or answered it on the Routines screen. */
  | { type: 'routineArmed'; routineId: string; armed: boolean }
  /** An agent wrote to its own Handbook, or hit the wall only a person can clear. */
  | { type: 'handbookWrite'; write: UiHandbookWrite }
  /** An entry was taken out, from the block or from the pane. The block stays; the control goes. */
  | { type: 'handbookRemoved'; entryId: string }
  | { type: 'budget'; used: number; budget: number }
  | { type: 'silentHandoff'; agentId: string; named: readonly string[]; at: number }
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
  usage: {},
  injection: {},
  handbooks: {},
  moreAbove: false,
  oldest: undefined,
  unread: [],
  routineOrigins: {},
  routineArmed: {},
};

/**
 * blobot's own loopback tools. Their lifecycles are real — each one *is* an MCP call — but the
 * conversation draws what each one did instead of the call: the dashed peer enclosure from the
 * orchestrator's message record, the Routine block from the row, the Handbook block from the
 * write. The raw line beside those says the same thing twice, in the one register a reader can
 * do nothing with, and the disclosure is the thing that was designed.
 *
 * Matching on the name is the seam ticket 04 warned about: the clean version is for the adapter
 * to tag its own tool so the UI never has to know a name at all.
 */
const OWN_TOOL = /(^|_)(message_agent|propose_routine|record_entry)$/;

/**
 * The two halves of a stored transcript as items, through one function.
 *
 * A snapshot and a `load earlier` page carry exactly the same pair of row sets and must draw
 * them identically — a restored message that looked one way at launch and another way after
 * scrolling up would be the transcript contradicting itself about its own history. The store
 * bounds the two halves against a shared cutoff for the same reason.
 */
function transcriptItems(
  messages: readonly Message[],
  answers: readonly UiAgentMessage[],
  origins: Record<string, string> = {},
): Item[] {
  return [
    ...messages.flatMap((message) =>
      itemsOfMessage(
        message,
        message.routineRunId === undefined ? undefined : origins[message.routineRunId],
      ),
    ),
    ...answers.map(
      (answer): Item => ({
        kind: 'agent',
        id: answer.id,
        at: answer.at,
        agentId: answer.agentId,
        text: answer.text,
        live: false,
      }),
    ),
  ];
}

/**
 * How far back a stored window reaches, which is the cursor for asking for the one above it.
 *
 * Both halves, because they are bounded together: taking the oldest message alone would skip
 * every answer written before it, which is the ragged edge the shared cutoff exists to prevent.
 */
function oldestOf(
  messages: readonly Message[],
  answers: readonly UiAgentMessage[],
): number | undefined {
  const times = [...messages.map((message) => message.at), ...answers.map((answer) => answer.at)];
  return times.length === 0 ? undefined : Math.min(...times);
}

/**
 * A tool's title, on one line.
 *
 * A runtime names a bash call after its command, and a command can be a hundred characters of
 * `&&` across six lines. Rendered as it arrives it is fifteen rows of the activity column for
 * one entry, which buries every other entry in the log. The log's job is to say what happened,
 * not to reproduce it: the whole command was never readable in a column this narrow, and the
 * transcript is where the agent explains what it ran.
 */
function oneLine(title: string): string {
  const flat = title.replace(/\s+/gu, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 79)}\u2026` : flat;
}

/**
 * The stored kind, narrowed back into the vocabulary.
 *
 * A row written before `kind` was stored has a null, and one written by a future runtime could
 * carry a word this build does not know. Both become `other`, which draws no verb — the honest
 * answer for a call blobot cannot name, and the same one an MCP tool gets.
 */
function asToolKind(kind: string | null): ToolKind {
  return kind === 'read' || kind === 'edit' || kind === 'execute' ? kind : 'other';
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'snapshot':
      // A snapshot replaces the pane rather than adding to it: it arrives at launch and on
      // every team switch, and a persisted transcript is only visible if it is seeded here.
      // Messages and answers are merged by time: a restored pane that showed the peer traffic
      // and not the replies would read as a conversation with half the speakers missing.
      // Tool lines are restored too, since 2026-08-30. They were not, and the transcript's
      // fold made that visible in the worst way: with no calls in a restored turn nothing
      // grouped, so every past turn came back as a flat wall of captions — the narration
      // kept, the work gone, permanently rather than only until the next completion.
      //
      // Ordered by `startedAt`, so a call sits after the line that introduced it. The rows
      // are the ones the activity column already had; what they gained is the kind, the
      // start, and whether an exit code was ever reported.
      return {
        ...state,
        snapshot: action.snapshot,
        // Replaced rather than merged, and it can be: the snapshot carries every live team's
        // agents, not just the one on screen. So this both seeds the rail's other rows and
        // forgets a team the pool has since unloaded, which is the correct thing to forget.
        statuses: { ...action.snapshot.statuses },
        commands: { ...action.snapshot.commands },
        usage: { ...action.snapshot.usage },
        injection: { ...action.snapshot.injection },
        handbooks: { ...action.snapshot.handbooks },
        turnsThisPrompt: action.snapshot.turnsThisPrompt,
        unread: action.snapshot.unread ?? [],
        routineOrigins: action.snapshot.routineOrigins ?? {},
        routineArmed: Object.fromEntries(
          (action.snapshot.scheduled ?? []).map((one) => [one.routineId, one.armed]),
        ),
        items: [
          ...transcriptItems(
            action.snapshot.messages,
            action.snapshot.answers,
            action.snapshot.routineOrigins ?? {},
          ),
          // A question nobody has answered is still being asked, so it comes back with the
          // pane. It sorts to the end because that is where the turn is standing.
          // A turn that stopped for an unusual reason is *conversation*, not log, so it has to
          // come back with the transcript: an answer that stopped mid-sentence and comes back
          // without its reason reads as an answer that finished.
          ...action.snapshot.log.turns
            .filter((turn) => turn.stopReason !== 'end_turn')
            .map(
              (turn): Item => ({
                kind: 'system',
                id: `${turn.turnId}:${turn.agentId}:${turn.at}:stopped`,
                at: turn.at,
                agentId: turn.agentId,
                text: stoppedBecause(turn.stopReason),
              }),
            ),
          // Calls still in flight, from the store rather than from the items being replaced.
          // The renderer drops every event that arrives before its first snapshot resolves, so
          // a call that started in that window was never in `items` to be preserved — it is
          // only ever recoverable from here.
          ...action.snapshot.log.running
            .filter((tool) => !OWN_TOOL.test(tool.title))
            .map(
              (tool): Item => ({
                kind: 'tool',
                id: tool.toolCallId,
                at: tool.startedAt,
                agentId: tool.agentId,
                title: tool.title,
                toolKind: asToolKind(tool.kind),
                status: 'running',
              }),
            ),
          ...action.snapshot.log.tools
            // blobot's own loopback tool is not the team's work, exactly as on the live path
            // and in the feed. Restoring it would put a call in the transcript that no agent
            // chose to make and no user can act on.
            .filter((tool) => !OWN_TOOL.test(tool.title))
            .map(
            (tool): Item => ({
              kind: 'tool',
              id: tool.toolCallId,
              at: tool.startedAt,
              agentId: tool.agentId,
              title: tool.title,
              toolKind: asToolKind(tool.kind),
              // Only the two terminal words reach here: `logOfTeam` returns finished calls.
              // Anything else would be a call claiming to be in flight in a pane that was
              // rebuilt after it ended.
              status: tool.status === 'failed' ? 'failed' : 'completed',
              ...(tool.exit === undefined ? {} : { exit: tool.exit }),
              ...(tool.changed === undefined ? {} : { changed: tool.changed }),
            })),
          // A session blobot replaced is conversation for the same reason a stopped turn is:
          // an agent that stops remembering last week, with nothing in the transcript to say
          // why, is the exact shape of a bug report nobody can act on.
          ...action.snapshot.log.compactions.map((compaction) =>
            compactionItem(`${compaction.agentId}:${compaction.at}:compacted`, compaction),
          ),
          // Restored from the rows, so the disclosure survives a relaunch and a team switch. A
          // block that only existed while the app happened to be watching would be one the user
          // could miss by being on another team when the agent scheduled it.
          ...(action.snapshot.scheduled ?? []).map(scheduledItem),
          // The same restoration for the same reason. What each entry says, and whether it is
          // still in the Handbook, is read off the rows at snapshot time, so a block never
          // offers to remove something that is already gone.
          ...(action.snapshot.handbook ?? []).map(handbookItem),
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
        moreAbove: action.snapshot.moreAbove,
        oldest: oldestOf(action.snapshot.messages, action.snapshot.answers),
        // Rebuilt from the same rows, through the same formatting as a live line. The column
        // used to empty on every snapshot while the transcript beside it came back in full,
        // which is what a team switch looked like: the log of what the team had done was gone
        // and nothing said it was only unloaded.
        feed: restoreFeed(action.snapshot.log),
        budget: undefined,
      };
    case 'earlier': {
      // Prepend, never replace, and dedupe by id: the window is cut by time, so a page whose
      // oldest rows share a millisecond with the page below it can legitimately overlap. An
      // item already on screen is the one kept, because it may be mid-stream and this is not.
      const held = new Set(state.items.map((item) => item.id));
      const origins = { ...state.routineOrigins, ...action.routineOrigins };
      const added = transcriptItems(action.messages, action.answers, origins).filter(
        (item) => !held.has(item.id),
      );
      return {
        ...state,
        routineOrigins: origins,
        items: [...added, ...state.items].sort((left, right) => left.at - right.at),
        moreAbove: action.moreAbove,
        // Never forward. A page that came back empty must not move the cursor down and make
        // the control ask for the same window forever.
        oldest: oldestOf(action.messages, action.answers) ?? state.oldest,
      };
    }
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
    case 'silentHandoff': {
      // A transcript line rather than a banner, because it is about one turn and it belongs
      // where that turn ended. It states two facts and offers nothing: no button sends the
      // message for her, because composing the message she did not send is inference, and the
      // wording is an observation rather than an accusation.
      const id = `${action.agentId}:${action.at}:silent-handoff`;
      if (state.items.some((item) => item.id === id)) return state;
      return {
        ...state,
        items: [
          ...state.items,
          {
            kind: 'system',
            id,
            at: action.at,
            agentId: action.agentId,
            text: `named ${listNames(action.named)} · no message sent`,
          },
        ],
      };
    }
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
      return applyMessage(state, action.message, action.routineName);
    case 'seen':
      // Opening that agent's pane, and nothing else. Not opening the team: the team pane is not
      // where that agent's turn is.
      return { ...state, unread: state.unread.filter((id) => id !== action.agentId) };
    case 'scheduled': {
      const id = `${action.scheduled.routineId}:scheduled`;
      if (state.items.some((item) => item.id === id)) return state;
      return {
        ...state,
        routineArmed: { ...state.routineArmed, [action.scheduled.routineId]: action.scheduled.armed },
        items: [...state.items, scheduledItem(action.scheduled)],
      };
    }
    case 'routineArmed':
      return {
        ...state,
        routineArmed: { ...state.routineArmed, [action.routineId]: action.armed },
      };
    case 'handbookWrite': {
      if (state.items.some((item) => item.id === action.write.id)) return state;
      return {
        ...state,
        items: [...state.items, handbookItem(action.write)],
        // The Handbook itself follows, because it is the one part of the persona that changes
        // while somebody is watching it. Standing instructions only move through a dialog, which
        // refreshes the snapshot on its way out; nothing refreshes when an agent records
        // something mid-turn, so a panel and a gauge row read only at snapshot would both sit at
        // nothing for the whole of the session in which the agent was first briefed. Which is
        // the session the whole feature is about.
        //
        // A `full` write changes nothing, correctly: nothing was recorded.
        handbooks: withWrite(state.handbooks, action.write),
      };
    }
    case 'handbookRemoved': {
      // The line stays and says the same thing it said: a transcript is a record of what
      // happened and is never rewritten, which is why a Routine the user later disarmed still
      // shows the turn that armed it. What goes is the control beside the entry.
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind !== 'handbook'
            ? item
            : {
                ...item,
                entries: item.entries.map((entry) =>
                  entry.id === action.entryId ? { ...entry, removed: true } : entry,
                ),
              },
        ),
        handbooks: without(state.handbooks, action.entryId),
      };
    }
    case 'event':
      return applyEvent(state, action.event);
  }
}

/**
 * One agent's Handbook after a write: what the call withdrew is gone, what it added is on the
 * end. Appended rather than re-sorted, because the ordinal is the order and the store hands
 * entries back in it.
 */
function withWrite(
  handbooks: Record<string, readonly UiHandbookEntry[]>,
  write: UiHandbookWrite,
): Record<string, readonly UiHandbookEntry[]> {
  if (write.kind !== 'recorded') return handbooks;
  const withdrew = new Set(write.withdrew.map((entry) => entry.id));
  const held = (handbooks[write.agentId] ?? []).filter((entry) => !withdrew.has(entry.id));
  return { ...handbooks, [write.agentId]: [...held, ...write.entries] };
}

/**
 * The Handbook without one entry, whoever it belonged to.
 *
 * Swept across every agent rather than told which one, because a removal arrives as an entry id
 * and nothing else — the transcript block that raises it belongs to the agent that *wrote* the
 * entry, and ids are unique, so looking for it is both simpler and correct.
 */
function without(
  handbooks: Record<string, readonly UiHandbookEntry[]>,
  entryId: string,
): Record<string, readonly UiHandbookEntry[]> {
  const owner = Object.keys(handbooks).find((agentId) =>
    (handbooks[agentId] ?? []).some((entry) => entry.id === entryId),
  );
  if (owner === undefined) return handbooks;
  return {
    ...handbooks,
    [owner]: (handbooks[owner] ?? []).filter((entry) => entry.id !== entryId),
  };
}

/** One Handbook write as the transcript draws it. */
function handbookItem(write: UiHandbookWrite): Item {
  return {
    kind: 'handbook',
    id: write.id,
    at: write.at,
    agentId: write.agentId,
    write: write.kind,
    entries: write.entries,
    withdrew: write.withdrew,
  };
}

/** One agent-scheduled Routine as the transcript draws it. */
function scheduledItem(one: UiScheduledRoutine): Item {
  return {
    kind: 'routine',
    id: `${one.routineId}:scheduled`,
    at: one.at,
    agentId: one.agentId,
    routineId: one.routineId,
    name: one.name,
    schedule: one.schedule,
    frequency: one.frequency,
  };
}

/** `Bob`, `Bob and Carol`, `Bob, Carol and Dave`. Prose, because the line is read as a sentence. */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] as string}`;
}

function applyMessage(state: AppState, message: Message, routineName?: string): AppState {
  if (state.items.some((item) => item.id === message.id)) return state;
  return {
    ...state,
    items: [...state.items, ...itemsOfMessage(message, routineName)],
    // Remembered, so a re-render and a `load earlier` page draw the same line the live one did.
    ...(message.routineRunId === undefined || routineName === undefined
      ? {}
      : { routineOrigins: { ...state.routineOrigins, [message.routineRunId]: routineName } }),
  };
}

/**
 * One committed Message as the pane draws it, and the line above it when a clock delivered it.
 *
 * **The prompt draws in the user's voice** — solid, filled, right-aligned. The words *are* the
 * user's: they authored them and nobody else said them. What the bubble gets wrong is *when*, and
 * that is the whole of what the line above it discloses.
 *
 * A `system` line rather than a fourth voice, and the instrument already existed: it is not a
 * voice, and it was invented to carry a fact the three cannot say (`turn stopped · the context
 * window is full`). `DESIGN.md`'s three voices exist because three was hard enough, and dashed
 * against solid is the trick that must not be softened by a third texture competing with it.
 */
function itemsOfMessage(message: Message, routineName: string | undefined): Item[] {
  const item = toItem(message);
  // Only the user's voice can be wrong about when. A peer message was sent when it says it was.
  if (routineName === undefined || message.fromAgentId !== null) return [item];
  return [
    {
      kind: 'system',
      id: `${message.id}:routine`,
      // The same moment, so the sort cannot separate them. Emitted first, and `Array.sort` is
      // stable, which is what keeps the line above the bubble it is about.
      at: message.at,
      agentId: message.toAgentId,
      text: `routine · ${routineName}`,
    },
    item,
  ];
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
          ...(message.attachments === undefined ? {} : { attachments: message.attachments }),
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
            title: oneLine(event.title),
            toolKind: event.kind,
            status: asked ? 'asking' : 'running',
          },
        ],
      };
    }
    case 'tool_call_updated': {
      const index = state.items.findIndex(
        (item) => item.kind === 'tool' && item.id === event.toolCallId,
      );
      if (index < 0) return state;
      const existing = state.items[index] as Extract<Item, { kind: 'tool' }>;
      // A tool call is announced before its arguments have finished streaming, so the first
      // title is whatever the runtime can say without them — `Terminal` for a bash call that
      // has no command yet, `Edit` for an edit with no path. The refinement that carries the
      // real one arrives as an update with no terminal status, which is why it is taken here
      // rather than only on the way out.
      const title = event.title === undefined ? existing.title : oneLine(event.title);
      const toolKind = event.kind ?? existing.toolKind;
      // The counts arrive mid-stream, on the update that carries the diff, and never on the
      // terminal one — so they have to be taken on the way past rather than only on the way out.
      const changed = event.changed ?? existing.changed;
      if (event.status !== 'completed' && event.status !== 'failed') {
        if (title === existing.title && toolKind === existing.toolKind && changed === existing.changed)
          return state;
        const items = [...state.items];
        items[index] = { ...existing, title, toolKind, ...(changed === undefined ? {} : { changed }) };
        return { ...state, items };
      }
      // A finished call stays in the conversation now, by the author, 2026-08-30. The seam used
      // to be that the in-flight line left the transcript on completion and only the feed kept
      // it — so what survived a turn was the agent's narration about the work ("now the desk
      // surface") and never the work. That reads as a list of intentions with the doing removed.
      //
      // It costs nothing in ink because a settled call is only ever drawn inside a fold: see
      // `rowsOf`. The feed still takes the completion, because the feed is the log and the fold
      // is a summary.
      //
      // Unless a human was asked about this one, in which case the permission item *is* this
      // call's line and always was — it stands where the tool line would have stood and settles
      // into the same shape. Keeping both would print every answered call twice, once as what
      // was run and once as what you said about it.
      const asked = state.items.some(
        (item) => item.kind === 'permission' && item.toolCallId === event.toolCallId,
      );
      // Narrowed here rather than read off `event` in the callback: a property narrowing does
      // not survive into a closure, and `status` is what the guard above just established.
      const status = event.status;
      const settled: Item = {
        ...existing,
        title,
        toolKind,
        status,
        ...(event.exit === undefined ? {} : { exit: event.exit }),
        ...(changed === undefined ? {} : { changed }),
      };
      const items = asked
        ? state.items.filter((item) => item !== existing)
        : state.items.map((item) => (item === existing ? settled : item));
      return {
        ...state,
        items,
        feed: pushFeed(state.feed, {
          id: `${event.toolCallId}:done`,
          at: event.at,
          agentId: event.agentId,
          // A cancelled tool reports `completed` with `exit: null`, so the exit code is
          // printed rather than trusted.
          text: `${title} ${event.status}${event.exit === null ? ' (exit null)' : ''}`,
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
                text: stoppedBecause(event.stopReason),
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
    case 'usage_updated':
      // `used: 0` is the gauge reset a cancelled turn leaves behind, observed on both runtimes
      // and reproduced by the mock. Taking it would zero the gauge every time the user stops an
      // agent, so a zero never overwrites a reading: it can only be the first one, where it is
      // an agent that has genuinely said nothing yet.
      if (event.used === 0 && state.usage[event.agentId] !== undefined) return state;
      return {
        ...state,
        usage: {
          ...state.usage,
          [event.agentId]: {
            used: event.used,
            size: event.size,
            ...(event.costUsd === undefined ? {} : { costUsd: event.costUsd }),
          },
        },
      };
    case 'context_compacted': {
      const id = `${event.agentId}:${event.at}:compacted`;
      if (state.items.some((item) => item.id === id)) return state;
      return {
        ...state,
        items: [...state.items, compactionItem(id, event)],
        feed: pushFeed(state.feed, {
          id,
          at: event.at,
          agentId: event.agentId,
          text: compactionLine(
            event.how,
            event.used,
            event.ceiling,
            event.measured,
            event.reason,
            event.personaRefreshed,
          ),
          // Emphasised only when nothing happened. A compaction that worked is routine; a
          // session blobot decided to keep is the one a reader may want to act on.
          emphasis: event.how === 'refused',
        }),
      };
    }
    // Thinking has no pane of its own yet, and the peer message is rendered from its record
    // rather than from this announcement.
    case 'agent_thought_delta':
    case 'agent_message_sent':
      return state;
  }
}

/** One `context_compacted` as the transcript holds it. Shared by the live and restored paths. */
function compactionItem(
  id: string,
  event: {
    agentId: string;
    at: number;
    how: 'command' | 'handoff' | 'refused';
    used: number;
    ceiling: number;
    measured: boolean;
    personaRefreshed?: boolean;
    handoff?: string;
    handoffPath?: string;
    reason?: string;
  },
): Item {
  return {
    kind: 'compaction',
    id,
    at: event.at,
    agentId: event.agentId,
    how: event.how,
    used: event.used,
    ceiling: event.ceiling,
    measured: event.measured,
    ...(event.personaRefreshed === true ? { personaRefreshed: true } : {}),
    ...(event.handoff === undefined ? {} : { handoff: event.handoff }),
    ...(event.handoffPath === undefined ? {} : { handoffPath: event.handoffPath }),
    ...(event.reason === undefined ? {} : { reason: event.reason }),
  };
}

/**
 * What blobot did to this session, in one line.
 *
 * Three shapes for three outcomes, and none of them says the word blobot: the subject of every
 * one is the session, because that is what changed. `refused` leads with what did *not* happen,
 * since a reader scanning a column needs to know the agent is still carrying everything it was.
 *
 * The numbers are the pair ticket 09 settled on rather than a percentage — occupancy, and the
 * ceiling it was judged against — and the ceiling says when nobody measured it. Firing a session
 * restart off a guess about a model is a stronger claim than drawing that guess on a gauge, and
 * the line a person reads should not quietly conflate the two.
 *
 * It offers no remedy, which is ticket 05's rule surviving intact: `/compact` is in the palette
 * and the user may still type it, and nothing here suggests they should.
 */
export function compactionLine(
  how: 'command' | 'handoff' | 'refused',
  used: number,
  ceiling: number,
  measured: boolean,
  reason?: string,
  personaRefreshed?: boolean,
): string {
  const against = `${formatTokens(used)} of ${formatTokens(ceiling)}${measured ? '' : ' estimated'}`;
  switch (how) {
    case 'command':
      return `context compacted · ${against}`;
    case 'handoff':
      // The standing instructions are named only where they could actually have moved. On a
      // runtime that re-asserts the persona every session it is not news, and a clause that is
      // always there is a clause nobody reads on the day it matters.
      return (
        `fresh session · ${against}` +
        (personaRefreshed === true ? ' · standing instructions re-read' : '') +
        ' · the handoff is below'
      );
    case 'refused':
      return `session kept · ${against} · ${reason ?? 'nothing was changed'}`;
  }
}

/** `4k`, `168k`, `1m`. The activity column's own shortening, so two surfaces agree on a size. */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}m`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/**
 * Why a turn stopped, in the transcript's own words rather than in the protocol's.
 *
 * The stop reason already reached the pane, but it reached it as `max tokens`, which names a
 * mechanism and not a consequence. The one this exists for is exactly that: a turn that stopped
 * because the agent had no room left reads to a user as an agent that got worse for no reason,
 * and that is the shape of a bug report nobody can act on.
 *
 * It says what happened and nothing about what to do next. blobot does not manage the agent's
 * context: the CLI behind the adapter owns compaction, `/compact` is in the composer's palette,
 * and a line in the transcript that started recommending it would be blobot managing a context
 * it has said it does not manage.
 */
export function stoppedBecause(stopReason: StopReason): string {
  switch (stopReason) {
    case 'max_tokens':
      return 'turn stopped · the context window is full';
    case 'max_turn_requests':
      return 'turn stopped · the runtime hit its own request limit';
    case 'refusal':
      return 'turn stopped · declined to answer';
    case 'cancelled':
      return 'turn stopped · cancelled';
    // `end_turn` never reaches here: an ordinary ending is log, not conversation.
    case 'end_turn':
      return 'turn ended';
  }
}

/**
 * The activity column, from the persisted log. Newest first and capped like the live one, so a
 * restored column and a column that was watched all along are the same column.
 */
function restoreFeed(log: UiLog): FeedEntry[] {
  const tools = log.tools
    // The live column hides blobot's own tool, so the restored one has to as well. The row is
    // in the store on purpose — a peer message is a real MCP call and the transcript records
    // it — but a column that gains an entry the moment a team is switched back to is not the
    // same column the user was watching.
    .filter((tool) => !OWN_TOOL.test(tool.title))
    .map(
      (tool): FeedEntry => ({
        id: `${tool.toolCallId}:done`,
        at: tool.at,
        agentId: tool.agentId,
        text: `${oneLine(tool.title)} ${tool.status}`,
      }),
    );
  const turns = log.turns.map(
    (turn): FeedEntry => ({
      id: `${turn.turnId}:${turn.agentId}:${turn.at}`,
      at: turn.at,
      agentId: turn.agentId,
      text: `turn ended · ${turn.stopReason}`,
      emphasis: turn.stopReason !== 'end_turn',
    }),
  );
  const compactions = log.compactions.map(
    (compaction): FeedEntry => ({
      id: `${compaction.agentId}:${compaction.at}:compacted`,
      at: compaction.at,
      agentId: compaction.agentId,
      text: compactionLine(
        compaction.how,
        compaction.used,
        compaction.ceiling,
        compaction.measured,
        compaction.reason,
        compaction.personaRefreshed,
      ),
      emphasis: compaction.how === 'refused',
    }),
  );
  return [...tools, ...turns, ...compactions]
    .sort((left, right) => right.at - left.at)
    .slice(0, 200);
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
 * Which pane a fresh snapshot leaves the reader in.
 *
 * Switching teams resets the pane, because the agent it was showing belongs to the team that
 * just went away. But the channel that carries that news carries more than that: a cold start
 * reports each agent up as it comes up, and a Routine changing reports itself the same way. So
 * the reset is keyed on the team having actually changed, and on an agent's pane it also asks
 * whether that agent is still on the roster — an edit can take them off it.
 *
 * `wanted` is the navigator's wish: an agent on a team that was not open yet, honoured once the
 * roster naming them has arrived.
 */
export function paneAfterSnapshot(options: {
  readonly open: Pane;
  readonly arrived: boolean;
  readonly roster: readonly { readonly id: string }[];
  readonly wanted?: string;
}): Pane {
  const { open, arrived, roster, wanted } = options;
  const onRoster = (agentId: string): boolean => roster.some((agent) => agent.id === agentId);
  if (wanted !== undefined && onRoster(wanted)) return { kind: 'agent', agentId: wanted };
  if (!arrived && open.kind === 'agent' && onRoster(open.agentId)) return open;
  return { kind: 'team' };
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
 * A run of settled work, folded into one line.
 *
 * A step is a caption and the calls it introduces: "Now the desk surface and the scene that ties
 * it together." followed by an edit. A turn is a dozen of those and then an answer, and drawn
 * flat it reads as a bulleted list of intentions — because the captions are sentences and the
 * calls are one mono line each, so the narration wins the column by weight while saying the
 * least. `DESIGN.md`'s hiding rule is amended for exactly this case (ticket 12, 2026-08-30): a
 * caption on a tool call is not the answer the pane exists to show.
 *
 * Three things are structurally outside a block rather than flagged open inside one, so that
 * "the live step never folds" is a property of the grouping and not a render-time exception
 * somebody can forget:
 *
 * - a call that is `running` or `asking`, so what an agent is doing now is never behind a click;
 * - a question nobody has answered, because `waiting` spends the app's one inversion and a
 *   stopped agent behind a chevron is the modal problem wearing a chevron;
 * - a live answer, and any prose long enough to be one.
 *
 * Trailing prose is trimmed off the end of a block for the same reason: the last thing said in
 * a turn has no call after it, so it is the answer, and the answer never folds.
 */
export type Row =
  | { readonly kind: 'item'; readonly at: number; readonly item: Item }
  | {
      readonly kind: 'steps';
      readonly id: string;
      readonly at: number;
      readonly agentId: string;
      readonly items: readonly Item[];
    };

/**
 * Prose past this is not a caption on a call, it is something being explained, and folding it
 * would be hiding the work. Measured against the observed shape rather than chosen: the
 * captions a turn strings together are one short sentence, and the paragraph that closes a turn
 * is several.
 */
const CAPTION = 240;

/**
 * Below this a fold costs more than it saves. One call under a chevron is a line replaced by a
 * line, plus a click, plus the reader wondering what is in it.
 */
const WORTH_FOLDING = 2;

/** Whose turn an item belongs to, or undefined for the voices that are nobody's. */
function speakerOf(item: Item): string | undefined {
  return item.kind === 'user' || item.kind === 'peer' ? undefined : item.agentId;
}

function settledWork(item: Item): boolean {
  switch (item.kind) {
    case 'tool':
      return item.status === 'completed' || item.status === 'failed';
    case 'permission':
      return item.outcome !== undefined;
    case 'agent':
      return !item.live && item.text.trim().length <= CAPTION;
    default:
      return false;
  }
}

/** How many calls a block actually stands for, which is what its header counts. */
export function toolsIn(items: readonly Item[]): number {
  return items.filter((item) => item.kind === 'tool' || item.kind === 'permission').length;
}

/**
 * How many of them failed, counted from the status and the exit code and from nothing else.
 * Ticket 08's trap is that a cancelled call reports `completed`, so `exit: null` counts here,
 * and the absence of a failure is never drawn as success anywhere.
 *
 * A rejected or unanswered question is not counted. It did not fail, it did not run, and the
 * header is not the place to relitigate a decision the user made — its own line inside the fold
 * says which word applies.
 */
export function failuresIn(items: readonly Item[]): number {
  return items.filter(
    (item) => item.kind === 'tool' && (item.status === 'failed' || item.exit === null),
  ).length;
}

/** The transcript's rows: every item as itself, except settled runs of work, which fold. */
export function rowsOf(items: readonly Item[]): Row[] {
  const rows: Row[] = [];
  let index = 0;

  while (index < items.length) {
    const start = items[index] as Item;
    const speaker = speakerOf(start);

    if (speaker !== undefined && settledWork(start)) {
      let end = index;
      while (end < items.length) {
        const item = items[end] as Item;
        if (speakerOf(item) !== speaker || !settledWork(item)) break;
        end += 1;
      }
      // The answer is whatever prose the run ends on, so it comes back out.
      while (end > index && (items[end - 1] as Item).kind === 'agent') end -= 1;

      const run = items.slice(index, end);
      if (toolsIn(run) >= WORTH_FOLDING) {
        rows.push({
          kind: 'steps',
          id: `steps:${(run[0] as Item).id}`,
          at: (run[0] as Item).at,
          agentId: speaker,
          items: run,
        });
        index = end;
        continue;
      }
    }

    rows.push({ kind: 'item', at: start.at, item: start });
    index += 1;
  }

  return rows;
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
