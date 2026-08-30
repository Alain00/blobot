import { AsyncQueue } from '../../mock/async-queue.js';
import type { JsonRpcMessage, LineTransport } from '../acp/jsonrpc.js';
import type { SessionUpdate } from '../acp/wire.js';
import { VERIFIED_OPENCODE_VERSION } from './stdio.js';

/**
 * An `opencode acp` that speaks the protocol without spawning anything.
 *
 * Every shape here is copied from a captured transcript in
 * `.scratch/first-demo/research/03-transcripts/` — the `configOptions` block where the Claude
 * bridge sends `modes`, the `session/load` that answers with no `sessionId`, the agent-side
 * request ids that start at **0** in their own space. It is deliberately unkind in the same
 * way `MockAgentRuntime` is: a fake that is tidier than the runtime produces an adapter that
 * breaks on first contact.
 *
 * What it cannot prove is that the real OpenCode still behaves this way. That is
 * `live.test.ts`'s job.
 */
export class FakeOpencode implements LineTransport {
  sessionId: string;
  readonly received: JsonRpcMessage[] = [];
  /** The environment the adapter asked for, so a test can assert the persona reached the
   *  process rather than the session — which on OpenCode is the only place it can reach. */
  configContent: string | undefined;

  cancelled = false;

  readonly #out = new AsyncQueue<string>();
  readonly #closeListeners = new Set<(reason: string | undefined) => void>();
  readonly #pendingPrompts: JsonRpcMessage[] = [];
  readonly #permissionReplies = new Map<number, (message: JsonRpcMessage) => void>();

  #closed = false;
  #version: string;
  #protocolVersion: number;
  #loadSession: boolean;
  #failLoad: string | undefined;
  #replayOnLoad: readonly SessionUpdate[];
  #mode: string;
  #model = 'opencode/big-pickle';
  #modes: string[];
  #failSetMode: string | undefined;
  #agentRequestId = 0;

  constructor(
    options: {
      sessionId?: string;
      version?: string;
      /** OpenCode does not negotiate this, so an adapter that trusts it is the bug. */
      protocolVersion?: number;
      loadSession?: boolean;
      failLoad?: string;
      replayOnLoad?: readonly SessionUpdate[];
      /** The mode a new or loaded session reports. A resumed session reports whatever it was
       *  last used as, which is the trap `session/set_mode` after a load exists for. */
      mode?: string;
      availableModes?: string[];
      failSetMode?: string;
      configContent?: string;
    } = {},
  ) {
    this.sessionId = options.sessionId ?? 'ses_fake';
    this.#version = options.version ?? VERIFIED_OPENCODE_VERSION;
    this.#protocolVersion = options.protocolVersion ?? 1;
    this.#loadSession = options.loadSession ?? true;
    this.#failLoad = options.failLoad;
    this.#replayOnLoad = options.replayOnLoad ?? [];
    this.#mode = options.mode ?? 'build';
    this.#modes = options.availableModes ?? ['build', 'plan'];
    this.#failSetMode = options.failSetMode;
  }

  /** The mode the session is currently running as: OpenCode's agent, blobot's persona. */
  get mode(): string {
    return this.#mode;
  }

  get model(): string {
    return this.#model;
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

  update(update: SessionUpdate): void {
    this.#send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: this.sessionId, update },
    });
  }

  endTurn(stopReason: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeOpencode: no prompt is in flight');
    this.#send({
      jsonrpc: '2.0',
      id: prompt.id as number,
      // The real reply carries per-turn `usage` beside the stop reason. Kept, so a test that
      // reads the reply sees the shape the adapter actually meets.
      result: { stopReason, usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 } },
    });
  }

  failPrompt(message: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeOpencode: no prompt is in flight');
    this.#send({ jsonrpc: '2.0', id: prompt.id as number, error: { code: -32603, message } });
  }

  get promptInFlight(): boolean {
    return this.#pendingPrompts.length > 0;
  }

  /** Ask for permission the way OpenCode does: **from its own id space, starting at 0**. */
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

  // ------------------------------------------------------------------ internals

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
        // `authMethods` is advertised **even when the agent is authenticated**, which is why
        // the adapter must not read it as a sign-in prompt the way the Claude one does.
        this.#reply(message, {
          protocolVersion: this.#protocolVersion,
          agentInfo: { name: 'OpenCode', version: this.#version },
          authMethods: [
            { id: 'opencode-login', name: 'Login with opencode', description: 'Run `opencode auth login`' },
          ],
          agentCapabilities: {
            loadSession: this.#loadSession,
            mcpCapabilities: { http: true, sse: true },
          },
        });
        return;
      case 'session/new':
        this.#reply(message, { sessionId: this.sessionId, configOptions: this.#configOptions() });
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
        // History comes back as notifications *before* the reply, which is what makes replay
        // suppression a real problem rather than a theoretical one.
        for (const update of this.#replayOnLoad) this.update(update);
        // And the reply carries no `sessionId`: the client already has it.
        this.#reply(message, { configOptions: this.#configOptions() });
        return;
      }
      case 'session/set_mode': {
        if (this.#failSetMode !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32602, message: this.#failSetMode },
          });
          return;
        }
        const wanted = (message.params as { modeId?: string } | undefined)?.modeId;
        if (wanted !== undefined) this.#mode = wanted;
        this.#reply(message, {});
        return;
      }
      case 'session/set_config_option': {
        const params = message.params as { configId?: string; value?: string };
        if (params?.configId === 'mode' && params.value !== undefined) this.#mode = params.value;
        if (params?.configId === 'model' && params.value !== undefined) this.#model = params.value;
        // OpenCode answers with the full refreshed block rather than an empty result.
        this.#reply(message, { configOptions: this.#configOptions() });
        return;
      }
      case 'session/prompt':
        this.#pendingPrompts.push(message);
        return;
      case 'session/cancel':
        this.cancelled = true;
        return;
      case 'session/close':
        this.#reply(message, {});
        return;
      default:
        if (message.id !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: `"Method not found": ${message.method}` },
          });
        }
    }
  }

  /** The block OpenCode returns in place of `modes`, trimmed to the two options it carries. */
  #configOptions(): unknown[] {
    const modes = this.#modes.includes(this.#mode) ? this.#modes : [...this.#modes, this.#mode];
    return [
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: this.#model,
        options: [
          { value: 'opencode/big-pickle', name: 'OpenCode/Big Pickle' },
          { value: 'openai/gpt-5.4', name: 'OpenAI/GPT-5.4' },
        ],
      },
      {
        id: 'mode',
        name: 'Session Mode',
        category: 'mode',
        type: 'select',
        currentValue: this.#mode,
        options: modes.map((value) => ({ value, name: value })),
      },
    ];
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
