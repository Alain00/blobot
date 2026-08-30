import type { AgentEvent } from './events.js';

/** One prompt handed to a session. Peer messages arrive here too, already enveloped. */
export interface Prompt {
  readonly text: string;
  /** Who is speaking. A peer message is not a user instruction — see ticket 06. */
  readonly from: 'user' | 'peer';
  /**
   * What the user attached, embedded rather than linked. Never present when `from` is `peer`:
   * only the user attaches — `.scratch/composer-attachments/09`.
   *
   * The bytes travel because a path would not: an agent reading a path outside its
   * AgentWorkspace is a read blobot cannot gate, since `Read` never prompts. See
   * `docs/adr/0004-attachments-are-embedded-not-linked.md`.
   */
  readonly attachments?: readonly PromptAttachment[];
}

/**
 * One attachment on its way to a runtime.
 *
 * `data` and not a path, and raw bytes rather than base64: the encoding is the wire's business
 * and belongs to the adapter that speaks it.
 */
export interface PromptAttachment {
  readonly kind: AttachmentKind;
  readonly mimeType: string;
  /**
   * The file's own name, when it had one. **A pasted image has none**, and blobot does not
   * invent one: a made-up `pasted-image-1.png` is a filename in an agent's context for a file
   * that exists nowhere under it, and the agent will repeat it back.
   */
  readonly name?: string;
  readonly data: Uint8Array;
}

/**
 * The two kinds blobot carries, which are the two the runtimes advertise support for.
 *
 * A PDF is neither, deliberately: embedding one is protocol-legal and there is no evidence
 * either runtime does anything with it, so it would be dropped in silence. See
 * `.scratch/composer-attachments/03`.
 */
export type AttachmentKind = 'image' | 'text';

/**
 * What a runtime will take, in blobot's own words.
 *
 * Derived by each adapter from whatever its protocol says — `promptCapabilities` on both of
 * today's — so that the composer can refuse a file *before* the user writes the message, and
 * still cannot tell which provider is behind an agent. The same shape as `TrustLevel`: blobot's
 * vocabulary, translated at the far end.
 */
export interface AttachmentSupport {
  readonly images: boolean;
  readonly textFiles: boolean;
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

/**
 * One entry in a session's slash-command menu: a command or a skill, which the providers do
 * not distinguish and neither do we.
 *
 * blobot's own shape, not the wire type, for the same reason core imports no ACP type today.
 * It is not an `AgentEvent`: ticket 04 dropped `available_commands_update` from the vocabulary
 * because it is a menu rather than agent state, and several KB of it arrives every turn.
 * Putting it in the stream would push all of that through the recorder into SQLite.
 */
export interface AvailableCommand {
  readonly name: string;
  readonly description: string;
  /** What the command expects after its name, when it takes an argument at all. */
  readonly hint?: string;
}

/**
 * One thing a runtime lets the user choose about how it answers: a model, a reasoning effort,
 * a fast mode. Provider-agnostic on purpose — **the UI renders whatever groups it is handed
 * and knows none of their names**, because the day it special-cases `effort` is the day it
 * knows which provider an agent is.
 *
 * Both runtimes advertise these on `session/new`, which is why the shape is theirs rather than
 * ours: `{id, label, choices}` is what came back off the wire, filtered by the adapter to the
 * groups blobot is willing to hand over. What blobot withholds is the groups it owns itself —
 * Claude's permission `mode` is ticket 14's and OpenCode's is the persona.
 */
export interface RuntimeOptionGroup {
  /** The provider's own id: `model`, `effort`, `fast`. Stored, and sent back verbatim. */
  readonly id: string;
  readonly label: string;
  readonly choices: readonly RuntimeOptionChoice[];
  /** What the session is set to now. */
  readonly current?: string;
}

export interface RuntimeOptionChoice {
  readonly value: string;
  readonly label: string;
  /**
   * What the runtime does when blobot says nothing, which is what "no choice stored" means.
   * Exactly one choice per group carries it, read off the session before anything is applied.
   */
  readonly isDefault?: boolean;
}

/** A user's choices, keyed by group id. An absent key is the runtime's own default. */
export type RuntimeOptionChoices = Readonly<Record<string, string>>;

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

  /**
   * The slash commands and skills this session currently advertises.
   *
   * Per session, so it belongs to the runtime instance rather than to the Team or the
   * AgentProfile, and it does not survive a restart: after `session/load` the provider
   * re-advertises, and a stale menu read from disk would be worse than an empty one.
   *
   * **Empty is a real answer.** On OpenCode the list arrives a few milliseconds *after*
   * `session/prompt`, so an agent that has never held a turn knows no commands at all. A
   * consumer must say so rather than assume the list is still loading.
   */
  readonly availableCommands: readonly AvailableCommand[];

  /**
   * Fires when the list has actually changed. **Replace, never merge** — a provider's push is
   * authoritative, and merging would accumulate commands from directories the agent has left.
   * An identical re-advertisement, which OpenCode sends after every prompt, notifies nobody.
   */
  onCommandsChange(listener: (commands: readonly AvailableCommand[]) => void): Unsubscribe;

  /**
   * What this runtime will accept attached to a prompt.
   *
   * Read after `start()`, from the capabilities the provider advertised. Before then it is the
   * conservative answer — nothing — because a composer that offers a paperclip against a
   * runtime that has not said yes is offering a refusal.
   */
  readonly accepts: AttachmentSupport;

  /**
   * What this runtime lets the user choose, as it advertised it on this session.
   *
   * Empty until `start()`, and empty for a runtime that offers nothing — which is a real
   * answer and not a loading state. Read at session creation rather than asked for, because
   * both providers volunteer it and neither has a method for the question.
   */
  readonly optionGroups: readonly RuntimeOptionGroup[];
}
