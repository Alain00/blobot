import type { Clock } from '../../clock.js';
import { DEFAULT_TRUST, type TrustLevel } from '../../trust.js';
import { SystemClock } from '../../clock.js';
import type { AgentEvent } from '../../events.js';
import { assembleMessages } from '../../message-assembler.js';
import { AsyncQueue } from '../../mock/async-queue.js';
import type { InjectableEvent } from '../../mock/mock-agent-runtime.js';
import { sameCommands } from '../../commands.js';
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
import { applyOptionChoices, optionGroupsFrom } from '../acp/config-options.js';
import { JsonRpcConnection, type LineTransport } from '../acp/jsonrpc.js';
import {
  BRIDGE_PACKAGE,
  BRIDGE_VERSION,
  spawnClaudeBridge,
  type SpawnBridge,
} from './stdio-bridge.js';
import { offerableNames, paletteOf } from './palette.js';
import { LocalMachine } from '../../machines/local-machine.js';
import { CLAUDE_MACHINE_IMAGE } from './image.js';
import { claudeSandboxFor } from './sandbox.js';
import type { Machine } from '../../machines/machine.js';
import { MACHINE_CLIENT_CAPABILITIES } from '../acp/client-capabilities.js';
import {
  CLAUDE_POSTURE_MODE,
  claudeModeFor,
  claudeModeNeedsProbe,
  refusedTools,
  vouchedTools,
} from './permissions.js';
import { PictureWatch } from '../acp/pictures.js';
import { commandsFrom, stopReasonOf, translateSessionUpdate } from '../acp/session-updates.js';
import { withTarget } from '../acp/target.js';
import { withoutToolVerb } from './tool-title.js';
import { ACCEPTS_NOTHING, acceptsOf, contentBlockOf } from '../acp/attachments.js';
import type {
  InitializeResult,
  NewSessionResult,
  PermissionRequestParams,
  PromptResult,
  SessionModeWire,
  SessionNotification,
} from '../acp/wire.js';

const PROTOCOL_VERSION = 1;

/**
 * The mode is now the trust level's, not a constant. The bridge discards `permissionMode`,
 * `canUseTool` and `allowDangerouslySkipPermissions`, so `session/set_mode` is still the only
 * lever we have; what changed on 2026-08-31 is that `unattended` reaches for `auto` and the other
 * three levels keep `default`. `acceptEdits`, `dontAsk`, `plan` and `bypassPermissions` remain
 * unoffered. See `permissions.ts` and ticket 14's reopened section.
 */

/**
 * Which advertised option groups blobot hands to the user.
 *
 * The bridge advertises five. Two are withheld and both for the same reason: they are not
 * settings, they are decisions blobot has already made. `mode` is ticket 14's permission
 * posture, and offering it would put `bypassPermissions` in a dropdown. `agent` picks a
 * different persona, and the persona is composed by core out of a Team and a roster.
 *
 * Measured on the pinned bridge, 2026-08-30: `model` (5), `effort` (6), `fast` (on/off).
 */
const SURFACED_OPTIONS = ['model', 'effort', 'fast'];

/**
 * Claude Code ships its own inter-session messaging — `SendMessage` and `ListAgents`, which
 * reach *other Claude sessions on the machine*. Observed live: asked to message Bob, Alice
 * ignored blobot's tool, called `ListAgents`, found three unrelated Claude sessions and told
 * the user Bob was unreachable.
 *
 * They are disallowed for a blobot agent: a permanent rule says **the orchestrator owns
 * agent-to-agent communication**, and these two tools are a second, unowned channel for
 * exactly that — messages that never reach the mailbox, never persist, and never appear in
 * the UI.
 *
 * This once carried a note that it was "not a retreat from ticket 07's inherit the user's
 * whole setup". ADR-0003 has since made that retreat deliberately and at the right altitude:
 * an agent inherits the project's config, not the operator's. See `SETTING_SCOPES`.
 */
const SHADOWING_TOOLS = ['SendMessage', 'ListAgents'];

