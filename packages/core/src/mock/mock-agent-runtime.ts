import { lineChange } from '../adapters/acp/line-diff.js';
import type { Clock } from '../clock.js';
import { SystemClock } from '../clock.js';
import type { AgentEvent, StopReason } from '../events.js';
import { assembleMessages } from '../message-assembler.js';
import { sameCommands } from '../commands.js';
import type {
  AgentRuntime,
  AttachmentSupport,
  AvailableCommand,
  PeerMessageAck,
  PeerMessageHandler,
  PermissionHandler,
  Prompt,
  RuntimeLifecycle,
  RuntimeOptionGroup,
  Unsubscribe,
} from '../runtime.js';
import { AsyncQueue } from './async-queue.js';
import { raggedFragments } from './ragged.js';
import type { Scenario, ScenarioStep, ToolStep } from './scenario.js';

/** An event as the dev control panel writes it: identity and timestamp are filled in for you. */
export type InjectableEvent<T = AgentEvent> = T extends AgentEvent
  ? Omit<T, 'agentId' | 'sessionId' | 'at'>
  : never;

/**
 * Which scenario answers a given prompt. An array is consumed one per turn, with the last
 * repeating — enough to script a two-turn demo without inventing a scheduler.
 */
export type ScenarioScript =
  | Scenario
  | readonly Scenario[]
  | ((prompt: Prompt, turnIndex: number) => Scenario);

export interface MockAgentRuntimeOptions {
  readonly agentId: string;
  readonly sessionId?: string;
  readonly clock?: Clock;
  readonly script: ScenarioScript;
  /**
   * The orchestrator's `message_agent` handler, called directly — no loopback HTTP. Declaring
   * that a message was sent would test nothing; the mailbox and wake logic are the point.
   */
  readonly peerMessageHandler?: PeerMessageHandler;
  readonly startupMs?: number;
  /** When set, `start()` rejects with this message: the spawn-failure path. */
  readonly spawnFailure?: string;
  /** How late a cancellation lands. Non-zero reproduces a cancel that arrives after the fact. */
  readonly cancelLatencyMs?: number;
  readonly contextSize?: number;
  readonly usedPerTurn?: number;
  /**
   * The menu the session advertises before it has held a turn. Defaults to empty, which is
   * the case worth building against: a fresh session may genuinely know no commands until a
   * scenario's `advertises()` step fires.
   */
  readonly commands?: readonly AvailableCommand[];
  /**
   * What this runtime takes attached to a prompt. Defaults to both, which is what both real
   * runtimes advertise.
   *
   * **Set it to refuse something.** There is no runtime on this machine that says no, which is
   * exactly why the mock has to be the one that does: without it the composer's refusal path is
   * never exercised until a fourth adapter arrives and somebody finds it was never wired up.
   */
  readonly accepts?: AttachmentSupport;
}

const CANCELLED_TOOL_OUTPUT =
  '(no output)\n\n<shell_metadata>\nUser aborted the command\n</shell_metadata>';

/**
 * A runtime that emits blobot's event vocabulary with no ACP anywhere — and reproduces every
 * ugly behaviour the research observed, on purpose. See
 * `.scratch/first-demo/issues/08-mockagentruntime-fidelity-contract.md`: a mock that is too
 * kind produces a UI that shatters on first contact.
 *
 * It ships as demo mode, not as test scaffolding.
 */
export class MockAgentRuntime implements AgentRuntime {
  readonly agentId: string;
  readonly sessionId: string;

  readonly #clock: Clock;
  readonly #script: ScenarioScript;
  readonly #peerMessageHandler: PeerMessageHandler | undefined;
  readonly #startupMs: number;
  readonly #spawnFailure: string | undefined;
  readonly #cancelLatencyMs: number;
  readonly #accepts: AttachmentSupport;
  readonly #contextSize: number;
  readonly #usedPerTurn: number;

