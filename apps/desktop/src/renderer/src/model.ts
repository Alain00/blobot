import { findAgentByName } from '@blobot/core/domain';
import type {
  Agent,
  AgentEvent,
  AgentStatus,
  MachinePower,
  Message,
  PictureNotDrawn,
  PictureSource,
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
  UiRailAgent,
  UiScheduledRoutine,
  UiTeamSummary,
  UiSnapshot,
  UiUsage,
} from '../../shared/api.js';

/**
 * What a conversation pane is showing: one agent's session, the whole team's stream, or an
 * agent's **thread** that does not exist yet.
 *
 * The third kind is `.scratch/rail/issues/04`'s deliberate amendment to this map's own charting
 * premise. A thread is created on the first message and never on the press of a rail row, so
 * between those two moments the pane is showing a person rather than a session: it holds an
 * AgentProfile id, and resolves to `{kind: 'agent'}` the moment the Agent exists. It is the only
 * option where the rail's identity and the pane's identity agree — a row is a person, so what it
 * selects is a person.
 */
export type Pane =
  | { readonly kind: 'team' }
  | { readonly kind: 'agent'; readonly agentId: string }
  | { readonly kind: 'thread'; readonly profileId: string };

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
      /**
       * `unfinished` is blobot never having learned how the call ended -- the process that owned
       * it went away mid-flight and the launch reconcile closed the row. It is deliberately not
       * `failed`: the tool may have done its work perfectly and only the answer was lost. It
       * counts as settled, because nothing more is coming, and it is not counted as a failure,
       * because that is a claim nobody can make.
       */
      status: 'asking' | 'running' | 'completed' | 'failed' | 'unfinished';
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
   * A Picture, or the fact that there was one and it is not here.
   *
   * `.scratch/agent-media/`. One item for both outcomes, because they are one event: a Picture
   * that arrived and could not be shown is *not drawn*, always with the reason in the same line,
   * and never a noun on its own -- a noun would let a session ship the noun without the reason.
   *
   * `count` is what stops a screenshot loop drawing a column of identical apologies. It collapses
   * by turn, by agent **and by reason**, in that order, so two different reasons in one turn are
   * two lines: a reason that is averaged away is not a reason.
   */
  | {
      kind: 'picture';
      id: string;
      at: number;
      agentId: string;
      /** Which frame it gets. The two sources must never draw the same. */
      source: PictureSource;
      /** The store's row, and what the pane fetches bytes by. Absent when `notDrawn` is set. */
      pictureId?: string;
      notDrawn?: PictureNotDrawn;
      /** How many identical refusals this line stands for. Only ever above one when not drawn. */
      count?: number;
      /** The tool that produced it, for an observed Picture's frame. */
      toolName?: string;
      /** The file's own name, for a shown one. */
      name?: string;
      /** Whether the file was written during this turn or was already there. Shown only. */
      writtenThisTurn?: boolean;
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
      allowAlways?: UiPermissionRequest['allowAlways'];
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
  return continuesAgent(item.agentId, previous);
}

/**
 * The same rule for something that is not an item: a live block whose steps sit under a caption
 * the same agent has just finished writing. That caption is settled prose with running calls
 * beneath it, which is one item short of the fold's threshold and therefore a loose row, so
 * without this the face and the name are drawn twice with one sentence between them.
 */
export function continuesAgent(agentId: string, previous: Item | undefined): boolean {
  return previous?.kind === 'agent' && previous.agentId === agentId;
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
  if (!isInFlight(status)) return false;
  return !items.some((item) => item.kind === 'agent' && item.agentId === agentId && item.live);
}

/**
 * Whether this agent is inside a turn, which is what {@link LiveNow} is asked and what bounds
 * the live half of a run.
 *
 * `responding` is not in here and that is the whole of what keeps one face on screen: while an
 * agent is streaming prose there is no live block, so the message's own face is the only one,
 * and the two are never mounted at the same time.
 */
export function isInFlight(status: AgentStatus): boolean {
  return status === 'starting' || status === 'thinking' || status === 'working';
}

/**
 * One agent's turn while it is still a turn: its face, and the calls that have not returned.
 *
 * `.scratch/live-steps/issues/03`. The transcript used to draw running calls as loose mono lines
 * in the shared column with nothing on them saying whose they were, and a pending bubble under
 * all of them. In a team pane that is unreadable the moment two agents run at once: six lines
 * interleaved in call-start order, attributable to nobody. A block is the only shape that
 * survives more than one of them, and it is the shape the settled transcript already uses — a
 * face, a name, and then the thing being done.
 *
 * **One per principal, not one per agent** (`issues/08`, narrowing 03). A teammate's open calls
 * are inside the run its mail caused, the same place they go the instant they return; the block
 * that says it is working is the principal's. Empty items is the other legal shape: an agent
 * asked something with nothing to show for it yet, which is where the dots survive.
 */
export interface LiveBlock {
  readonly agentId: string;
  /** In flight, in the order they were called. Empty is legal: that is the block with the dots. */
  readonly items: readonly Item[];
}


/**
 * Whether this agent is inside a turn right now, asked of the status record the renderer holds.
 *
 * It has to be a status rather than a property of the items. A call whose row still says
 * `running` in a transcript nobody is watching is a call whose end was never learned, and a lone
 * completed call never reaches the fold's threshold, so it stays a loose row for the rest of the
 * session — either one, read off the items alone, would hold a live face over a dead turn.
 */
export type LiveNow = (agentId: string) => boolean;

/**
 * What {@link rowsOf} assumes when it is handed no status record: a settled transcript, where
 * nothing is in flight and every row is a record of something that already happened.
 */
const NOBODY_LIVE: LiveNow = () => false;

