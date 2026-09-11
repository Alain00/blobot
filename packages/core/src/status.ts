import type { AgentEvent } from './events.js';
import type { RuntimeLifecycle } from './runtime.js';

/**
 * An Agent's current activity — see
 * `.scratch/first-demo/issues/09-agent-status-state-machine.md`.
 *
 * `done` is deliberately absent: an agent that finishes a turn is `idle`.
 */
export type AgentStatus =
  | 'idle'
  | 'starting'
  | 'thinking'
  | 'working'
  | 'responding'
  | 'waiting'
  | 'failed';

export type StatusListener = (status: AgentStatus) => void;

/**
 * A pure fold over one agent's event stream plus its runtime lifecycle. Held in memory and
 * computed fresh each launch — persisting it invites the bug where SQLite says `working` and
 * nothing is running.
 *
 * Signals overlap (a tool can be in flight while text streams), so the answer is a fixed
 * precedence rather than last-event-wins, which would make the blobatar flicker several
 * times a second:
 *
 *   failed > waiting > starting > working > responding > thinking > idle
 *
 * The ordering encodes what a watcher most needs to know: *is someone blocked on me* beats
 * *is it touching my files* beats *is it talking* beats *is it musing*.
 */
export class AgentStatusTracker {
  readonly agentId: string;

  #lifecycle: RuntimeLifecycle = 'created';
  #turnInFlight = false;
  #responding = false;
  #openToolCalls = new Set<string>();
  #permissionOutstanding = false;
  /** Only process-level failure is sticky: the distinction is whether the agent is viable. */
  #failed = false;
  #failure: string | undefined;
  #status: AgentStatus = 'idle';
  #listeners = new Set<StatusListener>();

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  get status(): AgentStatus {
    return this.#status;
  }

  /** Why the agent is `failed`, for the one status the user has to act on. */
  get failure(): string | undefined {
    return this.#failure;
  }

  onChange(listener: StatusListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * A prompt has been sent. Called by the orchestrator rather than inferred from the first
   * event, because a turn can be ninety seconds old before it emits anything, and `idle` is
   * a lie for all ninety of them.
   */
  turnStarted(): AgentStatus {
    this.#turnInFlight = true;
    this.#responding = false;
    this.#openToolCalls.clear();
    return this.#settle();
  }

  lifecycleChanged(lifecycle: RuntimeLifecycle): AgentStatus {
    this.#lifecycle = lifecycle;
    if (lifecycle === 'dead') {
      this.#failed = true;
      this.#failure ??= 'the runtime process is gone';
      this.#turnInFlight = false;
    }
    // A restart is the way out of `failed`, and this is what a restart looks like.
    if (lifecycle === 'starting') {
      this.#failed = false;
      this.#failure = undefined;
      this.#turnInFlight = false;
    }
    return this.#settle();
  }

  /**
   * A permission prompt blocks the turn until a human answers. Narrow by construction: an
   * agent waiting on a *peer* is simply idle, because replies are explicit and nobody blocks.
   */
  permissionRequested(): AgentStatus {
    this.#permissionOutstanding = true;
    return this.#settle();
  }

  permissionResolved(): AgentStatus {
    this.#permissionOutstanding = false;
    return this.#settle();
  }

  /** Reconcile found the AgentWorkspace gone or its branch unresolvable (ticket 10). */
  markFailed(reason: string): AgentStatus {
    this.#failed = true;
    this.#failure = reason;
    this.#turnInFlight = false;
    return this.#settle();
  }

  apply(event: AgentEvent): AgentStatus {
    switch (event.type) {
      case 'agent_message_delta':
      case 'agent_message_completed':
        this.#responding = true;
        break;
      case 'tool_call_started':
        this.#openToolCalls.add(event.toolCallId);
        // A tool call opens a new segment; whatever was being said is finished.
        this.#responding = false;
        break;
      case 'tool_call_updated':
        if (event.status === 'completed' || event.status === 'failed') {
          this.#openToolCalls.delete(event.toolCallId);
        }
        break;
      case 'turn_ended':
        // Every stop reason lands here — `cancelled` was the user pressing stop, and
        // `refusal` / `max_tokens` are turns that ended unusually. The agent is alive and
        // answerable in all of them; the outcome lives in the transcript, not in a status.
        this.#turnInFlight = false;
        this.#responding = false;
        this.#openToolCalls.clear();
        break;
      case 'error':
        this.#failed = true;
        this.#failure = event.message;
        this.#turnInFlight = false;
        break;
      case 'agent_thought_delta':
      case 'agent_message_sent':
      case 'usage_updated':
      case 'plan_limits_updated':
        break;
    }
    return this.#settle();
  }

  #settle(): AgentStatus {
    const next = this.#derive();
    if (next !== this.#status) {
      this.#status = next;
      for (const listener of this.#listeners) listener(next);
    }
    return this.#status;
  }

  #derive(): AgentStatus {
    if (this.#failed) return 'failed';
    if (this.#permissionOutstanding) return 'waiting';
    if (this.#lifecycle === 'starting') return 'starting';
    if (!this.#turnInFlight) return 'idle';
    if (this.#openToolCalls.size > 0) return 'working';
    if (this.#responding) return 'responding';
    // A turn in flight with nothing else to go on. `agent_thought_delta` lands here too, and
    // so does the ninety-second silence before a slow runtime's first token.
    return 'thinking';
  }
}

/** Fold a finished stream to its final status — the shape most tests want. */
export function statusAfter(agentId: string, events: Iterable<AgentEvent>): AgentStatus {
  const tracker = new AgentStatusTracker(agentId);
  tracker.turnStarted();
  for (const event of events) tracker.apply(event);
  return tracker.status;
}
