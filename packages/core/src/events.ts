import type { PictureNotDrawn, PictureSource } from './pictures.js';

/**
 * blobot's normalized event vocabulary.
 *
 * This is *our* type, never an ACP passthrough — see
 * `.scratch/first-demo/issues/04-the-normalized-agentevent-vocabulary.md`.
 * `packages/core` exports no ACP type; every provider quirk dies inside an adapter and
 * emerges as one of these eleven members.
 */

/** Every event carries agent and session identity — the orchestrator multiplexes many agents. */
export interface AgentEventBase {
  readonly agentId: string;
  readonly sessionId: string;
  /** Epoch millis, from the runtime's injected clock. */
  readonly at: number;
}

/**
 * The normalized tool taxonomy. Observed on OpenCode as `read` / `edit` / `execute` /
 * `other`; every MCP tool collapses to `other`, so client-supplied tools are told apart by
 * their `<server>_` name prefix, not by kind.
 */
export type ToolKind = 'read' | 'edit' | 'execute' | 'other';

export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Why a turn stopped. `end_turn` and `cancelled` observed on both runtimes; the rest are
 * Claude-bridge additions that still have to reach the UI.
 */
export type StopReason =
  | 'end_turn'
  | 'cancelled'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'refusal';

/** A fragment of the agent's answer. Ragged: bursts of fragments, then a gap. */
export interface AgentMessageDelta extends AgentEventBase {
  readonly type: 'agent_message_delta';
  readonly messageId: string;
  readonly text: string;
}

/**
 * Synthesized by core when a `messageId` closes: the concatenation of that message's
 * deltas. The natural unit both to persist and to hand a peer as compact context.
 */
export interface AgentMessageCompleted extends AgentEventBase {
  readonly type: 'agent_message_completed';
  readonly messageId: string;
  readonly text: string;
}

/**
 * A fragment of the agent's reasoning. Deltas only — there is no completed counterpart.
 *
 * Trap: both runtimes share one `messageId` between thinking and answer chunks, so a
 * thinking pane must key on event type, never on message identity.
 */
export interface AgentThoughtDelta extends AgentEventBase {
  readonly type: 'agent_thought_delta';
  readonly messageId: string;
  readonly text: string;
}

export interface ToolCallStarted extends AgentEventBase {
  readonly type: 'tool_call_started';
  /** The only stable key. Tools interleave; never assume a serial timeline. */
  readonly toolCallId: string;
  readonly title: string;
  readonly kind: ToolKind;
  readonly rawInput?: unknown;
}

/**
 * Argument refinements, streaming output, and the terminal `completed` / `failed`.
 *
 * Trap: a cancelled tool reports `completed` with `exit: null`. Never infer success from
 * status alone.
 */
export interface ToolCallUpdated extends AgentEventBase {
  readonly type: 'tool_call_updated';
  readonly toolCallId: string;
  readonly status: ToolCallStatus;
  readonly title?: string;
  readonly kind?: ToolKind;
  readonly rawInput?: unknown;
  readonly output?: string;
  /** `null` on a cancelled process — the only signal that `completed` is a lie. */
  readonly exit?: number | null;
  /** Present on `failed`. A tool failure is not an `error`: the turn continues. */
  readonly error?: string;
  /**
   * What an edit changed, in lines. blobot's own shape, counted from ACP's `diff` content
   * block, so no consumer learns which provider produced it.
   *
   * Absent is not zero. A tool that changed nothing, a diff too large to measure, and a runtime
   * that sends no diff block are all absent, and the transcript draws nothing for all three.
   */
  readonly changed?: { readonly added: number; readonly removed: number };
}

/**
 * A peer message, Alice→Bob. Synthesized by the **orchestrator**, never by an adapter, so
 * the UI can render a peer message without knowing an MCP tool exists.
 */
export interface AgentMessageSent extends AgentEventBase {
  readonly type: 'agent_message_sent';
  readonly to: string;
  readonly message: string;
  readonly context?: string;
}

/**
 * The context gauge — occupancy, not billing.
 *
 * Trap: reports `used: 0` on cancel. Suppress the trailing one when a turn ends cancelled.
 */
export interface UsageUpdated extends AgentEventBase {
  readonly type: 'usage_updated';
  readonly used: number;
  readonly size: number;
  readonly costUsd?: number;
}

/**
 * Synthesized from the `session/prompt` reply's `stopReason` — neither runtime emits a turn
 * terminator, and `for await` would silently discard an iterator's return value.
 */
export interface TurnEnded extends AgentEventBase {
  readonly type: 'turn_ended';
  readonly turnId: string;
  readonly stopReason: StopReason;
}

/**
 * blobot chose a moment, and here is what came of it.
 *
 * The one event in this vocabulary that is not the agent's news. Every other member is
 * something a runtime said; this is something blobot did *to* a session, and it is in the
 * vocabulary rather than beside it because the alternative was a second durable channel
 * carrying one fact. It travels the path the rest already travel: published to the pane,
 * appended by the recorder, and read back into the transcript on a switch.
 *
 * It never says the word *compacted* on its own. `how` is the whole of what happened, and
 * `refused` is a real outcome and the most important one: blobot decided the session was too
 * full, asked for a handoff, did not get an ordinary ending, and **kept the session it had**.
 * See `.scratch/transcript-scale/issues/10-compaction-by-handoff.md`.
 */
