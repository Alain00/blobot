import type { Clock } from '../../clock.js';
import { SystemClock } from '../../clock.js';
import { sameCommands } from '../../commands.js';
import type { AgentEvent } from '../../events.js';
import { assembleMessages } from '../../message-assembler.js';
import { AsyncQueue } from '../../mock/async-queue.js';
import type { InjectableEvent } from '../../mock/mock-agent-runtime.js';
import type {
  AgentRuntime,
  AttachmentSupport,
  AvailableCommand,
  PermissionHandler,
  PermissionOption,
  Prompt,
  RuntimeLifecycle,
  RuntimeOptionChoices,
  RuntimeOptionGroup,
  Unsubscribe,
} from '../../runtime.js';
import { DEFAULT_TRUST, type TrustLevel } from '../../trust.js';
import { ACCEPTS_NOTHING, acceptsOf, contentBlockOf } from '../acp/attachments.js';
import { applyOptionChoices, optionGroupsFrom } from '../acp/config-options.js';
import { JsonRpcConnection, type LineTransport } from '../acp/jsonrpc.js';
import { commandsFrom, stopReasonOf, translateSessionUpdate } from '../acp/session-updates.js';
import { withTarget } from '../acp/target.js';
import type {
  InitializeResult,
  NewSessionResult,
  PermissionRequestParams,
  PromptResult,
  SessionNotification,
} from '../acp/wire.js';
import {
  defaultCursorConfigDir,
  writeCursorConfig,
  type McpServerConfig,
} from './config.js';
import {
  ASK_QUESTION_METHOD,
  CREATE_PLAN_METHOD,
  askQuestionRefusal,
  createPlanRefusal,
} from './extensions.js';
import { offerableNames } from './palette.js';
import { CURSOR_SESSION_MODE } from './permissions.js';
import { spawnCursor, VERIFIED_CURSOR_VERSION, type SpawnCursor } from './stdio.js';

const PROTOCOL_VERSION = 1;

/**
 * Which advertised option groups blobot hands to the user.
 *
 * Cursor advertises `mode` as `agent` / `plan` / `ask`. `plan` and `ask` are read-only, so a
 * user picking either would hire a teammate that cannot do the work. The adapter pins `agent`
 * itself. `model` stays.
 */
const SURFACED_OPTIONS = ['model'];

export type { McpHttpServer, McpServerConfig, McpStdioServer } from './config.js';

export interface CursorAgentRuntimeOptions {
  readonly agentId: string;
  readonly cwd: string;
  /** Composed by core; written as a always-apply rule in `CURSOR_CONFIG_DIR`. */
  readonly persona?: string;
  readonly agentName?: string;
  readonly resumeSessionId?: string;
  readonly options?: RuntimeOptionChoices;
  readonly mcpServers?: readonly McpServerConfig[];
  readonly trust?: TrustLevel;
  readonly clock?: Clock;
  readonly cursorExecutable?: string;
  /** Tests inject a directory; production uses `~/.local/share/blobot/cursor-config/<id>`. */
  readonly configDir?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly spawn?: SpawnCursor;
  readonly onStderr?: (line: string) => void;
}

/**
 * Cursor behind `AgentRuntime`, over `agent acp` on stdio.
 *
 * First-party ACP: no npm bridge to pin, no wire format to reverse. Everything Cursor-shaped
 * stops here — the config directory that carries the mailbox token, the allowlist posture,
 * the two extension methods that would otherwise hang a turn. Nothing above this class can
 * tell which provider an agent is.
 */
export class CursorAgentRuntime implements AgentRuntime {
  readonly agentId: string;

  readonly #options: CursorAgentRuntimeOptions;
  readonly #clock: Clock;
  readonly #spawn: SpawnCursor;
  readonly #configDir: string;
  readonly #eventListeners = new Set<(event: AgentEvent) => void>();
  readonly #lifecycleListeners = new Set<(lifecycle: RuntimeLifecycle) => void>();
  readonly #commandListeners = new Set<(commands: readonly AvailableCommand[]) => void>();

  #sessionId = '';
  #lifecycle: RuntimeLifecycle = 'created';
  #connection: JsonRpcConnection | undefined;
  #transport: LineTransport | undefined;
  #turn: { queue: AsyncQueue<AgentEvent>; turnId: string } | undefined;
  #permissionHandler: PermissionHandler | undefined;
  #turnIndex = 0;
  #modeId: string | undefined;
  #replaying = false;
  #resumed = false;
  #commands: readonly AvailableCommand[] = [];
  #optionGroups: readonly RuntimeOptionGroup[] = [];
  #accepts: AttachmentSupport = ACCEPTS_NOTHING;
  #projectNames: ReadonlySet<string> | undefined;

