import type { AgentEvent } from './events.js';

/** One prompt handed to a session. Peer messages arrive here too, already enveloped. */
export interface Prompt {
  readonly text: string;
  /** Who is speaking. A peer message is not a user instruction — see ticket 06. */
  readonly from: 'user' | 'peer';
}

/**
 * `session/request_permission` is agent→client request/response and blocks the turn until
 * answered. Events are fire-and-forget, so this is a **callback on the runtime**, not an
 * event: modelling it as one would bolt a correlation id and a response channel onto the
 * vocabulary.
 */
export interface PermissionRequest {
  readonly agentId: string;
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly title: string;
  readonly options: readonly PermissionOption[];
}

export interface PermissionOption {
  readonly optionId: string;
  readonly kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  readonly name: string;
}

/** Resolves with the chosen `optionId`, or `null` to cancel the turn. */
export type PermissionHandler = (request: PermissionRequest) => Promise<string | null>;

/** The `message_agent` MCP tool call, as the orchestrator's handler sees it. */
export interface PeerMessageCall {
  readonly from: string;
  /** Free-form: validated by the orchestrator, not by an enum frozen at session creation. */
  readonly agent: string;
  readonly message: string;
  /** The one-line situation the sender supplies. We never summarize on her behalf. */
  readonly context?: string;
  /** Required by ticket 15: the handler must be idempotent and non-blocking. */
  readonly idempotencyKey: string;
}

/** The ack carries recipient state — the one fact that changes the sender's next action. */
export interface PeerMessageAck {
  readonly delivered: true;
  readonly recipient: string;
  readonly status: 'started' | 'queued';
}

/**
 * The orchestrator's tool handler, injected. It is a plain function in the process that
 * holds the mailbox — the mock calls it directly, real runtimes reach it over loopback HTTP.
 */
export type PeerMessageHandler = (call: PeerMessageCall) => Promise<PeerMessageAck>;

/**
 * Process-level state, distinct from Status (ticket 09), which is derived from the event
 * stream. `starting` is the one Status that comes from here rather than from events.
 */
export type RuntimeLifecycle = 'created' | 'starting' | 'ready' | 'stopped' | 'dead';

export type Unsubscribe = () => void;

/**
 * The interface every provider sits behind. Nothing outside an adapter may know which
 * provider an Agent is.
 */
export interface AgentRuntime {
  readonly agentId: string;
  readonly sessionId: string;
  readonly lifecycle: RuntimeLifecycle;

  /** Spawn the process and create the session. Rejects if the runtime cannot start. */
  start(): Promise<void>;

  /**
   * One turn. Prompts on a session are serialized — calling this while a turn is in flight
   * is a programming error, which is why the orchestrator owns a mailbox.
   *
   * The iterable ends after `turn_ended`, or after a fatal `error`. Errors arrive as events
   * rather than rejections so a partial transcript survives.
   */
  sendPrompt(prompt: Prompt): AsyncIterable<AgentEvent>;

  /** Cancel the turn in flight. Resolves once the cancellation has been requested. */
  cancel(): Promise<void>;

  stop(): Promise<void>;

  /**
   * Events that belong to no turn — today, process death between turns. Turn events are not
   * repeated here; they belong to the iterable `sendPrompt` returned.
   */
  onEvent(listener: (event: AgentEvent) => void): Unsubscribe;

  onLifecycleChange(listener: (lifecycle: RuntimeLifecycle) => void): Unsubscribe;

  setPermissionHandler(handler: PermissionHandler): void;
}
