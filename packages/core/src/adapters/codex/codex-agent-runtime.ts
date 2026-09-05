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
  ConfigOption,
  SessionUpdate,
  InitializeResult,
  PermissionRequestParams,
  PromptResult,
  SessionNotification,
} from '../acp/wire.js';
import { offerableNames, offeredName } from './palette.js';
import { LocalMachine } from '../../machines/local-machine.js';
import { requireLocalMachine, type Machine } from '../../machines/machine.js';
import { MACHINE_CLIENT_CAPABILITIES } from '../acp/client-capabilities.js';
import { CODEX_POSTURE_MODE, codexModeFor } from './permissions.js';
import {
  CODEX_BRIDGE_PACKAGE,
  CODEX_BRIDGE_VERSION,
  spawnCodexBridge,
  type SpawnCodexBridge,
} from './stdio-bridge.js';

const PROTOCOL_VERSION = 1;

/**
 * Which advertised option groups blobot hands to the user.
 *
 * Codex advertises five. `mode` is not one blobot may offer: it *is* ticket 14's posture, and a
 * user who could pick `agent-full-access` from a dropdown would have gone around that ticket
 * without ever seeing the word. The other four stay — `model` and `reasoning_effort` are the two
 * ADR-0002 already reads off Claude, `fast-mode` is the third and is absent for some models, and
 * `collaboration_mode` is a `default`/`plan` choice blobot does not make and which changes how
 * Codex works *within* the posture rather than changing it.
 */
const SURFACED_OPTIONS = ['model', 'reasoning_effort', 'fast-mode', 'collaboration_mode'];

/** Structurally the other two adapters' shape, and declared here for the reason they give:
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

export interface CodexAgentRuntimeOptions {
  readonly agentId: string;
  /** The agent's own AgentWorkspace. One process, one workspace, one persona. */
  readonly cwd: string;
  /**
   * Composed by core (`composePersona`), delivered as `CODEX_CONFIG.developer_instructions`.
   *
   * **Codex stores it on the session**, measured in research 01: a second process with the
   * variable unset still answered in persona, and a *different* persona in the variable did not
   * take. So a resumed session keeps the persona it was created with, and an edited persona
   * needs a new session rather than a resume — see `resumeSessionId`.
   */
  readonly persona?: string;
  readonly agentName?: string;
  /**
   * Bring this agent back with its memory. The bridge advertises `loadSession` and replays the
   * transcript before answering, which is muted here the way both other adapters mute it.
   *
   * **Do not pass one after the persona has changed.** The runtime cannot tell: the new persona
   * reaches the process and is ignored in favour of the stored one, silently. ADR-0002 says an
   * edit is taken at the team's next start, and on this runtime that start has to be a new
   * session for the sentence to stay true.
   */
  readonly resumeSessionId?: string;
  readonly options?: RuntimeOptionChoices;
  readonly mcpServers?: readonly McpServerConfig[];
  /** How much of this agent's own work blobot vouches for. One posture on this runtime at
   *  every level, and `permissions.ts` says why. */
  readonly trust?: TrustLevel;
  readonly clock?: Clock;
  /** The user's own `codex`, from detection. The bridge runs its own bundled copy without it. */
  readonly codexExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly machine?: Machine;
  /** Injected in tests: a transport that speaks the protocol without spawning anything. */
  readonly spawn?: SpawnCodexBridge;
  readonly onStderr?: (line: string) => void;
}

/**
 * What blobot has to tell a Codex agent that it does not have to tell the other two.
 *
 * Codex ships its own multi-agent vocabulary — `collaboration.spawn_agent`,
 * `collaboration.send_message`, `collaboration.list_agents` — and it competes with the mailbox.
 * Measured 2026-08-30, both failure modes on a real Codex: asked to message Bob, it **started a
 * subagent called `bob`** and reported the message sent; and, on later turns, it consulted its
 * own roster, found no Bob in it, and answered *"Bob isn't an active agent"* without ever
 * reaching for `message_agent`. Both are a second orchestrator answering for a teammate who
 * heard nothing, and `CLAUDE.md` says the orchestrator owns agent-to-agent communication.
 *
 * Turning the feature off through `CODEX_CONFIG` was tried first and is **worse**: a partial
 * `features` map replaces the defaults rather than merging into them, and a session started with
 * `{"features":{"multi_agent":false}}` lost its MCP tooling entirely. So this is said in words,
 * in the adapter, where a fact about one provider belongs.
 */
