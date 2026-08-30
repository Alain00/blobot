/**
 * Newline-delimited JSON-RPC over a pair of streams.
 *
 * Small on purpose: the bridge speaks a handful of methods and we own both ends of the
 * conversation. Nothing here knows what ACP is — it moves messages, and
 * `claude-agent-runtime.ts` gives them meaning.
 */

export type JsonRpcId = number | string;

export interface JsonRpcMessage {
  readonly jsonrpc?: '2.0';
  readonly id?: JsonRpcId;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

/** The transport the connection writes to and reads from. Stdio in production, a pair of
 *  queues in tests — which is how the whole adapter is testable without spawning anything. */
export interface LineTransport {
  write(line: string): void;
  lines(): AsyncIterable<string>;
  /** Close our side. The bridge exits on stdin EOF, so this is the whole `stop()` story. */
  close(): Promise<void>;
  /** The far side went away: EOF, a crash, a signal. */
  onClose(listener: (reason: string | undefined) => void): () => void;
}

export type RequestHandler = (params: unknown) => Promise<unknown>;
export type NotificationHandler = (params: unknown) => void;

export class JsonRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;
  }
}

const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class JsonRpcConnection {
  readonly #transport: LineTransport;
  readonly #pending = new Map<JsonRpcId, Pending>();
  readonly #requestHandlers = new Map<string, RequestHandler>();
  readonly #notificationHandlers = new Map<string, NotificationHandler>();
  readonly #closeListeners = new Set<(reason: string | undefined) => void>();

  #nextId = 1;
  #closed = false;
  #pump: Promise<void> | undefined;

  constructor(transport: LineTransport) {
    this.#transport = transport;
    transport.onClose((reason) => this.#handleClose(reason));
  }

  /** Start reading. Separate from the constructor so handlers can be registered first. */
  listen(): void {
    if (this.#pump !== undefined) return;
    this.#pump = this.#readLoop();
  }

  get closed(): boolean {
    return this.#closed;
  }

  onClose(listener: (reason: string | undefined) => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  setRequestHandler(method: string, handler: RequestHandler): void {
    this.#requestHandlers.set(method, handler);
  }

  setNotificationHandler(method: string, handler: NotificationHandler): void {
    this.#notificationHandlers.set(method, handler);
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (this.#closed) throw new Error(`${method}: the bridge connection is closed`);
    const id = this.#nextId;
    this.#nextId += 1;
    const reply = new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    this.#send({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    return (await reply) as T;
  }

  notify(method: string, params?: unknown): void {
    if (this.#closed) return;
    this.#send({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
  }

  async close(): Promise<void> {
    await this.#transport.close();
    this.#handleClose(undefined);
  }

  async #readLoop(): Promise<void> {
    try {
      for await (const line of this.#transport.lines()) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        let message: JsonRpcMessage;
        try {
          message = JSON.parse(trimmed) as JsonRpcMessage;
        } catch {
          // Not our channel's problem: the bridge remaps console output onto stderr, so a
          // line that is not JSON is noise from something else in the pipe.
          continue;
        }
        this.#dispatch(message);
      }
    } catch (error) {
      this.#handleClose(error instanceof Error ? error.message : String(error));
      return;
    }
    this.#handleClose(undefined);
  }

  /**
   * Route on `method`, never on `id`.
   *
   * The trap ticket 04 names: agent-originated request ids live in **their own space and
   * start at 0**, so a client that keys a single Map by id cross-wires the bridge's first
   * request onto its own first response. A message carrying `method` is inbound work; a
   * message carrying only `id` is a reply to something we sent.
   */
  #dispatch(message: JsonRpcMessage): void {
    if (message.method !== undefined) {
      if (message.id === undefined) {
        this.#notificationHandlers.get(message.method)?.(message.params);
        return;
      }
      void this.#handleRequest(message.id, message.method, message.params);
      return;
    }

    if (message.id === undefined) return;
    const pending = this.#pending.get(message.id);
    if (pending === undefined) return;
    this.#pending.delete(message.id);
    if (message.error !== undefined) {
      pending.reject(new JsonRpcError(message.error.code, message.error.message, message.error.data));
      return;
    }
    pending.resolve(message.result);
  }

  async #handleRequest(id: JsonRpcId, method: string, params: unknown): Promise<void> {
    const handler = this.#requestHandlers.get(method);
    if (handler === undefined) {
      this.#send({
        jsonrpc: '2.0',
        id,
        error: { code: METHOD_NOT_FOUND, message: `${method} is not implemented by blobot` },
      });
      return;
    }
    try {
      const result = await handler(params);
      this.#send({ jsonrpc: '2.0', id, result: result ?? {} });
    } catch (error) {
      this.#send({
        jsonrpc: '2.0',
        id,
        error: { code: INTERNAL_ERROR, message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  #send(message: JsonRpcMessage): void {
    this.#transport.write(`${JSON.stringify(message)}\n`);
  }

  #handleClose(reason: string | undefined): void {
    if (this.#closed) return;
    this.#closed = true;
    const failure = new Error(reason ?? 'the bridge connection closed');
    for (const pending of this.#pending.values()) pending.reject(failure);
    this.#pending.clear();
    for (const listener of this.#closeListeners) listener(reason);
  }
}
