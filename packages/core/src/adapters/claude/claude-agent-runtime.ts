import type { Clock } from '../../clock.js';
import { SystemClock } from '../../clock.js';
import type { AgentEvent } from '../../events.js';
import { assembleMessages } from '../../message-assembler.js';
import { AsyncQueue } from '../../mock/async-queue.js';
import type { InjectableEvent } from '../../mock/mock-agent-runtime.js';
import type {
  AgentRuntime,
  PermissionHandler,
  PermissionOption,
  Prompt,
  RuntimeLifecycle,
  Unsubscribe,
} from '../../runtime.js';
import { JsonRpcConnection, type LineTransport } from './jsonrpc.js';
import {
  BRIDGE_PACKAGE,
  BRIDGE_VERSION,
  spawnClaudeBridge,
  type SpawnBridge,
} from './stdio-bridge.js';
import { stopReasonOf, translateSessionUpdate } from './translate.js';
import type {
  InitializeResult,
  NewSessionResult,
  PermissionRequestParams,
  PromptResult,
  SessionNotification,
} from './wire.js';

const PROTOCOL_VERSION = 1;

/**
 * Forced, not chosen: the bridge discards `permissionMode`, `canUseTool` and
 * `allowDangerouslySkipPermissions`, so `session/set_mode` is the only lever we have. We take
 * `default` — never `auto`, which would hand safety decisions for an unattended teammate to a
 * model classifier we do not control, and never `acceptEdits` or `bypassPermissions`.
 * See ticket 14.
 */
const PERMISSION_MODE = 'default';

/** An MCP server handed to the session. Ticket 15's loopback `message_agent` tool plugs in here. */
export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: readonly { readonly name: string; readonly value: string }[];
}

export interface ClaudeAgentRuntimeOptions {
  readonly agentId: string;
  /** The agent's own worktree. One process, one workspace. */
  readonly cwd: string;
  /** Composed by core (`composePersona`); injected here by the mechanism Claude offers. */
  readonly persona?: string;
  readonly model?: string;
  readonly mcpServers?: readonly McpServerConfig[];
  readonly clock?: Clock;
  /** The user's own `claude`. Defaults to `CLAUDE_CODE_EXECUTABLE`, then `PATH`. */
  readonly claudeExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Injected in tests: a transport that speaks the protocol without spawning anything. */
  readonly spawn?: SpawnBridge;
  readonly onStderr?: (line: string) => void;
}

/**
 * Claude Code behind `AgentRuntime`, over `@agentclientprotocol/claude-agent-acp` on stdio.
 *
 * Everything Claude-shaped stops here: the off-spec `_meta` persona, the forced permission
 * mode, the eleven `sessionUpdate` kinds, the `stopReason` that is an RPC reply rather than an
 * event. Nothing above this class can tell which provider an agent is.
 */
export class ClaudeAgentRuntime implements AgentRuntime {
  readonly agentId: string;

  readonly #options: ClaudeAgentRuntimeOptions;
  readonly #clock: Clock;
  readonly #spawn: SpawnBridge;
  readonly #eventListeners = new Set<(event: AgentEvent) => void>();
  readonly #lifecycleListeners = new Set<(lifecycle: RuntimeLifecycle) => void>();

  #sessionId = '';
  #lifecycle: RuntimeLifecycle = 'created';
  #connection: JsonRpcConnection | undefined;
  #transport: LineTransport | undefined;
  #turn: { queue: AsyncQueue<AgentEvent>; turnId: string } | undefined;
  #permissionHandler: PermissionHandler | undefined;
  #turnIndex = 0;
  #modeId: string | undefined;

