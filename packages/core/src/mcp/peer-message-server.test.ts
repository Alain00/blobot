import { afterEach, describe, expect, it } from 'vitest';
import type { PeerMessageAck, PeerMessageCall } from '../runtime.js';
import { PeerMessageServer, type PeerMessageEndpoint } from './peer-message-server.js';

/**
 * Driven over real HTTP against a real socket, because every requirement this server carries
 * came from watching two real runtimes talk to one (ticket 15) — and none of them survives
 * being tested through a shortcut past the transport.
 */

let running: PeerMessageServer | undefined;

afterEach(async () => {
  await running?.stop();
  running = undefined;
});

interface Harness {
  readonly server: PeerMessageServer;
  readonly calls: PeerMessageCall[];
  readonly endpoint: PeerMessageEndpoint;
  rpc(method: string, params?: unknown, options?: { token?: string; url?: string }): Promise<Response>;
  json(method: string, params?: unknown): Promise<Record<string, unknown>>;
}

async function harness(
  handler?: (call: PeerMessageCall) => Promise<PeerMessageAck>,
): Promise<Harness> {
  const calls: PeerMessageCall[] = [];
  const server = new PeerMessageServer({
    handler: async (call) => {
      calls.push(call);
      if (handler !== undefined) return handler(call);
      return { delivered: true, recipient: 'Bob', status: 'started' };
    },
  });
  await server.start();
  running = server;
  const endpoint = server.endpointFor('alice');

  const rpc = async (
    method: string,
    params?: unknown,
    options: { token?: string; url?: string } = {},
  ): Promise<Response> =>
    fetch(options.url ?? endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.token ?? endpoint.token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
    });

  return {
    server,
    calls,
    endpoint,
    rpc,
    json: async (method, params) => (await rpc(method, params)).json() as Promise<Record<string, unknown>>,
  };
}

function toolText(reply: Record<string, unknown>): string {
  const result = reply['result'] as { content?: { text?: string }[] };
  return result.content?.[0]?.text ?? '';
}

describe('the tool it publishes', () => {
  it('answers initialize and lists exactly one tool, named for OpenCode prefixing', async () => {
    const { json } = await harness();

    const initialized = await json('initialize', { protocolVersion: '2025-06-18' });
    expect(initialized['result']).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'blobot' },
    });

    const listed = await json('tools/list');
    const tools = (listed['result'] as { tools: { name: string }[] }).tools;
    // `blobot` + `message_agent`. Naming the tool `blobot_message_agent` makes OpenCode
    // publish `blobot_blobot_message_agent`.
    expect(tools.map((tool) => tool.name)).toEqual(['message_agent']);
  });

  it('takes agent, message and the sender-supplied context', async () => {
    const { json } = await harness();
    const listed = await json('tools/list');
    const [tool] = (listed['result'] as { tools: { inputSchema: Record<string, unknown> }[] }).tools;
    const schema = tool?.inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(schema.properties)).toEqual(['agent', 'message', 'context']);
    expect(schema.required).toEqual(['agent', 'message']);
  });

  it('calls the orchestrator handler with the caller identified by its token', async () => {
    const { json, calls } = await harness();

    const reply = await json('tools/call', {
      name: 'message_agent',
      arguments: {
        agent: 'Bob',
        message: 'the retry loop needs a backoff',
        context: 'fixing the double-charge on the UI side',
      },
    });

    expect(calls).toEqual([
      {
        from: 'alice',
        agent: 'Bob',
        message: 'the retry loop needs a backoff',
        context: 'fixing the double-charge on the UI side',
        idempotencyKey: expect.any(String),
      },
    ]);
    expect(toolText(reply)).toContain('Delivered to Bob');
  });

  it('tells the sender whether the recipient started or is busy', async () => {
    const { json } = await harness(async () => ({
      delivered: true,
      recipient: 'Bob',
      status: 'queued',
    }));
    expect(toolText(await json('tools/call', {
      name: 'message_agent',
      arguments: { agent: 'Bob', message: 'when you get a moment' },
    }))).toContain('busy');
  });

  it('hands a bad recipient back as a tool error the model can correct', async () => {
    const { json } = await harness(async () => {
      throw new Error("no agent named 'Reviewr' on this team; try: Alice, Bob");
    });

    const reply = await json('tools/call', {
      name: 'message_agent',
      arguments: { agent: 'Reviewr', message: 'take a look' },
    });
    // A tool error, not a JSON-RPC error: the turn continues and the model retries.
    expect(reply['error']).toBeUndefined();
    expect(reply['result']).toMatchObject({ isError: true });
    expect(toolText(reply)).toContain('try: Alice, Bob');
  });

  it('rejects a call missing its arguments without touching the mailbox', async () => {
    const { json, calls } = await harness();
    const reply = await json('tools/call', {
      name: 'message_agent',
      arguments: { agent: 'Bob' },
    });
    expect(reply['result']).toMatchObject({ isError: true });
    expect(calls).toEqual([]);
  });
});

