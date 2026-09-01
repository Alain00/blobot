import { AsyncQueue } from '../../mock/async-queue.js';
import type { JsonRpcMessage, LineTransport } from '../acp/jsonrpc.js';
import type { SessionUpdate } from '../acp/wire.js';
import { ASK_QUESTION_METHOD, CREATE_PLAN_METHOD } from './extensions.js';

/**
 * A `cursor-agent acp` that speaks the protocol without spawning anything.
 *
 * Every shape here was copied off a real `cursor-agent` 2026.08.25 on 2026-08-31 rather than
 * invented (`.scratch/cursor-runtime/issues/01` holds the measurement; the raw frames were
 * logged live), and the unkind details are the point — a tidy fake produces an adapter that
 * shatters on first contact:
 *
 * - **`initialize` carries no `agentInfo`**, so the version is invisible on the wire.
 * - **`promptCapabilities` says `embeddedContext: false`** — Cursor takes images and refuses
 *   embedded text files, the exact mirror of fx.
 * - **Permission option ids are hyphenated** (`allow-once`) while the `kind` field is ACP's
 *   underscored vocabulary, and a `toolCallId` can carry a literal newline.
 * - **A denied command's `tool_call` reports `status: completed`** with a clean `rawOutput` —
 *   the refusal exists only in prose, which `deniedShell` reproduces.
 * - The mode arrives twice, in `modes` and in `configOptions`, and they must agree.
 */
export class FakeCursor implements LineTransport {
  sessionId: string;
  readonly received: JsonRpcMessage[] = [];
  cancelled = false;
  /** What the next `session/new` reports. The measured default is `agent`. */
  currentModeId: string;
  /** What a `session/load` comes back reporting. Whether the real one forgets the mode was
   *  not measured, so the adapter must re-assert either way; `plan` here proves it does. */
  modeAfterLoad: string;

  readonly #out = new AsyncQueue<string>();
  readonly #closeListeners = new Set<(reason: string | undefined) => void>();
  readonly #pendingPrompts: JsonRpcMessage[] = [];
  readonly #agentReplies = new Map<number, (message: JsonRpcMessage) => void>();

  #closed = false;
  #protocolVersion: number;
  #agentInfo: { name: string; version: string } | undefined;
  #loadSession: boolean;
  #failLoad: string | undefined;
  #failNewSession: string | undefined;
  #replayOnLoad: readonly SessionUpdate[];
  #agentRequestId = 0;
  #lastPrompt: JsonRpcMessage | undefined;

  constructor(
    options: {
      sessionId?: string;
      protocolVersion?: number;
      /** Absent by default, as measured. Set it to test the version report path. */
      agentInfo?: { name: string; version: string };
      loadSession?: boolean;
      failLoad?: string;
      /** The signed-out machine, roughly: `session/new` fails and the launch must name the
       *  vendor's own login. The real shape is unobserved (ticket 05), so only the adapter's
       *  side of the sentence is asserted against this. */
      failNewSession?: string;
      replayOnLoad?: readonly SessionUpdate[];
      currentModeId?: string;
      modeAfterLoad?: string;
    } = {},
  ) {
    this.sessionId = options.sessionId ?? 'a252e6a7-fake-cursor';
    this.#protocolVersion = options.protocolVersion ?? 1;
    this.#agentInfo = options.agentInfo;
    this.#loadSession = options.loadSession ?? true;
    this.#failLoad = options.failLoad;
    this.#failNewSession = options.failNewSession;
    this.#replayOnLoad = options.replayOnLoad ?? [];
    this.currentModeId = options.currentModeId ?? 'agent';
    this.modeAfterLoad = options.modeAfterLoad ?? 'agent';
  }

  /** The mode and model the session is holding, as `session/set_*` left them. */
  readonly options: Record<string, string> = { mode: 'agent', model: 'default[]' };

  write(line: string): void {
    for (const raw of line.split('\n')) {
      if (raw.trim().length === 0) continue;
      const message = JSON.parse(raw) as JsonRpcMessage;
      this.received.push(message);
      this.#handle(message);
    }
  }