const NO_SUBAGENTS =
  'You have no subagents. Codex collaboration tools such as spawn_agent, send_message and ' +
  'list_agents are not how this team works, and an agent you spawn is not your teammate. ' +
  'Your teammates are the ones named in your role above, they are already running, and the ' +
  'only way to reach one is the message_agent tool from the blobot MCP server.';

/**
 * Codex behind `AgentRuntime`, over the pinned `codex-acp` bridge on stdio.
 *
 * The third adapter and the smallest, because the two before it moved everything general into
 * `adapters/acp/`: the JSON-RPC, the transport, the wire shapes, the `session/update`
 * translation, the option groups, the attachment blocks, the pinned npm bridge and the tool
 * title. What is left here is only what is Codex's own.
 */
export class CodexAgentRuntime implements AgentRuntime {
  readonly agentId: string;

  readonly #options: CodexAgentRuntimeOptions;
  readonly #clock: Clock;
  readonly #spawn: SpawnCodexBridge;
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
  #offerable: ReadonlySet<string> | undefined;
  /** Which MCP server and tool a call belongs to, by call id, from `rawInput`. Codex sends the
   *  `tool_call` before it asks about it, so this is populated by the time it matters. */
  readonly #mcpCalls = new Map<string, { server?: string; tool?: string }>();

  constructor(options: CodexAgentRuntimeOptions) {
    this.agentId = options.agentId;
    requireLocalMachine(options.machine);
    this.#options = {
      ...options,
      machine: options.machine ?? new LocalMachine({ agentId: options.agentId, workspacePath: options.cwd }),
    };
    this.#clock = options.clock ?? new SystemClock();
    this.#spawn = options.spawn ?? spawnCodexBridge;
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get lifecycle(): RuntimeLifecycle {
    return this.#lifecycle;
  }

  /** The mode the session is actually in. It is the posture, or the posture did not take. */
  get modeId(): string | undefined {
    return this.#modeId;
  }

  /** Whether the agent came back with its memory. */
  get resumed(): boolean {
    return this.#resumed;
  }