/**
 * Which settings scopes a blobot agent loads. See
 * `docs/adr/0003-what-an-agent-inherits.md`, including its amendment.
 *
 * All three, which is also the bridge's default — stated here anyway, because it was chosen
 * rather than inherited, and because it was briefly `['project','local']` and the reason it
 * changed back is worth keeping next to the line.
 *
 * The first decision dropped `user` on the strength of a measurement: 223 advertised commands,
 * of which 175 came from that scope. But 140 of those were a single installed **plugin** and
 * only **37** were skills the operator had actually written, and those two populations have
 * nothing in common. Dropping the scope to be rid of the plugin also took the author's own
 * work, and `settingSources` is too coarse to separate them.
 *
 * So the separation moved to where it can actually be made: `palette.ts` enumerates
 * `~/.claude/skills` and the workspace's `.claude/` from disk, because a plugin installs into
 * neither. The scope decides what an agent *can do*; the palette decides what blobot *offers*.
 * Conflating those two was the error.
 *
 * The cost is real and is tracked in `.scratch/runtime-posture/`: `user` scope also restores
 * the operator's global CLAUDE.md, settings and hooks for every agent.
 */
const SETTING_SCOPES = ['user', 'project', 'local'];

/**
 * Everything this session is allowed to do without asking: blobot's posture, plus its mailbox.
 *
 * The servers blobot injects are pre-approved by name, as `mcp__<server>`. Ticket 14 assumed MCP
 * tools ride an ungated path — true of OpenCode, and true of the `auto` mode research 02 happened
 * to observe. It is **not** true of the `default` mode that same ticket forces on us: Claude
 * prompts for `mcp__blobot__message_agent` like any other tool, and an unattended Alice messaging
 * Bob then stalls on a permission request nobody answers.
 *
 * Only what blobot itself passed in `session/new.mcpServers` — never the user's own inherited
 * servers, which keep prompting exactly as ticket 14 describes.
 *
 * `vouchedTools` is the rest of the posture, and it arrives by the same route because that route
 * is the only one the bridge does not discard. See `permissions.ts` and ticket 14's 2026-08-30
 * amendment: without it `default` mode prompted on every edit inside the agent's own worktree.
 * The mailbox is added whatever the trust level, including `careful`, where the vouched list is
 * empty: an agent that had to ask permission to answer its teammate would not be careful.
 */
function preApprovedTools(servers: readonly McpServerConfig[], trust: TrustLevel): string[] {
  return [...vouchedTools(trust), ...servers.map((server) => `mcp__${server.name}`)];
}

/**
 * An MCP server handed to the session. Ticket 15's loopback `message_agent` endpoint is the
 * `http` variant; `stdio` is here because ACP offers it and someone will want it.
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

export interface ClaudeAgentRuntimeOptions {
  readonly agentId: string;
  /** The agent's own worktree. One process, one workspace. */
  readonly cwd: string;
  /** Host-derived Git metadata for this Agent’s linked worktrees. */
  readonly gitDirectories?: readonly string[];
  /** Composed by core (`composePersona`); injected here by the mechanism Claude offers. */
  readonly persona?: string;
  /**
   * Bring this agent back with its memory rather than as a stranger. The provider's own
   * session id, stored when the agent last ran. A session the provider no longer has is not
   * an error: the runtime falls back to a new one, which is exactly where it was before.
   */
  readonly resumeSessionId?: string;
  /**
   * The user's own choices among what this runtime advertises, keyed by the provider's group
   * id. Applied after the session exists: `_meta.claudeCode.options.model` is accepted and
   * then **ignored** — measured, asking for `sonnet` and getting `opus[1m]` back.
   */
  readonly options?: RuntimeOptionChoices;
  readonly mcpServers?: readonly McpServerConfig[];
  /**
   * How much of this agent's own work blobot vouches for. Absent is `normal`, which is what
   * every agent ran as before the level was a choice. See `trust.ts`.
   */
  readonly trust?: TrustLevel;
  readonly clock?: Clock;
  /** The user's own `claude`. Defaults to `CLAUDE_CODE_EXECUTABLE`, then `PATH`. */
  readonly claudeExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly machine?: Machine;
  /** Injected in tests: a transport that speaks the protocol without spawning anything. */
  readonly spawn?: SpawnBridge;
  readonly onStderr?: (line: string) => void;
  /**
   * Where a Picture's bytes go. Absent is a runtime with nowhere to put one, which is reported
   * as such rather than dropped: `.scratch/agent-media/10`.
   */
  readonly pictures?: PictureStore;
}

