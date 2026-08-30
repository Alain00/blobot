import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PeerMessageAck, PeerMessageHandler } from '../runtime.js';

/**
 * blobot's own MCP server: one tool, `message_agent`, served over loopback HTTP.
 *
 * The orchestrator **is** the server (ticket 05). A stdio server would mean one child process
 * per agent whose only job is to forward a call back to the process that already owns the
 * mailbox — agent → child → IPC → orchestrator, three places to lose a message. Here the tool
 * handler is a plain function in that same process.
 *
 * Ticket 15 verified this shape end to end against both runtimes, invocation included, and
 * left four requirements written into the code below: statelessness, a bearer token on every
 * request including the SSE stream, an idempotency key, and readiness measured by the inbound
 * handshake rather than by `session/new`.
 */

/** What one agent needs in `session/new.mcpServers`. Shaped for ACP, filled in by an adapter. */
export interface PeerMessageEndpoint {
  readonly url: string;
  readonly token: string;
}

export interface PeerMessageServerOptions {
  /** The orchestrator's handler. Must never block: a stalled call hangs the sender's turn. */
  readonly handler: PeerMessageHandler;
  /** 0 takes an ephemeral port, which is what everything but a test wants. */
  readonly port?: number;
  readonly onLog?: (line: string) => void;
}

/** The MCP protocol version the runtimes negotiated in ticket 15's transcripts. */
const PROTOCOL_VERSION = '2025-06-18';

/**
 * Named `blobot` / `message_agent`, never `blobot_message_agent`: OpenCode prefixes the tool
 * with the server name and would publish `blobot_blobot_message_agent`.
 */
const TOOL = {
  name: 'message_agent',
  description:
    'Send an asynchronous message to a teammate agent. Use this whenever you are asked to ' +
    'send, relay, or deliver a message to another agent by name. The teammate is a separate ' +
    'agent working in their own copy of the repository: they cannot see your turn or your ' +
    'uncommitted changes, so say what they need to know.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Name of the teammate agent to message' },
      message: { type: 'string', description: 'The message body' },
      context: {
        type: 'string',
        description:
          'Optional one-line description of what you are working on, in your own words. ' +
          'It is shown to the teammate so they can judge how your request relates to theirs.',
      },
    },
    required: ['agent', 'message'],
    additionalProperties: false,
  },
} as const;

interface JsonRpcRequest {
  readonly jsonrpc?: string;
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: {
    readonly name?: string;
    readonly arguments?: Record<string, unknown>;
    readonly protocolVersion?: string;
  };
}

export class PeerMessageServer {
  readonly #handler: PeerMessageHandler;
  readonly #onLog: ((line: string) => void) | undefined;
  readonly #requestedPort: number;
  /** token → agentId. The token is the identity: it is how we know who is calling. */
  readonly #tokens = new Map<string, string>();
  readonly #handshaked = new Set<string>();
  readonly #handshakeWaiters = new Map<string, (() => void)[]>();
  readonly #openStreams = new Set<ServerResponse>();

  #server: Server | undefined;
  #port = 0;

  constructor(options: PeerMessageServerOptions) {
    this.#handler = options.handler;
    this.#onLog = options.onLog;
    this.#requestedPort = options.port ?? 0;
  }

