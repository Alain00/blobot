import { AsyncQueue } from '../../mock/async-queue.js';
import type { JsonRpcMessage, LineTransport } from '../acp/jsonrpc.js';
import type { SessionUpdate } from '../acp/wire.js';
import { VERIFIED_FX_VERSION } from './stdio.js';

/**
 * `fx acp`, speaking the protocol without spawning anything.
 *
 * Every shape here was copied off a real `fx` 0.0.7 on 2026-08-31 rather than invented
 * (`.scratch/fx-runtime/research/01-acp-surface.md` quotes the frames), and four of them are
 * traps a kinder fake would hide:
 *
 * - **`promptCapabilities` says `image: false`.** fx is the first real runtime that refuses a
 *   kind of attachment blobot supports, and until now only `MockAgentRuntime` said no.
 * - **`authMethods` is empty and `initialize` itself can fail.** An unauthenticated fx does not
 *   advertise a way in, it refuses the handshake, which is what `failInitialize` reproduces.
 * - **The mode comes back in two places at once**, `modes.currentModeId` and a `mode` config
 *   option, and they must agree.
 * - **A resume forgets the mode.** `session/load` reports `ask` however the session was set,
 *   which is what makes re-asserting the posture real work rather than a formality.
 */
export class FakeFx implements LineTransport {
  sessionId: string;
  readonly received: JsonRpcMessage[] = [];
  cancelled = false;
  /** What the next `session/new` reports. A load always reports `ask`, as the real one does. */
  currentModeId: string;
  /** `session/set_config_option` refuses the mode. Reported, never fatal: the posture that
   *  matters is `FX_PERMISSION_MODE` on the process, which is set before the child exists. */
  refuseSetMode = false;

  readonly #out = new AsyncQueue<string>();
  readonly #closeListeners = new Set<(reason: string | undefined) => void>();
  readonly #pendingPrompts: JsonRpcMessage[] = [];
  readonly #permissionReplies = new Map<number, (message: JsonRpcMessage) => void>();

  #closed = false;
  #version: string;
  #loadSession: boolean;
  #failLoad: string | undefined;
  #failInitialize: string | undefined;
  #replayOnLoad: readonly SessionUpdate[];
  #agentRequestId = 0;

  constructor(
    options: {
      sessionId?: string;
      version?: string;
      loadSession?: boolean;
      failLoad?: string;
      /** The unauthenticated machine: `initialize` fails and nothing else can be called. */
      failInitialize?: string;
      replayOnLoad?: readonly SessionUpdate[];
      currentModeId?: string;
    } = {},
  ) {
    this.sessionId = options.sessionId ?? 'session_fake_fx';
    this.#version = options.version ?? VERIFIED_FX_VERSION;
    this.#loadSession = options.loadSession ?? true;
    this.#failLoad = options.failLoad;
    this.#failInitialize = options.failInitialize;
    this.#replayOnLoad = options.replayOnLoad ?? [];
    this.currentModeId = options.currentModeId ?? 'ask';
  }

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

  /** fx pushes this immediately after `session/new`, before any prompt. */
  advertiseCommands(names: readonly string[] = FAKE_COMMANDS): void {
    this.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: names.map((name) => ({ name, description: name })),
    } as SessionUpdate);
  }

  endTurn(stopReason: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeFx: no prompt is in flight');
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

  requestPermission(params: unknown): Promise<JsonRpcMessage> {
    const id = this.#agentRequestId;
    this.#agentRequestId += 1;
    const reply = new Promise<JsonRpcMessage>((resolve) => {
      this.#permissionReplies.set(id, resolve);
    });
    this.#send({ jsonrpc: '2.0', id, method: 'session/request_permission', params });
    return reply;
  }

  crash(reason = 'the agent process exited with code 1'): void {
    this.#die(reason);
  }

  /** The three fx advertises, with the real defaults. 234 models are cut to three. */
  readonly options: Record<string, string> = {
    provider: 'gateway',
    model: 'moonshotai/kimi-k3',
    mode: 'ask',
  };

  #lastPrompt: JsonRpcMessage | undefined;

  #configOptions(): unknown[] {
    const of = (id: string, name: string, values: string[]): unknown => ({
      id,
      name,
      type: 'select',
      currentValue: this.options[id],
      options: values.map((value) => ({ value, name: value })),
    });
    return [
      of('provider', 'Provider', ['gateway', 'codex', 'grok']),
      of('model', 'Model', ['moonshotai/kimi-k3', 'anthropic/claude-sonnet-4.5', 'openai/gpt-5.5']),
      of('mode', 'Mode', ['code', 'ask']),
    ];
  }

  #handle(message: JsonRpcMessage): void {
    if (message.method === undefined) {
      const resolve = this.#permissionReplies.get(message.id as number);
      if (resolve !== undefined) {
        this.#permissionReplies.delete(message.id as number);
        resolve(message);
      }
      return;
    }
    switch (message.method) {
      case 'initialize':
        if (this.#failInitialize !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32600, message: this.#failInitialize },
          });
          return;
        }
        this.#reply(message, {
          protocolVersion: 1,
          agentInfo: { name: 'fx', title: 'fx', version: this.#version },
          // Empty on a signed-in machine and on a signed-out one alike: fx has no ACP auth path.
          authMethods: [],
          agentCapabilities: {
            loadSession: this.#loadSession,
            // The real answer, and the reason the composer refuses a screenshot on fx.
            promptCapabilities: { image: false, audio: false, embeddedContext: true },
            mcpCapabilities: { http: true, sse: true },
            sessionCapabilities: { list: {}, resume: {}, close: {} },
          },
        });
        return;
      case 'session/new':
        this.options['mode'] = this.currentModeId;
        this.#reply(message, {
          sessionId: this.sessionId,
          modes: { currentModeId: this.currentModeId, availableModes: [] },
          configOptions: this.#configOptions(),
        });
        return;
      case 'session/load': {
        if (this.#failLoad !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32603, message: this.#failLoad },
          });
          return;
        }
        const asked = (message.params as { sessionId?: string } | undefined)?.sessionId;
        if (asked !== undefined) this.sessionId = asked;
        for (const update of this.#replayOnLoad) this.update(update);
        // Measured: a resumed session comes back `ask` however it was left.
        this.currentModeId = 'ask';
        this.options['mode'] = 'ask';
        this.#reply(message, {
          modes: { currentModeId: 'ask', availableModes: [] },
          configOptions: this.#configOptions(),
        });
        return;
      }
      case 'session/set_config_option': {
        const params = message.params as { configId?: string; value?: string };
        if (params?.configId === 'mode' && this.refuseSetMode) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32603, message: 'mode is not settable' },
          });
          return;
        }
        this.options[params?.configId ?? ''] = params?.value ?? '';
        if (params?.configId === 'mode') this.currentModeId = params.value ?? this.currentModeId;
        this.#reply(message, { configOptions: this.#configOptions() });
        return;
      }
      case 'session/close':
        this.#reply(message, {});
        return;
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
            error: { code: -32601, message: `FakeFx: ${message.method} not implemented` },
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

/** A slice of the eighteen a real session advertised: two vouched, three refused. */
export const FAKE_COMMANDS: readonly string[] = [
  'status',
  'compact',
  'allowlist',
  'settings',
  'reset',
];