/**
 * Claude Code behind `AgentRuntime`, over `@agentclientprotocol/claude-agent-acp` on stdio.
 *
 * Everything Claude-shaped stops here: the off-spec `_meta` persona, the forced permission
 * mode, the eleven `sessionUpdate` kinds, the `stopReason` that is an RPC reply rather than an
 * event. Nothing above this class can tell which provider an agent is.
 */
export class ClaudeAgentRuntime implements AgentRuntime {
  readonly machineImage = CLAUDE_MACHINE_IMAGE;
  readonly agentId: string;

  readonly #options: ClaudeAgentRuntimeOptions;
  readonly #clock: Clock;
  readonly #spawn: SpawnBridge;
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
  /** What this session takes attached to a prompt, read off `initialize`. */
  #accepts: AttachmentSupport = ACCEPTS_NOTHING;
  #projectNames: ReadonlySet<string> | undefined;

  constructor(options: ClaudeAgentRuntimeOptions) {
    this.agentId = options.agentId;
    this.#options = {
      ...options,
      machine: options.machine ?? new LocalMachine({ agentId: options.agentId, workspacePath: options.cwd }),
    };
    this.#pictures = new PictureWatch(options.pictures);
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

  /** What this session was launched vouching for. Fixed for its life: `allowedTools` is a
   *  `session/new` parameter, so a changed level reaches an agent at its next start. */
  get trust(): TrustLevel {
    return this.#options.trust ?? DEFAULT_TRUST;
  }