  /** What this process was launched vouching for. The mode is an env var on the child, so a
   *  changed level reaches an agent at its next start, exactly as on the other runtimes. */
  get trust(): TrustLevel {
    return this.#options.trust ?? DEFAULT_TRUST;
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
      trust: this.trust,
      // The persona reaches the process here, in its environment, and dies with it. Nothing is
      // written into the AgentWorkspace, which is a checkout of the user's repository.
      env: { ...this.#options.env, ...this.#personaEnv() },
      ...(this.#options.codexExecutable === undefined
        ? {}
        : { codexExecutable: this.#options.codexExecutable }),
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
      // We own no terminals and serve no unsaved buffers, so Codex's own tools are the right
      // ones. Declining `fs` is also what keeps the sandbox meaningful: a client that offers to
      // write files is a way around a kernel boundary ticket 02 relies on.
      clientCapabilities: MACHINE_CLIENT_CAPABILITIES,
      // The bridge's subagent and goal extensions are negotiated and therefore opt-in. They are
      // declined by saying nothing, on purpose and not by omission: blobot owns agent-to-agent
      // communication, and a second orchestrator underneath ours is not something to reach for.
    });
    this.#assertBridgeVersion(initialized);
    this.#accepts = acceptsOf(initialized.agentCapabilities);

    const wanted = this.#options.resumeSessionId;
    const canLoad = initialized.agentCapabilities?.loadSession === true;
    const session =
      wanted === undefined || wanted === '' || !canLoad
        ? await this.#newSession(connection)
        : await this.#loadSession(connection, wanted);
    const sessionId = session.sessionId ?? (wanted !== undefined && wanted !== '' ? wanted : '');
    if (sessionId === '') throw new Error(`${this.agentId}: codex returned no sessionId`);
    this.#sessionId = sessionId;

    await this.#assertPosture(session.modes?.currentModeId);
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
   * The two things blobot puts in `CODEX_CONFIG`, and the long list it does not.
   *
   * `developer_instructions` is the persona (research 01), with `NO_SUBAGENTS` on the end. It
   * reaches the process in its environment, dies with it, and writes nothing into the
   * AgentWorkspace, which is a checkout of the user's repository.
   *
   * Nothing else goes in here, and two keys in particular. The **posture** is inert against the
   * mode (research 02) and would read as a decision that had been taken. **`features`** replaces
   * the defaults instead of merging into them, and a session that set one flag came up with no
   * MCP tooling at all.
   */
  #personaEnv(): Record<string, string> {
    const persona = this.#options.persona;
    return {
      CODEX_CONFIG: JSON.stringify({
        developer_instructions:
          persona === undefined || persona === '' ? NO_SUBAGENTS : `${persona}\n\n${NO_SUBAGENTS}`,
      }),
    };
  }

  #newSession(connection: JsonRpcConnection): Promise<CodexSessionResult> {
    return connection.request<CodexSessionResult>('session/new', this.#sessionParams());
  }

  /**
   * Resume, with the two traps both other adapters meet.
   *
   * `mcpServers` must be re-supplied, or `message_agent` is gone while the replayed transcript
   * still shows the agent using it a moment ago. The replay arrives as `session/update`
   * notifications *before* the call returns — measured at three user and three agent chunks for
   * a three-turn session — and the store already has all of it, so the stream is muted.
   *
   * A session the provider has forgotten is not a failed launch: it falls back to a new one.
   */
  async #loadSession(
    connection: JsonRpcConnection,
    sessionId: string,
  ): Promise<CodexSessionResult> {
    this.#replaying = true;
    try {
      const loaded = await connection.request<CodexSessionResult>('session/load', {
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
   * The posture, checked against what came back rather than trusted on the write.
   *
   * Research 02: an unknown key in `CODEX_CONFIG` is accepted in silence, so a posture that
   * failed to apply would fail *open* and invisibly. `INITIAL_AGENT_MODE` is what sets the mode
   * and `session/set_mode` is what repairs it; a session that is somehow in `agent` or
   * `agent-full-access` is the one blobot measured writing to a home directory without asking.
   */
  async #assertPosture(reported: string | undefined): Promise<void> {
    this.#modeId = reported;
    const wanted = codexModeFor(this.trust);
    if (reported === wanted) return;
    try {
      await this.#connection?.request('session/set_mode', {
        sessionId: this.#sessionId,
        modeId: wanted,
      });
      this.#modeId = wanted;
    } catch (error) {
      // Fatal, unlike the persona's equivalent on OpenCode: an agent answering in the wrong
      // voice is a disappointment, and an agent running under the wrong posture is the thing
      // ticket 14 exists to prevent.
      throw new Error(
        `${this.agentId}: codex started in mode ${reported ?? 'unknown'} and could not be set ` +
          `to ${wanted} (${error instanceof Error ? error.message : String(error)}). ` +
          'blobot will not run an agent whose permission posture it could not confirm.',
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
      this.#emitTo(queue, { type: 'error', message: 'codex is not connected', fatal: true });
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

  /** True, and this is the runtime it was noticed on. Codex stores `developer_instructions`
   *  on the session, so an edited persona never reaches a resumed one and does reach a fresh
   *  one. See `.scratch/codex-runtime/issues/06`. */
  get personaIsSessionBound(): boolean {
    return true;
  }

  /**
   * Close this session and open a fresh one, without respawning the bridge.
   *
   * **The persona changes here, and that is the point worth knowing.** Codex stores
   * `developer_instructions` on the session, so an edit the user made never reached a resumed
   * one (`.scratch/codex-runtime/issues/06`). A new session takes what the process is holding,
   * which is the definition as it stood when this team last started. So a restart can silently
   * put an agent under instructions it has not been running under, at a moment nobody chose.
   * The adapter cannot see that difference — `sessions.persona_text` is the record of what each
   * session was actually told — so the caller compares and says so. It is not left to pass.
   *
   * The posture is re-asserted by `#assertPosture` and is fatal if it cannot be confirmed, for
   * the same reason it is fatal at start: the bridge's default mode wrote a file into the
   * user's home directory without asking once.
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
        throw new Error(`${this.agentId}: codex returned no sessionId`);
      }
      this.#sessionId = session.sessionId;
      this.#resumed = false;
      await this.#assertPosture(session.modes?.currentModeId);
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
    const commands = advertised.filter((command) => allowed.has(offeredName(command.name)));
    if (sameCommands(this.#commands, commands)) return;
    this.#commands = commands;
    for (const listener of this.#commandListeners) listener(commands);
  }

  /** Read once. A skill added to the workspace mid-session needs a restart to be offered. */
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
    if (update.toolCallId !== undefined && update.rawInput?.server !== undefined) {
      this.#mcpCalls.set(update.toolCallId, {
        ...(update.rawInput.server === undefined ? {} : { server: update.rawInput.server }),
        ...(update.rawInput.tool === undefined ? {} : { tool: update.rawInput.tool }),
      });
    }
    for (const event of translateSessionUpdate(update))
      this.#emit(withoutVerbOnMcp(withTarget(event, update, this.#options.cwd), update));
  }

  /**
   * blobot's own loopback tool, answered by blobot.
   *
   * Codex asks permission for **every MCP tool call**, so an agent messaging a teammate stopped
   * and waited for a human every time — on a runtime where the mailbox is how a team works at
   * all. The Claude adapter has the same carve-out for the same reason and says it the same way:
   * `mcp__blobot` is contributed by `preApprovedTools` separately from the trust posture,
   * because it belongs to the server blobot injected rather than to the agent's own work.
   *
   * It is decided on **structure, not prose**. The permission request itself says only
   * `_meta.is_mcp_tool_approval` and names no tool, but the `tool_call` that precedes it carries
   * `rawInput: {server, tool}`, and the two share a `toolCallId`. So the answer is *this call is
   * `message_agent` on a server this process injected* — a server the user configured is not in
   * that list and still asks. Ticket 02's refusal to vouch for a command by prefix stands
   * untouched: that was the inside of a shell string, this is blobot's own tool by name.
   */
  #isOwnMailboxCall(toolCallId: string | undefined): boolean {
    if (toolCallId === undefined) return false;
    const call = this.#mcpCalls.get(toolCallId);
    if (call?.tool !== 'message_agent') return false;
    return (this.#options.mcpServers ?? []).some((server) => server.name === call.server);
  }

  async #onPermissionRequest(params: PermissionRequestParams): Promise<unknown> {
    if (this.#isOwnMailboxCall(params.toolCall?.toolCallId)) {
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
      message: reason ?? 'the codex process exited',
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
   * The bridge is a pinned dependency of ours, so a version that is not the pin is refused the
   * way Claude's is: it is not the user's binary and there is nothing to be tolerant about.
   *
   * **`authMethods` is deliberately not checked**, which is the one place this differs from the
   * Claude adapter. There, an empty list is the proof the user is logged in. Codex advertises
   * `api-key` whether or not anyone is signed in — measured on a signed-in machine — so the
   * same check would refuse every launch. Being signed in is `codex login status`'s answer
   * (ticket 04), and a session that genuinely cannot authenticate fails at `session/new`.
   */
  #assertBridgeVersion(initialized: InitializeResult): void {
    if (initialized.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `${CODEX_BRIDGE_PACKAGE} negotiated ACP protocol version ${String(initialized.protocolVersion)}, ` +
          `but this adapter is written against ${PROTOCOL_VERSION}.`,
      );
    }
    const version = initialized.agentInfo?.version;
    if (version !== CODEX_BRIDGE_VERSION) {
      throw new Error(
        `${CODEX_BRIDGE_PACKAGE} reports version ${version ?? 'unknown'}, but blobot pins ` +
          `${CODEX_BRIDGE_VERSION}. Re-verify the adapter against the new version before bumping the pin.`,
      );
    }
  }
}

