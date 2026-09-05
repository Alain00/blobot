import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  HandbookEntryInput,
  PeerMessageAck,
  PeerMessageHandler,
  RecordEntryAck,
  RecordEntryHandler,
  RoutineProposalAck,
  RoutineProposalHandler,
} from '../runtime.js';

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
  /**
   * Issue 05's `propose_routine`. **Omit it and the tool is not advertised at all** — a tool a
   * model can see and call is a capability it will believe in, so a team that keeps no Routines
   * must not be told otherwise.
   */
  readonly proposeRoutine?: RoutineProposalHandler;
  /**
   * Ticket 03's `record_entry`. Omitted the same way and for the same reason as
   * `proposeRoutine`: a team with nowhere to keep a Handbook must not be told it has one.
   */
  readonly recordEntry?: RecordEntryHandler;
  /** 0 takes an ephemeral port, which is what everything but a test wants. */
  readonly port?: number;
  readonly onLog?: (line: string) => void;
}

/** The MCP protocol version the runtimes negotiated in ticket 15's transcripts. */
import {
  HANDBOOK_ENTRY_LIMIT,
  PEER_CONTEXT_LIMIT,
  PEER_MESSAGE_LIMIT,
  ROUTINE_NAME_LIMIT,
} from '../orchestrator/bounds.js';

const PROTOCOL_VERSION = '2025-06-18';

/**
 * Named `blobot` / `message_agent`, never `blobot_message_agent`: OpenCode prefixes the tool
 * with the server name and would publish `blobot_blobot_message_agent`.
 */
/**
 * Exported because its **size is context**. This definition is sent to every agent on every
 * turn, so the surface that shows what blobot injects measures the real thing rather than a
 * number somebody typed. It is also the only tool blobot adds: everything else in an agent's
 * tool list came from the runtime or from a server the user configured.
 */
export const MESSAGE_AGENT_TOOL = {
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
      message: {
        type: 'string',
        // The bound is said here as well as enforced in the orchestrator. Enforcement fails
        // closed and is what makes the rule real; saying it is what stops a sender spending a
        // tool call to find out.
        description:
          `The message body, under ${PEER_MESSAGE_LIMIT} characters. A teammate gets your ` +
          'summary, not your transcript: commit your work and say which branch it is on.',
        maxLength: PEER_MESSAGE_LIMIT,
      },
      context: {
        type: 'string',
        description:
          'Optional one-line description of what you are working on, in your own words. ' +
          'It is shown to the teammate so they can judge how your request relates to theirs.',
        maxLength: PEER_CONTEXT_LIMIT,
      },
    },
    required: ['agent', 'message'],
    additionalProperties: false,
  },
} as const;

/**
 * Issue 05's tool. Exported beside `MESSAGE_AGENT_TOOL` and for the same reason: **its size is
 * context**, on the wire to every agent on every turn, so the gauge measures the real thing.
 *
 * There is deliberately no recipient field, because the bearer token *is* the caller and a
 * Routine proposed for a teammate is fan-out with a delay on it.
 *
 * There is no field that arms one either, and the reason **inverted on 2026-08-30**: it used to
 * be that only a person could arm one, and it is now that every one of these is armed. Either way
 * it is not the caller's to decide, so there is nothing to send.
 */
export const PROPOSE_ROUTINE_TOOL = {
  name: 'propose_routine',
  description:
    'Schedule a Routine for yourself: an instruction you will be given again on a schedule, ' +
    'like a nightly check. It STARTS RUNNING as soon as you call this, so only use it for work ' +
    'you have been asked to repeat, and prefer the least frequent schedule that does the job. ' +
    'The person you are working with is shown it immediately and can switch it off. Tell them ' +
    'you have scheduled it, and say when it will run.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'A few words a person will read in a list, like "nightly typecheck".',
        maxLength: ROUTINE_NAME_LIMIT,
      },
      prompt: {
        type: 'string',
        description:
          `What you would be asked to do, under ${PEER_MESSAGE_LIMIT} characters. Write it as ` +
          'an instruction to yourself, on a day when nobody is watching and nobody can answer ' +
          'a question.',
        maxLength: PEER_MESSAGE_LIMIT,
      },
      schedule: {
        type: 'object',
        description: 'When it would run. Local time, and nothing finer than hourly is offered.',
        properties: {
          every: { type: 'string', enum: ['hour', 'day', 'week'] },
          hour: { type: 'integer', minimum: 0, maximum: 23, description: 'Required for day and week.' },
          minute: { type: 'integer', minimum: 0, maximum: 59 },
          weekday: {
            type: 'integer',
            minimum: 0,
            maximum: 6,
            description: 'Required for week. 0 is Sunday.',
          },
        },
        required: ['every', 'minute'],
        additionalProperties: false,
      },
    },
    required: ['name', 'prompt', 'schedule'],
    additionalProperties: false,
  },
} as const;