/**
 * Steps that have already been inside a fold, and so may never come back out of one.
 *
 * The author's rule, 2026-09-05: *"any folded step should stay folded"*. It is not a preference,
 * it is the other end of the bug that put a thought on screen. {@link liveRunIn}'s batch walks
 * **backwards** over contiguous calls until it meets the principal's own narration, so that a
 * call finishing while its siblings run does not drop out of the block as a loose unattributed
 * line. Two calls that ran one after the other with nothing said between them are indis-
 * tinguishable, from the items alone, from two calls that were opened together — so the walk
 * reached back over work that had already settled, already folded, and already been counted,
 * and hauled it back onto the screen the instant the next call opened. Thinking makes this the
 * common case rather than the corner one, because reasoning is not narration: an agent that
 * works quietly through a list produces no prose at all to bound a batch with.
 *
 * It cannot be decided from the items, for the same reason a reply's news cannot be
 * ({@link liveRunIn}): nothing on a call records *when* it settled, only that it has. What the
 * renderer can see is one render following another, so it keeps the set and hands it back in —
 * the shape `useSwallowed` and `useDwell` already have.
 *
 * The default is the empty set, which is a transcript nobody has watched fold anything.
 */
const NOTHING_FOLDED: ReadonlySet<string> = new Set();

/**
 * Everyone the last thing the user said was addressed to, which is who a run may belong to.
 *
 * Read off the items and stored nowhere, exactly as {@link rowsOf} reads it, so that the two
 * halves of the transcript cannot disagree about whose turn is being drawn.
 */
export function addressedIn(items: readonly Item[]): ReadonlySet<string> {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as Item;
    if (item.kind === 'user') return new Set(item.agentIds);
  }
  return new Set();
}

/**
 * Whether this agent is one the reader asked, which is what earns a voice of its own.
 *
 * `.scratch/live-steps/issues/07`. Everybody else in the turn is machinery the principal
 * arranged, and folds. An empty set is the honest failure and not a guess: above the top of a
 * bounded transcript blobot does not know who was asked, so everybody is a candidate — which is
 * also, for free, why an agent's own pane is unchanged by any of this. {@link itemsFor} filters
 * the user's `@alice` bubble out of Bob's pane, so nothing is addressed there and Bob is his own
 * principal.
 */
