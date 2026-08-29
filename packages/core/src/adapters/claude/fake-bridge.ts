import { AsyncQueue } from '../../mock/async-queue.js';
import type { JsonRpcMessage, LineTransport } from './jsonrpc.js';
import { BRIDGE_VERSION } from './stdio-bridge.js';
import type { SessionUpdate } from './wire.js';

/**
 * A bridge that speaks the protocol without spawning anything.
 *
 * It exists so the adapter's contract — the same behaviours `MockAgentRuntime` owes the
 * orchestrator — is testable at wire level: the framing, the id spaces, the turn boundary
 * that is an RPC reply. What it cannot prove is that the real bridge behaves this way; that
 * is `live.test.ts`'s job, and the transcripts in `research/02-claude-code-acp.md`.
 */
export class FakeBridge implements LineTransport {
  readonly sessionId: string;
  readonly received: JsonRpcMessage[] = [];

  readonly #out = new AsyncQueue<string>();
  readonly #closeListeners = new Set<(reason: string | undefined) => void>();
  readonly #pendingPrompts: JsonRpcMessage[] = [];

  cancelled = false;

  #closed = false;
  #version: string;
  #authMethods: unknown[];
  #agentRequestId = 0;

  constructor(
    options: { sessionId?: string; version?: string; authMethods?: unknown[] } = {},
  ) {
    this.sessionId = options.sessionId ?? 'session_fake';
    this.#version = options.version ?? BRIDGE_VERSION;
    this.#authMethods = options.authMethods ?? [];
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
        });
        return;
      case 'session/new':
        this.#reply(message, {
          sessionId: this.sessionId,
          modes: { currentModeId: 'auto', availableModes: [] },
        });
        return;
      case 'session/set_mode':
        this.#reply(message, {});
        return;
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