  constructor(options: CursorAgentRuntimeOptions) {
    this.agentId = options.agentId;
    this.#options = options;
    this.#clock = options.clock ?? new SystemClock();
    this.#spawn = options.spawn ?? spawnCursor;
    this.#configDir = options.configDir ?? defaultCursorConfigDir(options.agentId);
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get lifecycle(): RuntimeLifecycle {
    return this.#lifecycle;
  }

  get modeId(): string | undefined {
    return this.#modeId;
  }

  get resumed(): boolean {
    return this.#resumed;
  }

  get configDir(): string {
    return this.#configDir;
  }

  get trust(): TrustLevel {
    return this.#options.trust ?? DEFAULT_TRUST;
  }

  /**
   * The persona lives in the child's `CURSOR_CONFIG_DIR` as a rule, not on the session, so a
   * restart cannot change who the agent is.
   */
  get personaIsSessionBound(): boolean {
    return false;
  }

  async start(): Promise<void> {
    if (this.#lifecycle === 'starting' || this.#lifecycle === 'ready') {
      throw new Error(`${this.agentId}: already started`);
    }
    this.#setLifecycle('starting');
    try {
      writeCursorConfig({
        dir: this.#configDir,
        persona: this.#options.persona ?? '',
        trust: this.trust,
        mcpServers: this.#options.mcpServers ?? [],
      });
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
      configDir: this.#configDir,
      ...(this.#options.cursorExecutable === undefined
        ? {}
        : { cursorExecutable: this.#options.cursorExecutable }),
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
    connection.setRequestHandler(ASK_QUESTION_METHOD, () => Promise.resolve(askQuestionRefusal()));
    connection.setRequestHandler(CREATE_PLAN_METHOD, () => Promise.resolve(createPlanRefusal()));
    connection.onClose((reason) => this.#onConnectionClosed(reason));
    connection.listen();

    const initialized = await connection.request<InitializeResult>('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'blobot', version: '0.0.0' },
    });
    this.#checkVersions(initialized);
    await this.#authenticate(connection);

    this.#accepts = acceptsOf(initialized.agentCapabilities);
    const wanted = this.#options.resumeSessionId;
    const canLoad = initialized.agentCapabilities?.loadSession === true;
    const session =
      wanted === undefined || wanted === '' || !canLoad
        ? await this.#newSession(connection)
        : await this.#loadSession(connection, wanted);
    if (session.sessionId === undefined) {
      throw new Error(`${this.agentId}: cursor returned no sessionId`);
    }
    this.#sessionId = session.sessionId;
    await this.#pinAgentMode();
    this.#optionGroups = optionGroupsFrom(session.configOptions, SURFACED_OPTIONS);
    this.#optionGroups = await applyOptionChoices(
      connection,
      this.#sessionId,
      this.#options.options ?? {},
      this.#optionGroups,
      (line) => this.#options.onStderr?.(line),
    );
  }

  /**
   * Handshake, not a login.
   *
   * Cursor's docs put `authenticate` with `cursor_login` between `initialize` and
   * `session/new`. The actual login is `agent login` on a PTY that blobot does not read.
   * If this call fails, the launch names that command rather than opening a browser from
   * here, and it never sets `CURSOR_API_KEY`.
   */
  async #authenticate(connection: JsonRpcConnection): Promise<void> {
    try {
      await connection.request('authenticate', { methodId: 'cursor_login' });
    } catch (error) {
      throw new Error(
        `${this.agentId}: Cursor is not signed in (${error instanceof Error ? error.message : String(error)}). Sign in with cursor-agent login.`,
      );
    }
  }

  #newSession(connection: JsonRpcConnection): Promise<NewSessionResult> {
    return connection.request<NewSessionResult>('session/new', this.#sessionParams());
  }

  async #loadSession(connection: JsonRpcConnection, sessionId: string): Promise<NewSessionResult> {
    this.#replaying = true;
    try {
      const loaded = await connection.request<NewSessionResult>('session/load', {
        sessionId,
        ...this.#sessionParams(),
      });
      this.#resumed = true;
      return { sessionId, ...loaded };
    } catch (error) {
      this.#options.onStderr?.(
        `blobot: could not resume ${sessionId} (${error instanceof Error ? error.message : String(error)}); starting a new session`,
      );
      return this.#newSession(connection);
    } finally {
      this.#replaying = false;
    }
  }

  /**
   * `mcpServers` is still sent. Cursor documents that ACP ignores it and reads `.cursor/mcp.json`
   * instead; a client that omits the field has given up the one cheap measurement (ticket 02).
   * The file in `CURSOR_CONFIG_DIR` is the real door.
   */
  #sessionParams(): Record<string, unknown> {
    return {
      cwd: this.#options.cwd,
      mcpServers: (this.#options.mcpServers ?? []).map(toAcpMcpServer),
    };
  }

