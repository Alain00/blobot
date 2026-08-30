import { AsyncQueue } from '../../mock/async-queue.js';
import type { JsonRpcMessage, LineTransport } from '../acp/jsonrpc.js';
import type { SessionUpdate } from '../acp/wire.js';
import { CODEX_BRIDGE_VERSION } from './stdio-bridge.js';

/**
 * The codex-acp bridge, speaking the protocol without spawning anything.
 *
 * Every shape here was copied off a real one on 2026-08-30 rather than invented: the five
 * config option groups and their ids, the three mode ids, the `$`-prefixed skills beside the
 * bare built-ins, and `authMethods` carrying `api-key` **on a machine that is signed in**,
 * which is the trap that would refuse every launch if the adapter checked it.
 */
export class FakeCodex implements LineTransport {
  sessionId: string;
  readonly received: JsonRpcMessage[] = [];
  cancelled = false;
  /** What the next `session/new` or `session/load` reports as its mode. */
  currentModeId: string;
  /** `session/set_mode` refuses, which is a posture blobot could not confirm. */
  refuseSetMode = false;

  readonly #out = new AsyncQueue<string>();
  readonly #closeListeners = new Set<(reason: string | undefined) => void>();
  readonly #pendingPrompts: JsonRpcMessage[] = [];
  readonly #permissionReplies = new Map<number, (message: JsonRpcMessage) => void>();

  #closed = false;
  #version: string;
  #loadSession: boolean;
  #failLoad: string | undefined;
  #replayOnLoad: readonly SessionUpdate[];
  #agentRequestId = 0;

  constructor(
    options: {
      sessionId?: string;
      version?: string;
      loadSession?: boolean;
      failLoad?: string;
      replayOnLoad?: readonly SessionUpdate[];
      currentModeId?: string;
    } = {},
  ) {
    this.sessionId = options.sessionId ?? 'session_fake_codex';
    this.#version = options.version ?? CODEX_BRIDGE_VERSION;
    this.#loadSession = options.loadSession ?? true;
    this.#failLoad = options.failLoad;
    this.#replayOnLoad = options.replayOnLoad ?? [];
    this.currentModeId = options.currentModeId ?? 'read-only';
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

  /** The command list, which a real bridge sends as an update after the session exists. */
  advertiseCommands(names: readonly string[] = FAKE_COMMANDS): void {
    this.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: names.map((name) => ({ name, description: name })),
    } as SessionUpdate);
  }

  endTurn(stopReason: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeCodex: no prompt is in flight');
    this.#send({ jsonrpc: '2.0', id: prompt.id as number, result: { stopReason } });
  }

  get promptInFlight(): boolean {
    return this.#pendingPrompts.length > 0;
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

  readonly options: Record<string, string> = {
    mode: 'read-only',
    collaboration_mode: 'default',
    model: 'gpt-5.6-sol',
    reasoning_effort: 'medium',
    'fast-mode': 'off',
  };

  #configOptions(): unknown[] {
    const of = (id: string, name: string, values: string[]): unknown => ({
      id,
      name,
      type: 'select',
      currentValue: this.options[id],
      options: values.map((value) => ({ value, name: value })),
    });
    return [
      of('mode', 'Mode', ['read-only', 'agent', 'agent-full-access']),
      of('collaboration_mode', 'Collaboration mode', ['default', 'plan']),
      of('model', 'Model', ['gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.4-mini']),
      of('reasoning_effort', 'Reasoning effort', ['low', 'medium', 'high']),
      of('fast-mode', 'Fast mode', ['on', 'off']),
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
        this.#reply(message, {
          protocolVersion: 1,
          agentInfo: { name: '@agentclientprotocol/codex-acp', title: 'Codex', version: this.#version },
          // Advertised on a signed-in machine. The adapter must not read this as signed out.
          authMethods: [{ id: 'api-key', name: 'API Key' }],
          agentCapabilities: {
            loadSession: this.#loadSession,
            promptCapabilities: { embeddedContext: true, image: true },
            sessionCapabilities: { subagents: {} },
          },
        });
        return;
      case 'session/new':
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
        // The transcript comes back before the reply, which is what makes muting it real work.
        for (const update of this.#replayOnLoad) this.update(update);
        this.#reply(message, {
          modes: { currentModeId: this.currentModeId, availableModes: [] },
          configOptions: this.#configOptions(),
        });
        return;
      }
      case 'session/set_mode': {
        if (this.refuseSetMode) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32603, message: 'mode is not settable' },
          });
          return;
        }
        this.currentModeId = (message.params as { modeId?: string }).modeId ?? this.currentModeId;
        this.options['mode'] = this.currentModeId;
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
        return;
      case 'session/cancel':
        this.cancelled = true;
        return;
      default:
        if (message.id !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: `FakeCodex: ${message.method} not implemented` },
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

/** A slice of the 52 a real session advertised: two vouched, one dropped, two skills. */
export const FAKE_COMMANDS: readonly string[] = [
  'status',
  'compact',
  'logout',
  'goal',
  '$research',
  '$yeet-from-a-plugin',
];