/**
 * An MCP tool call carries no verb, which is DESIGN.md's rule and not this adapter's taste: the
 * name of an MCP tool is its server's, and `read` / `edit` / `run` is blobot paraphrasing work
 * it did not name. Codex types every MCP call as `execute`, so `mcp.blobot.message_agent` drew
 * `run` beside it until this — measured in the real UI, 2026-08-30.
 *
 * Told apart by `rawInput.server`, the same structural fact the mailbox carve-out reads, and
 * never by the title's prefix: a title is a string a provider chooses.
 */
function withoutVerbOnMcp(event: InjectableEvent, update: SessionUpdate): InjectableEvent {
  if (event.type !== 'tool_call_started' && event.type !== 'tool_call_updated') return event;
  if (update.rawInput?.server === undefined) return event;
  return { ...event, kind: 'other' };
}

/** `session/new` and `session/load` answer with the same block, minus the id on a load. */
interface CodexSessionResult {
  readonly sessionId?: string;
  readonly modes?: { readonly currentModeId?: string };
  readonly configOptions?: readonly ConfigOption[];
}

/** The posture blobot expects a fresh session to report. Exported for the live test, which
 *  asserts it against a real Codex rather than against the fake. */
export const EXPECTED_MODE = CODEX_POSTURE_MODE;

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
 * Codex offers `allow_once`, `allow_always` and `reject_once`, and it spells `allow_always` two
 * different ways depending on what is being asked about: `accept_execpolicy_amendment` on a
 * command, `allow_for_session` on an edit. Both arrive as the kind, which is what blobot reads,
 * and ticket 14 gives that kind no path to the UI. An unknown kind is a rejection.
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