export function isPrincipal(addressed: ReadonlySet<string>, agentId: string): boolean {
  return addressed.size === 0 || addressed.has(agentId);
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
  /**
   * The log of settled work: finished tool calls, ended turns, errors, compactions.
   *
   * **Nothing draws it since 2026-09-05**, when the activity column it was the body of came off
   * and its two heads moved into a popover (`components/Details.tsx`). It is kept because a
   * settled event arriving here is the cheapest honest signal that a worktree may have changed,
   * and `useWorkspaces` re-reads local git off its length. Restored from the persisted rows on
   * every snapshot, so that signal survives a team switch the same way it always did.
   */
  feed: FeedEntry[];
  /**
   * How many settled entries have ever arrived. Monotonic, and never the feed's length.
   *
   * `useWorkspaces` re-reads local git off this. The length was the signal until 2026-09-05 and
   * it is capped at 200, so once a team had settled its two hundredth tool call the number
   * stopped moving and the worktree was never read again for the rest of the session: the
   * tray's `+412 -7 - 9 files` silently froze. A counter cannot saturate. The feed's own cap
   * stays, because the cap is about memory and this is about liveness.
   */
  settled: number;
  budget: { used: number; budget: number } | undefined;
  /** How full each agent's context is, by agent id. Absent means it has never reported. */
  usage: Record<string, UiUsage>;
  /** What blobot itself put into each agent's turn. Snapshot-only: nothing streams it. */
  injection: Record<string, UiInjection>;
  /**
   * Each agent's Handbook, live. Unlike `injection` this **does** stream: an agent records into
   * its own mid-turn, and two surfaces read it — the panel behind the tray's door, and the
   * gauge's handbook row, which is the sum of exactly these entries.
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
  settled: 0,
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
              status:
                tool.status === 'failed'
                  ? 'failed'
                  : tool.status === 'unfinished'
                    ? 'unfinished'
                    : 'completed',
              ...(tool.exit === undefined ? {} : { exit: tool.exit }),
              ...(tool.changed === undefined ? {} : { changed: tool.changed }),
            })),
          // A session blobot replaced is conversation for the same reason a stopped turn is:
          // an agent that stops remembering last week, with nothing in the transcript to say
          // why, is the exact shape of a bug report nobody can act on.
          ...action.snapshot.log.compactions.map((compaction) =>
            compactionItem(`${compaction.agentId}:${compaction.at}:compacted`, compaction),
          ),
          // A Picture comes back from the store, and a Picture that was **not** drawn comes back
          // too: that event is the only record it ever happened, so losing it on a team switch
          // would put the silent drop back one screen further along. The bytes are not here --
          // the pane fetches one at a time by id.
          ...action.snapshot.log.pictures.map((picture) =>
            pictureItem(`${picture.agentId}:${picture.at}:picture`, picture),
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
              ...(request.allowAlways === undefined ? {} : { allowAlways: request.allowAlways }),
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
            ...(action.request.allowAlways === undefined
              ? {}
              : { allowAlways: action.request.allowAlways }),
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
        ...settle(state, {
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
        ...settle(state, {
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
        ...settle(state, {
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
        ...settle(state, {
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
    case 'picture_arrived': {
      const id = `${event.agentId}:${event.at}:picture`;
      if (state.items.some((item) => item.id === id)) return state;
      return { ...state, items: withPicture(state.items, id, event) };
    }
    // Reasoning is not drawn and is not kept. The *state* is on screen -- the live block stands
    // with its agent's face while the turn is in flight -- and `.scratch/live-steps/issues/01`'s
    // amendment has why the tokens themselves are not: the author's, having seen them drawn.
    // The peer message is rendered from its record rather than from this announcement.
    case 'agent_thought_delta':
    case 'agent_message_sent':
      return state;
  }
}

/**
 * A Picture into the transcript, counting rather than repeating.
 *
 * A Picture that was drawn is always its own item: they are different pictures and the reader is
 * looking at them. A Picture that was **not** drawn folds into the last one from the same agent
 * with the same reason, and the fold is deliberately shallow -- only the trailing item, so a
 * refusal from before the agent said something is not silently absorbed into a later run.
 *
 * That asymmetry is the whole rule: an agent in a screenshot loop produces `4 pictures from bob`
 * and not four apologies, and two reasons in one turn stay two lines.
 */
function withPicture(
  items: readonly Item[],
  id: string,
  event: {
    agentId: string;
    at: number;
    source: PictureSource;
    pictureId?: string;
    notDrawn?: PictureNotDrawn;
    toolName?: string;
    name?: string;
    writtenAt?: number;
    turnStartedAt?: number;
  },
): Item[] {
  const item = pictureItem(id, event);
  const last = items[items.length - 1];
  if (
    item.notDrawn !== undefined &&
    last?.kind === 'picture' &&
    last.agentId === item.agentId &&
    last.notDrawn === item.notDrawn
  ) {
    return [...items.slice(0, -1), { ...last, count: (last.count ?? 1) + 1 }];
  }
  return [...items, item];
}

/** One `picture_arrived` as the transcript holds it. Shared by the live and restored paths. */
function pictureItem(
  id: string,
  event: {
    agentId: string;
    at: number;
    source: PictureSource;
    pictureId?: string;
    notDrawn?: PictureNotDrawn;
    toolName?: string;
    name?: string;
    writtenAt?: number;
    turnStartedAt?: number;
  },
): Extract<Item, { kind: 'picture' }> {
  return {
    kind: 'picture',
    id,
    at: event.at,
    agentId: event.agentId,
    source: event.source,
    ...(event.pictureId === undefined ? {} : { pictureId: event.pictureId }),
    ...(event.notDrawn === undefined ? {} : { notDrawn: event.notDrawn }),
    ...(event.toolName === undefined ? {} : { toolName: event.toolName }),
    ...(event.name === undefined ? {} : { name: event.name }),
    // Compared here rather than at the draw, so a replay weighs the same two numbers a live draw
    // did instead of re-deriving one of them from a clock that has moved on.
    ...(event.writtenAt === undefined || event.turnStartedAt === undefined
      ? {}
      : { writtenThisTurn: event.writtenAt >= event.turnStartedAt }),
  };
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

/**
 * The feed and the revision, together, so they can never disagree.
 *
 * A re-delivered event is not a new settlement: `pushFeed` refuses it, and the counter has to
 * refuse it too, or a reconnect would re-read every worktree for work that had already been
 * counted.
 */
function settle(state: AppState, entry: FeedEntry): Pick<AppState, 'feed' | 'settled'> {
  const feed = pushFeed(state.feed, entry);
  return feed === state.feed
    ? { feed, settled: state.settled }
    : { feed, settled: state.settled + 1 };
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
  /**
   * Set when the team that just arrived is a **thread**.
   *
   * A thread has no team view — the team view of a one-member team is the member's transcript
   * with the roster furniture drawn around it — so the pane lands on its one member instead of
   * on `{kind: 'team'}`. This is also what makes a thread a legitimate thing to relaunch onto:
   * `.scratch/rail/issues/05-where-a-thread-is-hidden.md`.
   */
  readonly thread?: boolean;
}): Pane {
  const { open, arrived, roster, wanted, thread } = options;
  const onRoster = (agentId: string): boolean => roster.some((agent) => agent.id === agentId);
  if (wanted !== undefined && onRoster(wanted)) return { kind: 'agent', agentId: wanted };
  if (thread === true) {
    const only = roster[0];
    if (only !== undefined) return { kind: 'agent', agentId: only.id };
  }
  if (!arrived && open.kind === 'agent' && onRoster(open.agentId)) return open;
  // A thread the user pressed whose Team does not exist yet survives every snapshot: there is
  // nothing on the roster to resolve it to, and resetting to the team pane would drop the
  // person they selected the instant anything else re-read the store.
  if (open.kind === 'thread') return open;
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
    // A thread with nothing in it yet: no Agent exists, so nothing in the transcript can be
    // about it. An empty pane rather than the team's stream, which belongs to another team.
    pane.kind !== 'agent'
      ? pane.kind === 'thread'
        ? []
        : [...items]
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
 * And a fourth, which is the same rule read one turn wider (2026-09-04): **everything the agent
 * said to you** is outside, not only the paragraph the run ends on. It is drawn under the block
 * in the order it was said, where consecutive rows from one agent group into one turn. An agent
 * that pings three teammates writes a paragraph after every reply, and its last paragraph is the
 * last increment rather than a summary, so keeping only that one would throw away what it learned
 * about the other two. blobot provides no inference: it cannot summarise them and must not drop
 * them.
 *
 * A short caption is what stays in, and it is barely an exception. It introduces the call beneath
 * it and means nothing away from it, which is what {@link CAPTION} has always measured. Prose is
 * a caption only while the agent has more of its own work to come.
 */
export type Row =
  | { readonly kind: 'item'; readonly at: number; readonly item: Item }
  | {
      readonly kind: 'steps';
      readonly id: string;
      readonly at: number;
      /**
       * Whose turn this is: the agent the last prompt addressed. A run never spans two of them,
       * so an answer inside a fold is never ambiguous about who wrote it.
       */
      readonly agentId: string;
      /**
       * Everyone else who is in here, in the order they first appear: agents the prompt did not
       * address, and the far end of any mail. Empty for the ordinary run of one agent's own work.
       */
      readonly partnerIds: readonly string[];
      readonly items: readonly Item[];
    }
  /**
   * The half of a run that has not finished becoming a record: the principal's face over the
   * calls that are still open. It sits where its run sits rather than at the foot of the column,
   * so a fan-out with two agents working draws each block under its own fold instead of stacking
   * both of them below everybody's history.
   */
  | ({ readonly kind: 'live'; readonly id: string; readonly at: number } & LiveBlock)
  /**
   * Every Picture one agent showed in a turn, on one line.
   *
   * A turn that takes four screenshots drew four column-width pictures, one under the other with
   * a name and a caption between each, and the answer they were taken for ended up a screen and
   * a half below the question. The fold already makes this call for the same turn's *calls*; a
   * row makes it for what those calls produced.
   *
   * **Only ever more than one.** A single Picture is the thing you are being shown and it keeps
   * the column, because shrinking one picture to half width buys no scroll at all and costs the
   * detail the picture exists to carry.
   *
   * A Picture that could **not** be drawn never joins one. It is a sentence, it already counts
   * rather than repeating, and a row of them would be a row of nothing.
   */
  | {
      readonly kind: 'pictures';
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

/**
 * Whether a run may hold this item at all.
 *
 * One predicate for the principal and for a teammate, which is `.scratch/live-steps/issues/07`
 * arriving in the code: what admits a line is what the line *is*, and who spoke it decides only
 * where it comes back out — {@link runFrom}'s lifted set. There were two of these and they had
 * been identical since the day length stopped deciding admission; the comment on the second one
 * still described a difference that was no longer there.
 *
 * A **running call is admitted**, and that is ticket 08's whole change. It used to end the run,
 * which was harmless while one agent worked and false the moment two did: a teammate's open call
 * cut the principal's turn in half, so one turn drew as two folds with an unattributed mono line
 * between them. It is taken straight back out by {@link liveRunIn} and drawn under its agent's
 * face, so the run is computed once over both halves and rendered at two altitudes.
 *
 * Admitted only while the agent is **in a turn**. Without a status record — a persisted
 * transcript nobody is watching — a row that still says `running` is a record of a call whose
 * end was never learned, and lifting it into a live block would put a face over a dead turn.
 *
 * What is still refused is what has to reach the person: a question nobody has answered, and the
 * disclosures that exist *because* something happened off screen.
 *
 * **Prose is admitted whether or not it has finished**, which is the author's, 2026-09-05, from
 * watching it: a teammate's reply streamed at the top level for as long as it took to write and
 * then vanished into the fold the instant it stopped, while the agent the reader had actually
 * asked was working underneath it. Two costs and no benefit. The words were never addressed to
 * the reader, so they are noise while they arrive; and the reader watches a paragraph appear and
 * be taken away for a reason nothing on screen explains. Folded from the first delta, the same
 * reply simply is where it belongs from the start and never moves.
 *
 * Nothing is hidden by it. The **principal's** prose is lifted straight back out by
 * {@link runFrom} — all of it, live included — so letting a run reach past a sentence being
 * written changes only where the run ends. A **teammate's** was never going to stay on screen:
 * it folds a second later regardless, so refusing it here only chose which second.
 */
function runWork(item: Item, live: LiveNow): boolean {
  switch (item.kind) {
    case 'tool':
      if (item.status === 'asking') return false;
      return item.status !== 'running' || live(item.agentId);
    case 'permission':
      return item.outcome !== undefined;
    case 'agent':
      return true;
    default:
      return false;
  }
}

/**
 * Prose long enough to be an answer rather than a caption on a call.
 *
 * It used to be part of {@link settledWork}, which meant a paragraph *broke* the run outright.
 * That was right while a block was one agent's own work and is wrong across an exchange: an
 * agent that pings three teammates writes a paragraph after each reply, and every one of those
 * broke the run, so one prompt came back as four blocks with four of the agent's reports
 * standing between them. Only the last of those is an answer to you. The others are the agent
 * telling you what it has arranged so far, which is what a block is *for*.
 *
 * So length no longer decides admission. It decides where a run **ends**, in {@link runFrom},
 * and only in the stretch of the run that nobody else is in.
 */
function isAnswerLength(item: Item): boolean {
  return item.kind === 'agent' && item.text.trim().length > CAPTION;
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

/**
 * How many captions a block folded away. The header says it because they really are in here:
 * `Steps` draws every `agent` item in the run inside the fold, and a reader deciding whether to
 * open one wants to know there is prose behind the count and not only calls.
 *
 * They are `notes` and never `messages`, and the principal's alone. The word `messages` is spent
 * on {@link messagesIn} for what the fold now also holds — mail, and a teammate's own turn —
 * which is exactly what it always meant: what an agent says to you, or mails to a peer.
 *
 * That is a reversal, and worth naming as one. The rule here used to be that a message is
 * *never* folded, which was true while a block could only hold one voice. A teammate's reply to
 * your agent is a message and it does fold now, because it was never addressed to you.
 */
export function notesIn(items: readonly Item[], principal?: string): number {
  return items.filter((item) => item.kind === 'agent' && item.agentId === principal).length;
}

/**
 * Mail, and turns taken by somebody other than the principal. What the header counts as messages.
 *
 * With **no** principal — a block made entirely of a teammate's work — every turn in it is
 * somebody else's and all of them count. Written the other way round this returned zero there,
 * and the header drew a chevron with an empty label beside it: a fold that said nothing at all
 * about what it was holding.
 */
export function messagesIn(items: readonly Item[], principal?: string): number {
  return items.filter(
    (item) => item.kind === 'peer' || (item.kind === 'agent' && item.agentId !== principal),
  ).length;
}

/**
 * What the run changed, per file, summed across the calls that touched each one.
 *
 * Shut, a block used to say only how many calls it stood for, so the one question a reader
 * actually has about a fold they are not going to open — what did this turn touch — had no
 * answer at that altitude. Opened, the same fact is on the lines themselves and more precisely,
 * which is why the footer is drawn only while the block is shut rather than at both.
 *
 * `absent is not zero` survives the sum: a call with no measured diff contributes nothing, so a
 * file only ever edited by calls the runtime sent no diff block for is not listed at all. The
 * alternative is a `+0 −0` that reads as "changed nothing", which is a different claim.
 *
 * `name` is what the footer draws and `path` is what it is: the filename alone, because this is
 * a glance at what a turn touched and four workspace-relative paths in a row is a wall of shared
 * prefixes with the distinguishing word at the end of each. The line inside the fold keeps the
 * whole path, which is the same trade the block itself makes — shut is the glance, open is the
 * record. Where two touched files share a filename the short form would be a lie about how many
 * files there are, so **both** of them keep their whole path rather than one arbitrary winner.
 */
export function filesChangedIn(
  items: readonly Item[],
): readonly { path: string; name: string; added: number; removed: number }[] {
  const byPath = new Map<string, { path: string; name: string; added: number; removed: number }>();
  for (const item of items) {
    if (item.kind !== 'tool' || item.changed === undefined) continue;
    const seen = byPath.get(item.title);
    if (seen === undefined) {
      byPath.set(item.title, {
        path: item.title,
        name: fileName(item.title),
        added: item.changed.added,
        removed: item.changed.removed,
      });
      continue;
    }
    seen.added += item.changed.added;
    seen.removed += item.changed.removed;
  }

  const files = [...byPath.values()];
  const shared = new Set(
    files.map((file) => file.name).filter((name, index, all) => all.indexOf(name) !== index),
  );
  return files.map((file) => (shared.has(file.name) ? { ...file, name: file.path } : file));
}

/** The last segment of a path, on either separator, and the whole string if it has neither. */
function fileName(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const tail = cut === -1 ? path : path.slice(cut + 1);
  return tail.length === 0 ? path : tail;
}

/**
 * The run of work starting at `index`, and where it ends. Undefined when nothing starts here.
 *
 * One run holds three things now: the addressed agent's own settled steps, the mail it sent or
 * received, and the whole turn a teammate took because of that mail. They were two folds for
 * half a day — `ran 2 tools` and a separate `aside` — and that was one fold too many, by the
 * author: what the reader wants demoted is *everything the turn had to arrange*, and splitting
 * it by whether blobot classed a given line as a call or as a message is a distinction the
 * reader never asked about.
 *
 * A run has one **principal**, so two agents the user addressed never merge into one block: an
 * unattributed paragraph inside a fold would be read as the principal's, and on a fan-out that
 * would be blobot putting Bob's words under Alice's name.
 *
 * With nothing addressed — the top of a bounded transcript — every speaker is a principal
 * candidate, which is exactly the single-speaker rule this had before the addressed set existed.
 * That is the honest failure rather than a guess: blobot does not know who was asked above the
 * window it holds.
 */
function runFrom(
  items: readonly Item[],
  index: number,
  addressed: ReadonlySet<string>,
  live: LiveNow,
  folded: ReadonlySet<string>,
): {
  end: number;
  principal: string | undefined;
  said: readonly number[];
  live: readonly number[];
} | undefined {
  let principal: string | undefined;
  let end = index;

  while (end < items.length) {
    const item = items[end] as Item;
    // Mail belongs to whichever run it is sitting in. It is nobody's turn -- `speakerOf` says so
    // -- and it is the hinge between the principal's work and the teammate's, so a run that
    // stopped at it would put the outbound line between two folds of one exchange.
    if (item.kind === 'peer') {
      // Mail is nobody's turn, but it is somebody's act: an outbound line from an addressed
      // agent settles whose run this is, which is how a run that opens on the mail itself knows
      // the sender is the principal rather than one more partner.
      if (principal === undefined && addressed.has(item.fromId)) principal = item.fromId;
      end += 1;
      continue;
    }
    const speaker = speakerOf(item);
    if (speaker === undefined) break;

    if (isPrincipal(addressed, speaker)) {
      if (principal !== undefined && principal !== speaker) break;
      if (!runWork(item, live)) break;
      principal = speaker;
    } else if (!runWork(item, live)) {
      break;
    }
    end += 1;
  }

  if (end === index) return undefined;

  // The live half, taken out before anything else is decided about the run, so that everything
  // below reads as though the run ended where the work still happening begins. That is what
  // keeps the caption above a running batch lifted out as a loose row for the block to group
  // under, which is what it did when an open call ended the run outright.
  const inFlight = liveRunIn(items, index, end, principal, live, folded);
  const isLive = new Set(inFlight);

  /*
   * What the principal actually said to you, which is never inside the block.
   *
   * The rule arrived in four steps in one day and the last step is the author's, from a real
   * transcript. Popping trailing prose off the *end* was right while a block held one voice: the
   * teammate's reply lands after your agent's words, so trimming the end folds away the only
   * thing addressed to you. Cutting the run at that prose stranded whatever the teammate did
   * afterwards below it as a second, unattributed block. Lifting only the *last* prose out then
   * looked right and was worse than either: an agent that pings three teammates writes a
   * paragraph after every reply, and its last paragraph is the last increment, not a summary --
   * so folding the earlier ones threw away everything it had learned about the other two.
   *
   * So the line is drawn by **who it was addressed to** and by nothing else. Everything the
   * principal said to you comes out and is drawn under the block, in order; the mail, the calls
   * and the teammates' own turns stay in. A short caption is the one exception, and it is not
   * really one: it introduces the call beneath it, is meaningless away from it, and is the
   * reading this block was built on.
   *
   * Prose is a caption only while the principal has more of its own work to come. The last thing
   * it says is its answer at any length, which is what {@link CAPTION} was always guarding, and a
   * paragraph is an answer wherever it stands.
   */
  const lifted: number[] = [];
  let trailing = true;
  for (let back = end - 1; back >= index; back -= 1) {
    const item = items[back] as Item;
    if (item.kind === 'peer' || speakerOf(item) !== principal) continue;
    // Skipped without clearing `trailing`: these are leaving the run, and the prose above them
    // is the caption on work the reader can still see.
    if (isLive.has(back)) continue;
    if (item.kind !== 'agent') {
      trailing = false;
      continue;
    }
    if (trailing || isAnswerLength(item)) lifted.push(back);
  }
  lifted.reverse();

  return { end, principal, said: lifted, live: inFlight };
}

/**
 * The principal's calls that have not finished, and the settled ones that will leave with them.
 *
 * A step leaves the block for exactly one reason, it finished (`issues/04`) — so a call that
 * returns while its neighbours are still open must not jump out of the block and back into the
 * column above it as a lone unattributed line. Its **batch** is what it leaves with, and a batch
 * is a run of calls with none of the agent's own narration between them: the walk starts at the
 * earliest still-open call and extends backwards over contiguous calls until it meets a caption.
 *
 * A teammate's items are stepped over rather than stopping it, because they are somebody else's
 * work happening in the middle of this one's batch and say nothing about where the batch begins.
 *
 * Only the principal's calls. A teammate has no live block of its own in a team pane
 * (`issues/08`): its open calls stay inside the run they were caused by, and what says it is
 * working is that block. In its own pane it *is* the principal — {@link itemsFor} filters the
 * other agents out before any of this runs, so nothing is addressed there and
 * {@link isPrincipal} answers yes.
 *
 * **A teammate's reply, once it has finished, is a step in here too.** The author's, 2026-09-05,
 * and it is the middle of three positions rather than a return to the first. Drawn at the top
 * level while it streams, it is a paragraph nobody in the room was addressed in taking the column
 * from the agent the reader did ask; dropped straight into the shut fold, it is a reply the
 * reader never sees arrive at all. As a step it sits where the rest of the turn's machinery sits,
 * at the altitude of a call and clipped to the one line a glance can use, and it leaves the way a
 * call leaves — when the turn ends and the fold takes the whole block. Live prose is not in here:
 * *when it finished* is the whole of the instruction.
 */
function liveRunIn(
  items: readonly Item[],
  index: number,
  end: number,
  principal: string | undefined,
  live: LiveNow,
  folded: ReadonlySet<string>,
): number[] {
  if (principal === undefined || !live(principal)) return [];

  const calls: number[] = [];
  const replies: number[] = [];
  let open = -1;
  let lastOwn = -1;
  for (let at = index; at < end; at += 1) {
    const item = items[at] as Item;
    const speaker = speakerOf(item);
    if (speaker === undefined) continue;
    if (speaker !== principal) {
      if (item.kind === 'agent' && !item.live) replies.push(at);
      continue;
    }
    lastOwn = at;
    if (item.kind !== 'tool') continue;
    calls.push(at);
    if (open === -1 && item.status === 'running') open = at;
  }

  let batch: number[] = [];
  if (open !== -1) {
    let from = calls.indexOf(open);
    while (from > 0) {
      if (narratedBetween(items, calls[from - 1] as number, calls[from] as number, principal)) break;
      from -= 1;
    }
    batch = calls.slice(from);
  }

  /*
   * Every settled reply in the run, and **how long each stands is not decided here.**
   *
   * Two rules were tried and both were wrong for the same reason, which the third attempt
   * measured. Collecting every reply left a teammate's line standing for the rest of the turn
   * with a second stacked under it. Bounding it by position — after the open batch's first call,
   * or after the last thing the principal did — made it never appear at all.
   *
   * From a real run: Bob's reply is item **21** while Alice is already at item 25 and climbing.
   * An agent message takes its `at` from its **first delta**, so a reply that took a few seconds
   * to write is inserted at the moment it *began*, and by the time it settles the principal has
   * moved past that position. It is new, and it is behind. No comparison of positions can call it
   * news, because by position it is not.
   *
   * What is new is the **transition**, a live message becoming a settled one, and nothing in the
   * item records when that happened. The only place that sees one render follow another is the
   * renderer, so this hands over everything that has settled and `useDwell` decides how long a
   * reply stands.
   */
  // In the order they happened: a reply that came back between two calls belongs between them,
  // because this is the turn as it is being lived rather than two lists stacked.
  //
  // Minus anything a fold has already taken. {@link NOTHING_FOLDED} has the reason: the
  // backwards walk above cannot tell a batch opened together from two calls that merely had
  // nothing said between them, and only the renderer knows which of them the reader has already
  // watched being filed away. A step leaves the block once.
  return [...batch, ...replies]
    .filter((at) => !folded.has((items[at] as Item).id))
    .sort((left, right) => left - right);
}

/** Whether the principal said anything of its own between two of its calls, which ends a batch. */
function narratedBetween(
  items: readonly Item[],
  after: number,
  before: number,
  principal: string,
): boolean {
  for (let at = after + 1; at < before; at += 1) {
    const item = items[at] as Item;
    if (speakerOf(item) === principal) return true;
  }
  return false;
}

/** Everyone in a run who is not the principal: teammates who spoke, and the far end of mail. */
function partnersOf(run: readonly Item[], principal: string | undefined): string[] {
  const partners: string[] = [];
  const add = (id: string): void => {
    if (id !== principal && !partners.includes(id)) partners.push(id);
  };
  for (const item of run) {
    if (item.kind === 'peer') {
      add(item.fromId);
      add(item.toId);
      continue;
    }
    const speaker = speakerOf(item);
    if (speaker !== undefined) add(speaker);
  }
  return partners;
}

/** Whether anybody but the principal actually took a turn in here, rather than only being mailed. */
function partnerSpoke(run: readonly Item[], principal: string | undefined): boolean {
  return run.some((item) => {
    const speaker = speakerOf(item);
    return speaker !== undefined && speaker !== principal;
  });
}

/**
 * The transcript's rows: every item as itself, except settled runs of work, which fold.
 *
 * The addressed set is read off the last thing the user said and off nothing else. Nothing new is
 * stored for any of this, and nothing is reordered: where a runtime narrates after its call, the
 * agent's mail out stays on its own line above its own answer and only what came back folds.
 */
export function rowsOf(
  items: readonly Item[],
  live: LiveNow = NOBODY_LIVE,
  folded: ReadonlySet<string> = NOTHING_FOLDED,
): Row[] {
  const rows: Row[] = [];
  let index = 0;
  let addressed: ReadonlySet<string> = new Set();

  while (index < items.length) {
    const start = items[index] as Item;

    // Whose thread this is now. A fan-out addresses several, and then several agents are
    // answering the user directly and none of them is anybody's aside.
    if (start.kind === 'user') addressed = new Set(start.agentIds);

    const found = runFrom(items, index, addressed, live, folded);
    if (found !== undefined) {
      // The run with everything the principal said to you taken out of it. What is left holds
      // its own order, and so does what came out.
      const said = new Set(found.said);
      const inFlight = new Set(found.live);
      const run = items
        .slice(index, found.end)
        .filter((_, at) => !said.has(index + at) && !inFlight.has(index + at));
      const answer = found.said.map((at) => items[at] as Item);
      const open = found.live.map((at) => items[at] as Item);
      const principal = found.principal;
      const partnerIds = partnersOf(run, principal);
      /*
       * Two ways in. The ordinary one is the tool threshold: below it a fold is a line replaced
       * by a line, plus a click. The other is a teammate having taken a turn in here, which
       * always folds however short it is, because that turn is the thing the reader did not ask
       * for and the whole reason any of this exists.
       *
       * Mail with no turn behind it is neither: one outbound line nobody has answered yet is
       * already one line, and it is the addressed agent's own act rather than somebody else's.
       */
      if (run.length > 0 && (partnerSpoke(run, principal) || toolsIn(run) >= WORTH_FOLDING)) {
        rows.push({
          kind: 'steps',
          id: `steps:${(run[0] as Item).id}`,
          at: (run[0] as Item).at,
          // Empty when nobody in here was addressed, which is a run made entirely of a teammate's
          // work. Then there is no principal, everybody in it is a partner, and every line of it
          // is drawn under its own name rather than as the block's own narration.
          agentId: principal ?? '',
          partnerIds,
          items: run,
        });
      } else {
        /*
         * Below the threshold a fold costs more than it saves, so the remainder is drawn flat.
         * The whole remainder rather than one item and another attempt: both ways in are
         * monotonic over a prefix, so a run that does not qualify has no sub-run that does, and
         * re-entering here would only re-derive the same answer one item at a time.
         */
        for (const item of run) rows.push({ kind: 'item', at: item.at, item });
      }
      for (const said of answer) rows.push({ kind: 'item', at: said.at, item: said });
      /*
       * The block stands for as long as the turn does, and **not only while a call is open**.
       *
       * `.scratch/live-steps/issues/01`, second amendment. Between two batches an agent goes
       * back to `thinking`: its calls settle, its steps fold, and the block had nothing left in
       * it, so it came off the screen and the pending bubble reappeared at the foot of the
       * column, grouped under the fold and therefore faceless. Three dots in a gutter under a
       * shut fold is what *"nothing is shown"* looks like, and it is the state a reasoning model
       * spends most of a turn in.
       *
       * So the emptiness is the point rather than the reason to stop drawing: the face is the
       * carrier, standing at the end of its own run, and the dots are the same device the rail
       * and the pending bubble already use. Only on the last run, because a turn in flight is
       * the tail of the transcript and an earlier run by the same agent is finished history.
       */
      const turning = open.length > 0 || (principal !== undefined && live(principal) && found.end === items.length);
      if (turning) {
        rows.push({
          kind: 'live',
          /*
           * Keyed by the agent and never by what is in it. The block is one thing for the length
           * of a turn -- steps arrive and leave inside it -- and keying it by its first item made
           * React unmount and remount the whole block every time that item changed, which threw
           * away the face's animation state and, with it, `useDwell`'s memory of what had just
           * been on screen. One live block per agent at a time, because one turn is.
           */
          id: `live:${principal as string}`,
          // Where the run ends when there is nothing open: the block is the turn continuing, so
          // it sits after everything the turn has settled rather than at its first open call.
          at: open[0]?.at ?? (items[found.end - 1] as Item).at,
          agentId: principal as string,
          items: open,
        });
      }
      index = found.end;
      continue;
    }

    rows.push({ kind: 'item', at: start.at, item: start });
    index += 1;
  }

  return oneRowPerTurnsPictures(rows);
}

/**
 * A turn's Pictures, gathered onto one row.
 *
 * The window is the runs and the Pictures between them, and it closes on anything else: prose,
 * a user message, a system line, a block still in flight. So Pictures are only ever gathered
 * across the turn's own **demoted** work -- the folds -- and never across something somebody
 * said. That is the same editorial call the fold itself makes, applied to what the calls
 * produced rather than to the calls: the mechanics go first, and what came of them is the thing
 * you are left looking at.
 *
 * It is the one place in this column that moves a row past another. What it moves past is a shut
 * fold, and it keeps the folds in their own order, so nothing that is legible on screen changes
 * position relative to anything else that is.
 *
 * One agent, because a row of pictures under one face has to be that face's work.
 */
function oneRowPerTurnsPictures(rows: readonly Row[]): Row[] {
  const grouped: Row[] = [];
  let index = 0;
  while (index < rows.length) {
    const window = pictureWindowFrom(rows, index);
    if (window === undefined) {
      grouped.push(rows[index] as Row);
      index += 1;
      continue;
    }
    for (const row of window.others) grouped.push(row);
    const last = window.pictures[window.pictures.length - 1] as Item;
    grouped.push({
      kind: 'pictures',
      id: `pictures:${(window.pictures[0] as Item).id}`,
      at: last.at,
      agentId: window.agentId,
      items: window.pictures,
    });
    index = window.end;
  }
  return grouped;
}

/** The longest run of folds and one agent's drawn Pictures starting here, if it holds two. */
function pictureWindowFrom(
  rows: readonly Row[],
  from: number,
): { others: Row[]; pictures: Item[]; agentId: string; end: number } | undefined {
  const others: Row[] = [];
  const pictures: Item[] = [];
  let agentId: string | undefined;
  let index = from;
  while (index < rows.length) {
    const row = rows[index] as Row;
    if (row.kind === 'steps') {
      others.push(row);
      index += 1;
      continue;
    }
    const item = row.kind === 'item' ? row.item : undefined;
    if (item?.kind !== 'picture' || item.notDrawn !== undefined) break;
    if (agentId !== undefined && agentId !== item.agentId) break;
    agentId = item.agentId;
    pictures.push(item);
    index += 1;
  }
  return pictures.length > 1 && agentId !== undefined
    ? { others, pictures, agentId, end: index }
    : undefined;
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

// ------------------------------------------------------------------ the rail's contents

/**
 * One row in the rail, of the two kinds that are now peers.
 *
 * `.scratch/rail/`. The rail was a list of teams with the open team's roster nested under it, so
 * a person the user hired existed on screen as a child of a project, and only while that project
 * was the one being read. Now every hired agent is a row of its own and every team is one row
 * that opens no roster, in one list ordered by recency with a pin.
 *
 * Both kinds wear the same shape, which is what makes them peers in the literal sense: a 34px
 * mark, the name and the time on the first line, the last thing said on the second. Neither
 * reads as a heading over the other, because the 20px team row was small only while it *headed*
 * a roster, and there is no roster under it now.
 */
export type RailRow =
  | {
      readonly kind: 'team';
      readonly id: string;
      readonly name: string;
      readonly team: UiTeamSummary;
      readonly at?: number;
      readonly last?: string;
      readonly status?: { readonly status: AgentStatus; readonly label: string };
      /**
       * Members past the three the mark can hold. Absent below four, and **absent whenever a
       * status is showing**: the right of a row says one thing at a time, and a stack capped at
       * three would otherwise be claiming *three people* about a team of nine.
       */
      readonly more?: number;
      readonly unread: boolean;
      readonly pinned: boolean;
    }
  | {
      readonly kind: 'agent';
      readonly id: string;
      readonly name: string;
      readonly agent: UiRailAgent;
      readonly at?: number;
      readonly last?: string;
      readonly status?: { readonly status: AgentStatus; readonly label: string };
      /**
       * What the Machine behind this agent's thread is doing. Absent while the thread is not
       * loaded, which is the only honest answer there: nothing is running to ask.
       *
       * A thread has exactly one member, so this is that member's reading and never a fold.
       * Team rows carry none: four Machines do not fold into one dot the way four statuses fold
       * into a `StatusWord`, and nobody has asked what a team's power is.
       */
      readonly power?: MachinePower;
      readonly unread: boolean;
      readonly pinned: boolean;
    };

/** How many faces a team's mark holds before the rest become a count. See `TeamMark`. */
export const MARK_FACES = 3;

/**
 * The rail's list: teams and agents, mixed, ordered by recency, pinned rows in a block on top.
 *
 * The single seam for all five of those decisions, which is why it is a pure function here
 * rather than five conditions spread through the component. `Rail.tsx` renders what this says.
 *
 * **Ordering is by last activity across both kinds**, and an agent who has never said anything
 * sorts on their **hire time** — so the order is total with no special case, and a fresh hire
 * lands near the top where the person who just made them is looking.
 *
 * **An agent row draws its thread's status and its thread's unread, and nothing about its
 * seats.** Argued both ways on `.scratch/rail/issues/08` and decided against, on the grounds
 * that pressing that row opens the agent's thread, which is not where a team's permission
 * request is: a row would be reporting a problem it cannot lead you to. The team row carries
 * that, inverted, and is both correct and pressable.
 */
export function railRowsOf(options: {
  readonly teams: readonly UiTeamSummary[];
  readonly profiles: readonly UiRailAgent[];
  readonly statuses: Readonly<Record<string, AgentStatus>>;
  readonly unread: readonly string[];
  /** Pinned row ids — a team id or a profile id — in the order the user pinned them. */
  readonly pinned: readonly string[];
}): readonly RailRow[] {
  const { teams, profiles, statuses, unread, pinned } = options;
  const statusOf = (agentIds: readonly string[]): RailRow['status'] => {
    if (agentIds.length === 0) return undefined;
    const folded = foldTeamStatus(agentIds.map((id) => statuses[id] ?? 'idle'));
    return folded.status === 'idle' ? undefined : folded;
  };
  // A thread is a Team in the store and never one on screen, so the team rows are the teams
  // that are not threads and the thread rows are drawn from their agent instead.
  const threads = new Map(
    teams.filter((team) => team.threadFor !== undefined).map((team) => [team.id, team]),
  );

  const teamRows: RailRow[] = teams
    .filter((team) => team.threadFor === undefined)
    .map((team) => {
      const status = statusOf(team.members.map((member) => member.id));
      const more = team.members.length - MARK_FACES;
      return {
        kind: 'team' as const,
        id: team.id,
        name: team.name,
        team,
        ...(team.lastActiveAt === undefined ? {} : { at: team.lastActiveAt }),
        ...(team.lastLine === undefined ? {} : { last: team.lastLine }),
        ...(status === undefined ? {} : { status }),
        // Dropped while a status is showing, which is the *one thing at a time* rule the right
        // edge already had. A team that is working is not also usefully described by its size.
        ...(more > 0 && status === undefined ? { more } : {}),
        unread: team.members.some((member) => unread.includes(member.id)),
        pinned: pinned.includes(team.id),
      };
    });

  const agentRows: RailRow[] = profiles.map((profile) => {
    const thread = profile.threadId === undefined ? undefined : threads.get(profile.threadId);
    const members = thread?.members ?? [];
    const status = statusOf(members.map((member) => member.id));
    const power = members[0]?.machinePower;
    return {
      kind: 'agent' as const,
      id: profile.id,
      name: profile.name,
      agent: profile,
      ...(power === undefined ? {} : { power }),
      // Hire time is a never-talked agent's activity. Not a missing value handled separately:
      // it is what they last did, and it is what makes this sort total.
      at: thread?.lastActiveAt ?? profile.hiredAt,
      ...(thread?.lastLine === undefined ? {} : { last: thread.lastLine }),
      ...(status === undefined ? {} : { status }),
      unread: members.some((member) => unread.includes(member.id)),
      pinned: pinned.includes(profile.id),
    };
  });

  const byRecency = (left: RailRow, right: RailRow): number => (right.at ?? 0) - (left.at ?? 0);
  const rest = [...teamRows, ...agentRows].filter((row) => !row.pinned).sort(byRecency);
  // Pinned rows keep **pin order**, not recency: the block exists so the rows a person returns
  // to stay where they left them, and reordering it under them would undo the whole point.
  const block = pinned.flatMap((id) => {
    const row = [...teamRows, ...agentRows].find((candidate) => candidate.id === id);
    return row === undefined ? [] : [row];
  });
  return [...block, ...rest];
}