  constructor(options: ClaudeAgentRuntimeOptions) {
    this.agentId = options.agentId;
    this.#options = options;
    this.#clock = options.clock ?? new SystemClock();
    this.#spawn = options.spawn ?? spawnClaudeBridge;
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get lifecycle(): RuntimeLifecycle {
    return this.#lifecycle;
  }

  /** The mode the bridge says it is in. `default`, or this adapter has a bug worth seeing. */
  get permissionMode(): string | undefined {
    return this.#modeId;
  }

  async start(): Promise<void> {
    if (this.#lifecycle === 'starting' || this.#lifecycle === 'ready') {
      throw new Error(`${this.agentId}: already started`);
    }
    this.#setLifecycle('starting');
    try {
      await this.#connect();
      this.#setLifecycle('ready');
    } catch (error) {
      this.#setLifecycle('dead');
      await this.#transport?.close().catch(() => undefined);
      throw error;
    }
  }

  async #connect(): Promise<void> {
    const transport = this.#spawn({
      cwd: this.#options.cwd,
      ...(this.#options.claudeExecutable === undefined
        ? {}
        : { claudeExecutable: this.#options.claudeExecutable }),
      ...(this.#options.env === undefined ? {} : { env: this.#options.env }),
      ...(this.#options.onStderr === undefined ? {} : { onStderr: this.#options.onStderr }),
    });
    this.#transport = transport;
    const connection = new JsonRpcConnection(transport);
    this.#connection = connection;

    connection.setNotificationHandler('session/update', (params) =>
      this.#onSessionUpdate(params as SessionNotification),
    );
    connection.setRequestHandler('session/request_permission', (params) =>
      this.#onPermissionRequest(params as PermissionRequestParams),
    );
    connection.onClose((reason) => this.#onConnectionClosed(reason));
    connection.listen();

    const initialized = await connection.request<InitializeResult>('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      // We own no terminals and serve no unsaved buffers: the agent works in a real worktree
      // on disk, so the bridge's own file and shell tools are the right ones to use.
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
    assertBridgeVersion(initialized);
    assertAuthenticated(initialized);

    const session = await connection.request<NewSessionResult>('session/new', {
      cwd: this.#options.cwd,
      mcpServers: (this.#options.mcpServers ?? []).map((server) => ({
        name: server.name,
        command: server.command,
        args: server.args ?? [],
        env: server.env ?? [],
        // `type` is deliberately omitted: 0.70.0 reads an absent type as stdio, and ticket
        // 01's "omitting it drops the server" trap was observed against 0.16.2.
      })),
      _meta: {
        // Off-spec, and it stays in here: `_meta` is an adapter extension OpenCode ignores.
        ...(this.#options.persona === undefined ? {} : { systemPrompt: this.#options.persona }),
        ...(this.#options.model === undefined
          ? {}
          : { claudeCode: { options: { model: this.#options.model } } }),
      },
    });
    if (session.sessionId === undefined) {
      throw new Error(`${this.agentId}: session/new returned no sessionId`);
    }
    this.#sessionId = session.sessionId;
    this.#modeId = session.modes?.currentModeId;
    await this.#applyPermissionMode();
  }

  /**
   * Ticket 14's trap, generalised: re-send this after every `session/load` or resume, because
   * a restored session comes back in whatever mode it was saved in.
   */
  async #applyPermissionMode(): Promise<void> {
    const connection = this.#connection;
    if (connection === undefined) return;
    await connection.request('session/set_mode', {
      sessionId: this.#sessionId,
      modeId: PERMISSION_MODE,
    });
    this.#modeId = PERMISSION_MODE;
  }

  sendPrompt(prompt: Prompt): AsyncIterable<AgentEvent> {
    if (this.#lifecycle !== 'ready') {
      throw new Error(`${this.agentId}: cannot prompt a runtime that is ${this.#lifecycle}`);
    }
    if (this.#turn !== undefined) {
      throw new Error(
        `${this.agentId}: a turn is already in flight — the orchestrator's mailbox exists so this cannot happen`,
      );
    }
    const queue = new AsyncQueue<AgentEvent>();
    this.#turnIndex += 1;
    const turnId = `turn_${this.#turnIndex}`;
    this.#turn = { queue, turnId };
    void this.#runTurn(prompt, queue, turnId).finally(() => {
      this.#turn = undefined;
      queue.close();
    });
    return assembleMessages(queue);
  }

  async #runTurn(prompt: Prompt, queue: AsyncQueue<AgentEvent>, turnId: string): Promise<void> {
    const connection = this.#connection;
    if (connection === undefined) {
      this.#emitTo(queue, { type: 'error', message: 'the bridge is not connected', fatal: true });
      return;
    }
    try {
      const result = await connection.request<PromptResult>('session/prompt', {
        sessionId: this.#sessionId,
        prompt: [{ type: 'text', text: prompt.text }],
      });
      // Turn end is the RPC *reply*, never a notification — and `for await` would discard an
      // iterator's return value, so it becomes an event here or it reaches nobody.
      this.#emitTo(queue, { type: 'turn_ended', turnId, stopReason: stopReasonOf(result.stopReason) });
    } catch (error) {
      // No `turn_ended`: the RPC never replied, and inventing a stop reason would be a lie.
      // An event rather than a rejection, so the partial transcript survives.
      if (queue.closed) return;
      this.#emitTo(queue, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        fatal: true,
      });
    }
  }

  /** A notification, not a request: it is delivered, and the in-flight prompt replies
   *  `cancelled` on its own. The process stays alive and the session stays usable. */
  async cancel(): Promise<void> {
    if (this.#turn === undefined) return;
    this.#connection?.notify('session/cancel', { sessionId: this.#sessionId });
  }

  async stop(): Promise<void> {
    if (this.#lifecycle === 'stopped') return;
    this.#setLifecycle('stopped');
    // Close the session before the pipe. Dropping stdin on a live session works — the bridge
    // exits on EOF — but it tears the SDK query down mid-flight and the bridge logs a cleanup
    // failure, which is a real error message for a routine shutdown.
    if (this.#sessionId !== '') {
      await this.#connection?.request('session/close', { sessionId: this.#sessionId })
        .catch(() => undefined);
    }
    await this.#connection?.close();
    this.#turn?.queue.close();
  }

  onEvent(listener: (event: AgentEvent) => void): Unsubscribe {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  onLifecycleChange(listener: (lifecycle: RuntimeLifecycle) => void): Unsubscribe {
    this.#lifecycleListeners.add(listener);
    return () => this.#lifecycleListeners.delete(listener);
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this.#permissionHandler = handler;
  }

  #onSessionUpdate(notification: SessionNotification): void {
    if (notification.sessionId !== this.#sessionId) return;
    const update = notification.update;
    if (update === undefined) return;
    if (update.sessionUpdate === 'current_mode_update') {
      // Dropped from the stream — Claude-only state — but worth knowing, because a mode that
      // drifts off `default` is the posture quietly failing.
      this.#modeId = update.currentModeId ?? this.#modeId;
      return;
    }
    for (const event of translateSessionUpdate(update)) this.#emit(event);
  }

  async #onPermissionRequest(params: PermissionRequestParams): Promise<unknown> {
    const handler = this.#permissionHandler;
    const options: PermissionOption[] = (params.options ?? []).flatMap((option) =>
      option.optionId === undefined
        ? []
        : [
            {
              optionId: option.optionId,
              kind: permissionKind(option.kind),
              name: option.name ?? option.optionId,
            },
          ],
    );
    // Nobody can answer, so nothing is approved. Blocking the turn forever on an unattended
    // agent is the worse failure.
    if (handler === undefined) return { outcome: { outcome: 'cancelled' } };

    const chosen = await handler({
      agentId: this.agentId,
      sessionId: this.#sessionId,
      toolCallId: params.toolCall?.toolCallId ?? '',
      title: params.toolCall?.title ?? 'a tool call',
      options,
    });
    return chosen === null
      ? { outcome: { outcome: 'cancelled' } }
      : { outcome: { outcome: 'selected', optionId: chosen } };
  }

  #onConnectionClosed(reason: string | undefined): void {
    if (this.#lifecycle === 'stopped' || this.#lifecycle === 'dead') return;
    this.#setLifecycle('dead');
    this.#emit({
      type: 'error',
      message: reason ?? 'the bridge process exited',
      code: 'process_died',
      fatal: true,
    });
    this.#turn?.queue.close();
  }

  /** Into the open turn if there is one, to `onEvent` otherwise — process death between
   *  turns belongs to no iterator. */
  #emit(event: InjectableEvent): void {
    const stamped = this.#stamp(event);
    const turn = this.#turn;
    if (turn !== undefined && !turn.queue.closed) {
      turn.queue.push(stamped);
      return;
    }
    for (const listener of this.#eventListeners) listener(stamped);
  }

  #emitTo(queue: AsyncQueue<AgentEvent>, event: InjectableEvent): void {
    queue.push(this.#stamp(event));
  }

  #stamp(event: InjectableEvent): AgentEvent {
    return {
      ...event,
      agentId: this.agentId,
      sessionId: this.#sessionId,
      at: this.#clock.now(),
    } as AgentEvent;
  }

