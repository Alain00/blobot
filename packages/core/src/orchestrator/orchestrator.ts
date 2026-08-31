import type { Clock } from '../clock.js';
import { SystemClock } from '../clock.js';
import type { AgentEvent } from '../events.js';
import { uuidv7, type IdFactory } from '../ids.js';
import type {
  AgentRuntime,
  AttachmentSupport,
  PeerMessageAck,
  PeerMessageCall,
  RoutineProposalAck,
  RoutineProposalCall,
  PermissionOption,
  PermissionRequest,
  Prompt,
  Unsubscribe,
} from '../runtime.js';
import type { AvailableCommand } from '../runtime.js';
import { AgentStatusTracker, type AgentStatus } from '../status.js';
import { DEFAULT_COMPACTION, type Agent, type Message, type Team } from './domain.js';
import type { ScheduledRoutine } from '../routines/domain.js';
import { findAgentByName, namesMentioned } from './roster.js';
import {
  PEER_CONTEXT_LIMIT,
  PEER_MESSAGE_LIMIT,
  ROUTINE_PROPOSALS_PER_TURN,
  ROUTINE_PROPOSALS_STANDING,
  ROUTINE_TURN_BUDGET,
  WAKE_BATCH_LIMIT,
  attachmentNotAccepted,
  contextTooLong,
  tooLongToSend,
  tooManyProposalsStanding,
  tooManyProposalsThisTurn,
} from './bounds.js';
import { describeFrequency, describeSchedule } from '../routines/schedule.js';
import { checkProposalText, parseProposedSchedule } from '../routines/proposal.js';
import type { Routine } from '../routines/domain.js';
import {
  HANDOFF_EMPTY,
  HANDOFF_LIMIT,
  HANDOFF_PROMPT,
  HANDOFF_STOPPED,
  RESTART_FAILED,
  handoffTooLong,
  overCompactionThreshold,
  resumeFromHandoff,
  type HandoffArchive,
} from './compaction.js';
import { workingCeiling } from '../context-ceiling.js';
import { composeLeadBrief, composeWakePrompt } from './envelope.js';
import {
  InMemoryMessageStore,
  type AttachmentStore,
  type MessageStore,
} from './message-store.js';

/** What the orchestrator tells the transcript. Structural, so core never imports the store. */
export interface TurnRecorder {
  turnStarted(agentId: string, at: number, triggerMessageId?: string): void;
  record(event: AgentEvent): void;
}

export interface OrchestratorOptions {
  readonly team: Team;
  readonly agents: readonly Agent[];
  /** One runtime per agent, keyed by agent id. The orchestrator never learns which provider. */
  readonly runtimes: ReadonlyMap<string, AgentRuntime>;
  readonly store?: MessageStore & AttachmentStore;
  readonly clock?: Clock;
  readonly createId?: IdFactory;
  /** Where the durable subset of the stream is written. Omit and nothing is persisted. */
  readonly recorder?: TurnRecorder;
  /**
   * What anybody has established about each agent's model, in tokens, keyed by agent id.
   *
   * A plain number, resolved by whoever had the `runtime_id` in hand — ticket 09's split, so
   * only the *lookup* knows a provider exists and the arithmetic here does not. An absent key
   * is the ordinary case and means nobody measured this model, not that there is no ceiling:
   * `workingCeiling` falls back conservatively against whatever window the runtime reports.
   */
  readonly contextCeilings?: ReadonlyMap<string, number>;
  /**
   * Where a handoff is kept for the user to read. Omit and one is still carried into the fresh
   * session — the archive is the record, never the route.
   */
  readonly handoffs?: HandoffArchive;
  /**
   * Where Routines are kept. Omit and `propose_routine` is not offered at all, which is the
   * honest answer for a team whose database is thrown away when the window closes.
   */
  readonly routines?: RoutineStore;
}

/**
 * The half of the store a proposal needs. Structural, and `SqliteStore` satisfies it, so the
 * orchestrator still imports no SQLite.
 */
export interface RoutineStore {
  createRoutine(routine: Routine): Routine;
  routinesOfAgent(agentId: string): Routine[];
}

/**
 * A tool call an agent is blocked on until a human answers.
 *
 * The runtime's `PermissionRequest` with an id of ours on it. The id exists because the answer
 * comes back from somewhere else entirely — a click in another process — and the promise the
 * runtime is waiting on has to be found again by name.
 */
export interface PendingPermission {
  readonly id: string;
  readonly agentId: string;
  readonly toolCallId: string;
  readonly title: string;
  readonly options: readonly PermissionOption[];
}

/**
 * How a permission request ended. `cancelled` is nobody answering: the team was stopped, or
 * the chosen option does not exist on this runtime. It is not the same as a rejection, and the
 * transcript says which.
 *
 * `allowed_always` is separate from `allowed` because it is not the same act: it leaves a
 * standing rule behind, and the line the transcript keeps has to say so.
 */
export type PermissionOutcome = 'allowed' | 'allowed_always' | 'rejected' | 'cancelled';

/**
 * An agent named a teammate the user had just named, and wrote to nobody.
 *
 * The failure this is written against was observed live: asked to get Bob on the API side,
 * Alice answers *"I'll ask Bob to review it"*, never calls `message_agent`, and the transcript
 * looks perfectly healthy. Ticket 05's *ack means committed* covers the message that was sent;
 * nothing covered the message that was never attempted.
 *
 * **blobot surfaces this and never repairs it.** There is no button that sends the message for
 * her: composing the message she did not send would be blobot deciding what it should have
 * said, which is inference, and blobot provides none. See
 * `.scratch/team-addressing/issues/05-mock-a-coordinator-that-forgets-to-route.md`.
 */
export interface SilentHandoff {
  readonly teamId: string;
  /** Who spoke. */
  readonly agentId: string;
  /** The teammates they named and never wrote to, in roster order. */
  readonly named: readonly string[];
  readonly at: number;
}

/** What `#runTurn` needs to remember about the user's prompt to observe a silent handoff. */
interface HandoffWatch {
  readonly prompt: string;
  /** Every agent that prompt was addressed to, including the one holding this turn. */
  readonly addressed: readonly string[];
  /**
   * The **lead**, holding a prompt in which the user named nobody at all.
   *
   * It drops the *"the prompt named that teammate"* clause, which a lead breaks by definition:
   * the whole premise of a lead is that the user named no one, so there is no name in the
   * prompt to match against. See issue 06, which reopened issue 02 to build this, and which
   * carries the cost of the widening on the record.
   */
  readonly leading: boolean;
}

/**
 * What a compaction did, for the caller that has to write it down.
 *
 * `sessionId` is what the agent is on *now*: unchanged on `command` and on `refused`, and a
 * string the provider has never used before on `handoff`. That last case is the reason this
 * exists at all — a relaunch resumes from the last session row, and a row still naming the
 * closed session would bring an agent back to a conversation the provider has thrown away.
 */
export interface Compacted {
  readonly teamId: string;
  readonly agentId: string;
  readonly how: 'command' | 'handoff' | 'refused';
  /** The session that was open when blobot decided. */
  readonly previousSessionId: string;
  /** The session the agent is on now. Equal to the above unless `how` is `handoff`. */
  readonly sessionId: string;
  readonly at: number;
  readonly handoff?: string;
}

export interface BudgetExhausted {
  readonly teamId: string;
  readonly turnsUsed: number;
  readonly turnBudget: number;
  /** Messages sitting in mailboxes that the budget is holding back. */
  readonly pending: number;
}

/**
 * How a Routine's firing ended, as the orchestrator saw it.
 *
 * `busy` is not a {@link RoutineOutcome} and is deliberately not recorded as one: nothing was
 * committed, nothing ran, and no firing has yet happened. It is the answer to *may I start*, and
 * the caller holds the firing until the agent is free or the run has waited long enough.
 */
