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
  PictureStore,
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
import { PictureWatch } from '../acp/pictures.js';
import { commandsFrom, stopReasonOf, translateSessionUpdate } from '../acp/session-updates.js';
import { withTarget } from '../acp/target.js';
import type {
  ConfigOption,
  InitializeResult,
  PermissionRequestParams,
  PromptResult,
  SessionNotification,
} from '../acp/wire.js';
import { defaultCursorConfigDir, writeCursorConfig } from './config.js';
import {
  ASK_QUESTION_METHOD,
  CREATE_PLAN_METHOD,
  askQuestionRefusal,
  createPlanRefusal,
} from './extensions.js';
import { offerableNames } from './palette.js';
import { LocalMachine } from '../../machines/local-machine.js';
import { CURSOR_MACHINE_IMAGE } from './image.js';
import type { Machine } from '../../machines/machine.js';
import { MACHINE_CLIENT_CAPABILITIES } from '../acp/client-capabilities.js';
import { CURSOR_SESSION_MODE, cursorCliConfig } from './permissions.js';
import { cursorPersonaBlocks } from './persona.js';
import { spawnCursor, VERIFIED_CURSOR_VERSION, type SpawnCursor } from './stdio.js';

const PROTOCOL_VERSION = 1;

/**
 * Which advertised option groups blobot hands to the user.
 *
 * Cursor advertises `mode` and `model` as `configOptions` on `session/new` (measured — the
 * same block also arrives as `modes` and `models`, saying the same thing twice). `mode` is
 * excluded for the reason every adapter excludes it: `agent` is the posture and `plan` / `ask`
 * are read-only, so a user who could pick either from a dropdown would hire a teammate that
 * cannot do the work. `model` stays: thirty-five entries on a real session, fronting whatever
 * the account has, which is ADR-0002's decision and the user's.
 */
const SURFACED_OPTIONS = ['model'];

/** Structurally the other adapters' shape, and declared here for the reason they give:
 *  the day one runtime needs a field another cannot express, neither should have to move. */
export type McpServerConfig = McpStdioServer | McpHttpServer;

export interface McpStdioServer {
  readonly type?: 'stdio';
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: readonly { readonly name: string; readonly value: string }[];
}

export interface McpHttpServer {
  readonly type: 'http';
  readonly name: string;
  readonly url: string;
  readonly headers?: readonly { readonly name: string; readonly value: string }[];
}

export interface CursorAgentRuntimeOptions {
  readonly agentId: string;
  /** The agent's own AgentWorkspace: the process's cwd and its `--workspace` at once. */
  readonly cwd: string;
  /**
   * Composed by core (`composePersona`), and on this runtime **delivered on every prompt**:
   * ticket 01 measured the config-dir rules channel dead and ticket 08 chose fx's shape.
   * `persona.ts` has the table of candidates and how each died.
   */
  readonly persona?: string;
  readonly resumeSessionId?: string;
  readonly options?: RuntimeOptionChoices;
  readonly mcpServers?: readonly McpServerConfig[];
  readonly trust?: TrustLevel;
  readonly clock?: Clock;
  /** The user's own `cursor-agent`, from detection. */
  readonly cursorExecutable?: string;
  /** Tests inject a directory; production uses `~/.local/share/blobot/cursor-config/<id>`. */
  readonly configDir?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly machine?: Machine;
  /** Injected in tests: a transport that speaks the protocol without spawning anything. */
  readonly spawn?: SpawnCursor;
  readonly onStderr?: (line: string) => void;
  /**
   * Where a Picture's bytes go. Absent is a runtime with nowhere to put one, which is reported
   * as such rather than dropped: `.scratch/agent-media/10`.
   */
  readonly pictures?: PictureStore;
}

