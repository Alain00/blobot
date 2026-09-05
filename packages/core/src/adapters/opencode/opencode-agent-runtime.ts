import type { Clock } from '../../clock.js';
import { DEFAULT_TRUST, type TrustLevel } from '../../trust.js';
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
import { applyOptionChoices, optionGroupsFrom } from '../acp/config-options.js';
import { JsonRpcConnection, type LineTransport } from '../acp/jsonrpc.js';
import { commandsFrom, stopReasonOf, translateSessionUpdate } from '../acp/session-updates.js';
import { withTarget } from '../acp/target.js';
import { ACCEPTS_NOTHING, acceptsOf, contentBlockOf } from '../acp/attachments.js';
import type {
  InitializeResult,
  PermissionRequestParams,
  PromptResult,
  SessionNotification,
} from '../acp/wire.js';
import { agentKeyFor, opencodeConfigContent } from './config.js';
import { offerableNames } from './palette.js';
import { LocalMachine } from '../../machines/local-machine.js';
import { OPENCODE_MACHINE_IMAGE } from './image.js';
import { requireLocalMachine, type Machine } from '../../machines/machine.js';
import { MACHINE_CLIENT_CAPABILITIES } from '../acp/client-capabilities.js';
import { spawnOpencode, VERIFIED_OPENCODE_VERSION, type SpawnOpencode } from './stdio.js';
import { currentModeOf, type OpencodeSessionResult } from './wire.js';

const PROTOCOL_VERSION = 1;

/**
 * Which advertised option groups blobot hands to the user.
 *
 * OpenCode advertises two, and `mode` is not one blobot may offer: on this runtime the mode
 * *is* the persona (research 16 §2.1), so a user switching it would be switching Alice off
 * rather than changing a setting. Measured on 1.18.4: 34 models, and no effort scale of any
 * kind, which is the asymmetry with Claude that the picker has to be able to express by
 * showing one group instead of two.
 */
const SURFACED_OPTIONS = ['model'];

/**
 * An MCP server handed to the session. Ticket 15's loopback `message_agent` endpoint is the
 * `http` variant; `stdio` is here because ACP offers it and OpenCode was observed serving it.
 *
 * Structurally identical to the Claude adapter's, and deliberately declared twice: the two
 * adapters agree about this shape today because both speak ACP, and the day one of them needs
 * a field the other cannot express, neither should have to move.
 */
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

export interface OpencodeAgentRuntimeOptions {
  readonly agentId: string;
  /** The agent's own AgentWorkspace. One process, one workspace, one persona. */
  readonly cwd: string;
  /** Composed by core (`composePersona`); injected as an OpenCode agent's `prompt`. */
  readonly persona?: string;
  /** The human name, for the agent definition's `description`. Falls back to the id. */
  readonly agentName?: string;
  /**
   * Bring this agent back with its memory. OpenCode persists sessions to its own SQLite and
   * they genuinely survive process death, so a forgotten session is rare rather than routine.
   * It is still not fatal: the runtime falls back to a new one.
   */
  readonly resumeSessionId?: string;
  /**
   * The user's own choices among what this runtime advertises, keyed by the provider's group
   * id. Applied after the session exists, because that is the only lever that works.
   */
  readonly options?: RuntimeOptionChoices;
  readonly mcpServers?: readonly McpServerConfig[];
  /**
   * How much of this agent's own work blobot vouches for. Absent is `normal`, which is what
   * every agent ran as before the level was a choice. See `trust.ts`.
   */
  readonly trust?: TrustLevel;
  readonly clock?: Clock;
  /** The user's own `opencode`. Defaults to `OPENCODE_BIN`, then `PATH`. */
  readonly opencodeExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly machine?: Machine;
  /** Injected in tests: a transport that speaks the protocol without spawning anything. */
  readonly spawn?: SpawnOpencode;
  readonly onStderr?: (line: string) => void;
}

/**
 * OpenCode behind `AgentRuntime`, over `opencode acp` on stdio.
 *
 * Everything OpenCode-shaped stops here: the persona that is an *agent* rather than a system
 * prompt, the permission posture that is an env var rather than a mode, the `configOptions`
 * block where the Claude bridge sends `modes`, and the resumed session that comes back in
 * whatever mode it was last used in. Nothing above this class can tell which provider an
 * agent is.
 */