  lines(): AsyncIterable<string> {
    return this.#out;
  }

  async close(): Promise<void> {
    this.#die(undefined);
  }

  onClose(listener: (reason: string | undefined) => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  update(update: SessionUpdate): void {
    this.#send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: this.sessionId, update },
    });
  }

  /** Cursor advertises its commands the way the others do; a real session sent 130. */
  advertiseCommands(names: readonly string[]): void {
    this.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: names.map((name) => ({ name, description: name })),
    } as SessionUpdate);
  }

  /**
   * The measured trap: a command a `permissions.deny` rule blocks runs no shell and raises no
   * permission request, and its `tool_call` still walks pending → in_progress → `completed`,
   * with a clean-looking `rawOutput`. The refusal is only ever in the message text.
   */
  deniedShell(command: string, toolCallId = `call-denied-0\nfc_denied_0`): void {
    this.update({
      sessionUpdate: 'tool_call',
      toolCallId,
      title: `\`${command}\``,
      kind: 'execute',
      status: 'pending',
      rawInput: { command },
    } as SessionUpdate);
    this.update({
      sessionUpdate: 'tool_call_update',
      toolCallId,
      status: 'in_progress',
    } as SessionUpdate);
    this.update({
      sessionUpdate: 'tool_call_update',
      toolCallId,
      status: 'completed',
      rawOutput: { exitCode: 0, stdout: '', stderr: '' },
    } as SessionUpdate);
  }

  endTurn(stopReason: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeCursor: no prompt is in flight');
    this.#send({ jsonrpc: '2.0', id: prompt.id as number, result: { stopReason } });
  }

  get promptInFlight(): boolean {
    return this.#pendingPrompts.length > 0;
  }

  /** The blocks the adapter actually sent on the last prompt, which is where the persona is. */
  get lastPromptBlocks(): readonly { type?: string; text?: string }[] {
    const prompt = this.#pendingPrompts.at(-1) ?? this.#lastPrompt;
    const params = prompt?.params as { prompt?: { type?: string; text?: string }[] } | undefined;
    return params?.prompt ?? [];
  }

  /** Option ids hyphenated and the kind underscored, exactly as the real wire sends them. */
  requestPermission(params: unknown): Promise<JsonRpcMessage> {
    return this.#agentRequest('session/request_permission', params);
  }

  askQuestion(params: unknown): Promise<JsonRpcMessage> {
    return this.#agentRequest(ASK_QUESTION_METHOD, params);
  }

  createPlan(params: unknown): Promise<JsonRpcMessage> {
    return this.#agentRequest(CREATE_PLAN_METHOD, params);
  }

  sendBlocking(method: string, params: unknown): Promise<JsonRpcMessage> {
    return this.#agentRequest(method, params);
  }

  notify(method: string, params: unknown): void {
    this.#send({ jsonrpc: '2.0', method, params });
  }

  crash(reason = 'the agent process exited with code 1'): void {
    this.#die(reason);
  }

  #agentRequest(method: string, params: unknown): Promise<JsonRpcMessage> {
    const id = this.#agentRequestId;
    this.#agentRequestId += 1;
    const reply = new Promise<JsonRpcMessage>((resolve) => {
      this.#agentReplies.set(id, resolve);
    });
    this.#send({ jsonrpc: '2.0', id, method, params });
    return reply;
  }

  #configOptions(): unknown[] {
    return [
      {
        id: 'mode',
        name: 'Mode',
        description: 'Controls how the agent executes tasks',
        category: 'mode',
        type: 'select',
        currentValue: this.options['mode'],
        options: [
          { value: 'agent', name: 'Agent' },
          { value: 'plan', name: 'Plan' },
          { value: 'ask', name: 'Ask' },
        ],
      },
      {
        id: 'model',
        name: 'Model',
        description: 'Controls which model variant is used for responses',
        category: 'model',
        type: 'select',
        currentValue: this.options['model'],
        options: [
          { value: 'default[]', name: 'Auto' },
          { value: 'composer-2.5[fast=true]', name: 'composer-2.5' },
          { value: 'gpt-5.5[context=272k,reasoning=medium,fast=false]', name: 'gpt-5.5' },
        ],
      },
    ];
  }

  #modes(current: string): unknown {
    return {
      currentModeId: current,
      availableModes: [
        { id: 'agent', name: 'Agent', description: 'Full agent capabilities with tool access' },
        { id: 'plan', name: 'Plan', description: 'Read-only mode for planning' },
        { id: 'ask', name: 'Ask', description: 'Q&A mode - no edits or command execution' },
      ],
    };
  }

  #handle(message: JsonRpcMessage): void {
    if (message.method === undefined) {
      const resolve = this.#agentReplies.get(message.id as number);
      if (resolve !== undefined) {
        this.#agentReplies.delete(message.id as number);
        resolve(message);
      }
      return;
    }
    switch (message.method) {
      case 'initialize':
        this.#reply(message, {
          protocolVersion: this.#protocolVersion,
          ...(this.#agentInfo === undefined ? {} : { agentInfo: this.#agentInfo }),
          agentCapabilities: {
            loadSession: this.#loadSession,
            mcpCapabilities: { http: true, sse: true },
            promptCapabilities: { audio: false, embeddedContext: false, image: true },
            sessionCapabilities: { list: {} },
          },
          authMethods: [
            {
              id: 'cursor_login',
              name: 'Cursor Login',
              description: 'Authenticate using existing Cursor login credentials.',
            },
          ],
        });
        return;
      case 'session/new':
        if (this.#failNewSession !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32000, message: this.#failNewSession },
          });
          return;
        }
        this.options['mode'] = this.currentModeId;
        this.#reply(message, {
          sessionId: this.sessionId,
          modes: this.#modes(this.currentModeId),
          configOptions: this.#configOptions(),
        });
        return;
      case 'session/load': {
        if (this.#failLoad !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32602, message: this.#failLoad },
          });
          return;
        }
        const asked = (message.params as { sessionId?: string } | undefined)?.sessionId;
        if (asked !== undefined) this.sessionId = asked;
        for (const update of this.#replayOnLoad) this.update(update);
        this.options['mode'] = this.modeAfterLoad;
        this.#reply(message, {
          modes: this.#modes(this.modeAfterLoad),
          configOptions: this.#configOptions(),
        });
        return;
      }
      case 'session/set_mode': {
        const wanted = (message.params as { modeId?: string } | undefined)?.modeId;
        if (wanted !== undefined) this.options['mode'] = wanted;
        this.#reply(message, {});
        return;
      }
      case 'session/set_config_option': {
        const params = message.params as { configId?: string; value?: string };
        this.options[params?.configId ?? ''] = params?.value ?? '';
        this.#reply(message, { configOptions: this.#configOptions() });
        return;
      }
      case 'session/prompt':
        this.#pendingPrompts.push(message);
        this.#lastPrompt = message;
        return;
      case 'session/cancel':
        this.cancelled = true;
        return;
      default:
        if (message.id !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: `FakeCursor: ${message.method} not implemented` },
          });
        }
    }
  }

  #reply(request: JsonRpcMessage, result: unknown): void {
    this.#send({ jsonrpc: '2.0', id: request.id as number, result });
  }

  #send(message: JsonRpcMessage): void {
    if (this.#closed) return;
    this.#out.push(JSON.stringify(message));
  }

  #die(reason: string | undefined): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#out.close();
    for (const listener of this.#closeListeners) listener(reason);
  }
}

/** A slice of the 130 a real session advertised, names verbatim from the measured
 *  `available_commands_update` frame: vendor surface a palette must not offer. */
export const FAKE_ADVERTISED_COMMANDS: readonly string[] = [
  'worktree',
  'apply-worktree',
  'autopilot',
  'shell',
  'update-cli-config',
];