export type RoutineTurn =
  | { readonly outcome: 'ran' }
  /** A turn started and did not finish. The reason is prose, and goes on the run. */
  | { readonly outcome: 'stopped'; readonly reason: string }
  | { readonly outcome: 'busy' };

/**
 * Owns agent-to-agent communication: the mailbox, the wake policy, the turn budget, and the
 * peer-message tool handler itself. A plain TypeScript module with no Electron imports.
 *
 * Everything here is *our* concern rather than ACP's, and no part of it knows which provider
 * an agent is.
 */
/**
 * The event types that are the agent *talking*, as opposed to the agent working.
 *
 * Held apart only for compaction turns, where what was said was addressed to blobot rather than
 * to the reader. Everything outside this set is what a turn did, and is published and recorded
 * whoever asked for it.
 */
const SPOKEN = new Set<AgentEvent['type']>([
  'agent_message_delta',
  'agent_message_completed',
  'agent_thought_delta',
]);

export class Orchestrator {
  readonly team: Team;

  readonly #agents: readonly Agent[];
  readonly #runtimes: ReadonlyMap<string, AgentRuntime>;
  readonly #store: MessageStore & AttachmentStore;
  readonly #clock: Clock;
  readonly #createId: IdFactory;
  readonly #recorder: TurnRecorder | undefined;

  readonly #trackers = new Map<string, AgentStatusTracker>();
  readonly #busy = new Set<string>();
  readonly #inFlight = new Set<Promise<void>>();
  readonly #eventListeners = new Set<(event: AgentEvent) => void>();
  readonly #statusListeners = new Set<(agentId: string, status: AgentStatus) => void>();
  readonly #commandListeners = new Set<
    (agentId: string, commands: readonly AvailableCommand[]) => void
  >();
  readonly #budgetListeners = new Set<(exhausted: BudgetExhausted) => void>();
  readonly #silentHandoffListeners = new Set<(observed: SilentHandoff) => void>();
  readonly #messageListeners = new Set<(message: Message) => void>();
  /** The size of the last prompt the orchestrator composed for each agent, for `injectionOf`. */
  readonly #lastWake = new Map<string, { chars: number; messages: number }>();
  /**
   * What has been attached into each session, cumulatively.
   *
   * Cumulative and not per-turn, which is the whole point: an embedded image stays in the
   * session's history for the life of the session. Every other figure under the gauge is a
   * per-turn one, so this one has to be counted differently or it would be read as one.
   */
  readonly #attachmentsSent = new Map<string, { count: number; bytes: number }>();
  readonly #permissionListeners = new Set<(pending: PendingPermission) => void>();
  readonly #permissionSettledListeners = new Set<
    (id: string, outcome: PermissionOutcome) => void
  >();
  /**
   * Requests nobody has answered yet, by the id the answer will come back with — the question
   * so a pane rebuilt mid-turn can draw the blocks it missed, and the resolver so the turn on
   * the other end of it can be released.
   */
  readonly #pendingPermissions = new Map<
    string,
    { readonly pending: PendingPermission; readonly resolve: (optionId: string | null) => void }
  >();
  readonly #subscriptions: Unsubscribe[] = [];
  /**
   * Who each agent has written to during the turn it is holding right now, by sender id.
   *
   * Populated for every turn: the silent-handoff observation reads it on a watched turn, and
   * the routing-turn refund reads it on any turn at all, because that exemption is defined by
   * what a turn did rather than by what started it. A session runs one turn at a time, so the
   * agent id is key enough.
   */
  readonly #wroteThisTurn = new Map<string, Set<string>>();

  /** The budget is per *prompt*: it is the thing that bounds cost when agents ping-pong. */
  #turnsThisPrompt = 0;
  /**
   * What the current prompt's budget is. The team's `turnBudget` for the user's own words, and
   * {@link ROUTINE_TURN_BUDGET} for a Routine run, which has no person to answer *continue?*.
   */
  #budgetCeiling: number;
  /**
   * Agents holding a Routine run right now, and how long a permission request may wait.
   *
   * Issue 03: a parked run expires, and **the expiry belongs to the run rather than to the
   * request**. A user's own turn still waits forever, because they started it and can answer
   * it, and an agent blocked on a human sitting there until answered is the property the rail's
   * one contrast inversion is spent on. A timeout on that would be this effort quietly changing
   * a decision that is not its own.
   */
  readonly #routines: RoutineStore | undefined;
  readonly #routineListeners = new Set<() => void>();
  readonly #scheduledListeners = new Set<(scheduled: ScheduledRoutine) => void>();
  /**
   * Proposals made in the turn each agent is holding. Reset where `#wroteThisTurn` is, because
   * both answer a question about one turn and neither survives it.
   */
  readonly #proposedThisTurn = new Map<string, number>();
  readonly #routineRuns = new Map<
    string,
    { runId: string; expiryMs: number; expired?: string; budgetHalted?: boolean }
  >();

  /**
   * The last real occupancy reading per agent, which is what a threshold is measured against.
   *
   * Ticket 08's trap applies here as much as it does to the gauge: a cancelled turn leaves
   * `used: 0` behind, and a stored zero is a reset rather than an empty context. Taking it
   * would make a full agent look empty and quietly switch compaction off for it.
   */
  readonly #usage = new Map<string, { used: number; size: number }>();
  readonly #contextCeilings: ReadonlyMap<string, number>;
  readonly #handoffs: HandoffArchive | undefined;
  /** Agents inside a compaction right now. The turns it runs must not start another one. */
  readonly #compacting = new Set<string>();
  readonly #compactionListeners = new Set<(compacted: Compacted) => void>();