export class OpencodeAgentRuntime implements AgentRuntime {
  readonly machineImage = OPENCODE_MACHINE_IMAGE;
  readonly agentId: string;

  readonly #options: OpencodeAgentRuntimeOptions;
  readonly #clock: Clock;
  readonly #spawn: SpawnOpencode;
  readonly #agentKey: string;
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
  /** What this session takes attached to a prompt, read off `initialize`. */
  #accepts: AttachmentSupport = ACCEPTS_NOTHING;
  #projectNames: ReadonlySet<string> | undefined;

  constructor(options: OpencodeAgentRuntimeOptions) {
    this.agentId = options.agentId;
    requireLocalMachine(options.machine);
    this.#options = {
      ...options,
      machine: options.machine ?? new LocalMachine({ agentId: options.agentId, workspacePath: options.cwd }),
    };
    this.#clock = options.clock ?? new SystemClock();
    this.#spawn = options.spawn ?? spawnOpencode;
    this.#agentKey = agentKeyFor(options.agentName ?? options.agentId);
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get lifecycle(): RuntimeLifecycle {
    return this.#lifecycle;
  }

  /** The OpenCode agent this session is running as. It is the persona, or the persona is not
   *  live and the answer will come back in OpenCode's own voice. */
  get modeId(): string | undefined {
    return this.#modeId;
  }

  /** The config key the persona is defined under, which is also the ACP mode id. */
  get personaMode(): string {
    return this.#agentKey;
  }

  /** Whether the agent came back with its memory. */
  get resumed(): boolean {
    return this.#resumed;
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
      ...(this.#options.machine === undefined ? {} : { machine: this.#options.machine }),
      cwd: this.#options.cwd,
      // The persona and the posture reach the process here, before it reads a directory:
      // OpenCode snapshots a directory's config for the process lifetime, so a config that
      // arrives after the first session is a config that never applies (research 16 §8).
      configContent: this.#configContent(),
      ...(this.#options.opencodeExecutable === undefined
        ? {}
        : { opencodeExecutable: this.#options.opencodeExecutable }),
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
      // We own no terminals and serve no unsaved buffers: the agent works in a real workspace
      // on disk, so OpenCode's own file and shell tools are the right ones to use.
      clientCapabilities: MACHINE_CLIENT_CAPABILITIES,
    });
    this.#checkVersions(initialized);

    const wanted = this.#options.resumeSessionId;
    this.#accepts = acceptsOf(initialized.agentCapabilities);
    const canLoad = initialized.agentCapabilities?.loadSession === true;
    const session =
      wanted === undefined || wanted === '' || !canLoad
        ? await this.#newSession(connection)
        : await this.#loadSession(connection, wanted);
    if (session.sessionId === undefined) {
      throw new Error(`${this.agentId}: opencode returned no sessionId`);
    }
    this.#sessionId = session.sessionId;
    await this.#applyPersonaMode(currentModeOf(session));
    this.#optionGroups = optionGroupsFrom(session.configOptions, SURFACED_OPTIONS);
    this.#optionGroups = await applyOptionChoices(
      connection,
      this.#sessionId,
      this.#options.options ?? {},
      this.#optionGroups,
      (line) => this.#options.onStderr?.(line),
    );
  }

  #newSession(connection: JsonRpcConnection): Promise<OpencodeSessionResult> {
    return connection.request<OpencodeSessionResult>('session/new', this.#sessionParams());
  }

