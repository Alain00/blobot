/**
 * Ticket 01's probe server: one MCP tool that returns one image block, and nothing else.
 *
 * Deliberately **not** a browser server. Ticket 01 asks to isolate the protocol question from a
 * vendor's screenshot implementation, so this returns a fixed, tiny PNG that blobot generated
 * itself. If an image arrives at the client, the path works; if it does not, the failure is the
 * runtime's or the bridge's and cannot be blamed on Playwright.
 *
 * The HTTP shape is copied from `packages/core/src/mcp/peer-message-server.ts` on purpose, down
 * to the details that turned out to be load-bearing there: loopback only, a bearer token that is
 * the caller's identity, **stateless** because neither runtime re-handshakes, and an **error**
 * rather than an empty result for an unknown method, without which fx fails the whole session
 * with `McpMissingResultType`.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A 2x2 PNG, four flat colours, 79 bytes. Small enough to read in a transcript by eye and still
 * a real decodable image, which a 1x1 grey square would also be but tells you nothing about
 * whether anything downstream mangled it.
 */
export const PROBE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mO4Y2NjU3GH4cMJGw0NDQAp' +
  'dgVRmX0rfQAAAABJRU5ErkJggg==';

/** 79 bytes, four pixels: red, blue, yellow, near-black. CRCs verified when it was generated. */
export const PROBE_PNG_BYTES = 79;

export interface ProbeToolCall {
  readonly tool: string;
  readonly args: unknown;
}

export interface PictureServerOptions {
  /** The bearer token the runtime must present. Minted by the caller so it can be logged. */
  readonly token: string;
  /** Every tool call, for the transcript. */
  readonly onCall?: (call: ProbeToolCall) => void;
  readonly onLog?: (line: string) => void;
  /**
   * Whether the image block carries `annotations`. Off by default, because the first question is
   * whether a plain block survives at all; ticket 01 also wants to know whether a client that
   * *is* sent `audience` and `lastModified` receives them intact, which is what turning this on
   * measures.
   */
  readonly annotate?: boolean;
  /**
   * Send `uri` and omit `data`, which is the dangerous shape ticket 01's desk half asked to check
   * for. Off by default.
   */
  readonly uriOnly?: boolean;
}

const PROTOCOL_VERSION = '2024-11-05';

const SHOW_PICTURE_TOOL = {
  name: 'show_picture',
  description:
    'Return a picture. Call this when asked to take, produce or show a screenshot. It takes no ' +
    'arguments and always succeeds.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const;

/**
 * A second tool that returns the *same* picture as text, so a run can tell "this runtime drops
 * images" apart from "this runtime never called the tool at all". Without it a silent result is
 * ambiguous and the whole probe proves nothing.
 */
const SHOW_TEXT_TOOL = {
  name: 'show_text',
  description: 'Return a short line of text. Takes no arguments.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const;

interface JsonRpcRequest {
  readonly jsonrpc?: string;
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: { readonly name?: string; readonly [key: string]: unknown };
}

export class PictureServer {
  readonly #options: PictureServerOptions;
  #server: Server | undefined;
  #port = 0;

  constructor(options: PictureServerOptions) {
    this.#options = options;
  }

  async start(): Promise<void> {
    const server = createServer((request, response) => {
      void this.#onRequest(request, response);
    });
    this.#server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    this.#port = (server.address() as AddressInfo).port;
    this.#options.onLog?.(`picture server on 127.0.0.1:${this.#port}`);
  }

  async stop(): Promise<void> {
    const server = this.#server;
    if (server === undefined) return;
    this.#server = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  get url(): string {
    return `http://127.0.0.1:${this.#port}/`;
  }

  async #onRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const header = request.headers.authorization ?? '';
    if (header !== `Bearer ${this.#options.token}`) {
      this.#options.onLog?.(`401 ${request.method ?? '?'} ${request.url ?? '?'}`);
      response.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' });
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unauthorized' } }),
      );
      return;
    }
    if (request.method === 'GET') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      response.write(': ok\n\n');
      request.on('close', () => undefined);
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
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }),
      );
      return;
    }

    const batch = Array.isArray(payload) ? (payload as JsonRpcRequest[]) : [payload as JsonRpcRequest];
    const replies = batch.map((message) => this.#handle(message)).filter((r): r is object => r !== null);
    if (replies.length === 0) {
      response.writeHead(202).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(Array.isArray(payload) ? replies : replies[0]));
  }

  #handle(message: JsonRpcRequest): object | null {
    const { method, id } = message;
    this.#options.onLog?.(`mcp <- ${method ?? '?'}`);
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'picture', version: '0.0.1' },
        },
      };
    }
    if (method === 'notifications/initialized') return null;
    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: [SHOW_PICTURE_TOOL, SHOW_TEXT_TOOL] } };
    }
    if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
    if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
    if (method === 'tools/call') {
      const name = message.params?.name ?? '';
      this.#options.onCall?.({ tool: String(name), args: message.params?.arguments });
      if (name === SHOW_TEXT_TOOL.name) {
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: 'the codeword is AUBERGINE-7' }] },
        };
      }
      return { jsonrpc: '2.0', id, result: { content: [this.#imageBlock()] } };
    }
    if (id === undefined) return null;
    // Load-bearing, not tidy. See the header comment.
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
  }

  #imageBlock(): object {
    return {
      type: 'image',
      mimeType: 'image/png',
      ...(this.#options.uriOnly === true ? {} : { data: PROBE_PNG_BASE64 }),
      ...(this.#options.uriOnly === true ? { uri: 'probe://picture.png' } : {}),
      ...(this.#options.annotate === true
        ? { annotations: { audience: ['user'], lastModified: new Date().toISOString(), priority: 1 } }
        : {}),
    };
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