export interface ContextCompacted extends AgentEventBase {
  readonly type: 'context_compacted';
  /**
   * `command` is the runtime's own compaction, which keeps the session id. `handoff` is a
   * fresh session carrying what the agent wrote down. `refused` is neither, and says why.
   */
  readonly how: 'command' | 'handoff' | 'refused';
  /** Occupancy when blobot decided, in the tokens the runtime reports. */
  readonly used: number;
  /** What it decided against: ticket 09's working ceiling, never the advertised window. */
  readonly ceiling: number;
  /**
   * Whether a person established that ceiling for this model, or it is blobot's conservative
   * estimate. Carried because firing a session restart off a guess is a stronger claim than
   * drawing that guess on a gauge, and the line the user reads should not conflate the two.
   */
  readonly measured: boolean;
  /** What the agent wrote for its successor. Present on `handoff`, and on nothing else. */
  readonly handoff?: string;
  /** Where that was archived, outside every AgentWorkspace. */
  readonly handoffPath?: string;
  /** Why nothing happened, on `refused`. In blobot's words, never a protocol enum. */
  readonly reason?: string;
  /**
   * Whether the fresh session came up under the agent's standing instructions **as they stand
   * now**, which the closed one may never have been given.
   *
   * Only on `handoff`, and only where the runtime binds a persona to a session. It is here
   * rather than left implicit because it is the one way a compaction changes *who the agent
   * is* rather than only what it remembers, and it would otherwise land at a moment nobody
   * chose with nothing on screen. See `AgentRuntime.personaIsSessionBound`.
   */
  readonly personaRefreshed?: boolean;
}

/**
 * A **Picture** reached blobot, and either it is on screen or it is not and here is why.
 *
 * `.scratch/agent-media/06`. An eleventh member rather than blocks on `agent_message_completed`,
 * on an argument stronger than the ripple through the assembler and the `NOT NULL` text column:
 * under the objective there is **no message to hang them on**, because a shown Picture arrives as
 * a loopback tool call while the agent is saying nothing at all. So it is a sibling of
 * `agent_message_sent` and `context_compacted`, both of which are already news that is not prose.
 *
 * The name is neutral on purpose. *Shown* is the Agent's verb and half of these were not shown by
 * anybody, so `picture_shown` would assert of every one the single thing the two sources disagree
 * about.
 *
 * **It never carries bytes.** The event is persisted by the recorder and streamed to a renderer
 * that replays it on every team switch, so bytes here would be every picture of the session
 * crossing the boundary twice. They are written to the store *before* the event exists and this
 * carries the id -- `Attached.tsx`'s precedent, and it holds harder here, because the user knows
 * how many attachments they picked up and an agent in a screenshot loop decides how many Pictures
 * a transcript has.
 */
export interface PictureArrived extends AgentEventBase {
  readonly type: 'picture_arrived';
  /** Which of the two frames it gets. Required, so nothing arrives uncommitted about it. */
  readonly source: PictureSource;
  /** The store's row. Absent exactly when `notDrawn` is present. */
  readonly pictureId?: string;
  /** Why there is nothing to look at. Absent exactly when `pictureId` is present. */
  readonly notDrawn?: PictureNotDrawn;
  /**
   * The call it belongs to. On both sources, which looked like a second discriminator while
   * charting and is not: an observed Picture comes off a `tool_call_update` and a shown one off
   * the agent calling blobot's own tool, so both belong to a run.
   */
  readonly toolCallId?: string;
  /** The tool that produced it. Observed only, and never drawn as a filename. */
  readonly toolName?: string;
  /** The file's own name, relative to the AgentWorkspace. Shown only. */
  readonly name?: string;
  /** Measured by reading the header, never taken from the runtime's word for it. */
  readonly width?: number;
  readonly height?: number;
  /** The size, for the refusal that names it and for nothing on the frame. */
  readonly bytes?: number;
  /** The file's mtime, and what `turnStartedAt` is compared against. Shown only. */
  readonly writtenAt?: number;
  /**
   * Carried rather than re-derived, so a replay compares the same two numbers a live draw did.
   */
  readonly turnStartedAt?: number;
}

/**
 * Fatal only: protocol errors and process death. An **event, not a thrown rejection**, so a
 * partial turn's transcript survives intact.
 */
export interface AgentError extends AgentEventBase {
  readonly type: 'error';
  readonly message: string;
  readonly code?: string;
  /** True when the process is gone and the agent needs a restart. */
  readonly fatal: true;
}

export type AgentEvent =
  | AgentMessageDelta
  | AgentMessageCompleted
  | AgentThoughtDelta
  | ToolCallStarted
  | ToolCallUpdated
  | AgentMessageSent
  | UsageUpdated
  | ContextCompacted
  | PictureArrived
  | TurnEnded
  | AgentError;

export type AgentEventType = AgentEvent['type'];