  async start(): Promise<void> {
    if (this.#server !== undefined) return;
    const server = createServer((request, response) => {
      void this.#onRequest(request, response);
    });
    this.#server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      // Loopback only. An open port that can message agents is a real hole.
      server.listen(this.#requestedPort, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    this.#port = (server.address() as AddressInfo).port;
    this.#log(`listening on 127.0.0.1:${this.#port}`);
  }

  async stop(): Promise<void> {
    const server = this.#server;
    if (server === undefined) return;
    this.#server = undefined;
    for (const stream of this.#openStreams) stream.end();
    this.#openStreams.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  get port(): number {
    return this.#port;
  }

  /**
   * Mint one agent's endpoint. The path names the agent so a transcript is readable, but the
   * **token** is the authority — a request whose token does not match its path is refused.
   */
  endpointFor(agentId: string): PeerMessageEndpoint {
    if (this.#server === undefined) throw new Error('PeerMessageServer: start() first');
    const token = randomBytes(24).toString('base64url');
    this.#tokens.set(token, agentId);
    return { url: `http://127.0.0.1:${this.#port}/agents/${agentId}/mcp`, token };
  }

  /**
   * Ticket 15's first hazard: a dead port or a rejected token still yields a normal
   * `sessionId`, with no error anywhere in ACP — the agent simply has no tool and says so to
   * the user. The handshake arriving *here* is the only honest readiness signal, so this is
   * what a caller waits on before believing an agent can message anyone.
   */
  isReady(agentId: string): boolean {
    return this.#handshaked.has(agentId);
  }

  async whenReady(agentId: string, timeoutMs: number): Promise<boolean> {
    if (this.#handshaked.has(agentId)) return true;
    return new Promise<boolean>((resolve) => {
      const onReady = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.#handshakeWaiters.set(
          agentId,
          (this.#handshakeWaiters.get(agentId) ?? []).filter((waiter) => waiter !== onReady),
        );
        resolve(false);
      }, timeoutMs);
      this.#handshakeWaiters.set(agentId, [...(this.#handshakeWaiters.get(agentId) ?? []), onReady]);
    });
  }

  // ------------------------------------------------------------------ HTTP

  async #onRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const agentId = this.#authenticate(request);
    if (agentId === undefined) {
      this.#log(`401 ${request.method ?? '?'} ${request.url ?? '?'}`);
      response.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' });
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32001, message: 'unauthorized' },
        }),
      );
      return;
    }

    if (request.method === 'GET') {
      // The optional server→client stream. Guarded by the same token: leaving it open is the
      // mistake a naive implementation makes, and ticket 15 checked for it on purpose.
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      response.write(': ok\n\n');
      this.#openStreams.add(response);
      request.on('close', () => this.#openStreams.delete(response));
      return;
    }
    if (request.method === 'DELETE') {
      response.writeHead(200).end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405).end();
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await readBody(request));
    } catch {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'parse error' },
        }),
      );
      return;
    }

    const batch = Array.isArray(payload)
      ? (payload as JsonRpcRequest[])
      : [payload as JsonRpcRequest];
    const replies = (
      await Promise.all(batch.map((message) => this.#handle(agentId, message)))
    ).filter((reply): reply is object => reply !== null);

    // A batch of notifications gets no body at all.
    if (replies.length === 0) {
      response.writeHead(202).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(Array.isArray(payload) ? replies : replies[0]));
  }

  /** The token identifies the caller; the path must agree with it. */
  #authenticate(request: IncomingMessage): string | undefined {
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const agentId = this.#tokens.get(token);
    if (agentId === undefined) return undefined;
    const path = request.url ?? '';
    return path === '/' || path.startsWith(`/agents/${agentId}/`) ? agentId : undefined;
  }

  // ------------------------------------------------------------------ MCP

  async #handle(agentId: string, message: JsonRpcRequest): Promise<object | null> {
    const { method, id } = message;
    if (method === 'initialize') {
      this.#markReady(agentId);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'blobot', version: '0.0.1' },
        },
      };
    }
    if (method === 'notifications/initialized') return null;
    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
    if (method === 'tools/list') {
      // Statelessness, ticket 15's second hazard: neither runtime re-handshakes after a
      // transport drop, so every method has to work without a prior `initialize`. A server
      // that tracks sessions 404s after the first orchestrator restart and never recovers.
      this.#markReady(agentId);
      return { jsonrpc: '2.0', id, result: { tools: [TOOL] } };
    }
    if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
    if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
    if (method === 'tools/call') {
      this.#markReady(agentId);
      return { jsonrpc: '2.0', id, result: await this.#callTool(agentId, message) };
    }
    if (id === undefined) return null;
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
  }

  async #callTool(agentId: string, message: JsonRpcRequest): Promise<object> {
    if (message.params?.name !== TOOL.name) {
      return toolError(`no tool named '${message.params?.name ?? ''}' on this server`);
    }
    const args = message.params.arguments ?? {};
    const agent = typeof args['agent'] === 'string' ? args['agent'] : undefined;
    const body = typeof args['message'] === 'string' ? args['message'] : undefined;
    const context = typeof args['context'] === 'string' ? args['context'] : undefined;
    if (agent === undefined || body === undefined) {
      return toolError('message_agent requires both `agent` and `message`');
    }

    try {
      const ack: PeerMessageAck = await this.#handler({
        from: agentId,
        agent,
        message: body,
        idempotencyKey: idempotencyKey(agentId, agent, body, context),
        ...(context === undefined ? {} : { context }),
      });
      this.#log(`${agentId} → ${agent}: ${ack.status}`);
      return {
        content: [
          {
            type: 'text',
            text:
              ack.status === 'started'
                ? `Delivered to ${ack.recipient}, who is reading it now.`
                : `Delivered to ${ack.recipient}, who is busy and will read it when free.`,
          },
        ],
        structuredContent: ack,
      };
    } catch (error) {
      // A bad recipient is the sender's mistake to fix, so it comes back as a tool error the
      // model can read and retry — "no agent named 'Reviewr'; try: Alice, Bob" — rather than
      // as a protocol error that ends the turn.
      return toolError(error instanceof Error ? error.message : String(error));
    }
  }

  #markReady(agentId: string): void {
    if (this.#handshaked.has(agentId)) return;
    this.#handshaked.add(agentId);
    this.#log(`${agentId} handshaked. It has the message_agent tool`);
    for (const waiter of this.#handshakeWaiters.get(agentId) ?? []) waiter();
    this.#handshakeWaiters.delete(agentId);
  }

  #log(line: string): void {
    this.#onLog?.(`[mcp] ${line}`);
  }
}

/**
 * Derived, never taken from the caller: the model would invent one, and a retried `tools/call`
 * carries a fresh JSON-RPC id, so nothing on the wire is stable across the retry we care about.
 *
 * The consequence is deliberate and worth saying out loud: the same sender saying the same
 * words to the same teammate twice is treated as one message. Ticket 15's third hazard is that
 * a mid-turn transport drop leaves genuine at-most-once ambiguity — the model is told the call
 * may or may not have landed, and both runtimes' models flagged it unprompted. Between
 * swallowing a deliberate duplicate and waking Bob twice for one message, the first is the
 * failure a human can see and correct.
 */
function idempotencyKey(from: string, to: string, message: string, context?: string): string {
  return createHash('sha256')
    .update([from, to, message, context ?? ''].join(' '))
    .digest('base64url')
    .slice(0, 32);
}

function toolError(text: string): object {
  return { content: [{ type: 'text', text }], isError: true };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