/**
 * Ticket 03's tool. Exported beside the other two for the third time and for the same reason:
 * **its size is context**, on the wire to every agent on every turn, whether or not anybody ever
 * briefs anybody. That is why it is this short. The test an agent applies is in the persona,
 * inside the Handbook block, where it is said once.
 *
 * It takes a **list**. One entry per call was the charting recommendation, ported from
 * `propose_routine`, and ticket 03 reversed it: an agent that has just been told the
 * positioning, the ICP, the tone and who signs off would be able to record one of them, and
 * briefing would become five turns of an agent asking permission to keep listening. A Routine
 * proposal is a commitment and an entry is a note.
 *
 * It is **not** called `remember`. Ticket 01 banned that word in blobot's mouth, and a tool
 * description is blobot's mouth: it promises persistence blobot does not give, since a Handbook
 * dies with its team and travels to no other.
 *
 * There is no recipient field, and no agent field. The bearer token is the identity, so an agent
 * can only write to its own Handbook, and there is no argument by which Bob could name Mara's.
 */
export const RECORD_ENTRY_TOOL = {
  name: 'record_entry',
  description:
    'Write something down in your Handbook for this team: what you have been told about the ' +
    'work here, which you will be given again at the start of every session. Send everything ' +
    'you learned in one call.',
  inputSchema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'One thing, in a sentence or two.',
              maxLength: HANDBOOK_ENTRY_LIMIT,
            },
            source: {
              type: 'string',
              enum: ['told', 'noticed'],
              // Plain words, because there is nothing to derive it from and the agent is the
              // only one who knows. A teammate is not the operator, so what one tells you is
              // something you worked out.
              description:
                'Did someone tell you this, or did you work it out? A teammate telling you ' +
                'something counts as working it out.',
            },
            replaces: {
              type: 'integer',
              description:
                'The number of an entry this one corrects. Only something you worked out ' +
                'yourself: you cannot withdraw what you were told.',
            },
          },
          required: ['text', 'source'],
          additionalProperties: false,
        },
      },
    },
    required: ['entries'],
    additionalProperties: false,
  },
} as const;