  constructor(options: OrchestratorOptions) {
    this.team = options.team;
    this.#agents = options.agents;
    this.#runtimes = options.runtimes;
    this.#store = options.store ?? new InMemoryMessageStore();
    this.#clock = options.clock ?? new SystemClock();
    this.#createId = options.createId ?? uuidv7;
    this.#recorder = options.recorder;
    this.#contextCeilings = options.contextCeilings ?? new Map();
    this.#handoffs = options.handoffs;
    this.#budgetCeiling = options.team.turnBudget;
    this.#routines = options.routines;

    for (const agent of this.#agents) {
      const tracker = new AgentStatusTracker(agent.id);
      tracker.onChange((status) => {
        for (const listener of this.#statusListeners) listener(agent.id, status);
      });
      this.#trackers.set(agent.id, tracker);

      const runtime = this.#runtimes.get(agent.id);
      if (runtime === undefined) continue;
      // The turn blocks here until somebody answers, which is why it is a callback and not an
      // event: there is a reply channel and a correlation id, and ticket 04 kept both out of
      // the event vocabulary. Installed for every agent whether or not anything is listening —
      // `#askPermission` answers on its own when nobody is.
      runtime.setPermissionHandler((request) => this.#askPermission(request));
      this.#subscriptions.push(
        // A menu, not agent state: it never enters the event stream and the recorder never
        // sees it (ticket 04). It is relayed because the composer is in another process and
        // the runtimes are in this one.
        runtime.onCommandsChange((commands) => {
          for (const listener of this.#commandListeners) listener(agent.id, commands);
        }),
        runtime.onLifecycleChange((lifecycle) => tracker.lifecycleChanged(lifecycle)),
        // Events belonging to no turn — process death between turns.
        runtime.onEvent((event) => {
          this.#publish(event);
          tracker.apply(event);
          this.#recorder?.record(event);
        }),
      );
    }
  }

  get agents(): readonly Agent[] {
    return this.#agents;
  }

  get store(): MessageStore & AttachmentStore {
    return this.#store;
  }

  get turnsThisPrompt(): number {
    return this.#turnsThisPrompt;
  }

  statusOf(agentId: string): AgentStatus {
    return this.#trackers.get(agentId)?.status ?? 'idle';
  }

  onEvent(listener: (event: AgentEvent) => void): Unsubscribe {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  onStatusChange(listener: (agentId: string, status: AgentStatus) => void): Unsubscribe {
    this.#statusListeners.add(listener);
    return () => this.#statusListeners.delete(listener);
  }

  /**
   * The slash commands an agent's session currently offers, already curated by its adapter.
   *
   * Per agent rather than per team: each has its own workspace and its own session, so two
   * teammates genuinely can offer different menus. Empty is a real answer, not a loading
   * state — a session that has never held a turn may know none.
   */
  commandsOf(agentId: string): readonly AvailableCommand[] {
    return this.#runtimes.get(agentId)?.availableCommands ?? [];
  }

  onCommandsChange(
    listener: (agentId: string, commands: readonly AvailableCommand[]) => void,
  ): Unsubscribe {
    this.#commandListeners.add(listener);
    return () => this.#commandListeners.delete(listener);
  }

  /**
   * Every committed Message, the user's and a peer's alike. The store is the record; this is
   * how a UI hears that it changed without polling it.
   */
  onMessage(listener: (message: Message) => void): Unsubscribe {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  /**
   * An agent is blocked on a human. Ticket 14: rendered inline in the transcript rather than as
   * a modal, because two agents can be waiting at once and a modal serialises them into
   * whichever arrived first.
   */
  onPermissionRequested(listener: (pending: PendingPermission) => void): Unsubscribe {
    this.#permissionListeners.add(listener);
    return () => this.#permissionListeners.delete(listener);
  }

  /** The same request, answered — by the user, or by nobody. */
  onPermissionSettled(listener: (id: string, outcome: PermissionOutcome) => void): Unsubscribe {
    this.#permissionSettledListeners.add(listener);
    return () => this.#permissionSettledListeners.delete(listener);
  }

  /** Every request nobody has answered yet, so a pane rebuilt mid-turn still shows them. */
  get pendingPermissions(): readonly PendingPermission[] {
    return [...this.#pendingPermissions.values()].map((entry) => entry.pending);
  }

  /**
   * Answer one. `null` cancels the tool call rather than rejecting it — the difference the
   * runtimes draw, and the one the transcript repeats.
   */
  answerPermission(id: string, optionId: string | null): void {
    this.#pendingPermissions.get(id)?.resolve(optionId);
  }

  onBudgetExhausted(listener: (exhausted: BudgetExhausted) => void): Unsubscribe {
    this.#budgetListeners.add(listener);
    return () => this.#budgetListeners.delete(listener);
  }

  /** An agent named a teammate the user named, and messaged nobody. See {@link SilentHandoff}. */
  /**
   * blobot chose a moment and something came of it.
   *
   * Separate from the `context_compacted` event, which is the *record*: this carries the fresh
   * session id, which nothing in the vocabulary does and which the caller needs in order to
   * write the row that lets a relaunch resume the right conversation. A listener that only
   * wants to draw the line should read the event.
   */
  onCompaction(listener: (compacted: Compacted) => void): Unsubscribe {
    this.#compactionListeners.add(listener);
    return () => this.#compactionListeners.delete(listener);
  }

  onSilentHandoff(listener: (observed: SilentHandoff) => void): Unsubscribe {
    this.#silentHandoffListeners.add(listener);
    return () => this.#silentHandoffListeners.delete(listener);
  }

  dispose(): void {
    for (const unsubscribe of this.#subscriptions) unsubscribe();
    // A request nobody will ever answer now: the window is closing or the team is being
    // stopped. Cancelling releases the bridge's RPC instead of leaving the process wedged on
    // a promise whose only resolver has just gone away.
    for (const id of [...this.#pendingPermissions.keys()]) this.answerPermission(id, null);
  }

  /**
   * Spawn every agent's runtime. A runtime that cannot start leaves *that* agent `failed` and
   * the rest of the team working — detection never gates the team.
   */
  async start(): Promise<void> {
    await Promise.all(
      this.#agents.map(async (agent) => {
        const runtime = this.#runtimes.get(agent.id);
        if (runtime === undefined) return;
        try {
          await runtime.start();
        } catch (error) {
          this.#trackers
            .get(agent.id)
            ?.markFailed(error instanceof Error ? error.message : String(error));
        }
      }),
    );
  }

  // ------------------------------------------------------------------ the user's prompt

  /**
   * The user says something to one agent, or to several at once.
   *
   * **A list, and not a broadcast.** Every id here is one the user typed a name for, and each
   * gets its own `messages` row carrying the user's own words with the user's own authority —
   * so ticket 05's "a message lands in exactly one agent's session" holds N times rather than
   * bending once. blobot never decides who a message is for and never widens the list. See
   * `.scratch/team-addressing/issues/02-does-a-coordinator-earn-its-turn.md`, which chose this
   * over a coordinator that would have decided it.
   *
   * **One prompt, one budget.** The reset happens once for the whole fan-out, so naming three
   * agents spends three of the ten rather than resetting the count three times.
   *
   * **One `at` for every row**, from a single read of the clock, because one thing was typed
   * once: the team pane groups the rows back into the single bubble the user actually sent.
   *
   * Resolves when every turn it started has ended. Anything *those* set off keeps running —
   * see {@link settled}.
   */
  async promptFromUser(
    agentIds: readonly string[],
    text: string,
    attachmentIds: readonly string[] = [],
  ): Promise<void> {
    const agents = agentIds.map((agentId) => this.#requireAgent(agentId));
    const attachments = attachmentIds.map((id) => {
      const found = this.#store.attachment(id);
      if (found === undefined) throw new Error(`no attachment ${id}`);
      return found;
    });
    // Refused for the whole fan-out, not delivered to two of three. blobot never narrows a set
    // the user typed, and quietly dropping one recipient is narrowing it.
    for (const agent of agents) {
      const accepts = this.#runtimes.get(agent.id)?.accepts;
      for (const attachment of attachments) {
        const ok = attachment.kind === 'image' ? accepts?.images : accepts?.textFiles;
        if (ok !== true) throw new Error(attachmentNotAccepted(agent.name, attachment.kind));
      }
    }
    this.#turnsThisPrompt = 0;
    this.#budgetCeiling = this.team.turnBudget;
    const now = this.#clock.now();
    // The lead was the one addressed only if the user named nobody. Lexical, like every other
    // reading blobot does of prose: a prompt that says the lead's name addressed them by name,
    // and this turn is then an ordinary one.
    const leadId = this.team.leadAgentId;
    const leading =
      leadId !== undefined &&
      agents.length === 1 &&
      agents[0]?.id === leadId &&
      namesMentioned(text, this.#agents.filter((candidate) => candidate.id === leadId)).length ===
        0;
    const dispatched = agents.map((agent) => {
      /**
       * An agent already holding a turn takes this through the mailbox, not through a second
       * `sendPrompt`.
       *
       * Prompts on a session are serialized and the adapters throw when they are not, which is
       * the check doing its job. Until blobot could start a turn of its own this could not
       * happen: the only turns were ones the user or a peer began, and the composer is downstream
       * of the status those produce. A compaction turn is neither, so a user typing a perfectly
       * ordinary next message during one reached an adapter that refused it — and the message
       * had already been committed and marked delivered, so it sat in the transcript with
       * nothing left that would ever answer it.
       *
       * The mailbox is exactly the queue for this and has been all along: `#runTurn` ends by
       * draining it, which is the path a mid-turn peer message already takes. So the row is
       * committed and drawn, and simply not marked delivered.
       */
      const busy = this.#busy.has(agent.id);
      const message = this.#store.commit({
        id: this.#createId(now),
        teamId: this.team.id,
        fromAgentId: null, // the discriminator: NULL means the user
        toAgentId: agent.id,
        body: text,
        at: now,
        // Metadata on every row of the fan-out; one copy of the bytes underneath. The
        // transcript needs to draw what was sent, in every pane it appears in.
        ...(attachments.length === 0
          ? {}
          : { attachments: attachments.map(({ data: _data, at: _at, ...record }) => record) }),
      });
      if (!busy) this.#store.markDelivered([message.id], now);
      this.#announceMessage(message);
      if (attachments.length > 0) {
        const sent = this.#attachmentsSent.get(agent.id) ?? { count: 0, bytes: 0 };
        this.#attachmentsSent.set(agent.id, {
          count: sent.count + attachments.length,
          bytes: sent.bytes + attachments.reduce((total, one) => total + one.bytes, 0),
        });
      }
      return { agent, message, busy };
    });
    // Committed for everybody before anybody starts. A turn can message a teammate mid-flight,
    // and a recipient who has not been written to yet would take that wake before the user's
    // own words — which is the user watching their prompt arrive second.
    await Promise.all(
      dispatched
        .filter((entry) => !entry.busy)
        .map((entry) =>
        // The brief goes to the runtime and never into the `messages` row above: the transcript
        // keeps what the user typed, and what blobot added to the turn is blobot's.
        this.#runTurn(
          entry.agent,
          {
            text: this.#withBrief(entry.agent.id, text),
            from: 'user',
            ...(attachments.length === 0
              ? {}
              : {
                  attachments: attachments.map((attachment) => ({
                    kind: attachment.kind,
                    mimeType: attachment.mimeType,
                    data: attachment.data,
                    ...(attachment.name === undefined ? {} : { name: attachment.name }),
                  })),
                }),
          },
          entry.message.id,
          {
            prompt: text,
            leading: leading && entry.agent.id === leadId,
            // Everybody the user addressed. A co-recipient of the same fan-out is excluded
            // from the observation below: Bob already has the user's own words, so Alice not
            // forwarding them costs nothing and saying so would be the noise the scoping rule
            // exists to prevent.
            addressed: agents.map((agent) => agent.id),
          },
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ a Routine's prompt

  /**
   * A **Routine** fires: the same words, the same single recipient, the same turn, with a clock
   * behind them instead of a person.
   *
   * **A sibling of {@link promptFromUser} and deliberately not a parameter on it.** Three things
   * differ, and every one of them is a thing you do not want reaching a user's turn by accident:
   *
   * - **The budget.** {@link ROUTINE_TURN_BUDGET}, not the team's ten. The team's release valve
   *   is a person answering *continue?* and there is no person here.
   * - **The origin.** `routineRunId` on the `messages` row. The words are the user's — they
   *   authored the Routine — so the transcript still draws them in the user's voice, and the
   *   `system` line above the bubble carries the one thing the bubble gets wrong, which is
   *   *when*.
   * - **The permission expiry.** A request raised inside this turn is cancelled if nobody has
   *   answered within `permissionExpiryMs`. Without it, a parked run holds a session, a bridge
   *   process and a pool slot forever, and four nights of that is a pool that can no longer
   *   start the team the user is trying to open.
   *
   * One recipient, always: a Routine names one Agent, because a turn needs an AgentWorkspace, a
   * session and a mailbox and none of those are a Team's to lend. There is no fan-out here and
   * no attachment — only the user attaches, and a Routine is not at the keyboard.
   */
  async promptFromRoutine(
    agentId: string,
    text: string,
    run: { readonly runId: string; readonly permissionExpiryMs: number },
  ): Promise<RoutineTurn> {
    const agent = this.#requireAgent(agentId);
    // Nothing is committed and nothing runs. A session runs one turn at a time, and the two
    // existing paths into `#runTurn` both reach it through a mailbox that knows that; this one
    // does not, so it asks. The caller holds the firing rather than stacking a second turn on a
    // live session, which is also what makes the coalescing rule expressible.
    if (this.#busy.has(agent.id)) return { outcome: 'busy' };
    this.#turnsThisPrompt = 0;
    this.#budgetCeiling = ROUTINE_TURN_BUDGET;
    const now = this.#clock.now();

    const message = this.#store.commit({
      id: this.#createId(now),
      teamId: this.team.id,
      fromAgentId: null, // still the user's words, and still the user's authority
      toAgentId: agent.id,
      body: text,
      at: now,
      routineRunId: run.runId,
    });
    this.#store.markDelivered([message.id], now);
    this.#announceMessage(message);

    const record: {
      runId: string;
      expiryMs: number;
      expired?: string;
      budgetHalted?: boolean;
    } = {
      runId: run.runId,
      expiryMs: run.permissionExpiryMs,
    };
    this.#routineRuns.set(agent.id, record);
    try {
      await this.#runTurn(
        agent,
        { text: this.#withBrief(agent.id, text), from: 'user' },
        message.id,
        // Nobody was named, and nobody is leading: a Routine is one instruction to one agent.
        // The silent-handoff observation has nothing to watch for and says nothing.
        { prompt: text, leading: false, addressed: [agent.id] },
      );
      // The run is the turn **and what it set off**. A Routine's turns are agents waking each
      // other, which is what `ROUTINE_TURN_BUDGET` bounds and what the budget halts, so a run
      // that returned at the end of its own first turn would report `ran` for a night that
      // stopped at the ceiling two turns later. `promptFromUser` does not wait for this because
      // there is a person watching it happen; nobody is watching this one.
      await this.settled();
    } finally {
      this.#routineRuns.delete(agent.id);
    }
    // How the run ended, read here rather than watched for from outside: the two ways a Routine
    // run dies are both this method's own doing, and a caller correlating a budget event with a
    // cancelled permission would be reconstructing what was known here all along.
    if (record.expired !== undefined) {
      return { outcome: 'stopped', reason: `needed permission for ${record.expired}` };
    }
    if (record.budgetHalted === true) {
      return { outcome: 'stopped', reason: `the run budget of ${ROUTINE_TURN_BUDGET} turns` };
    }
    return { outcome: 'ran' };
  }

  // ------------------------------------------------------------------ the proposal tool

  /**
   * The `propose_routine` tool handler. **An agent may propose; only a person may arm.**
   *
   * Issue 05's argument in one method: a stored, recurring, unattended turn is more authority
   * than a peer message, and this channel carries no operator authority at all — `envelope.ts`
   * says so, and `.scratch/team-addressing/issues/03` refused relayed authority permanently. So
   * the row lands `armed: false` and nothing an agent can call ever changes that. What the author
   * asked for is satisfied all the same: the agent makes the Routine. What it cannot do is give
   * it a clock.
   *
   * Every refusal here is at the tool boundary and comes back as something the model has to
   * account for, never as a silent trim: this is `bounds.ts`'s posture, and a proposal quietly
   * dropped is how an agent ends up telling the user that work is scheduled when it is not.
   */
  async handleProposeRoutine(call: RoutineProposalCall): Promise<RoutineProposalAck> {
    const agent = this.#requireAgent(call.from);
    const routines = this.#routines;
    if (routines === undefined) throw new Error('This team does not keep Routines.');

    // Before anything is written, and in this order because the cheapest refusals are the ones
    // that say the most: the caps are about the agent's behaviour, the parse is about this call.
    if ((this.#proposedThisTurn.get(agent.id) ?? 0) >= ROUTINE_PROPOSALS_PER_TURN) {
      throw new Error(tooManyProposalsThisTurn());
    }
    // **Armed and proposed by this agent**, which is issue 05's amendment and the third of the
    // four controls that are the price of it. The cap counted *unreviewed* proposals, which was
    // the right thing to count while nothing an agent proposed could fire; now that every one of
    // them fires, nothing is ever unreviewed in that sense and the cap would have gone dead at
    // the moment it started to matter. What it bounds instead is the thing that costs: how much
    // recurring, unattended work an agent can give itself. Disarming frees a slot.
    const standing = routines
      .routinesOfAgent(agent.id)
      .filter((routine) => routine.proposedBy !== undefined && routine.armed);
    if (standing.length >= ROUTINE_PROPOSALS_STANDING) {
      throw new Error(tooManyProposalsStanding(standing.length));
    }
    const said = checkProposalText(call.name, call.prompt);
    if (said !== undefined) throw new Error(said);
    const parsed = parseProposedSchedule(call.schedule);
    if ('error' in parsed) throw new Error(parsed.error);

    const now = this.#clock.now();
    const routine: Routine = {
      id: this.#createId(now),
      // The proposal is for the caller and there is no field that could say otherwise. A Routine
      // proposed for a teammate is fan-out with a delay on it, which is a different ticket.
      agentId: agent.id,
      name: call.name.trim(),
      prompt: call.prompt.trim(),
      schedule: parsed.schedule,
      // **Armed.** Issue 05's 2026-08-30 amendment reversed the answer this line used to carry.
      // The controls that pay for it are not here — they are the cap above, the transcript block
      // this returns the id for, the ink edge that stands until `reviewedAt` is set, and
      // everything an agent still may not do, which the amendment leaves untouched.
      armed: true,
      // Who **asked**, not who owns it. An agent id and never free text, so a proposal cannot
      // claim to come from somebody it did not. It still means *asked* rather than *approved*:
      // the row is armed, and a person has still not looked at it.
      proposedBy: agent.id,
      createdAt: now,
    };
    routines.createRoutine(routine);
    this.#proposedThisTurn.set(agent.id, (this.#proposedThisTurn.get(agent.id) ?? 0) + 1);
    // Two channels, because they answer different questions. The first says *the list changed*;
    // the second says *this happened, in this turn*, which is what the transcript block is built
    // from and the whole of how a person finds out without having gone looking.
    for (const listener of this.#routineListeners) listener();
    const scheduled: ScheduledRoutine = {
      routineId: routine.id,
      agentId: agent.id,
      name: routine.name,
      schedule: describeSchedule(routine.schedule),
      frequency: describeFrequency(routine.schedule),
      at: now,
    };
    for (const listener of this.#scheduledListeners) listener(scheduled);
    return {
      proposed: true,
      routineId: routine.id,
      name: routine.name,
      schedule: scheduled.schedule,
      frequency: scheduled.frequency,
      armed: true,
    };
  }

  /**
   * An agent put itself on a schedule. **The user is told where it happened.**
   *
   * The second of issue 05's four compensating controls, and the one that makes the rest
   * bearable: an agent arming something silently is the version of this feature that must not
   * exist. blobot still never interrupts — what it refuses is to let this happen off screen.
   */
  onRoutineScheduled(listener: (scheduled: ScheduledRoutine) => void): Unsubscribe {
    this.#scheduledListeners.add(listener);
    return () => this.#scheduledListeners.delete(listener);
  }

  /** Something changed about this team's Routines. Whatever draws them is out of date. */
  onRoutinesChanged(listener: () => void): Unsubscribe {
    this.#routineListeners.add(listener);
    return () => this.#routineListeners.delete(listener);
  }

  // ------------------------------------------------------------------ the peer-message tool

  /**
   * The `message_agent` tool handler. The orchestrator *is* the MCP server, so this is a plain
   * function in the process that owns the mailbox — no child process, no IPC hop.
   *
   * It must never block: a mid-turn stall costs the sender the full 60–120s tool timeout and
   * ends in genuine at-most-once ambiguity. So it commits, acks, and wakes the recipient in
   * the background.
   */
  async handleMessageAgent(call: PeerMessageCall): Promise<PeerMessageAck> {
    const sender = this.#requireAgent(call.from);
    const recipient = this.#resolveRecipient(call.agent, sender);
    // Before the commit, because a message that is refused must not exist: it is not in the
    // transcript, the recipient is not woken, and the sender reads why as a tool failure and
    // gets to write the short version. This is where "always compact context" is enforced.
    if (call.message.length > PEER_MESSAGE_LIMIT) {
      throw new Error(tooLongToSend(call.message.length));
    }
    if (call.context !== undefined && call.context.length > PEER_CONTEXT_LIMIT) {
      throw new Error(contextTooLong(call.context.length));
    }

    const now = this.#clock.now();
    const message = this.#store.commit({
      id: this.#createId(now),
      teamId: this.team.id,
      fromAgentId: sender.id,
      toAgentId: recipient.id,
      body: call.message,
      at: now,
      ...(call.context === undefined ? {} : { context: call.context }),
      ...(call.idempotencyKey === undefined ? {} : { idempotencyKey: call.idempotencyKey }),
    });

    this.#announceMessage(message);
    // Whether she wrote at all is the whole of the silent-handoff observation, so it is counted
    // here, where the message is committed, rather than inferred from the transcript later.
    this.#wroteThisTurn.get(sender.id)?.add(recipient.id);

    // Ack means committed. Only now is it safe to tell the sender the message exists.
    // The peer message is announced by the orchestrator, never by an adapter, so the UI can
    // render it without knowing an MCP tool exists.
    const senderRuntime = this.#runtimes.get(sender.id);
    this.#publish({
      type: 'agent_message_sent',
      agentId: sender.id,
      sessionId: senderRuntime?.sessionId ?? sender.id,
      at: now,
      to: recipient.name,
      message: call.message,
      ...(call.context === undefined ? {} : { context: call.context }),
    });

    // Already delivered on a previous identical call: say what is true, wake nobody twice.
    if (message.deliveredAt !== undefined) {
      return { delivered: true, recipient: recipient.name, status: 'started' };
    }

    if (this.#busy.has(recipient.id) || this.#budgetIsSpent()) {
      // Queued: mid-turn arrivals are the common case, and a session runs one turn at a time.
      if (this.#budgetIsSpent()) this.#announceBudget();
      return { delivered: true, recipient: recipient.name, status: 'queued' };
    }

    void this.#wake(recipient.id);
    return { delivered: true, recipient: recipient.name, status: 'started' };
  }

  // ------------------------------------------------------------------ mailbox and budget

  /** Undelivered mail for an agent. On relaunch this is what "2 messages waiting" counts. */
  mailbox(agentId: string): Message[] {
    return this.#store.undelivered(agentId);
  }

  /** The user answered "continue?" — release the budget and drain every mailbox. */
  resumeAfterBudget(): void {
    this.#turnsThisPrompt = 0;
    for (const agent of this.#agents) void this.#wake(agent.id);
  }

  /** Resolves when nothing is in flight. Tests and the demo wait on this, the UI never does. */
  async settled(): Promise<void> {
    while (this.#inFlight.size > 0) {
      await Promise.all([...this.#inFlight]);
    }
  }

  // ------------------------------------------------------------------ internals

  /**
   * Auto-wake: a message to an idle agent starts its turn immediately, whether or not the user
   * is looking at that tab. Be clear-eyed — this is agents spending the user's tokens
   * unwatched, which is the actual product and also what makes the turn budget mandatory.
   */
  async #wake(agentId: string): Promise<void> {
    if (this.#busy.has(agentId)) return;
    const agent = this.#agents.find((candidate) => candidate.id === agentId);
    if (agent === undefined) return;

    if (this.#budgetIsSpent()) {
      // Leave the mail in the mailbox: the budget halts the team, it does not drop messages.
      if (this.#store.undelivered(agentId).length > 0) this.#announceBudget();
      return;
    }

    const waiting = this.#store.undelivered(agentId);
    if (waiting.length === 0) return;

    // One prompt for the batch, not one prompt per message: delivering one and requeuing the
    // rest doubles turn count against a budget of ten. Bounded all the same, because past a
    // handful a numbered list stops being a prompt and becomes a context dump with numbers on
    // it. The overflow stays in the mailbox and `#runTurn` wakes this agent again when the
    // turn ends, which is the path a mid-turn arrival already takes.
    const mail = waiting.slice(0, WAKE_BATCH_LIMIT);
    this.#store.markDelivered(
      mail.map((message) => message.id),
      this.#clock.now(),
    );
    const text = composeWakePrompt(
      mail,
      (message) =>
        message.fromAgentId === null
          ? undefined
          : this.#agents.find((candidate) => candidate.id === message.fromAgentId),
      this.#agents.filter((candidate) => candidate.id !== agentId),
      this.#leadBrief(agentId),
    );
    this.#lastWake.set(agentId, { chars: text.length, messages: mail.length });
    await this.#runTurn(agent, { text, from: 'peer' }, mail[mail.length - 1]?.id);
  }

  async #runTurn(
    agent: Agent,
    prompt: Prompt,
    triggerMessageId?: string,
    watch?: HandoffWatch,
    /**
     * blobot's own turns, which are the compaction ones, do not spend the user's budget.
     *
     * `turnBudget` bounds agents ping-ponging on somebody's prompt. A compaction turn is not
     * that: nobody asked for it, it happens at most twice per agent per fill-up, and charging
     * it would mean an agent whose window filled mid-conversation had its team halted for
     * asking *continue?* about work the user never requested.
     */
    counted = true,
  ): Promise<void> {
    const runtime = this.#runtimes.get(agent.id);
    const tracker = this.#trackers.get(agent.id);
    if (runtime === undefined || tracker === undefined) return;

    // Whether somebody else is already holding this agent. A second turn against one session
    // is a programming error the adapters throw on, and every caller here guards against it —
    // but the *bookkeeping* must not make it worse. Deleting a flag this call did not set is
    // how one refused prompt used to leave a live turn looking idle, and the next thing to ask
    // about the agent got a wrong answer.
    const held = this.#busy.has(agent.id);
    this.#busy.add(agent.id);
    if (counted) this.#turnsThisPrompt += 1;
    tracker.turnStarted();
    this.#recorder?.turnStarted(agent.id, this.#clock.now(), triggerMessageId);
    // Populated for every turn, not only a watched one: the routing-turn refund below is
    // defined by what a turn *did*, never by who did it or what started it.
    this.#wroteThisTurn.set(agent.id, new Set());
    this.#proposedThisTurn.set(agent.id, 0);

    const turn = (async () => {
      // What the agent actually said, and whether the turn got to the end of itself.
      let said = '';
      let endedOrdinarily = false;
      try {
        for await (const event of runtime.sendPrompt(prompt)) {
          // Publish first, fold second: a consumer sees the event, then the status it caused.
          this.#publish(event);
          tracker.apply(event);
          this.#recorder?.record(event);
          // The answer only. Thinking is not what the reader was told, and a name that appears
          // in reasoning the user never sees cannot be a handoff they are waiting on.
          if (event.type === 'agent_message_completed') said += `\n${event.text}`;
          if (event.type === 'turn_ended') endedOrdinarily = event.stopReason === 'end_turn';
          if (event.type === 'error') endedOrdinarily = false;
          // A cancelled turn reports `used: 0`, and a stored zero is a gauge reset rather than
          // an empty context. Taking it would make a full agent look empty to the threshold.
          if (event.type === 'usage_updated' && event.used > 0) {
            this.#usage.set(agent.id, { used: event.used, size: event.size });
          }
        }
      } finally {
        if (!held) this.#busy.delete(agent.id);
      }
      if (watch !== undefined && endedOrdinarily) {
        this.#observeSilentHandoff(agent, watch, said);
      }
      if (counted) this.#refundRoutingTurn(agent.id, said);
      this.#wroteThisTurn.delete(agent.id);
      // Before the mailbox drains, so a queued message is answered by whichever session the
      // agent ends up on rather than by one that is about to be closed underneath it.
      await this.#maybeCompact(agent);
      // Whatever arrived mid-turn is delivered now, as one prompt.
      await this.#wake(agent.id);
    })();

    this.#inFlight.add(turn);
    try {
      await turn;
    } finally {
      this.#inFlight.delete(turn);
    }
  }

  /**
   * What blobot itself put into this agent's turn, for the surface that shows it.
   *
   * Only the parts that are ours: the prompt the orchestrator composed and the mail still
   * waiting. The persona is not here because the orchestrator does not compose it, and what
   * the agent carries beyond either is the runtime's, which blobot does not manage.
   */
  /**
   * What this agent's runtime takes attached to a prompt, in blobot's own words.
   *
   * Surfaced so the composer can refuse a file before the user writes the message. The renderer
   * gets two booleans and never learns which provider answered them.
   */
  acceptsOf(agentId: string): AttachmentSupport {
    return this.#runtimes.get(agentId)?.accepts ?? { images: false, textFiles: false };
  }

  injectionOf(agentId: string): {
    lastWakeChars: number;
    lastWakeMessages: number;
    queued: number;
    attachmentCount: number;
    attachmentBytes: number;
  } {
    const wake = this.#lastWake.get(agentId);
    const attached = this.#attachmentsSent.get(agentId);
    return {
      lastWakeChars: wake?.chars ?? 0,
      lastWakeMessages: wake?.messages ?? 0,
      queued: this.#store.undelivered(agentId).length,
      attachmentCount: attached?.count ?? 0,
      attachmentBytes: attached?.bytes ?? 0,
    };
  }

  /**
   * The lead's brief, when this agent is the lead. See {@link composeLeadBrief}.
   *
   * Composed fresh every time because its whole content is the live status fold, and a cached
   * brief is a lead handing work to somebody who stopped being free a minute ago.
   */
  #leadBrief(agentId: string): string | undefined {
    if (this.team.leadAgentId !== agentId) return undefined;
    return composeLeadBrief(
      this.#agents
        .filter((candidate) => candidate.id !== agentId)
        .map((agent) => ({ agent, status: this.statusOf(agent.id) })),
    );
  }

  /**
   * The same, folded onto the end of a user prompt, which has no envelope of its own.
   *
   * It is recorded as an injection because it *is* one: the brief is text blobot put into the
   * agent's window, and the gauge under the activity column exists to show exactly that. The
   * user's own words are not counted there, because they are the user's rather than ours.
   */
  #withBrief(agentId: string, text: string): string {
    const brief = this.#leadBrief(agentId);
    if (brief === undefined) return text;
    this.#lastWake.set(agentId, { chars: brief.length, messages: 0 });
    return `${text}\n\n${brief}`;
  }

  /**
   * The moment blobot is allowed to choose, and everything it refuses to conclude from.
   *
   * Five ways to answer *no* before anything happens, and every one of them leaves the agent
   * exactly as it was:
   *
   * - the user turned it off for this agent, which is per agent because a session is;
   * - blobot is already inside a compaction for this agent, and its own turns must not start
   *   another one;
   * - the runtime has never reported occupancy, so there is no numerator;
   * - the ceiling works out at zero, so there is no denominator, and an unknown denominator is
   *   not a reason to close somebody's session;
   * - a turn is in flight, because prompts on a session are serialized;
   * - the agent is not full enough yet.
   *
   * It runs after every turn rather than on a timer, and that is a decision rather than
   * convenience. **Occupancy triggered and never time triggered**: compaction *is* cache
   * invalidation, so it buys headroom and quality and never cache economy, and a timer firing
   * on an idle team would pay a full uncached read of a context nobody is using to pre-pay a
   * cost the user may never incur. `TeamPool` holds three teams live precisely so switching is
   * cheap; a compaction timer would turn that into background spend nobody asked for.
   */
  async #maybeCompact(agent: Agent): Promise<void> {
    if ((agent.compaction ?? DEFAULT_COMPACTION) === 'off') return;
    if (this.#compacting.has(agent.id)) return;
    /**
     * And never while a turn is in flight, which is a narrower window than it looks.
     *
     * `#runTurn` clears `#busy` before it asks this question, so between that clear and the
     * compaction's own first turn the agent is momentarily free — and a user prompt landing in
     * that gap starts a turn this would then try to run a second `sendPrompt` against. It is a
     * microtask wide and it is still real, and skipping is the right answer rather than
     * waiting: the check runs after every turn, so the next one asks again.
     */
    if (this.#busy.has(agent.id)) return;
    const runtime = this.#runtimes.get(agent.id);
    const usage = this.#usage.get(agent.id);
    if (runtime === undefined || usage === undefined) return;
    if (runtime.lifecycle !== 'ready') return;
    const ceiling = workingCeiling(this.#contextCeilings.get(agent.id), usage.size);
    if (!overCompactionThreshold(usage.used, ceiling.tokens)) return;

    this.#compacting.add(agent.id);
    try {
      await this.#compact(agent, runtime, usage.used, ceiling);
    } finally {
      this.#compacting.delete(agent.id);
    }
  }

  /**
   * A handoff and a fresh session. Always, and never the runtime's own compaction.
   *
   * This was two mechanisms, ordered, with the runtime's own first: it keeps the session id,
   * costs one turn, and is written by people who can see the real message list. **Reversed by
   * the author 2026-08-30, on the evidence of the first live run** — a real Claude agent
   * compacted itself at 223k and came back having lost too much of what mattered. The argument
   * for going first was cost; the argument against it is quality, and quality is the entire
   * reason this ticket exists. A cheap compaction that leaves an agent unable to continue is not
   * cheaper than an expensive one that leaves it able to.
   *
   * `/compact` stays in the composer's palette. What changed is what blobot reaches for on
   * somebody's behalf, not what a person may still choose to type.
   */
  async #compact(
    agent: Agent,
    runtime: AgentRuntime,
    used: number,
    ceiling: { tokens: number; measured: boolean },
  ): Promise<void> {
    const previousSessionId = runtime.sessionId;

    // Only the agent can write its own handoff, so this costs one turn at the most expensive
    // moment available. `said` is the whole of what it wrote: a handoff turn that stopped for
    // any reason at all is a refusal, because a truncated handoff plus a discarded session is
    // worse than either alone.
    const written = await this.#runCompactionTurn(agent, () =>
      runtime.sendPrompt({ text: HANDOFF_PROMPT, from: 'peer' }),
    );
    const refuse = (reason: string): void => {
      this.#announceCompaction(agent, runtime, {
        how: 'refused',
        used,
        ceiling,
        previousSessionId,
        reason,
      });
    };
    if (!written.endedOrdinarily) return refuse(HANDOFF_STOPPED);
    const handoff = written.said.trim();
    if (handoff === '') return refuse(HANDOFF_EMPTY);
    if (handoff.length > HANDOFF_LIMIT) return refuse(handoffTooLong(handoff.length));

    // Archived before the session is closed, so a crash between the two leaves the note on
    // disk rather than losing both. A failure to write is not a failure to compact: the text
    // travels in the fresh session's first prompt and is in the transcript either way.
    const handoffPath = await this.#handoffs
      ?.write({
        teamId: this.team.id,
        agentId: agent.id,
        agentName: agent.name,
        sessionId: previousSessionId,
        at: this.#clock.now(),
        handoff,
      })
      .catch(() => undefined);

    try {
      await runtime.restart();
    } catch {
      // The old session is already closed by the time an adapter finds out, so this says the
      // session was kept and is the one refusal where that is not quite true. It is still the
      // honest half: nothing was compacted, and the agent needs a relaunch.
      return refuse(RESTART_FAILED);
    }

    // Not counted, not watched, and deliberately the fresh session's first turn: the handoff
    // has to be in the context before any queued mail is answered against it.
    await this.#runCompactionTurn(agent, () =>
      runtime.sendPrompt({ text: resumeFromHandoff(handoff), from: 'peer' }),
    );

    this.#announceCompaction(agent, runtime, {
      how: 'handoff',
      used,
      ceiling,
      previousSessionId,
      // Asked of the adapter rather than assumed: on one runtime the fresh session takes the
      // definition as it stands today, and on another the live one was already running it.
      personaRefreshed: runtime.personaIsSessionBound,
      handoff,
      ...(handoffPath === undefined ? {} : { handoffPath }),
    });
  }

  /**
   * One of blobot's own turns: published, folded and recorded like any other, and unbudgeted.
   *
   * Published because it is real. It costs the user tokens, the blobatar should move while it
   * happens, and a compaction that ran invisibly would be the thing this whole ticket exists to
   * avoid — an agent that changed underneath somebody with nothing on screen. What it does not
   * do is go through `#runTurn`: that ends by draining the mailbox and asking whether to
   * compact, and both are exactly wrong in the middle of a compaction.
   *
   * **What the agent says here is not published and not recorded**, which is the one departure
   * and was found by looking at the screen. Three of blobot's own turns rendered as three
   * paragraphs in Alice's own voice, in a conversation where nobody had asked her anything — a
   * compaction summary, a handoff written *to blobot*, and an acknowledgement of a note the
   * user had not seen. A reader has no way to tell those from an answer.
   *
   * So the words go where they were addressed: the handoff rides the `context_compacted` event,
   * durable in `events`, openable in the transcript and archived to a file. Everything else
   * about the turn — its tool calls, its occupancy, its ending — is published and recorded
   * exactly as any turn is, because that is what it cost and the gauge must not understate it.
   */
  async #runCompactionTurn(
    agent: Agent,
    start: () => AsyncIterable<AgentEvent>,
  ): Promise<{ said: string; endedOrdinarily: boolean }> {
    const tracker = this.#trackers.get(agent.id);
    if (tracker === undefined) return { said: '', endedOrdinarily: false };
    let said = '';
    let endedOrdinarily = false;
    this.#busy.add(agent.id);
    tracker.turnStarted();
    this.#recorder?.turnStarted(agent.id, this.#clock.now());
    try {
      for await (const event of start()) {
        if (event.type === 'agent_message_completed') said += `\n${event.text}`;
        // The status fold still sees everything: an agent that is writing is `responding`,
        // whoever it happens to be writing to.
        tracker.apply(event);
        if (!SPOKEN.has(event.type)) {
          this.#publish(event);
          this.#recorder?.record(event);
        }
        if (event.type === 'turn_ended') endedOrdinarily = event.stopReason === 'end_turn';
        if (event.type === 'error') endedOrdinarily = false;
        if (event.type === 'usage_updated' && event.used > 0) {
          this.#usage.set(agent.id, { used: event.used, size: event.size });
        }
      }
    } catch {
      endedOrdinarily = false;
    } finally {
      this.#busy.delete(agent.id);
    }
    return { said, endedOrdinarily };
  }