  async #pinAgentMode(): Promise<void> {
    const connection = this.#connection;
    if (connection === undefined) return;
    if (this.#modeId === CURSOR_SESSION_MODE) return;
    try {
      await connection.request('session/set_mode', {
        sessionId: this.#sessionId,
        modeId: CURSOR_SESSION_MODE,
      });
      this.#modeId = CURSOR_SESSION_MODE;
    } catch (error) {
      this.#options.onStderr?.(
        `blobot: ${this.agentId} could not be set to agent mode ` +
          `(${error instanceof Error ? error.message : String(error)}); plan/ask are read-only`,
      );
    }
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
      this.#emitTo(queue, { type: 'error', message: 'cursor is not connected', fatal: true });
      return;
    }
    try {
      const result = await connection.request<PromptResult>('session/prompt', {
        sessionId: this.#sessionId,
        prompt: [
          ...(prompt.attachments ?? []).map(contentBlockOf),
          { type: 'text', text: prompt.text },
        ],
      });
      this.#emitTo(queue, {
        type: 'turn_ended',
        turnId,
        stopReason: stopReasonOf(result.stopReason),
      });
    } catch (error) {
      if (queue.closed) return;
      this.#emitTo(queue, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        fatal: true,
      });
    }
  }

  async cancel(): Promise<void> {
    if (this.#turn === undefined) return;
    this.#connection?.notify('session/cancel', { sessionId: this.#sessionId });
  }

  async restart(): Promise<void> {
    const connection = this.#connection;
    if (connection === undefined || this.#lifecycle !== 'ready') {
      throw new Error(`${this.agentId}: cannot restart a runtime that is ${this.#lifecycle}`);
    }
    if (this.#turn !== undefined) {
      throw new Error(`${this.agentId}: cannot restart mid-turn`);
    }
    const previous = this.#sessionId;
    this.#sessionId = '';
    if (previous !== '') {
      await connection.request('session/close', { sessionId: previous }).catch(() => undefined);
    }
    try {
      const session = await this.#newSession(connection);
      if (session.sessionId === undefined) {
        throw new Error(`${this.agentId}: cursor returned no sessionId`);
      }
      this.#sessionId = session.sessionId;
      this.#resumed = false;
      this.#modeId = undefined;
      await this.#pinAgentMode();
      this.#optionGroups = await applyOptionChoices(
        connection,
        this.#sessionId,
        this.#options.options ?? {},
        optionGroupsFrom(session.configOptions, SURFACED_OPTIONS),
        (line) => this.#options.onStderr?.(line),
      );
    } catch (error) {
      this.#setLifecycle('dead');
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.#lifecycle === 'stopped') return;
    this.#setLifecycle('stopped');
    if (this.#sessionId !== '') {
      await this.#connection
        ?.request('session/close', { sessionId: this.#sessionId })
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

  get availableCommands(): readonly AvailableCommand[] {
    return this.#commands;
  }

  get optionGroups(): readonly RuntimeOptionGroup[] {
    return this.#optionGroups;
  }

  get accepts(): AttachmentSupport {
    return this.#accepts;
  }

  onCommandsChange(listener: (commands: readonly AvailableCommand[]) => void): Unsubscribe {
    this.#commandListeners.add(listener);
    return () => this.#commandListeners.delete(listener);
  }

  #setCommands(advertised: readonly AvailableCommand[]): void {
    const allowed = this.#projectCommands();
    const commands = advertised.filter((command) => allowed.has(command.name));
    if (sameCommands(this.#commands, commands)) return;
    this.#commands = commands;
    for (const listener of this.#commandListeners) listener(commands);
  }

  #projectCommands(): ReadonlySet<string> {
    this.#projectNames ??= offerableNames(this.#options.cwd);
    return this.#projectNames;
  }

  #onSessionUpdate(notification: SessionNotification): void {
    const update = notification.update;
    if (update === undefined) return;
    const commands = commandsFrom(update);
    if (commands !== undefined) {
      this.#setCommands(commands);
      return;
    }
    if (this.#replaying) return;
    if (notification.sessionId !== this.#sessionId) return;
    for (const event of translateSessionUpdate(update))
      this.#emit(withTarget(event, update, this.#options.cwd));
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
      message: reason ?? 'the cursor process exited',
      code: 'process_died',
      fatal: true,
    });
    this.#turn?.queue.close();
  }

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

  #checkVersions(initialized: InitializeResult): void {
    if (initialized.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `cursor negotiated ACP protocol version ${String(initialized.protocolVersion)}, ` +
          `but this adapter is written against ${PROTOCOL_VERSION}.`,
      );
    }
    const version = initialized.agentInfo?.version;
    if (version !== undefined && version !== VERIFIED_CURSOR_VERSION) {
      this.#options.onStderr?.(
        `blobot: cursor-agent ${version} is running; this adapter has not been verified live.`,
      );
    }
  }
}

function toAcpMcpServer(server: McpServerConfig): unknown {
  if (server.type === 'http') {
    return {
      type: 'http',
      name: server.name,
      url: server.url,
      headers: server.headers ?? [],
    };
  }
  return {
    name: server.name,
    command: server.command,
    args: server.args ?? [],
    env: server.env ?? [],
  };
}

function permissionKind(kind: string | undefined): PermissionOption['kind'] {
  const normalised = (kind ?? '').replace(/-/g, '_');
  switch (normalised) {
    case 'allow_once':
    case 'allow_always':
    case 'reject_once':
    case 'reject_always':
      return normalised;
    default:
      return 'reject_once';
  }
}