/**
 * Cursor behind `AgentRuntime`, over `cursor-agent acp` on stdio.
 *
 * The fifth adapter, and first-party ACP like OpenCode's and fx's: no bridge to pin, no wire
 * format to reverse. Everything Cursor-shaped stops here — the per-agent config directory that
 * carries the posture, the two extension methods that would otherwise hang a turn, the persona
 * with no channel of its own. Nothing above this class can tell which provider an agent is.
 *
 * Two measured behaviours of this runtime are deliberately *not* corrected here, because the
 * honest translation is to pass them through:
 *
 * - **A denied command's `tool_call` reports `status: completed`** — the refusal exists only
 *   in the message text. blobot's own posture writes an empty deny list precisely so this
 *   cannot happen to a blobot agent (`permissions.ts`), but a rule the *user* holds in their
 *   own `~/.cursor` can still produce it, and inventing a `failed` the wire never said would
 *   be blobot editing the record.
 * - **The user's own MCP servers, skills and account User Rules load into the session.**
 *   Ticket 07, decided: the operator added them, ADR-0003's settings scope says they work, and
 *   blobot narrows nothing there. Per-agent restriction is a future cross-runtime effort.
 */
export class CursorAgentRuntime implements AgentRuntime {
  readonly machineImage = CURSOR_MACHINE_IMAGE;
  readonly agentId: string;

  readonly #options: CursorAgentRuntimeOptions;
  readonly #clock: Clock;
  readonly #spawn: SpawnCursor;
  readonly #configDir: string;
  readonly #eventListeners = new Set<(event: AgentEvent) => void>();
  readonly #lifecycleListeners = new Set<(lifecycle: RuntimeLifecycle) => void>();
  readonly #commandListeners = new Set<(commands: readonly AvailableCommand[]) => void>();
  readonly #pictures: PictureWatch;

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
  #offerable: ReadonlySet<string> | undefined;

  constructor(options: CursorAgentRuntimeOptions) {
    this.agentId = options.agentId;
    this.#options = {
      ...options,
      machine: options.machine ?? new LocalMachine({ agentId: options.agentId, workspacePath: options.cwd }),
    };
    this.#pictures = new PictureWatch(options.pictures);
    this.#clock = options.clock ?? new SystemClock();
    this.#spawn = options.spawn ?? spawnCursor;
    this.#configDir = options.machine?.kind === 'box' ? '/home/agent/.config/blobot/cursor'
      : options.configDir ?? defaultCursorConfigDir(options.agentId);
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get lifecycle(): RuntimeLifecycle {
    return this.#lifecycle;
  }

  /** The ACP session mode. `agent` is the only one a blobot teammate runs in. */
  get modeId(): string | undefined {
    return this.#modeId;
  }

  /** Whether the agent came back with its memory. */
  get resumed(): boolean {
    return this.#resumed;
  }

  /** The per-agent `CURSOR_CONFIG_DIR`: the posture and the session store, and nothing else. */
  get configDir(): string {
    return this.#configDir;
  }

  get trust(): TrustLevel {
    return this.#options.trust ?? DEFAULT_TRUST;
  }