const TOOL = MESSAGE_AGENT_TOOL;

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
  readonly #proposeRoutine: RoutineProposalHandler | undefined;
  readonly #recordEntry: RecordEntryHandler | undefined;
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
    this.#proposeRoutine = options.proposeRoutine;
    this.#recordEntry = options.recordEntry;
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
  endpointFor(agentId: string, hostname: '127.0.0.1' | 'host.docker.internal' = '127.0.0.1'): PeerMessageEndpoint {
    if (this.#server === undefined) throw new Error('PeerMessageServer: start() first');
    const token = randomBytes(24).toString('base64url');
    this.#tokens.set(token, agentId);
    return { url: `http://${hostname}:${this.#port}/agents/${agentId}/mcp`, token };
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
      return { jsonrpc: '2.0', id, result: { tools: this.#tools() } };
    }
    if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
    if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
    if (method === 'tools/call') {
      this.#markReady(agentId);
      return { jsonrpc: '2.0', id, result: await this.#callTool(agentId, message) };
    }
    if (id === undefined) return null;
    // **An unknown method must answer with an error, never with an empty result**, and on one
    // runtime that is load-bearing rather than tidy. fx opens an MCP connection with
    // `server/discover`, a newer draft's method this server does not implement, and it falls
    // back to the classic `initialize` handshake **only because this line is an error**:
    // measured 2026-08-31, a `{}` result instead fails the whole session with
    // `-32602 Required MCP server 'blobot' failed to start: McpMissingResultType`, so every fx
    // agent would launch without a mailbox. See `.scratch/fx-runtime/research/01-acp-surface.md`.
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
  }

  #tools(): object[] {
    return [
      TOOL,
      ...(this.#proposeRoutine === undefined ? [] : [PROPOSE_ROUTINE_TOOL]),
      ...(this.#recordEntry === undefined ? [] : [RECORD_ENTRY_TOOL]),
    ];
  }

  async #callTool(agentId: string, message: JsonRpcRequest): Promise<object> {
    if (message.params?.name === PROPOSE_ROUTINE_TOOL.name) {
      return this.#callProposeRoutine(agentId, message);
    }
    if (message.params?.name === RECORD_ENTRY_TOOL.name) {
      return this.#callRecordEntry(agentId, message);
    }
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

  /**
   * The proposal, and the answer the model reads.
   *
   * The ack is worded as carefully as the tool is, because this is the moment the hazard lands:
   * an agent that proposes a Routine and is not told what happened next reports to the user that
   * the work is scheduled. It is told, in the same breath, that nothing runs.
   */
  async #callProposeRoutine(agentId: string, message: JsonRpcRequest): Promise<object> {
    const propose = this.#proposeRoutine;
    if (propose === undefined) return toolError('no tool named `propose_routine` on this server');
    const args = message.params?.arguments ?? {};
    const name = typeof args['name'] === 'string' ? args['name'] : undefined;
    const prompt = typeof args['prompt'] === 'string' ? args['prompt'] : undefined;
    if (name === undefined || prompt === undefined || args['schedule'] === undefined) {
      return toolError('propose_routine requires `name`, `prompt` and `schedule`');
    }
    // Refused by the absence of the field rather than by prose: there is nobody to name.
    if (args['agent'] !== undefined || args['for'] !== undefined) {
      return toolError(
        'A Routine is proposed for yourself only. Ask a teammate with message_agent instead.',
      );
    }
    try {
      const ack: RoutineProposalAck = await propose({
        from: agentId,
        name,
        prompt,
        schedule: args['schedule'],
      });
      this.#log(`${agentId} proposed a Routine: ${ack.name}`);
      return {
        content: [
          {
            type: 'text',
            text:
              `Scheduled: "${ack.name}", ${ack.schedule}, which is ${ack.frequency}. It is ` +
              'running now. The person you are working with has been shown it and can switch ' +
              'it off. Tell them it is scheduled and say when it will run.',
          },
        ],
        structuredContent: ack,
      };
    } catch (error) {
      // A refused cap or an unparseable schedule is the caller's to read and account for, which
      // is the point: a proposal that vanished quietly is how a model ends up reporting work as
      // scheduled that nobody will ever run.
      return toolError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * The write, and the sentence the model reads back.
   *
   * Everything difficult is upstream of here: the caps, the two character bounds and the
   * `replaces` rule are the orchestrator's, refused at that boundary and never trimmed, so a
   * refusal comes back as a tool error the model has to account for. This end shapes the call
   * and says plainly what happened, including how many entries went in, because an agent that
   * is not told stops being able to tell the user.
   */
  async #callRecordEntry(agentId: string, message: JsonRpcRequest): Promise<object> {
    const record = this.#recordEntry;
    if (record === undefined) return toolError('no tool named `record_entry` on this server');
    const raw = message.params?.arguments?.['entries'];
    if (!Array.isArray(raw) || raw.length === 0) {
      return toolError('record_entry requires `entries`, a list of at least one entry');
    }
    const entries: HandbookEntryInput[] = [];
    for (const item of raw) {
      const entry = item as Record<string, unknown>;
      const text = typeof entry['text'] === 'string' ? entry['text'] : undefined;
      const source = entry['source'];
      if (text === undefined || (source !== 'told' && source !== 'noticed')) {
        return toolError('every entry needs `text` and a `source` of "told" or "noticed"');
      }
      const replaces = typeof entry['replaces'] === 'number' ? entry['replaces'] : undefined;
      entries.push({ text, source, ...(replaces === undefined ? {} : { replaces }) });
    }
    try {
      const ack: RecordEntryAck = await record({ from: agentId, entries });
      this.#log(`${agentId} recorded ${ack.recorded.length} handbook entries`);
      const withdrew =
        ack.withdrew.length === 0
          ? ''
          : ` Withdrew ${ack.withdrew.map((ordinal) => `#${ordinal}`).join(', ')}.`;
      return {
        content: [
          {
            type: 'text',
            text:
              `Recorded ${ack.recorded.length} in your Handbook for this team, as ` +
              `${ack.recorded.map((entry) => `#${entry.ordinal}`).join(', ')}.${withdrew} ` +
              'The person you are working with can see what you wrote and can remove any of it.',
          },
        ],
        structuredContent: ack,
      };
    } catch (error) {
      // Including the one refusal in the app whose fix belongs to somebody who is not in the
      // room. The agent is told plainly that it cannot fix it, rather than being invited to
      // retry against a wall. Ticket 08 puts that case in front of the user as well.
      return toolError(error instanceof Error ? error.message : String(error));
    }
  }

  #markReady(agentId: string): void {
    if (this.#handshaked.has(agentId)) return;
    this.#handshaked.add(agentId);
    this.#log(`${agentId} handshaked. It has ${this.#tools().length} of blobot's own tools`);
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
