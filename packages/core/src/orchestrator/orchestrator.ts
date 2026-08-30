import type { Clock } from '../clock.js';
import { SystemClock } from '../clock.js';
import type { AgentEvent } from '../events.js';
import { uuidv7, type IdFactory } from '../ids.js';
import type {
  AgentRuntime,
  PeerMessageAck,
  PeerMessageCall,
  PermissionOption,
  PermissionRequest,
  Prompt,
  Unsubscribe,
} from '../runtime.js';
import { AgentStatusTracker, type AgentStatus } from '../status.js';
import type { Agent, Message, Team } from './domain.js';
import { findAgentByName } from './roster.js';
import { composeWakePrompt } from './envelope.js';
import { InMemoryMessageStore, type MessageStore } from './message-store.js';

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
  readonly store?: MessageStore;
  readonly clock?: Clock;
  readonly createId?: IdFactory;
  /** Where the durable subset of the stream is written. Omit and nothing is persisted. */
  readonly recorder?: TurnRecorder;
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
 */
export type PermissionOutcome = 'allowed' | 'rejected' | 'cancelled';

export interface BudgetExhausted {
  readonly teamId: string;
  readonly turnsUsed: number;
  readonly turnBudget: number;
  /** Messages sitting in mailboxes that the budget is holding back. */
  readonly pending: number;
}

/**
 * Owns agent-to-agent communication: the mailbox, the wake policy, the turn budget, and the
 * peer-message tool handler itself. A plain TypeScript module with no Electron imports.
 *
 * Everything here is *our* concern rather than ACP's, and no part of it knows which provider
 * an agent is.
 */
export class Orchestrator {
  readonly team: Team;

  readonly #agents: readonly Agent[];
  readonly #runtimes: ReadonlyMap<string, AgentRuntime>;
  readonly #store: MessageStore;
  readonly #clock: Clock;
  readonly #createId: IdFactory;
  readonly #recorder: TurnRecorder | undefined;

  readonly #trackers = new Map<string, AgentStatusTracker>();
  readonly #busy = new Set<string>();
  readonly #inFlight = new Set<Promise<void>>();
  readonly #eventListeners = new Set<(event: AgentEvent) => void>();
  readonly #statusListeners = new Set<(agentId: string, status: AgentStatus) => void>();
  readonly #budgetListeners = new Set<(exhausted: BudgetExhausted) => void>();
  readonly #messageListeners = new Set<(message: Message) => void>();
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

  /** The budget is per *user prompt*: it is the thing that bounds cost when agents ping-pong. */
  #turnsThisPrompt = 0;

  constructor(options: OrchestratorOptions) {
    this.team = options.team;
    this.#agents = options.agents;
    this.#runtimes = options.runtimes;
    this.#store = options.store ?? new InMemoryMessageStore();
    this.#clock = options.clock ?? new SystemClock();
    this.#createId = options.createId ?? uuidv7;
    this.#recorder = options.recorder;

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

  get store(): MessageStore {
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
   * The user says something to one agent. This is what resets the turn budget: N agent turns
   * are allowed to follow from it before the team halts and asks.
   *
   * Resolves when *this* agent's turn ends. Anything it set off keeps running — see
   * {@link settled}.
   */
  async promptFromUser(agentId: string, text: string): Promise<void> {
    const agent = this.#requireAgent(agentId);
    this.#turnsThisPrompt = 0;
    const now = this.#clock.now();
    const message = this.#store.commit({
      id: this.#createId(now),
      teamId: this.team.id,
      fromAgentId: null, // the discriminator: NULL means the user
      toAgentId: agent.id,
      body: text,
      at: now,
    });
    this.#store.markDelivered([message.id], now);
    this.#announceMessage(message);
    await this.#runTurn(agent, { text, from: 'user' }, message.id);
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

    const mail = this.#store.undelivered(agentId);
    if (mail.length === 0) return;

    this.#store.markDelivered(
      mail.map((message) => message.id),
      this.#clock.now(),
    );
    // The whole queue as one prompt, not one prompt per message: delivering one and re-queuing
    // the rest doubles turn count against a budget of ten.
    const text = composeWakePrompt(
      mail,
      (message) =>
        message.fromAgentId === null
          ? undefined
          : this.#agents.find((candidate) => candidate.id === message.fromAgentId),
      this.#agents.filter((candidate) => candidate.id !== agentId),
    );
    await this.#runTurn(agent, { text, from: 'peer' }, mail[mail.length - 1]?.id);
  }

  async #runTurn(agent: Agent, prompt: Prompt, triggerMessageId?: string): Promise<void> {
    const runtime = this.#runtimes.get(agent.id);
    const tracker = this.#trackers.get(agent.id);
    if (runtime === undefined || tracker === undefined) return;

    this.#busy.add(agent.id);
    this.#turnsThisPrompt += 1;
    tracker.turnStarted();
    this.#recorder?.turnStarted(agent.id, this.#clock.now(), triggerMessageId);

    const turn = (async () => {
      try {
        for await (const event of runtime.sendPrompt(prompt)) {
          // Publish first, fold second: a consumer sees the event, then the status it caused.
          this.#publish(event);
          tracker.apply(event);
          this.#recorder?.record(event);
        }
      } finally {
        this.#busy.delete(agent.id);
      }
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

  #budgetIsSpent(): boolean {
    return this.#turnsThisPrompt >= this.team.turnBudget;
  }

  #announceBudget(): void {
    const pending = this.#agents.reduce(
      (total, agent) => total + this.#store.undelivered(agent.id).length,
      0,
    );
    for (const listener of this.#budgetListeners) {
      listener({
        teamId: this.team.id,
        turnsUsed: this.#turnsThisPrompt,
        turnBudget: this.team.turnBudget,
        pending,
      });
    }
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
        : chosen.kind.startsWith('allow')
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
