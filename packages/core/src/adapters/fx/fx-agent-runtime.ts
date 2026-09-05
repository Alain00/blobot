import { isAbsolute, relative } from 'node:path';
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
  SessionUpdate,
} from '../acp/wire.js';
import { offerableNames } from './palette.js';
import { fxModeFor } from './permissions.js';
import { fxPersonaBlocks } from './persona.js';
import { spawnFx, VERIFIED_FX_VERSION, type SpawnFx } from './stdio.js';

const PROTOCOL_VERSION = 1;

/** The config option that *is* ticket 14's posture, and is therefore never offered as a choice. */
const MODE_OPTION = 'mode';

/**
 * Which advertised option groups blobot hands to the user.
 *
 * fx advertises three. `mode` is excluded for the reason Codex's was: it is the posture, and a
 * user who could pick it from a dropdown would have gone around ticket 14 without seeing the
 * word. The other two are ADR-0002's, and `provider` is a group no other runtime has —
 * `gateway`, `codex` or `grok`, with 234 models behind the first.
 *
 * `provider` is offered even though two of its three values need a login blobot does not have
 * and must not acquire. Setting one the user has not signed into is refused by fx in a sentence
 * that names its own remedy (`Run fx login codex.`), and quoting that is better than hiding the
 * choice: an empty dropdown teaches nobody that the subscription they already pay for would work
 * here.
 */
const SURFACED_OPTIONS = ['provider', 'model'];

/** Structurally the other three adapters' shape, and declared here for the reason they give:
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

export interface FxAgentRuntimeOptions {
  readonly agentId: string;
  /** The agent's own AgentWorkspace, and fx's whole notion of a workspace. */
  readonly cwd: string;
  /**
   * Composed by core (`composePersona`), and on this runtime **delivered on every prompt**
   * rather than through a channel, because fx has none. `persona.ts` has the six candidates
   * that were measured and why each failed.
   */
  readonly persona?: string;
  readonly agentName?: string;
  /**
   * Bring this agent back with its memory. fx advertises `loadSession`, and unlike Codex it
   * keeps no persona on the session, so a resumed fx agent is under the persona this process is
   * holding rather than a stored one. That is why `personaIsSessionBound` is false here.
   */
  readonly resumeSessionId?: string;
  readonly options?: RuntimeOptionChoices;
  readonly mcpServers?: readonly McpServerConfig[];
  readonly trust?: TrustLevel;
  readonly clock?: Clock;
  /** The user's own `fx`, from detection. */
  readonly fxExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Injected in tests: a transport that speaks the protocol without spawning anything. */
  readonly spawn?: SpawnFx;
  readonly onStderr?: (line: string) => void;
  /**
   * Where a Picture's bytes go. Absent is a runtime with nowhere to put one, which is reported
   * as such rather than dropped: `.scratch/agent-media/10`.
   */
  readonly pictures?: PictureStore;
}

/**
 * fx behind `AgentRuntime`, over `fx acp` on stdio.
 *
 * The fourth adapter and the first against a runtime nobody in the ACP working group wrote:
 * Claude's and Codex's bridges come from the protocol's own authors and OpenCode implements it
 * alongside them, while fx is a 7 MiB Zig binary with its own opinion of what a mode is. That
 * makes it the test of whether `adapters/acp/` is the protocol's shape or three vendors' habit,
 * and the answer is that it took it unchanged: the JSON-RPC, the transport, the wire shapes, the
 * `session/update` translation, the option groups and the attachment blocks are all reused here
 * with no edit. What is left in this file is only what is fx's own.
 */
export class FxAgentRuntime implements AgentRuntime {
  readonly agentId: string;

  readonly #options: FxAgentRuntimeOptions;
  readonly #clock: Clock;
  readonly #spawn: SpawnFx;
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
  /**
   * The file a tool call is about, by call id, learned from the **permission request**.
   *
   * fx is the only runtime so far that names the file nowhere the shared layer can see it. Its
   * `tool_call` carries `title: "Writing"`, `kind: "edit"` and nothing else -- no `locations`,
   * which is ACP's own field and which Claude and OpenCode both populate, and no `diff` block,
   * which is where Codex puts it. The path exists in exactly one place on the wire:
   * `toolCall.rawInput.path` on the `session/request_permission` that follows.
   *
   * So it is picked up there and applied to the updates that come after, which is why an fx edit
   * reads `notes.txt` on completion where the other three say it from the start. That is a real
   * difference and it is the honest one: before the permission is asked, blobot has not been
   * told which file, and titling the pending call would be inventing it.
   */
  readonly #pathsByCall = new Map<string, string>();