  #lifecycle: RuntimeLifecycle = 'created';
  #turnIndex = 0;
  #messageCounter = 0;
  #toolCounter = 0;
  #used = 0;
  #turn: { queue: AsyncQueue<AgentEvent>; abort: AbortController } | undefined;
  #permissionHandler: PermissionHandler | undefined;
  #eventListeners = new Set<(event: AgentEvent) => void>();
  #lifecycleListeners = new Set<(lifecycle: RuntimeLifecycle) => void>();
  #commandListeners = new Set<(commands: readonly AvailableCommand[]) => void>();
  #commands: readonly AvailableCommand[];

  constructor(options: MockAgentRuntimeOptions) {
    this.agentId = options.agentId;
    this.sessionId = options.sessionId ?? `session_${options.agentId}`;
    this.#clock = options.clock ?? new SystemClock();
    this.#script = options.script;
    this.#peerMessageHandler = options.peerMessageHandler;
    this.#startupMs = options.startupMs ?? 250;
    this.#spawnFailure = options.spawnFailure;
    this.#cancelLatencyMs = options.cancelLatencyMs ?? 0;
    this.#accepts = options.accepts ?? { images: true, textFiles: true };
    this.#contextSize = options.contextSize ?? 200_000;
    this.#usedPerTurn = options.usedPerTurn ?? 4_200;
    this.#commands = options.commands ?? [];
  }

  get lifecycle(): RuntimeLifecycle {
    return this.#lifecycle;
  }

  /** True while a turn is in flight. Prompts on a session are serialized. */
  get busy(): boolean {
    return this.#turn !== undefined;
  }

