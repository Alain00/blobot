import { AsyncQueue } from '../../mock/async-queue.js';
import type { JsonRpcMessage, LineTransport } from '../acp/jsonrpc.js';
import type { SessionUpdate } from '../acp/wire.js';
import { ASK_QUESTION_METHOD, CREATE_PLAN_METHOD } from './extensions.js';

/**
 * An `agent acp` that speaks the protocol without spawning anything.
 *
 * Shapes from Cursor's published ACP docs (2026-08-31): `authenticate` with `cursor_login`
 * before `session/new`, modes `agent` / `plan` / `ask`, permission option ids with hyphens,
 * and the two blocking extension methods. Unkind on purpose, the way `FakeOpencode` is —
 * a tidy fake produces an adapter that shatters on first contact.
 *
 * What it cannot prove is that a real `cursor-agent` still behaves this way. That is
 * `live.test.ts`'s job, behind `BLOBOT_LIVE_CURSOR`.
 */
export class FakeCursor implements LineTransport {
  sessionId: string;
  readonly received: JsonRpcMessage[] = [];
  configDir: string | undefined;
  cwd: string | undefined;
  spawnArgs: readonly string[] | undefined;
  env: Readonly<Record<string, string | undefined>> | undefined;

  cancelled = false;
  authenticated = false;

  readonly #out = new AsyncQueue<string>();
  readonly #closeListeners = new Set<(reason: string | undefined) => void>();
  readonly #pendingPrompts: JsonRpcMessage[] = [];
  readonly #permissionReplies = new Map<number, (message: JsonRpcMessage) => void>();
  readonly #extensionReplies = new Map<number, (message: JsonRpcMessage) => void>();

  #closed = false;
  #version: string;
  #protocolVersion: number;
  #loadSession: boolean;
  #failLoad: string | undefined;
  #failAuth: string | undefined;
  #requireAuth: boolean;
  #replayOnLoad: readonly SessionUpdate[];
  #mode: string;
  #model = 'composer-2';
  #agentRequestId = 0;

  constructor(
    options: {
      sessionId?: string;
      version?: string;
      protocolVersion?: number;
      loadSession?: boolean;
      failLoad?: string;
      failAuth?: string;
      /** When true, `session/new` fails until `authenticate` has succeeded. */
      requireAuth?: boolean;
      replayOnLoad?: readonly SessionUpdate[];
      mode?: string;
    } = {},
  ) {
    this.sessionId = options.sessionId ?? 'ses_cursor';
    this.#version = options.version ?? '1.0.0';
    this.#protocolVersion = options.protocolVersion ?? 1;
    this.#loadSession = options.loadSession ?? true;
    this.#failLoad = options.failLoad;
    this.#failAuth = options.failAuth;
    this.#requireAuth = options.requireAuth ?? false;
    this.#replayOnLoad = options.replayOnLoad ?? [];
    this.#mode = options.mode ?? 'agent';
  }

  get mode(): string {
    return this.#mode;
  }

  get model(): string {
    return this.#model;
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

  endTurn(stopReason: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeCursor: no prompt is in flight');
    this.#send({
      jsonrpc: '2.0',
      id: prompt.id as number,
      result: { stopReason, usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 } },
    });
  }

  failPrompt(message: string): void {
    const prompt = this.#pendingPrompts.shift();
    if (prompt === undefined) throw new Error('FakeCursor: no prompt is in flight');
    this.#send({ jsonrpc: '2.0', id: prompt.id as number, error: { code: -32603, message } });
  }

  get promptInFlight(): boolean {
    return this.#pendingPrompts.length > 0;
  }

  /** Ask for permission from Cursor's own id space, starting at 0, option ids hyphenated. */
  requestPermission(params: unknown): Promise<JsonRpcMessage> {
    return this.#agentRequest('session/request_permission', params, this.#permissionReplies);
  }

  askQuestion(params: unknown): Promise<JsonRpcMessage> {
    return this.#agentRequest(ASK_QUESTION_METHOD, params, this.#extensionReplies);
  }

  createPlan(params: unknown): Promise<JsonRpcMessage> {
    return this.#agentRequest(CREATE_PLAN_METHOD, params, this.#extensionReplies);
  }

  sendUnknownBlocking(method: string, params: unknown): Promise<JsonRpcMessage> {
    return this.#agentRequest(method, params, this.#extensionReplies);
  }

  crash(reason = 'the agent process exited with code 1'): void {
    this.#die(reason);
  }

  #agentRequest(
    method: string,
    params: unknown,
    replies: Map<number, (message: JsonRpcMessage) => void>,
  ): Promise<JsonRpcMessage> {
    const id = this.#agentRequestId;
    this.#agentRequestId += 1;
    const reply = new Promise<JsonRpcMessage>((resolve) => {
      replies.set(id, resolve);
    });
    this.#send({ jsonrpc: '2.0', id, method, params });
    return reply;
  }

  #handle(message: JsonRpcMessage): void {
    if (message.method === undefined) {
      const resolve =
        this.#permissionReplies.get(message.id as number) ??
        this.#extensionReplies.get(message.id as number);
      if (resolve !== undefined) {
        this.#permissionReplies.delete(message.id as number);
        this.#extensionReplies.delete(message.id as number);
        resolve(message);
      }
      return;
    }
    switch (message.method) {
      case 'initialize':
        this.#reply(message, {
          protocolVersion: this.#protocolVersion,
          agentInfo: { name: 'Cursor', version: this.#version },
          authMethods: [
            { id: 'cursor_login', name: 'Log in with Cursor', description: 'Run `agent login`' },
          ],
          agentCapabilities: {
            loadSession: this.#loadSession,
            mcpCapabilities: { http: true, sse: true },
          },
        });
        return;
      case 'authenticate': {
        if (this.#failAuth !== undefined) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32000, message: this.#failAuth },
          });
          return;
        }
        this.authenticated = true;
        this.#reply(message, {});
        return;
      }
      case 'session/new':
        if (this.#requireAuth && !this.authenticated) {
          this.#send({
            jsonrpc: '2.0',
            id: message.id as number,
            error: { code: -32000, message: 'not authenticated' },
          });
          return;
        }
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
        for (const update of this.#replayOnLoad) this.update(update);
        this.#reply(message, { configOptions: this.#configOptions() });
        return;
      }
      case 'session/set_mode': {
        const wanted = (message.params as { modeId?: string } | undefined)?.modeId;
        if (wanted !== undefined) this.#mode = wanted;
        this.#reply(message, {});
        return;
      }
      case 'session/set_config_option': {
        const params = message.params as { configId?: string; value?: string };
        if (params?.configId === 'mode' && params.value !== undefined) this.#mode = params.value;
        if (params?.configId === 'model' && params.value !== undefined) this.#model = params.value;
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

  #configOptions(): unknown[] {
    return [
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: this.#model,
        options: [
          { value: 'composer-2', name: 'Composer 2' },
          { value: 'gpt-5', name: 'GPT-5' },
        ],
      },
      {
        id: 'mode',
        name: 'Mode',
        category: 'mode',
        type: 'select',
        currentValue: this.#mode,
        options: [
          { value: 'agent', name: 'Agent' },
          { value: 'plan', name: 'Plan' },
          { value: 'ask', name: 'Ask' },
        ],
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