  constructor(options: FxAgentRuntimeOptions) {
    this.agentId = options.agentId;
    this.#options = options;
    this.#pictures = new PictureWatch(options.pictures);
    this.#clock = options.clock ?? new SystemClock();
    this.#spawn = options.spawn ?? spawnFx;
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get lifecycle(): RuntimeLifecycle {
    return this.#lifecycle;
  }

  /** The ACP mode the session reports. On fx this is the visible half of the posture; the
   *  half that decides is `FX_PERMISSION_MODE` on the process. */
  get modeId(): string | undefined {
    return this.#modeId;
  }

  /** Whether the agent came back with its memory. */
  get resumed(): boolean {
    return this.#resumed;
  }

  get trust(): TrustLevel {
    return this.#options.trust ?? DEFAULT_TRUST;
  }

  /**
   * False, and fx is the runtime that makes the flag easy to explain.
   *
   * The persona is not stored anywhere: it rides every prompt, so every session this process
   * opens — fresh, resumed or restarted — runs under the definition the process is holding. A
   * restart changes nothing about who the agent is, which is exactly what this flag means.
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
      trust: this.trust,
      ...(this.#options.env === undefined ? {} : { env: this.#options.env }),
      ...(this.#options.fxExecutable === undefined
        ? {}
        : { fxExecutable: this.#options.fxExecutable }),
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

    const initialized = await this.#initialize(connection);
    this.#reportVersion(initialized);
    this.#accepts = acceptsOf(initialized.agentCapabilities);

    const wanted = this.#options.resumeSessionId;
    const canLoad = initialized.agentCapabilities?.loadSession === true;
    const session =
      wanted === undefined || wanted === '' || !canLoad
        ? await this.#newSession(connection)
        : await this.#loadSession(connection, wanted);
    const sessionId = session.sessionId ?? (wanted !== undefined && wanted !== '' ? wanted : '');
    if (sessionId === '') throw new Error(`${this.agentId}: fx returned no sessionId`);
    this.#sessionId = sessionId;

    await this.#assertPosture(session);
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
   * `initialize`, and the one place fx diverges from the protocol in a way blobot has to catch.
   *
   * Claude, Codex and OpenCode all answer `initialize` whether or not anybody is signed in, and
   * advertise `authMethods` so the client can authenticate afterwards. **fx puts the gate in
   * front of the handshake**: with no credential it fails the call itself, measured 2026-08-31,
   * with `-32600` and the sentence
   *
   *     fx needs access to Vercel AI Gateway. Run fx login to sign in, fx setup to use an API
   *     key, or set AI_GATEWAY_API_KEY.
   *
   * and every later call answers `Not initialized. Call initialize first.` So on this runtime
   * detection is not a courtesy: an unready fx does not fail at the first turn, it fails at the
   * launch, and without this the user would see a raw JSON-RPC code.
   *
   * fx's own sentence is quoted rather than replaced. It names three remedies in the vendor's
   * vocabulary and would go stale the moment blobot paraphrased it.
   */
  async #initialize(connection: JsonRpcConnection): Promise<InitializeResult> {
    try {
      return await connection.request<InitializeResult>('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        // We own no terminals and serve no unsaved buffers, so fx's own tools are the right
        // ones — and a client that offers to write files is a way around the posture.
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${this.agentId}: fx would not start a session. ${message}`);
    }
  }

  #newSession(connection: JsonRpcConnection): Promise<FxSessionResult> {
    return connection.request<FxSessionResult>('session/new', this.#sessionParams());
  }

  /**
   * Resume, with the trap all four adapters meet and one fx adds.
   *
   * `mcpServers` must be re-supplied or `message_agent` is gone while the replayed transcript
   * still shows the agent using it a moment ago. The replay arrives as `session/update`
   * notifications and the store already has all of it, so the stream is muted.
   *
   * A session the provider has forgotten is not a failed launch: it falls back to a new one.
   */
  async #loadSession(connection: JsonRpcConnection, sessionId: string): Promise<FxSessionResult> {
    this.#replaying = true;
    try {
      const loaded = await connection.request<FxSessionResult>('session/load', {
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

  #sessionParams(): Record<string, unknown> {
    return {
      cwd: this.#options.cwd,
      mcpServers: (this.#options.mcpServers ?? []).map(toAcpMcpServer),
    };
  }

  /**
   * The posture, re-asserted on every session rather than trusted once.
   *
   * **Measured: fx forgets it.** A session set to one mode and then resumed came back reporting
   * `ask` regardless, which is the same behaviour the OpenCode adapter already carries — it
   * restores the last used mode rather than the configured default — arrived at independently by
   * a second runtime. So this runs after `session/new`, `session/load` and `restart` alike.
   *
   * The lever is `session/set_config_option`, not `session/set_mode`: fx exposes `mode` twice,
   * and `set_mode` answered with neither a result nor an error while `set_config_option`
   * returned the updated set.
   *
   * **This is not fatal, and that is a deliberate difference from the Codex adapter.** There the
   * mode *is* the posture, so a mode that could not be confirmed had to fail the launch. Here the
   * posture is `FX_PERMISSION_MODE` on the process, which is set before the child exists and
   * cannot fail to apply — the ACP mode is the visible half. A mode that will not take is
   * reported and the launch continues; a posture that could not be set would have thrown in
   * `spawnFx`, which cannot happen because it is an environment variable.
   */
  async #assertPosture(session: FxSessionResult): Promise<void> {
    const wanted = fxModeFor(this.trust);
    const reported =
      session.modes?.currentModeId ??
      session.configOptions?.find((option) => option.id === MODE_OPTION)?.currentValue;
    this.#modeId = reported;
    if (reported === wanted) return;
    try {
      await this.#connection?.request('session/set_config_option', {
        sessionId: this.#sessionId,
        configId: MODE_OPTION,
        value: wanted,
      });
      this.#modeId = wanted;
    } catch (error) {
      this.#options.onStderr?.(
        `blobot: fx reported mode ${reported ?? 'unknown'} and would not be set to ${wanted} ` +
          `(${error instanceof Error ? error.message : String(error)}). ` +
          `The posture is FX_PERMISSION_MODE=${wanted} on the process, which is already set.`,
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
      this.#emitTo(queue, { type: 'error', message: 'fx is not connected', fatal: true });
      return;
    }
    try {
      const result = await connection.request<PromptResult>('session/prompt', {
        sessionId: this.#sessionId,
        prompt: [
          // The persona leads, on every turn, because fx has nowhere else to keep it. It is not
          // recorded in `messages`: core composed the text below it and nothing above it.
          ...fxPersonaBlocks(this.#options.persona),
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
   * Simpler here than on Codex, and the reason is `personaIsSessionBound`: the persona rides
   * the prompt, so the fresh session comes up under exactly the instructions the old one was
   * running under. There is no silent change of identity to warn a caller about.
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
      if (session.sessionId === undefined || session.sessionId === '') {
        throw new Error(`${this.agentId}: fx returned no sessionId`);
      }
      this.#sessionId = session.sessionId;
      this.#resumed = false;
      await this.#assertPosture(session);
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
    this.#offerable ??= offerableNames(this.#options.cwd);
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
    // fx stringifies the whole tool result into a text block and cuts it at 200 characters,
    // mid-base64, saying nothing. There is no reader for that and there deliberately is not one:
    // deciding a truncated fragment inside prose was a picture is a heuristic, and a heuristic
    // that misfires draws `not drawn` over an ordinary sentence an agent wrote, which is a false
    // claim in the transcript whose job is to be accurate. Open on `.scratch/agent-media/10`
    // until somebody measures whether that block carries a reliable marker.
    for (const picture of this.#pictures.from(update, this.agentId, this.#clock.now()))
      this.#emit(picture);
    for (const event of translateSessionUpdate(update))
      this.#emit(
        withoutVerbOnMcp(
          this.#withKnownPath(withTarget(event, update, this.#options.cwd), update),
          update,
        ),
      );
  }

  /**
   * blobot's own loopback tool, answered by blobot.
   *
   * The same carve-out the Claude and Codex adapters carry, on the same structural rule:
   * `rawInput.{server,tool}` from the `tool_call` that shares the permission request's
   * `toolCallId`, never the prose of a title. A server the *user* configured is not in
   * `mcpServers` and still asks.
   *
   * **Precautionary here rather than observed.** Codex asks about every MCP tool call and had to
   * have this or a peer message waited on a human; whether fx does the same has not been
   * measured. It is included because the cost of being wrong in the other direction is a team
   * that deadlocks the first time one agent messages another, and because the rule it applies is
   * the one blobot has already decided twice.
   */
  #isOwnMailboxCall(title: string | undefined): boolean {
    if (title === undefined) return false;
    return (this.#options.mcpServers ?? []).some(
      (server) => title === `mcp_${server.name}_message_agent`,
    );
  }

  /**
   * The path the permission request named, put on the events that follow it.
   *
   * Only ever *fills a gap*: if the shared layer already found a target in `locations` or a diff
   * block, that wins, because those are the protocol's own fields and this is a repair for a
   * runtime that populates neither. So the day fx starts sending `locations`, this quietly stops
   * doing anything rather than fighting it.
   */
  #withKnownPath(event: InjectableEvent, update: SessionUpdate): InjectableEvent {
    if (event.type !== 'tool_call_started' && event.type !== 'tool_call_updated') return event;
    if (update.toolCallId === undefined) return event;
    if (withTarget(event, update, this.#options.cwd) !== event) return event;
    const known = this.#pathsByCall.get(update.toolCallId);
    return known === undefined ? event : { ...event, title: known };
  }

  /** The one place the path is on the wire. Relative to the AgentWorkspace, like every other
   *  target blobot draws, because the part that differs between two agents says nothing. */
  #rememberPath(params: PermissionRequestParams): void {
    const id = params.toolCall?.toolCallId;
    const raw = (params.toolCall as { rawInput?: { path?: unknown } } | undefined)?.rawInput?.path;
    if (id === undefined || typeof raw !== 'string' || raw === '') return;
    const shown = isAbsolute(raw) ? (relative(this.#options.cwd, raw) || raw) : raw;
    this.#pathsByCall.set(id, shown);
  }

  async #onPermissionRequest(params: PermissionRequestParams): Promise<unknown> {
    this.#rememberPath(params);
    if (this.#isOwnMailboxCall(params.toolCall?.title)) {
      const allowOnce = (params.options ?? []).find((option) => option.kind === 'allow_once');
      if (allowOnce?.optionId !== undefined) {
        return { outcome: { outcome: 'selected', optionId: allowOnce.optionId } };
      }
    }
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
      message: reason ?? 'the fx process exited',
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
   * A version that is not the one this adapter was written against is **reported, not refused**.
   *
   * The opposite of the Claude and Codex bridges, which are pinned dependencies blobot installs
   * and may therefore insist on. `fx` is the user's own binary, it ships its own `fx upgrade`,
   * and refusing to start a team because they are one release ahead would be blobot breaking a
   * working machine. Same rule as `opencode`, same reason.
   *
   * The protocol version *is* refused, because that is a wire contract rather than a release.
   */
  #reportVersion(initialized: InitializeResult): void {
    if (
      initialized.protocolVersion !== undefined &&
      initialized.protocolVersion !== PROTOCOL_VERSION
    ) {
      throw new Error(
        `${this.agentId}: fx negotiated ACP protocol version ${String(initialized.protocolVersion)}, ` +
          `but this adapter is written against ${PROTOCOL_VERSION}.`,
      );
    }
    const version = initialized.agentInfo?.version;
    if (version !== undefined && version !== VERIFIED_FX_VERSION) {
      this.#options.onStderr?.(
        `blobot: fx reports version ${version}; this adapter was verified against ${VERIFIED_FX_VERSION}.`,
      );
    }
  }
}

/**
 * An MCP tool call carries no verb, which is DESIGN.md's rule: the name of an MCP tool is its
 * server's, and `read` / `edit` / `run` is blobot paraphrasing work it did not name.
 *
 * Nothing to do here on fx, and that is worth recording rather than leaving as an empty file:
 * fx already types every MCP call `kind: "other"` itself, measured on a real
 * `mcp_blobot_message_agent` call. The Codex adapter has to correct this because Codex types
 * them `execute`; fx got it right on its own.
 */
function withoutVerbOnMcp(event: InjectableEvent, _update: SessionUpdate): InjectableEvent {
  return event;
}

/** `session/new` and `session/load` answer with the same block, minus the id on a load. fx puts
 *  the mode in both `modes` and `configOptions`, so `#assertPosture` reads whichever it gets. */
interface FxSessionResult {
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
 * fx offers `allow_once`, `allow_always` and `reject_once`, measured on a real permission
 * request. Ticket 14 gives `allow_always` no path to the UI. An unknown kind is a rejection.
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
