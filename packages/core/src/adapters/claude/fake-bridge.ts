import { AsyncQueue } from '../../mock/async-queue.js';
import type { JsonRpcMessage, LineTransport } from '../acp/jsonrpc.js';
import { BRIDGE_VERSION } from './stdio-bridge.js';
import type { SessionUpdate } from '../acp/wire.js';

/**
 * A bridge that speaks the protocol without spawning anything.
 *
 * It exists so the adapter's contract — the same behaviours `MockAgentRuntime` owes the
 * orchestrator — is testable at wire level: the framing, the id spaces, the turn boundary
 * that is an RPC reply. What it cannot prove is that the real bridge behaves this way; that
 * is `live.test.ts`'s job, and the transcripts in `research/02-claude-code-acp.md`.
 */
export class FakeBridge implements LineTransport {
  /** The session it is currently serving. A `session/load` adopts the id it was asked for,
   *  because that is the id the real bridge then stamps on every notification. */
  sessionId: string;
  readonly received: JsonRpcMessage[] = [];

  readonly #out = new AsyncQueue<string>();
  readonly #closeListeners = new Set<(reason: string | undefined) => void>();
  readonly #pendingPrompts: JsonRpcMessage[] = [];

  cancelled = false;

  #closed = false;
  #version: string;
  #authMethods: unknown[];
  #loadSession: boolean;
  #failLoad: string | undefined;
  #replayOnLoad: readonly SessionUpdate[];
  #agentRequestId = 0;

  constructor(
    options: {
      sessionId?: string;
      version?: string;
      authMethods?: unknown[];
      /** What `initialize` advertises. A bridge that cannot resume is a real deployment. */
      loadSession?: boolean;
      /** `session/load` refuses with this message: the session the provider has forgotten. */
      failLoad?: string;
      /** What a load replays before it answers, the way the real bridge replays a transcript. */
      replayOnLoad?: readonly SessionUpdate[];
    } = {},
  ) {
    this.sessionId = options.sessionId ?? 'session_fake';
    this.#version = options.version ?? BRIDGE_VERSION;
    this.#authMethods = options.authMethods ?? [];
    this.#loadSession = options.loadSession ?? true;
    this.#failLoad = options.failLoad;
    this.#replayOnLoad = options.replayOnLoad ?? [];
  }

  // ------------------------------------------------------------------ LineTransport

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

  // ------------------------------------------------------------------ driving a turn

  /** Push a `session/update` as the bridge would during a turn. */
  update(update: SessionUpdate): void {
    this.#send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: this.sessionId, update },
    });
  }

  /** Reply to the in-flight `session/prompt`, ending the turn. */
  endTurn(stopReason: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeBridge: no prompt is in flight');
    this.#send({ jsonrpc: '2.0', id: prompt.id as number, result: { stopReason } });
  }

  failPrompt(message: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeBridge: no prompt is in flight');
    this.#send({
      jsonrpc: '2.0',
      id: prompt.id as number,
      error: { code: -32603, message },
    });
  }

  get promptInFlight(): boolean {
    return this.#pendingPrompts.length > 0;
  }

  /**
   * Ask for permission the way the bridge does — from **its own id space, starting at 0**,
   * which is the trap a client keyed on a single id Map walks straight into.
   */
  requestPermission(params: unknown): Promise<JsonRpcMessage> {
    const id = this.#agentRequestId;
    this.#agentRequestId += 1;
    const reply = new Promise<JsonRpcMessage>((resolve) => {
      this.#permissionReplies.set(id, resolve);
    });
    this.#send({ jsonrpc: '2.0', id, method: 'session/request_permission', params });
    return reply;
  }

  /** The process dies: what the runtime sees when the bridge crashes. */
  crash(reason = 'the bridge process exited with code 1'): void {
    this.#die(reason);
  }

  readonly #permissionReplies = new Map<number, (message: JsonRpcMessage) => void>();

  /**
   * What the session is currently set to, and which value it will refuse.
   *
   * Both are observed rather than invented: the bridge advertises five option groups and
   * accepts `session/set_config_option` for them, and it refused `fast=on` while the model was
   * `haiku` and accepted it a moment later under `sonnet` — so an option can be legal, offered,
   * and still refused because of another option's value.
   */
  readonly options: Record<string, string> = {
    mode: 'auto',
    model: 'opus[1m]',
    effort: 'medium',
    fast: 'off',
    agent: 'default',
  };

  readonly refuse: Record<string, string> = {};

  #configOptions(): unknown[] {
    const of = (id: string, name: string, values: string[]): unknown => ({
      id,
      name,
      type: 'select',
      currentValue: this.options[id],
      options: values.map((value) => ({ value, name: value })),
    });
    return [
      // `mode` and `agent` are advertised and must never reach the user: one is ticket 14's
      // posture and the other is the persona.
      of('mode', 'Permission Mode', ['auto', 'default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions']),
      of('model', 'Model', ['default', 'opus[1m]', 'claude-fable-5[1m]', 'sonnet', 'haiku']),
      of('effort', 'Reasoning', ['default', 'low', 'medium', 'high', 'xhigh', 'max']),
      of('fast', 'Fast Mode', ['on', 'off']),
      of('agent', 'Agent', ['default', 'posthog:error-analyzer']),
    ];
  }

  // ------------------------------------------------------------------ internals

  #handle(message: JsonRpcMessage): void {
    if (message.method === undefined) {
      // A reply to one of our own agent-side requests.
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
          agentInfo: { name: '@agentclientprotocol/claude-agent-acp', version: this.#version },
          authMethods: this.#authMethods,
          agentCapabilities: { loadSession: this.#loadSession },
        });
        return;
      case 'session/new':
        this.#reply(message, {
          sessionId: this.sessionId,
          modes: { currentModeId: 'auto', availableModes: [] },
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
        // The transcript comes back *before* the reply, which is the ordering that makes
        // replay suppression a real problem rather than a theoretical one.
        const asked = (message.params as { sessionId?: string } | undefined)?.sessionId;
        if (asked !== undefined) this.sessionId = asked;
        for (const update of this.#replayOnLoad) this.update(update);
        this.#reply(message, {
          sessionId: asked,
          modes: { currentModeId: 'auto', availableModes: [] },
          configOptions: this.#configOptions(),
        });
        return;
      }
      case 'session/set_mode':
        this.#reply(message, {});
        return;
      case 'session/set_config_option': {
        const params = message.params as { configId?: string; value?: string };
        const id = params?.configId ?? '';
        const value = params?.value ?? '';
        const refused = this.refuse[id];
        if (refused !== undefined && refused === value) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32603, message: 'Internal error' },
          });
          return;
        }
        this.options[id] = value;
        // The reply carries the whole refreshed block, which is what the real bridge sends.
        this.#reply(message, { configOptions: this.#configOptions() });
        return;
      }
      case 'session/prompt':
        this.#pendingPrompts.push(message);
        return;
      case 'session/cancel':
        // Recorded, not acted on: a cancellation lands when the runtime gets round to it,
        // and the tool updates already in flight still arrive before the prompt replies.
        this.cancelled = true;
        return;
      default:
        if (message.id !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: `FakeBridge: ${message.method} not implemented` },
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