  /** Whether the agent came back with its memory. False after a fallback to a new session,
   *  which is the difference between a teammate who remembers yesterday and one who does not. */
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
      clientCapabilities: MACHINE_CLIENT_CAPABILITIES,
    });
    assertBridgeVersion(initialized);
    assertAuthenticated(initialized);

    const wanted = this.#options.resumeSessionId;
    this.#accepts = acceptsOf(initialized.agentCapabilities);
    const canLoad = initialized.agentCapabilities?.loadSession === true;
    const session =
      wanted === undefined || wanted === '' || !canLoad
        ? await this.#newSession(connection)
        : await this.#loadSession(connection, wanted);
    if (session.sessionId === undefined) {
      throw new Error(`${this.agentId}: the bridge returned no sessionId`);
    }
    this.#sessionId = session.sessionId;
    this.#modeId = session.modes?.currentModeId;
    await this.#applyPermissionMode(session.modes?.availableModes);
    this.#optionGroups = optionGroupsFrom(session.configOptions, SURFACED_OPTIONS);
    this.#optionGroups = await applyOptionChoices(
      connection,
      this.#sessionId,
      this.#options.options ?? {},
      this.#optionGroups,
      (line) => this.#options.onStderr?.(line),
    );
  }

  #newSession(connection: JsonRpcConnection): Promise<NewSessionResult> {
    return connection.request<NewSessionResult>('session/new', this.#sessionParams());
  }

  /**
   * Resume, with two traps that are both observed rather than guessed (research 02 §2.8 and
   * research 15 §7).
   *
   * `mcpServers` must be re-supplied. Omit it and `message_agent` is simply gone, while the
   * replayed transcript still shows the agent using it successfully a moment ago — so it reads
   * as the tool breaking rather than as a tool never offered.
   *
   * And the load replays the whole prior transcript back as `session/update` notifications
   * before it returns. That transcript is already in the store and already on screen, so the
   * stream is muted while the load runs. Letting it through would double every message the
   * agent has ever said, once per launch.
   */
  async #loadSession(connection: JsonRpcConnection, sessionId: string): Promise<NewSessionResult> {
    this.#replaying = true;
    try {
      const loaded = await connection.request<NewSessionResult>('session/load', {
        sessionId,
        ...this.#sessionParams(),
      });
      this.#resumed = true;
      // `session/load` answers with `modes` and, in the runs we have seen, the id we asked
      // for. Trusting our own id if it answers with none keeps a resumed agent addressable.
      return { sessionId, ...loaded };
    } catch (error) {
      // A session the provider has forgotten, or a transcript that has aged out. The agent
      // starts fresh against a transcript the store still has: worse than resuming, and far
      // better than a team that will not launch.
      this.#options.onStderr?.(
        `blobot: could not resume ${sessionId} (${error instanceof Error ? error.message : String(error)}); starting a new session`,
      );
      return this.#newSession(connection);
    } finally {
      this.#replaying = false;
    }
  }

  /** Identical on `session/new` and `session/load`, because the second is a resume of the
   *  first and the bridge fingerprints these params to decide whether to tear the query down. */
  #sessionParams(): Record<string, unknown> {
    return {
      cwd: this.#options.cwd,
      mcpServers: (this.#options.mcpServers ?? []).map(toAcpMcpServer),
      _meta: {
        // Off-spec, and it stays in here: `_meta` is an adapter extension OpenCode ignores.
        ...(this.#options.persona === undefined ? {} : { systemPrompt: this.#options.persona }),
        claudeCode: {
          options: {
            disallowedTools: [...SHADOWING_TOOLS, ...refusedTools(this.trust)],
            settingSources: SETTING_SCOPES,
            allowedTools: preApprovedTools(this.#options.mcpServers ?? [], this.trust),
            sandbox: claudeSandboxFor(this.#options.machine?.kind ?? 'local', this.#options.gitDirectories),
          },
        },
      },
    };
  }

  /**
   * Ticket 14's trap, generalised: re-send this after every `session/load` or resume, because
   * a restored session comes back in whatever mode it was saved in.
   *
   * **Probed, not assumed, for anything but `default`.** Claude advertises `auto` *"only when the
   * model supports it"*, so an `unattended` agent on a model without a classifier would otherwise
   * have been put in a mode that does not exist and told nobody. `wire.ts` grew `availableModes`
   * for exactly this. When the mode blobot wants is not on offer it falls back to `default` and
   * says so on stderr, which reaches the user as the runtime's own voice.
   *
   * Deliberately **not** fatal, which is where this parts company with Codex's `#assertPosture`.
   * That one throws because its fallback would be *looser* than intended and ticket 14 exists to
   * prevent exactly that. Here the fallback is *stricter*: the agent asks the user instead of
   * asking a classifier. Refusing to launch would punish somebody for their model choice, and the
   * failure it is protecting against cannot happen in this direction.
   */
  async #applyPermissionMode(available?: readonly SessionModeWire[]): Promise<void> {
    const connection = this.#connection;
    if (connection === undefined) return;
    const wanted = claudeModeFor(this.trust);
    const offered =
      available === undefined || !claudeModeNeedsProbe(wanted)
        ? true
        : available.some((mode) => mode.id === wanted);
    const modeId = offered ? wanted : CLAUDE_POSTURE_MODE;
    if (!offered) {
      this.#options.onStderr?.(
        `blobot: this model does not offer the ${wanted} permission mode, so ${this.agentId} ` +
          `runs as ${CLAUDE_POSTURE_MODE} and will ask you instead`,
      );
    }
    await connection.request('session/set_mode', { sessionId: this.#sessionId, modeId });
    this.#modeId = modeId;
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
      this.#emitTo(queue, { type: 'error', message: 'the bridge is not connected', fatal: true });
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

  /** True: the persona is a `session/new` parameter, so a session carries the text it was
   *  opened with and a fresh one takes whatever the definition says today. */
  get personaIsSessionBound(): boolean {
    return true;
  }

  /**
   * Close this session and open a fresh one, without respawning the bridge.
   *
   * The process is not the problem and killing it would cost a second and a half for nothing:
   * what has to go is the conversation, which lives on the session id. Everything the session
   * was launched with is re-supplied here rather than inherited, because `session/new` is the
   * only place any of it can be said — the persona, ticket 14's mode, and the user's option
   * choices are all `session/new` parameters or `set_config_option` calls against a session id
   * that is about to change.
   *
   * The old session is closed **first**. A bridge holding two live sessions for one agent is
   * two sets of tools pointed at one worktree, and the second one would still be there after a
   * failure that leaves us reporting the session was kept.
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
        throw new Error(`${this.agentId}: the bridge returned no sessionId`);
      }
      this.#sessionId = session.sessionId;
      this.#modeId = session.modes?.currentModeId;
      // A fresh session is not a resumed one, and the surface that says whether an agent came
      // back knowing yesterday must not keep saying yes about a session that knows nothing.
      this.#resumed = false;
      await this.#applyPermissionMode(session.modes?.availableModes);
      this.#optionGroups = await applyOptionChoices(
        connection,
        this.#sessionId,
        this.#options.options ?? {},
        optionGroupsFrom(session.configOptions, SURFACED_OPTIONS),
        (line) => this.#options.onStderr?.(line),
      );
    } catch (error) {
      // Dead rather than ready: the old session is closed and the new one never opened, so
      // there is nothing here to prompt and saying otherwise would strand the next turn.
      this.#setLifecycle('dead');
      throw error;
    }
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

  get availableCommands(): readonly AvailableCommand[] {
    return this.#commands;
  }

  /** What this session lets the user choose, minus the two groups blobot decides itself. */
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

  /**
   * Replace, never merge, and stay quiet when nothing actually moved.
   *
   * The filter runs here rather than at the consumer, so nothing above the adapter ever holds
   * the unfiltered list. That is the provider rule doing its job: the names in
   * `VOUCHED_BUILT_INS` are Claude Code's, and a component that saw them would know which
   * provider it was rendering.
   */
  #setCommands(advertised: readonly AvailableCommand[]): void {
    const commands = paletteOf(advertised, this.#projectCommands());
    if (sameCommands(this.#commands, commands)) return;
    this.#commands = commands;
    for (const listener of this.#commandListeners) listener(commands);
  }

  /** Read once. A skill added to the workspace mid-session needs a restart to be offered,
   *  which is the same bargain the provider's own `/reload-skills` exists to make. */
  #projectCommands(): ReadonlySet<string> {
    this.#projectNames ??= offerableNames(this.#options.cwd, this.#options.machine?.kind === 'box' ? this.#options.machine.location() : undefined);
    return this.#projectNames;
  }

  #onSessionUpdate(notification: SessionNotification): void {
    const update = notification.update;
    if (update === undefined) return;

    // Commands pass both guards below on purpose. They are current state rather than
    // transcript, so a menu advertised while a resume replays describes the session we are
    // about to use — and during that replay `#sessionId` is still empty, because it is not
    // assigned until `session/load` returns.
    const commands = commandsFrom(update);
    if (commands !== undefined) {
      this.#setCommands(commands);
      return;
    }

    // The replay of a resumed transcript, which every listener already has. See `#loadSession`.
    if (this.#replaying) return;
    if (notification.sessionId !== this.#sessionId) return;
    if (update.sessionUpdate === 'current_mode_update') {
      // Dropped from the stream — Claude-only state — but worth knowing, because a mode that
      // drifts off `default` is the posture quietly failing.
      this.#modeId = update.currentModeId ?? this.#modeId;
      return;
    }
    // Two normalizations, in order and for different reasons. `withTarget` is the shared one:
    // where ACP says which paths a call is about, that is the title, so both runtimes say the
    // same thing. `withoutToolVerb` is Claude's own, and covers what is left — a call with no
    // location, whose title is still `Edit` or `Read File` while its arguments stream.
    for (const picture of this.#pictures.from(update, this.agentId, this.#clock.now()))
      this.#emit(picture);
    for (const event of translateSessionUpdate(update))
      this.#emit(withoutToolVerb(withTarget(event, update, this.#options.cwd), update));
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
              ...(option.kind === 'allow_always'
                ? {
                    description: 'Claude can save approval rules in .claude/settings.local.json in this agent\'s working folder. You can remove saved rules from that file; when the change takes effect depends on the runtime.',
                  }
                : {}),
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

/**
 * For stdio, `type` is deliberately omitted: 0.70.0 reads an absent type as stdio, and ticket
 * 01's "omitting it drops the server" trap was observed against the long-dead 0.16.2.
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