  /**
   * False, for fx's reason word for word: the persona is not stored anywhere — it rides every
   * prompt — so every session this process opens runs under the definition the process is
   * holding, and a restart changes nothing about who the agent is.
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
      // The posture goes to disk before the child exists, so there is no window in which the
      // process runs under somebody else's permissions. The file is in blobot's own data
      // directory and nothing is ever written into the AgentWorkspace, which is a checkout.
      if (this.#options.machine?.kind !== 'box') writeCursorConfig({
        dir: this.#configDir,
        trust: this.trust,
        machineKind: this.#options.machine?.kind ?? 'local',
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
      ...(this.#options.machine === undefined ? {} : { machine: this.#options.machine }),
      cwd: this.#options.cwd,
      configDir: this.#configDir,
      config: { ...cursorCliConfig(this.trust, this.#options.machine?.kind ?? 'local') },
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
    // The two blocking extension methods, answered so a turn cannot hang on them. Any other
    // `cursor/*` request falls through to the connection's method-not-found error, which is
    // ticket 04's answer for a method that does not exist yet; the three notification methods
    // arrive as notifications and are ignored by construction.
    connection.setRequestHandler(ASK_QUESTION_METHOD, () => Promise.resolve(askQuestionRefusal()));
    connection.setRequestHandler(CREATE_PLAN_METHOD, () => Promise.resolve(createPlanRefusal()));
    connection.onClose((reason) => this.#onConnectionClosed(reason));
    connection.listen();

    const initialized = await connection.request<InitializeResult>('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      // We own no terminals and serve no unsaved buffers, so Cursor's own tools are the right
      // ones — and a client that offers to write files is a way around the posture.
      clientCapabilities: MACHINE_CLIENT_CAPABILITIES,
    });
    this.#reportVersion(initialized);
    this.#accepts = acceptsOf(initialized.agentCapabilities);

    const wanted = this.#options.resumeSessionId;
    const canLoad = initialized.agentCapabilities?.loadSession === true;
    const session =
      wanted === undefined || wanted === '' || !canLoad
        ? await this.#newSession(connection)
        : await this.#loadSession(connection, wanted);
    // No fallback to `wanted` here: `#loadSession` already stamps the id it resumed, so a
    // missing `sessionId` can only mean `session/new` answered without one — and adopting the
    // old id instead of failing would aim every later request at a session that was never
    // opened.
    const sessionId = session.sessionId ?? '';
    if (sessionId === '') throw new Error(`${this.agentId}: cursor-agent returned no sessionId`);
    this.#sessionId = sessionId;

    await this.#assertMode(session);
    this.#optionGroups = await applyOptionChoices(
      connection,
      this.#sessionId,
      this.#options.options ?? {},
      optionGroupsFrom(session.configOptions, SURFACED_OPTIONS),
      (line) => this.#options.onStderr?.(line),
    );
  }

  /**
   * `session/new`, with the failure named rather than surfaced raw.
   *
   * Ticket 05: the in-protocol `authenticate` (`cursor_login`) is **never used** — the login
   * is `cursor-agent login` on a PTY blobot does not read, run before this process exists, and
   * detection's remedies are where it is offered. So a machine where the session will not open
   * gets a sentence carrying the vendor's own remedy, the way a `not_installed` runtime is
   * refused by name rather than as `spawn ENOENT`.
   */
  async #newSession(connection: JsonRpcConnection): Promise<CursorSessionResult> {
    try {
      return await connection.request<CursorSessionResult>('session/new', this.#sessionParams());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${this.agentId}: cursor-agent would not open a session (${message}). ` +
          `If Cursor is signed out, sign in with cursor-agent login.`,
      );
    }
  }

  /**
   * Resume, with the trap all five adapters share: `mcpServers` must be re-supplied or
   * `message_agent` is gone while the replayed transcript still shows the agent using it a
   * moment ago. The replay arrives as `session/update` notifications and the store already has
   * all of it, so the stream is muted. A session the provider has forgotten is not a failed
   * launch: it falls back to a new one. Sessions live in `acp-sessions/` under the config dir,
   * so pool eviction survives per agent.
   */
  async #loadSession(
    connection: JsonRpcConnection,
    sessionId: string,
  ): Promise<CursorSessionResult> {
    this.#replaying = true;
    try {
      const loaded = await connection.request<CursorSessionResult>('session/load', {
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
   * The loopback rides here, on the standard door.
   *
   * Cursor's docs say ACP takes MCP servers only from `.cursor/mcp.json`; ticket 01 measured
   * `session/new` accepting this field, handshaking the server with its per-server
   * `Authorization` header, and offering its tool **with no approval step**. Because that
   * contradicts the published docs, the live canary in `live.test.ts` asserts the door stays
   * open — a release that "fixes" it must fail by name, not ship a team member that silently
   * cannot address a teammate (ticket 02).
   */
  #sessionParams(): Record<string, unknown> {
    return {
      cwd: this.#options.cwd,
      mcpServers: (this.#options.mcpServers ?? []).map(toAcpMcpServer),
    };
  }

  /**
   * The mode, pinned to `agent` and re-asserted on every session rather than trusted once.
   *
   * `session/new` measured `agent` as the default, so on the ordinary path this confirms and
   * sends nothing. The assertion exists for the resume: OpenCode and fx both restore something
   * other than the configured default after `session/load`, and whether Cursor does was not
   * among ticket 01's three turns — so ticket 03 orders it re-asserted rather than assumed. A
   * load that reports no mode at all is asserted too, because unconfirmed is not confirmed.
   *
   * Not fatal when it will not take: the measured default is `agent`, the other two modes are
   * read-only — the safe direction — and a teammate that cannot edit says so on its first
   * turn. Reported on stderr rather than silently accepted.
   */
  async #assertMode(session: CursorSessionResult): Promise<void> {
    const reported =
      session.modes?.currentModeId ??
      session.configOptions?.find((option) => option.id === 'mode')?.currentValue;
    this.#modeId = reported;
    if (reported === CURSOR_SESSION_MODE) return;
    try {
      await this.#connection?.request('session/set_mode', {
        sessionId: this.#sessionId,
        modeId: CURSOR_SESSION_MODE,
      });
      this.#modeId = CURSOR_SESSION_MODE;
    } catch (error) {
      this.#options.onStderr?.(
        `blobot: cursor-agent reported mode ${reported ?? 'unknown'} and would not be set to ` +
          `${CURSOR_SESSION_MODE} (${error instanceof Error ? error.message : String(error)}); ` +
          `plan and ask are read-only`,
      );
    }
  }

  sendPrompt(prompt: Prompt, onAdmitted?: () => void): AsyncIterable<AgentEvent> {
    if (this.#lifecycle !== 'ready') {
      throw new Error(`${this.agentId}: cannot prompt a runtime that is ${this.#lifecycle}`);
    }
    if (this.#turn !== undefined) {
      throw new Error(
        `${this.agentId}: a turn is already in flight — the orchestrator's mailbox exists so this cannot happen`,
      );
    }
    onAdmitted?.();
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
      this.#emitTo(queue, { type: 'error', message: 'cursor-agent is not connected', fatal: true });
      return;
    }
    try {
      const result = await connection.request<PromptResult>('session/prompt', {
        sessionId: this.#sessionId,
        prompt: [
          // The persona leads, on every turn, because Cursor has nowhere else to keep it. It
          // is not recorded in `messages`: core composed the text below it and nothing above.
          ...cursorPersonaBlocks(this.#options.persona),
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

  /**
   * Close this session and open a fresh one, without respawning the process.
   *
   * No `session/close` is sent: Cursor's `sessionCapabilities` advertises `list` and nothing
   * else, so the old session is simply left behind in the store the config dir owns. Simple
   * for fx's reason: the persona rides the prompt, so the fresh session comes up under exactly
   * the instructions the old one was running under.
   */
  async restart(): Promise<void> {
    const connection = this.#connection;
    if (connection === undefined || this.#lifecycle !== 'ready') {
      throw new Error(`${this.agentId}: cannot restart a runtime that is ${this.#lifecycle}`);
    }
    if (this.#turn !== undefined) {
      throw new Error(`${this.agentId}: cannot restart mid-turn`);
    }
    this.#sessionId = '';
    try {
      const session = await this.#newSession(connection);
      if (session.sessionId === undefined || session.sessionId === '') {
        throw new Error(`${this.agentId}: cursor-agent returned no sessionId`);
      }
      this.#sessionId = session.sessionId;
      this.#resumed = false;
      await this.#assertMode(session);
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
    // A stopped lifecycle can precede OS process exit; repeated stop must still join cleanup.
    this.#setLifecycle('stopped');
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

  /** Replace, never merge, and stay quiet when nothing moved. */
  #setCommands(advertised: readonly AvailableCommand[]): void {
    const allowed = this.#offerableNames();
    const commands = advertised.filter((command) => allowed.has(command.name));
    if (sameCommands(this.#commands, commands)) return;
    this.#commands = commands;
    for (const listener of this.#commandListeners) listener(commands);
  }

  #offerableNames(): ReadonlySet<string> {
    this.#offerable ??= offerableNames(this.#options.cwd, this.#options.machine?.kind === 'box' ? this.#options.machine.location() : undefined);
    return this.#offerable;
  }

  #onSessionUpdate(notification: SessionNotification): void {
    const update = notification.update;
    if (update === undefined) return;

    // Commands are current state rather than transcript, so they pass both guards below — and
    // during a resume `#sessionId` is not assigned until `session/load` returns.
    const commands = commandsFrom(update);
    if (commands !== undefined) {
      this.#setCommands(commands);
      return;
    }

    if (this.#replaying) return;
    if (notification.sessionId !== this.#sessionId) return;
    // No MCP-verb correction is needed here: Cursor types MCP tool calls `kind: "other"`
    // itself, measured on a real loopback call — the same answer fx gave and Codex did not.
    for (const picture of this.#pictures.from(update, this.agentId, this.#clock.now()))
      this.#emit(picture);
    for (const event of translateSessionUpdate(update))
      this.#emit(withTarget(event, update, this.#options.cwd));
  }

  /**
   * A permission request, put to whoever is listening.
   *
   * No carve-out for blobot's own mailbox here, and that is ticket 03's decision rather than
   * an omission: `Mcp(blobot:*)` sits in `permissions.allow` at every trust level, so a peer
   * message never raises a request at all — solved in config, where the Codex adapter had to
   * solve it in code. Option ids arrive hyphenated (`allow-once`, measured) and are echoed
   * back verbatim; the `kind` field arrives in ACP's own underscored vocabulary.
   */
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
    // Nobody can answer, so nothing is approved.
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
      message: reason ?? 'the cursor-agent process exited',
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

  /**
   * A version that is not the one this adapter was measured against is **reported, not
   * refused** — `cursor-agent` is the user's own binary and it auto-updates by default, so
   * refusing a mismatch would refuse most mornings. The protocol version *is* refused, because
   * that is a wire contract rather than a release. And the measured `initialize` result
   * carries no `agentInfo` at all, so on the real wire this usually says nothing — which is
   * why detection reads the version from `cursor-agent --version` instead.
   */
  #reportVersion(initialized: InitializeResult): void {
    if (
      initialized.protocolVersion !== undefined &&
      initialized.protocolVersion !== PROTOCOL_VERSION
    ) {
      throw new Error(
        `${this.agentId}: cursor-agent negotiated ACP protocol version ` +
          `${String(initialized.protocolVersion)}, but this adapter is written against ${PROTOCOL_VERSION}.`,
      );
    }
    const version = initialized.agentInfo?.version;
    if (version !== undefined && version !== VERIFIED_CURSOR_VERSION) {
      this.#options.onStderr?.(
        `blobot: cursor-agent reports version ${version}; this adapter was verified against ${VERIFIED_CURSOR_VERSION}.`,
      );
    }
  }
}

/** `session/new` and `session/load` answer with the same block, minus the id on a load. The
 *  mode arrives in both `modes` and `configOptions`, so `#assertMode` reads whichever it gets. */
interface CursorSessionResult {
  readonly sessionId?: string;
  readonly modes?: { readonly currentModeId?: string };
  readonly configOptions?: readonly ConfigOption[];
}

function toAcpMcpServer(server: McpServerConfig): unknown {
  if (server.type === 'http') {
    return { type: 'http', name: server.name, url: server.url, headers: server.headers ?? [] };
  }
  return {
    name: server.name,
    command: server.command,
    args: server.args ?? [],
    env: server.env ?? [],
  };
}

/**
 * Cursor offers `allow_once`, `allow_always` and `reject_once`, measured on a real permission
 * request. An unknown kind is a rejection.
 */
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