  /**
   * Resume, with the same two traps the Claude adapter meets and one of its own.
   *
   * `mcpServers` must be re-supplied, or `message_agent` is gone while the replayed transcript
   * still shows the agent using it a moment ago. The replay itself arrives as `session/update`
   * notifications *before* the call returns, and the store already has all of it, so the
   * stream is muted while the load runs.
   *
   * OpenCode's own trap is the mode: it is restored from the **message history**, not from
   * `default_agent`, so a session that was ever switched off the persona resumes off it.
   * `#applyPersonaMode` is what closes that, and it runs after every start.
   */
  async #loadSession(
    connection: JsonRpcConnection,
    sessionId: string,
  ): Promise<OpencodeSessionResult> {
    this.#replaying = true;
    try {
      const loaded = await connection.request<OpencodeSessionResult>('session/load', {
        sessionId,
        ...this.#sessionParams(),
      });
      this.#resumed = true;
      // `session/load` answers with `configOptions` and no `sessionId` — we already have it.
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

  /** Identical on `session/new` and `session/load`. There is no `_meta`: OpenCode parses it
   *  and never reads it, so anything put there is a silent no-op (research 16 §1). */
  #sessionParams(): Record<string, unknown> {
    return {
      cwd: this.#options.cwd,
      mcpServers: (this.#options.mcpServers ?? []).map(toAcpMcpServer),
    };
  }

  #configContent(): string {
    const name = this.#options.agentName ?? this.agentId;
    return opencodeConfigContent({
      agentKey: this.#agentKey,
      description: `${name}, a blobot teammate.`,
      persona: this.#options.persona ?? '',
      trust: this.trust,
    });
  }

  /** What this process was launched vouching for. The config is an env var on the child, so a
   *  changed level reaches an agent at its next start, exactly as on the other runtime. */
  get trust(): TrustLevel {
    return this.#options.trust ?? DEFAULT_TRUST;
  }

  /**
   * The free health check research 16 asked for, plus the repair.
   *
   * `session/new` reports which agent the session is running as, so whether the persona is
   * live is knowable without spending a model turn. When it is not — a resumed session that
   * remembers being `build`, or a config that did not reach the process — `session/set_mode`
   * puts it back. The call is cheap and unconditional after a load for exactly that reason.
   */
  async #applyPersonaMode(reported: string | undefined): Promise<void> {
    const connection = this.#connection;
    this.#modeId = reported;
    if (connection === undefined || this.#options.persona === undefined) return;
    if (reported === this.#agentKey) return;
    try {
      await connection.request('session/set_mode', {
        sessionId: this.#sessionId,
        modeId: this.#agentKey,
      });
      this.#modeId = this.#agentKey;
    } catch (error) {
      // Not fatal, and loud: the agent works, it just answers as OpenCode rather than as the
      // teammate the user hired, and silently is the one way that must not happen.
      this.#options.onStderr?.(
        `blobot: ${this.agentId} could not be set to its persona agent ${this.#agentKey} ` +
          `(${error instanceof Error ? error.message : String(error)}); it will answer without one`,
      );
    }
  }

  sendPrompt(prompt: Prompt): AsyncIterable<AgentEvent> {
    if (this.#lifecycle !== 'ready') {
      throw new Error(`${this.agentId}: cannot prompt a runtime that is ${this.#lifecycle}`);
    }
    if (this.#turn !== undefined) {
      // Not a nicety on OpenCode: two prompts on one session were observed collapsing into a
      // single turn, both replies byte-identical. The orchestrator's mailbox exists so that
      // this cannot happen, and this throw is what keeps that true.
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
      this.#emitTo(queue, { type: 'error', message: 'opencode is not connected', fatal: true });
      return;
    }
    try {
      const result = await connection.request<PromptResult>('session/prompt', {
        sessionId: this.#sessionId,
        // Attachments first, then the text: an agent does better with the thing before the
        // question, and it is the order the user had in mind putting them together.
        prompt: [
          ...(prompt.attachments ?? []).map(contentBlockOf),
          { type: 'text', text: prompt.text },
        ],
      });
      // The turn ends on the RPC *reply*, including when it was cancelled: a cancelled prompt
      // resolves with `stopReason: "cancelled"` rather than rejecting, so a client waiting for
      // an error on cancel waits forever.
      this.#emitTo(queue, {
        type: 'turn_ended',
        turnId,
        stopReason: stopReasonOf(result.stopReason),
      });
    } catch (error) {
      // No `turn_ended`: the RPC never replied, and inventing a stop reason would be a lie.
      if (queue.closed) return;
      this.#emitTo(queue, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        fatal: true,
      });
    }
  }

  /** A notification, not a request. The in-flight prompt resolves `cancelled` ~20-30ms later
   *  and the session stays usable. */
  async cancel(): Promise<void> {
    if (this.#turn === undefined) return;
    this.#connection?.notify('session/cancel', { sessionId: this.#sessionId });
  }

  /** False: the persona is an OpenCode **agent** in the child's configuration, and
   *  `#applyPersonaMode` re-asserts it after every resume. The live session already runs the
   *  current one, so a restart cannot change who the agent is. */
  get personaIsSessionBound(): boolean {
    return false;
  }

  /**
   * Close this session and open a fresh one, without respawning `opencode acp`.
   *
   * The persona is the child's environment here rather than a `session/new` parameter, so it
   * needs nothing re-supplied — but the **mode** does, and for the reason ticket 16 already
   * found: OpenCode restores the last used mode rather than the configured default, so a
   * session that has not been told is a session answering as `build` instead of as the
   * teammate the user hired. `#applyPersonaMode` is unconditional after a new session for
   * exactly that reason, and this is a new session.
   */
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
        throw new Error(`${this.agentId}: opencode returned no sessionId`);
      }
      this.#sessionId = session.sessionId;
      this.#resumed = false;
      await this.#applyPersonaMode(currentModeOf(session));
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
    // The session is on disk either way, so closing it costs nothing and keeps the shutdown
    // orderly. `session/close` makes the session unusable to *this* process; a later
    // `session/load` still resumes it.
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

  /** What this session lets the user choose, minus the group that is the persona. */
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

  /** Replace, never merge, and stay quiet when nothing moved. OpenCode re-advertises the same
   *  list after every prompt, so an identical advertisement must notify nobody. */
  #setCommands(advertised: readonly AvailableCommand[]): void {
    const allowed = this.#projectCommands();
    const commands = advertised.filter((command) => allowed.has(command.name));
    if (sameCommands(this.#commands, commands)) return;
    this.#commands = commands;
    for (const listener of this.#commandListeners) listener(commands);
  }

  /** Read once. A command added to the workspace mid-session needs a restart to be offered. */
  #projectCommands(): ReadonlySet<string> {
    this.#projectNames ??= offerableNames(this.#options.cwd, this.#options.machine?.kind === 'box' ? this.#options.machine.location() : undefined);
    return this.#projectNames;
  }

  #onSessionUpdate(notification: SessionNotification): void {
    const update = notification.update;
    if (update === undefined) return;

    // Commands pass both guards below: they are current state rather than transcript, and
    // during a resume's replay `#sessionId` is still empty because it is not assigned until
    // `session/load` returns.
    const commands = commandsFrom(update);
    if (commands !== undefined) {
      this.#setCommands(commands);
      return;
    }

    if (this.#replaying) return;
    if (notification.sessionId !== this.#sessionId) return;
    // Where ACP says which paths a call is about, that is the title. OpenCode's own title for
    // a file call is the absolute path with its leading slash gone, which said the same work
    // very differently from Claude's workspace-relative one.
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
    // Nothing on the wire announces this: an in-flight `session/prompt` simply never resolves,
    // so the child's exit is the only signal there will be.
    this.#emit({
      type: 'error',
      message: reason ?? 'the opencode process exited',
      code: 'process_died',
      fatal: true,
    });
    this.#turn?.queue.close();
  }

  /** Into the open turn if there is one, to `onEvent` otherwise — process death between turns
   *  belongs to no iterator. */
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
   * Two version checks with two different postures, and the difference is who owns the thing
   * being checked.
   *
   * The **protocol** version is refused, because OpenCode does not negotiate it: sending
   * `protocolVersion: 99` came back `1` with no error, so a client that does not check its
   * own answer is the one that will mis-parse.
   *
   * The **agent** version is only reported. `opencode` is the user's binary on the user's
   * update schedule, and refusing to start a team over a patch release would be blobot
   * breaking a machine that works.
   */
  #checkVersions(initialized: InitializeResult): void {
    if (initialized.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `opencode negotiated ACP protocol version ${String(initialized.protocolVersion)}, ` +
          `but this adapter is written against ${PROTOCOL_VERSION}.`,
      );
    }
    const version = initialized.agentInfo?.version;
    if (version !== undefined && version !== VERIFIED_OPENCODE_VERSION) {
      this.#options.onStderr?.(
        `blobot: opencode ${version} is running; this adapter was verified against ` +
          `${VERIFIED_OPENCODE_VERSION}.`,
      );
    }
  }
}

/**
 * For stdio, `type` is omitted, matching the observed `session/new` shape. `env` is an
 * **array** in OpenCode's schema rather than an object, which is the kind of detail that
 * turns into a session with no tools and no error.
 */
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

/** OpenCode offers `allow_once`, `allow_always` and `reject_once`; there is no
 *  `reject_always`. An unknown kind is treated as a rejection, never as an approval. */
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