  async start(): Promise<void> {
    if (this.#lifecycle === 'starting' || this.#lifecycle === 'ready') {
      throw new Error(`${this.agentId}: already started`);
    }
    this.#setLifecycle('starting');
    await this.#clock.sleep(this.#startupMs);
    if (this.#spawnFailure !== undefined) {
      this.#setLifecycle('dead');
      throw new Error(this.#spawnFailure);
    }
    this.#setLifecycle('ready');
  }

  /** Every prompt this runtime was handed, so a scenario can assert what actually arrived. */
  readonly prompts: Prompt[] = [];

  get accepts(): AttachmentSupport {
    return this.#accepts;
  }

  sendPrompt(prompt: Prompt): AsyncIterable<AgentEvent> {
    this.prompts.push(prompt);
    if (this.#lifecycle !== 'ready') {
      throw new Error(`${this.agentId}: cannot prompt a runtime that is ${this.#lifecycle}`);
    }
    if (this.#turn !== undefined) {
      throw new Error(
        `${this.agentId}: a turn is already in flight — the orchestrator's mailbox exists so this cannot happen`,
      );
    }
    const queue = new AsyncQueue<AgentEvent>();
    const abort = new AbortController();
    this.#turn = { queue, abort };
    void this.#runTurn(prompt, queue, abort).finally(() => {
      this.#turn = undefined;
      queue.close();
    });
    return assembleMessages(queue);
  }

  /**
   * Request cancellation. Resolves as soon as the request is in — the *landing* is deferred
   * by `cancelLatencyMs`, because a cancellation that arrives late is a real case.
   */
  async cancel(): Promise<void> {
    const turn = this.#turn;
    if (turn === undefined) return;
    if (this.#cancelLatencyMs <= 0) {
      turn.abort.abort();
      return;
    }
    void this.#clock.sleep(this.#cancelLatencyMs).then(() => {
      turn.abort.abort();
    });
  }

  async stop(): Promise<void> {
    this.#turn?.abort.abort();
    this.#setLifecycle('stopped');
  }

  /**
   * The process dies. Emits a fatal `error` — into the current turn if there is one,
   * out-of-band if the death lands between turns — and leaves the agent needing a restart.
   */
  killProcess(message = 'runtime process exited unexpectedly'): void {
    if (this.#lifecycle === 'dead') return;
    this.#emit({ type: 'error', message, code: 'process_died', fatal: true });
    this.#turn?.abort.abort();
    this.#turn?.queue.close();
    this.#setLifecycle('dead');
  }

  /** The dev control panel: fire an event by hand without editing a scenario and restarting. */
  pushEvent(event: InjectableEvent): void {
    this.#emit(event);
  }

  onEvent(listener: (event: AgentEvent) => void): Unsubscribe {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  onLifecycleChange(listener: (lifecycle: RuntimeLifecycle) => void): Unsubscribe {
    this.#lifecycleListeners.add(listener);
    return () => this.#lifecycleListeners.delete(listener);
  }

  get availableCommands(): readonly AvailableCommand[] {
    return this.#commands;
  }

  /**
   * The mock offers nothing to choose, and says so rather than inventing a model list.
   *
   * An empty list is a real answer on a real runtime too — OpenCode advertises no effort
   * scale — so the consumer already has to handle it, and a demo agent offering a picker over
   * models it does not have would be the kind mock ticket 08 exists to refuse.
   */
  get optionGroups(): readonly RuntimeOptionGroup[] {
    return [];
  }

  onCommandsChange(listener: (commands: readonly AvailableCommand[]) => void): Unsubscribe {
    this.#commandListeners.add(listener);
    return () => this.#commandListeners.delete(listener);
  }

  /** Replace, never merge, and stay quiet when nothing actually moved. */
  #setCommands(commands: readonly AvailableCommand[]): void {
    if (sameCommands(this.#commands, commands)) return;
    this.#commands = commands;
    for (const listener of this.#commandListeners) listener(commands);
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this.#permissionHandler = handler;
  }

  get permissionHandler(): PermissionHandler | undefined {
    return this.#permissionHandler;
  }

  /**
   * Both runtimes offer three options and blobot now surfaces all three. The mock keeps
   * offering exactly what a real bridge offers, in the same shape: a mock that offered only
   * what the UI draws would never catch the UI drawing the wrong one.
   */
  async #askPermission(toolCallId: string, title: string): Promise<boolean> {
    const handler = this.#permissionHandler;
    if (handler === undefined) return false;
    const chosen = await handler({
      agentId: this.agentId,
      sessionId: this.sessionId,
      toolCallId,
      title,
      options: [
        { optionId: 'allow', kind: 'allow_once', name: 'Yes' },
        { optionId: 'allow_always', kind: 'allow_always', name: 'Yes, and don\'t ask again' },
        { optionId: 'reject', kind: 'reject_once', name: 'No' },
      ],
    });
    return chosen !== null && chosen.startsWith('allow');
  }

  // ---------------------------------------------------------------- turn execution

  async #runTurn(
    prompt: Prompt,
    queue: AsyncQueue<AgentEvent>,
    abort: AbortController,
  ): Promise<void> {
    const turnIndex = this.#turnIndex;
    this.#turnIndex += 1;
    const turnId = `turn_${turnIndex + 1}`;
    const scenario = this.#scenarioFor(prompt, turnIndex);
    let messageId = this.#nextMessageId();

    for (const step of scenario.steps) {
      if (abort.signal.aborted) return this.#endCancelled(queue, turnId);

      switch (step.kind) {
        case 'think':
        case 'say': {
          const type = step.kind === 'think' ? 'agent_thought_delta' : 'agent_message_delta';
          for (const fragment of raggedFragments(step.text, step.overMs)) {
            await this.#clock.sleep(fragment.delayBeforeMs, abort.signal);
            if (abort.signal.aborted) return this.#endCancelled(queue, turnId);
            this.#emitTo(queue, { type, messageId, text: fragment.text });
          }
          break;
        }
        case 'wait': {
          await this.#clock.sleep(step.ms, abort.signal);
          break;
        }
        case 'tool': {
          const cancelledDuringTool = await this.#runTool(queue, step.tool, abort.signal);
          if (cancelledDuringTool) return this.#endCancelled(queue, turnId);
          // A new assistant message begins after a tool call; within one message, thinking
          // and answer deliberately share a messageId.
          messageId = this.#nextMessageId();
          break;
        }
        case 'message_agent': {
          await this.#runPeerMessage(queue, step, turnId);
          break;
        }
        case 'commands': {
          this.#setCommands(step.commands);
          break;
        }
        case 'usage': {
          this.#used = step.used;
          this.#emitTo(queue, {
            type: 'usage_updated',
            used: step.used,
            size: step.size,
            ...(step.costUsd === undefined ? {} : { costUsd: step.costUsd }),
          });
          break;
        }
        case 'error': {
          this.#emitTo(queue, {
            type: 'error',
            message: step.message,
            fatal: true,
            ...(step.code === undefined ? {} : { code: step.code }),
          });
          // No `turn_ended`: the RPC never replied. The transcript keeps what it got.
          if (step.dies) this.#setLifecycle('dead');
          return;
        }
        case 'end': {
          return this.#endTurn(queue, turnId, step.stopReason);
        }
      }
    }

    if (abort.signal.aborted) return this.#endCancelled(queue, turnId);
    this.#endTurn(queue, turnId, 'end_turn');
  }

  /** Returns true if the turn was cancelled while the tool was in flight. */
  async #runTool(
    queue: AsyncQueue<AgentEvent>,
    tool: ToolStep,
    signal: AbortSignal,
  ): Promise<boolean> {
    const toolCallId = this.#nextToolCallId();
    this.#emitTo(queue, {
      type: 'tool_call_started',
      toolCallId,
      title: tool.title,
      kind: tool.kind,
      ...(tool.rawInput === undefined ? {} : { rawInput: tool.rawInput }),
    });
    // Ticket 14's posture, reproduced rather than assumed away: some tools ask first, and the
    // agent sits at `pending` until a human answers. A mock where everything runs unasked is a
    // UI that meets its first `rm` prompt in production.
    if (tool.asks === true) {
      const allowed = await this.#askPermission(toolCallId, tool.title);
      if (!allowed) {
        this.#emitTo(queue, {
          type: 'tool_call_updated',
          toolCallId,
          status: 'failed',
          error: 'the user did not allow this',
        });
        return signal.aborted;
      }
    }

    this.#emitTo(queue, { type: 'tool_call_updated', toolCallId, status: 'in_progress' });

    await this.#clock.sleep(tool.durationMs, signal);

    if (signal.aborted) {
      // The trap: an aborted tool reports `completed`, and only `exit: null` betrays it.
      this.#emitTo(queue, {
        type: 'tool_call_updated',
        toolCallId,
        status: 'completed',
        output: CANCELLED_TOOL_OUTPUT,
        exit: null,
      });
      return true;
    }

    const outcome = tool.outcome;
    if (outcome.status === 'failed') {
      // A tool failure is not an `error`: the model sees it, adapts, and the turn continues.
      this.#emitTo(queue, {
        type: 'tool_call_updated',
        toolCallId,
        status: 'failed',
        error: outcome.error ?? 'tool failed',
        ...(outcome.output === undefined ? {} : { output: outcome.output }),
      });
      return false;
    }

    // The counts land on an update of their own, before the terminal one — which is where a
    // real Claude puts them, and a mock that folded them into the completion would let a
    // consumer read them only on the way out and still pass.
    if (tool.diff !== undefined) {
      const changed = lineChange(tool.diff.oldText, tool.diff.newText);
      if (changed !== undefined) {
        this.#emitTo(queue, {
          type: 'tool_call_updated',
          toolCallId,
          status: 'in_progress',
          changed,
        });
      }
    }
    this.#emitTo(queue, {
      type: 'tool_call_updated',
      toolCallId,
      status: 'completed',
      output: outcome.output ?? defaultToolOutput(outcome.status),
      exit: outcome.status === 'cancelled_reports_completed' ? null : (outcome.exit ?? 0),
    });
    return false;
  }

  async #runPeerMessage(
    queue: AsyncQueue<AgentEvent>,
    step: Extract<ScenarioStep, { kind: 'message_agent' }>,
    turnId: string,
  ): Promise<void> {
    const toolCallId = this.#nextToolCallId();
    const rawInput = {
      agent: step.to,
      message: step.message,
      ...(step.context === undefined ? {} : { context: step.context }),
    };
    this.#emitTo(queue, {
      type: 'tool_call_started',
      toolCallId,
      title: 'blobot_message_agent',
      kind: 'other',
      rawInput,
    });
    this.#emitTo(queue, { type: 'tool_call_updated', toolCallId, status: 'in_progress' });

    // Note what is *not* emitted here: `agent_message_sent` belongs to the orchestrator, so
    // the UI can render a peer message without knowing an MCP tool exists.
    if (this.#peerMessageHandler === undefined) {
      this.#emitTo(queue, {
        type: 'tool_call_updated',
        toolCallId,
        status: 'failed',
        error: 'no message_agent handler is attached to this runtime',
      });
      return;
    }
    try {
      const ack: PeerMessageAck = await this.#peerMessageHandler({
        from: this.agentId,
        agent: step.to,
        message: step.message,
        idempotencyKey: `${this.agentId}:${turnId}:${toolCallId}`,
        ...(step.context === undefined ? {} : { context: step.context }),
      });
      this.#emitTo(queue, {
        type: 'tool_call_updated',
        toolCallId,
        status: 'completed',
        output: JSON.stringify(ack),
        exit: 0,
      });
    } catch (error) {
      // A rejected peer message is a tool failure, not a turn failure: the sender gets to
      // read the error and try a different recipient.
      this.#emitTo(queue, {
        type: 'tool_call_updated',
        toolCallId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  #endTurn(queue: AsyncQueue<AgentEvent>, turnId: string, stopReason: StopReason): void {
    if (stopReason === 'cancelled') return this.#endCancelled(queue, turnId);
    this.#used += this.#usedPerTurn;
    this.#emitTo(queue, {
      type: 'usage_updated',
      used: this.#used,
      size: this.#contextSize,
      costUsd: 0,
    });
    this.#emitTo(queue, { type: 'turn_ended', turnId, stopReason });
  }

  #endCancelled(queue: AsyncQueue<AgentEvent>, turnId: string): void {
    // The trap: the context gauge resets to zero on cancel. Consumers must suppress this
    // trailing update rather than render it as a bug.
    this.#emitTo(queue, { type: 'usage_updated', used: 0, size: this.#contextSize });
    this.#emitTo(queue, { type: 'turn_ended', turnId, stopReason: 'cancelled' });
  }

  #scenarioFor(prompt: Prompt, turnIndex: number): Scenario {
    const script = this.#script;
    if (typeof script === 'function') return script(prompt, turnIndex);
    if (Array.isArray(script)) {
      const scenarios = script as readonly Scenario[];
      const chosen = scenarios[Math.min(turnIndex, scenarios.length - 1)];
      if (chosen === undefined) throw new Error(`${this.agentId}: empty scenario script`);
      return chosen;
    }
    return script as Scenario;
  }

  #emitTo(queue: AsyncQueue<AgentEvent>, event: InjectableEvent): void {
    queue.push(this.#stamp(event));
  }

  /** Out-of-band: into the open turn if there is one, to `onEvent` listeners otherwise. */
  #emit(event: InjectableEvent): void {
    const stamped = this.#stamp(event);
    const turn = this.#turn;
    if (turn !== undefined && !turn.queue.closed) {
      turn.queue.push(stamped);
      return;
    }
    for (const listener of this.#eventListeners) listener(stamped);
  }

  #stamp(event: InjectableEvent): AgentEvent {
    return {
      ...event,
      agentId: this.agentId,
      sessionId: this.sessionId,
      at: this.#clock.now(),
    } as AgentEvent;
  }

  #setLifecycle(lifecycle: RuntimeLifecycle): void {
    if (this.#lifecycle === lifecycle) return;
    this.#lifecycle = lifecycle;
    for (const listener of this.#lifecycleListeners) listener(lifecycle);
  }

  #nextMessageId(): string {
    this.#messageCounter += 1;
    return `msg_${this.agentId}_${this.#messageCounter}`;
  }

  #nextToolCallId(): string {
    this.#toolCounter += 1;
    return `call_${this.agentId}_${this.#toolCounter}`;
  }
}

function defaultToolOutput(status: 'completed' | 'cancelled_reports_completed'): string {
  return status === 'cancelled_reports_completed' ? CANCELLED_TOOL_OUTPUT : '';
}