  /**
   * Say what happened, twice, and for two different readers.
   *
   * The event is the record: it goes to the pane, through the recorder into `events`, and comes
   * back on a team switch, which is ticket 06's lesson applied to a line that would otherwise
   * be live-only. The callback carries the fresh session id, which the vocabulary has no place
   * for and which the caller needs in order to write the row a relaunch resumes from.
   */
  #announceCompaction(
    agent: Agent,
    runtime: AgentRuntime,
    outcome: {
      how: 'command' | 'handoff' | 'refused';
      used: number;
      ceiling: { tokens: number; measured: boolean };
      previousSessionId: string;
      personaRefreshed?: boolean;
      handoff?: string;
      handoffPath?: string;
      reason?: string;
    },
  ): void {
    const at = this.#clock.now();
    const event: AgentEvent = {
      type: 'context_compacted',
      agentId: agent.id,
      // The session this is *about*, which on a handoff is the one that was closed. The fresh
      // id travels on the callback: an event stamped with a session that had not started when
      // the decision was taken would be a lie about when it happened.
      sessionId: outcome.previousSessionId,
      at,
      how: outcome.how,
      used: outcome.used,
      ceiling: outcome.ceiling.tokens,
      measured: outcome.ceiling.measured,
      ...(outcome.personaRefreshed === true ? { personaRefreshed: true } : {}),
      ...(outcome.handoff === undefined ? {} : { handoff: outcome.handoff }),
      ...(outcome.handoffPath === undefined ? {} : { handoffPath: outcome.handoffPath }),
      ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
    };
    this.#publish(event);
    this.#recorder?.record(event);
    const compacted: Compacted = {
      teamId: this.team.id,
      agentId: agent.id,
      how: outcome.how,
      previousSessionId: outcome.previousSessionId,
      sessionId: runtime.sessionId,
      at,
      ...(outcome.handoff === undefined ? {} : { handoff: outcome.handoff }),
    };
    for (const listener of this.#compactionListeners) listener(compacted);
  }

  #budgetIsSpent(): boolean {
    return this.#turnsThisPrompt >= this.#budgetCeiling;
  }

  #announceBudget(): void {
    // A Routine run in flight when the budget halts the team is a run the budget stopped, and
    // this is the only moment that is knowable. Reading `#budgetIsSpent()` after the turn does
    // not answer it: the routing-turn refund can put the count back under the ceiling, so a run
    // that was halted would report itself as having ended ordinarily.
    for (const record of this.#routineRuns.values()) record.budgetHalted = true;
    const pending = this.#agents.reduce(
      (total, agent) => total + this.#store.undelivered(agent.id).length,
      0,
    );
    for (const listener of this.#budgetListeners) {
      listener({
        teamId: this.team.id,
        turnsUsed: this.#turnsThisPrompt,
        turnBudget: this.#budgetCeiling,
        pending,
      });
    }
  }

  /**
   * A turn that only routed does not count against `turnBudget`.
   *
   * Decided in issue 02 and deliberately left unbuilt there, because with no coordinator nothing
   * ever spent such a turn. Issue 06 gives the lead work to hand out, so it is built now, to
   * that decision's own literal definition: **it messaged and said nothing else.**
   *
   * Defined by what the turn *did*, never by who held it. A title that bought its holder an
   * unmetered budget would be a title that buys free work, and every agent has `message_agent`.
   *
   * It fires rarely by construction, since a lead that says "I have asked Bob" out loud has
   * said something. The number to plan against is the one issue 06 states: a lead costs one
   * extra turn per prompt, not three.
   */
  #refundRoutingTurn(agentId: string, said: string): void {
    const wrote = this.#wroteThisTurn.get(agentId);
    if (wrote === undefined || wrote.size === 0) return;
    if (said.trim() !== '') return;
    this.#turnsThisPrompt = Math.max(0, this.#turnsThisPrompt - 1);
  }

  /**
   * The turn is over: did she name somebody the user named, and write to nobody?
   *
   * Every clause here is a fact rather than a reading, and every one of them narrows on
   * purpose — an unscoped version fires on shop talk (*"Bob's branch is fine"* names Bob and
   * promises nothing), and a warning that fires on shop talk is a warning nobody reads, which
   * is worse than silence.
   *
   * **Known limitation, on the record:** it cannot see a promise made about a teammate the user
   * never named. Widening it there means reading intent, and that is the line.
   *
   * The one exception is the lead holding a prompt that named nobody, where the user handed the
   * choice of recipient over and the answer is therefore the only record of who the work was
   * for. Issue 06 accepts the noise that buys — a lead saying *"Bob's branch is fine"* fires —
   * for that scope and no wider.
   */
  #observeSilentHandoff(agent: Agent, watch: HandoffWatch, said: string): void {
    const wrote = this.#wroteThisTurn.get(agent.id) ?? new Set<string>();
    const teammates = this.#agents.filter(
      (candidate) =>
        candidate.id !== agent.id &&
        !watch.addressed.includes(candidate.id) &&
        !wrote.has(candidate.id),
    );
    // The lead, on a prompt that named nobody, is the one case where the prompt cannot supply
    // a name to match: the user deferred the choice to it, so what it decided is the only
    // record of who the work was for. Everywhere else the prompt still has to have named them.
    const candidates = watch.leading
      ? teammates
      : namesMentioned(watch.prompt, teammates);
    const named = candidates.filter(
      (candidate) => namesMentioned(said, [candidate]).length > 0,
    );
    if (named.length === 0) return;

    const observed: SilentHandoff = {
      teamId: this.team.id,
      agentId: agent.id,
      named: named.map((candidate) => candidate.name),
      at: this.#clock.now(),
    };
    for (const listener of this.#silentHandoffListeners) listener(observed);
  }

  #announceMessage(message: Message): void {
    for (const listener of this.#messageListeners) listener(message);
  }

  /**
   * A runtime asking whether a tool call may go ahead.
   *
   * The agent is `waiting` from here until the answer, which is the one status ticket 12 spends
   * a contrast inversion on: an agent blocked on a human sits there forever, and nothing else
   * in the app has that property.
   *
   * With no listener the request is cancelled rather than allowed. An unattended team is the
   * normal case for blobot, and approving on nobody's behalf is the one answer we may not give.
   */
  async #askPermission(request: PermissionRequest): Promise<string | null> {
    const id = this.#createId(this.#clock.now());
    const pending: PendingPermission = {
      id,
      agentId: request.agentId,
      toolCallId: request.toolCallId,
      title: request.title,
      options: request.options,
    };
    if (this.#permissionListeners.size === 0) {
      this.#settlePermission(id, null, request.options);
      return null;
    }

    this.#trackers.get(request.agentId)?.permissionRequested();
    const answer = await new Promise<string | null>((resolve) => {
      this.#pendingPermissions.set(id, { pending, resolve });
      for (const listener of this.#permissionListeners) listener(pending);
      // Issue 03's expiry, and only for a Routine run. `null` is cancelled, which is the one
      // answer blobot may give on nobody's behalf — approving unwatched is the answer it may
      // not. A user's own turn has no timer here and waits until it is answered.
      const routine = this.#routineRuns.get(request.agentId);
      if (routine !== undefined) {
        void this.#clock.sleep(routine.expiryMs).then(() => {
          if (!this.#pendingPermissions.has(id)) return;
          // Remembered on the run rather than inferred afterwards from a cancelled permission:
          // the user answering `Reject` also settles as cancelled, and a run the user answered
          // is not a run that died of nobody being there.
          routine.expired = request.title;
          resolve(null);
        });
      }
    });
    this.#pendingPermissions.delete(id);
    this.#trackers.get(request.agentId)?.permissionResolved();
    this.#settlePermission(id, answer, request.options);
    return answer;
  }

  #settlePermission(
    id: string,
    optionId: string | null,
    options: readonly PermissionOption[],
  ): void {
    const chosen = options.find((option) => option.optionId === optionId);
    const outcome: PermissionOutcome =
      chosen === undefined
        ? 'cancelled'
        : chosen.kind === 'allow_always'
          ? 'allowed_always'
          : chosen.kind === 'allow_once'
            ? 'allowed'
            : 'rejected';
    for (const listener of this.#permissionSettledListeners) listener(id, outcome);
  }

  #publish(event: AgentEvent): void {
    for (const listener of this.#eventListeners) listener(event);
  }

  #requireAgent(idOrName: string): Agent {
    const agent = this.#agents.find(
      (candidate) =>
        candidate.id === idOrName ||
        candidate.name.toLowerCase() === idOrName.toLowerCase(),
    );
    if (agent === undefined) throw new Error(`no agent '${idOrName}' on team ${this.team.name}`);
    return agent;
  }

  /**
   * The recipient is free-form and validated here. A baked enum would freeze at session
   * creation and go invisibly wrong the moment the roster changes; this degrades correctly,
   * because the error is something the sender can act on.
   */
  #resolveRecipient(name: string, sender: Agent): Agent {
    // The same resolution the composer's @mention uses. One function, or the human-facing
    // "unresolved mention" and the agent-facing "no such teammate" will drift apart.
    const recipient = findAgentByName(this.#agents, name);
    const roster = this.#agents
      .filter((candidate) => candidate.id !== sender.id)
      .map((candidate) => candidate.name)
      .join(', ');
    if (recipient === undefined) {
      throw new Error(`no agent named '${name}' on this team; try: ${roster}`);
    }
    if (recipient.id === sender.id) {
      throw new Error(`you cannot message yourself; try: ${roster}`);
    }
    return recipient;
  }
}