  #setLifecycle(lifecycle: RuntimeLifecycle): void {
    if (this.#lifecycle === lifecycle) return;
    this.#lifecycle = lifecycle;
    for (const listener of this.#lifecycleListeners) listener(lifecycle);
  }
}

function permissionKind(kind: string | undefined): PermissionOption['kind'] {
  switch (kind) {
    case 'allow_once':
    case 'allow_always':
    case 'reject_once':
    case 'reject_always':
      return kind;
    default:
      return 'reject_once';
  }
}

/**
 * The version check ticket 07 asked for: loud, and never a fall-through to a degraded path.
 * The package renamed once and ships roughly a release a week; 0.70.0 already deleted the
 * `terminal/*` surface 0.16.2 had.
 */
function assertBridgeVersion(initialized: InitializeResult): void {
  if (initialized.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `${BRIDGE_PACKAGE} negotiated ACP protocol version ${String(initialized.protocolVersion)}, ` +
        `but this adapter is written against ${PROTOCOL_VERSION}.`,
    );
  }
  const version = initialized.agentInfo?.version;
  if (version !== BRIDGE_VERSION) {
    throw new Error(
      `${BRIDGE_PACKAGE} reports version ${version ?? 'unknown'}, but blobot pins ${BRIDGE_VERSION}. ` +
        'Re-verify the adapter against the new version before bumping the pin.',
    );
  }
}

/**
 * `authMethods: []` means the user's own `claude` login already covers us — the whole
 * credential story, and a protocol-level probe that costs nothing. When it is non-empty we
 * surface the command the user runs in their own terminal. We never hold a token.
 */
function assertAuthenticated(initialized: InitializeResult): void {
  const methods = initialized.authMethods ?? [];
  if (methods.length === 0) return;
  const command = methods
    .map((method) => method._meta?.terminal?.command)
    .find((value): value is string => typeof value === 'string');
  throw new Error(
    'Claude Code is not logged in on this machine. ' +
      `Run ${command ?? 'claude auth login'} in a terminal, then start the team again.`,
  );
}