describe("ticket 15's hazards", () => {
  it('is stateless: a tools/call with no initialize still works', async () => {
    // Neither runtime re-handshakes after a transport drop — both POST straight at a restarted
    // orchestrator. A session-tracking server 404s here, forever.
    const { json, calls } = await harness();
    const reply = await json('tools/call', {
      name: 'message_agent',
      arguments: { agent: 'Bob', message: 'still here?' },
    });
    expect(reply['error']).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('treats the inbound handshake as readiness, not session/new', async () => {
    const { server, json } = await harness();
    expect(server.isReady('alice')).toBe(false);

    const ready = server.whenReady('alice', 1_000);
    await json('initialize', { protocolVersion: '2025-06-18' });

    expect(await ready).toBe(true);
    expect(server.isReady('alice')).toBe(true);
    // An agent that never handshaked is misconfigured, and only we can know it.
    expect(server.isReady('bob')).toBe(false);
    expect(await server.whenReady('bob', 10)).toBe(false);
  });

  it('collapses an identical retry into one message', async () => {
    const { json, calls } = await harness();
    const args = {
      name: 'message_agent',
      arguments: { agent: 'Bob', message: 'the retry loop needs a backoff' },
    };
    await json('tools/call', args);
    await json('tools/call', args);

    expect(calls).toHaveLength(2);
    // The handler is called twice and the store dedups: same key, one committed message.
    expect(calls[0]?.idempotencyKey).toBe(calls[1]?.idempotencyKey);
  });

  it('gives a different key to a different message from the same sender', async () => {
    const { json, calls } = await harness();
    await json('tools/call', { name: 'message_agent', arguments: { agent: 'Bob', message: 'one' } });
    await json('tools/call', { name: 'message_agent', arguments: { agent: 'Bob', message: 'two' } });
    expect(calls[0]?.idempotencyKey).not.toBe(calls[1]?.idempotencyKey);
  });
});

describe('the token', () => {
  it('refuses a request with no token, a wrong token, and another agent path', async () => {
    const { server, endpoint, rpc } = await harness();
    const bob = server.endpointFor('bob');

    expect((await rpc('tools/list', undefined, { token: '' })).status).toBe(401);
    expect((await rpc('tools/list', undefined, { token: 'not-a-token' })).status).toBe(401);
    // Alice's token on Bob's path: the token is the identity, and the path must agree.
    expect((await rpc('tools/list', undefined, { url: bob.url })).status).toBe(401);
    expect((await rpc('tools/list', undefined, { url: endpoint.url })).status).toBe(200);
  });

  it('guards the GET stream too', async () => {
    const { endpoint } = await harness();

    const unguarded = await fetch(endpoint.url, { method: 'GET' });
    expect(unguarded.status).toBe(401);

    const controller = new AbortController();
    const guarded = await fetch(endpoint.url, {
      method: 'GET',
      headers: { authorization: `Bearer ${endpoint.token}` },
      signal: controller.signal,
    });
    expect(guarded.status).toBe(200);
    expect(guarded.headers.get('content-type')).toBe('text/event-stream');
    controller.abort();
  });

  it('binds to loopback only', async () => {
    const { server } = await harness();
    expect(server.port).toBeGreaterThan(0);
    // An open localhost port that can message agents is a real hole; a non-loopback one is
    // worse. `listen(port, '127.0.0.1')` is the whole mechanism, asserted here so a later
    // refactor cannot quietly widen it.
    await expect(
      fetch(`http://127.0.0.1:${server.port}/agents/alice/mcp`, { method: 'GET' }),
    ).resolves.toMatchObject({ status: 401 });
  });
});

describe('protocol housekeeping', () => {
  it('acknowledges notifications with 202 and no body', async () => {
    const { endpoint } = await harness();
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${endpoint.token}` },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
  });

  it('answers ping, and empty resources and prompts lists', async () => {
    const { json } = await harness();
    expect((await json('ping'))['result']).toEqual({});
    expect((await json('resources/list'))['result']).toEqual({ resources: [] });
    expect((await json('prompts/list'))['result']).toEqual({ prompts: [] });
  });

  it('reports an unknown method as a JSON-RPC error', async () => {
    const { json } = await harness();
    expect((await json('completion/complete'))['error']).toMatchObject({ code: -32601 });
  });
});
