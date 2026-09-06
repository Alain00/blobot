import { afterEach, describe, expect, it } from 'vitest';
import type {
  PeerMessageAck,
  PeerMessageCall,
  RecordEntryAck,
  RecordEntryCall,
  RoutineProposalAck,
  RoutineProposalCall,
} from '../runtime.js';
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

  it('does not advertise message_agent at all in a thread, where there is nobody to send to', async () => {
    // Absent, never advertised-and-refusing. Codex taught the alternative's cost: a runtime that
    // offers a capability the situation cannot honour produces an agent that tries it, and that
    // adapter had to spend a paragraph saying in words that it had no subagents.
    // `.scratch/rail/issues/02-what-a-thread-strips.md`.
    const server = new PeerMessageServer({
      recordEntry: async () => ({ recorded: [], ordinals: [], withdrew: [] }),
    });
    await server.start();
    running = server;
    const endpoint = server.endpointFor('alice');
    const reply = (await (
      await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${endpoint.token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    ).json()) as Record<string, unknown>;
    const tools = (reply['result'] as { tools: { name: string }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(['record_entry']);

    // And calling it anyway is a tool error the model can read, never a delivery.
    const called = (await (
      await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${endpoint.token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'message_agent', arguments: { agent: 'Bob', message: 'hi' } },
        }),
      })
    ).json()) as Record<string, unknown>;
    expect(toolText(called)).toContain('no tool named');
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
  it('changes the box carrier without changing bearer authority or opening the listener', async () => {
    const { server, rpc } = await harness();
    const box = server.endpointFor('box-agent', 'host.docker.internal');
    expect(box.url).toBe(`http://host.docker.internal:${server.port}/agents/box-agent/mcp`);
    // Model the proxy's already-measured hostname rewrite on the host side of the door.
    const upstream = box.url.replace('host.docker.internal', '127.0.0.1');
    expect((await rpc('tools/list', undefined, { url: upstream, token: box.token })).status).toBe(200);
    expect((await rpc('tools/list', undefined, { url: upstream })).status).toBe(401);
  });

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

  /**
   * The same rule again, named after the thing that depends on it.
   *
   * fx opens an MCP connection with `server/discover`, a newer draft's method this server does
   * not implement, and falls back to the classic handshake **only because it gets an error
   * back**. Measured 2026-08-31: an empty result instead fails the whole ACP session with
   * `McpMissingResultType`, so every fx agent would launch with no mailbox at all. This is a
   * separate test from the one above because the assertion that matters is `error` being
   * present rather than `result` — a future refactor that made unknown methods return `{}` for
   * politeness would pass a "reports an error" test written loosely.
   */
  it('answers server/discover with an error, which is what makes fx fall back', async () => {
    const { json } = await harness();
    const reply = await json('server/discover');
    expect(reply['result']).toBeUndefined();
    expect(reply['error']).toMatchObject({ code: -32601 });
  });
});

/**
 * Issue 05's `propose_routine`, on the wire. An agent may propose; only a person may arm.
 */
describe('the proposal tool', () => {
  /** A server that keeps Routines, with whatever the orchestrator would have answered. */
  async function proposing(
    answer?: (call: RoutineProposalCall) => Promise<RoutineProposalAck>,
  ): Promise<{ calls: RoutineProposalCall[]; json: Harness['json'] }> {
    const calls: RoutineProposalCall[] = [];
    const server = new PeerMessageServer({
      handler: async () => ({ delivered: true, recipient: 'Bob', status: 'started' }),
      proposeRoutine: async (call) => {
        calls.push(call);
        if (answer !== undefined) return answer(call);
        return {
          proposed: true,
          routineId: 'rt_1',
          name: call.name,
          schedule: 'every day at 09:00',
          frequency: '1 firing a day',
          armed: true,
        };
      },
    });
    await server.start();
    running = server;
    const endpoint = server.endpointFor('alice');
    const json = async (
      method: string,
      params?: unknown,
    ): Promise<Record<string, unknown>> =>
      (await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${endpoint.token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          ...(params === undefined ? {} : { params }),
        }),
      }).then((response) => response.json())) as Record<string, unknown>;
    return { calls, json };
  }

  it('is not advertised at all by a server that keeps no Routines', async () => {
    const { json } = await harness();
    const listed = await json('tools/list');
    const tools = (listed['result'] as { tools: { name: string }[] }).tools;
    // A tool a model can see is a capability it will believe in, and a demo team's database is
    // thrown away when the window closes.
    expect(tools.map((tool) => tool.name)).toEqual(['message_agent']);
  });

  it('is listed beside message_agent when the team keeps them', async () => {
    const { json } = await proposing();
    const listed = await json('tools/list');
    const tools = (listed['result'] as { tools: { name: string }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(['message_agent', 'propose_routine']);
  });

  it('has no field for a recipient and no field that arms one', async () => {
    const { json } = await proposing();
    const listed = await json('tools/list');
    const tools = (listed['result'] as { tools: { name: string; inputSchema: { properties: Record<string, unknown> } }[] }).tools;
    const schema = tools.find((tool) => tool.name === 'propose_routine')?.inputSchema;
    // The absence is the rule: the bearer token is the caller, and only a person arms.
    expect(Object.keys(schema?.properties ?? {})).toEqual(['name', 'prompt', 'schedule']);
  });

  it('carries the caller from the token, never from the arguments', async () => {
    const { calls, json } = await proposing();
    await json('tools/call', {
      name: 'propose_routine',
      arguments: {
        name: 'nightly typecheck',
        prompt: 'run the typecheck and say what broke',
        schedule: { every: 'day', hour: 9, minute: 0 },
      },
    });
    expect(calls[0]?.from).toBe('alice');
  });

  it('refuses a proposal aimed at a teammate rather than quietly making it your own', async () => {
    const { calls, json } = await proposing();
    const reply = await json('tools/call', {
      name: 'propose_routine',
      arguments: {
        agent: 'Bob',
        name: 'nightly typecheck',
        prompt: 'run the typecheck',
        schedule: { every: 'day', hour: 9, minute: 0 },
      },
    });
    expect((reply['result'] as { isError?: boolean }).isError).toBe(true);
    expect(toolText(reply)).toContain('for yourself');
    expect(calls).toEqual([]);
  });

  it('tells the model in the answer that it is running, and when', async () => {
    const { json } = await proposing();
    const reply = await json('tools/call', {
      name: 'propose_routine',
      arguments: {
        name: 'nightly typecheck',
        prompt: 'run the typecheck',
        schedule: { every: 'day', hour: 9, minute: 0 },
      },
    });
    const text = toolText(reply);
    // The hazard this wording exists for has not gone away, it changed direction. It used to be
    // an agent reporting work as scheduled that nobody would run; under issue 05's amendment it
    // is an agent that believes its Routine is inert, never mentions arming one, and leaves the
    // user to find out from a turn at 03:00.
    expect(text).toContain('It is running now.');
    expect(text).toContain('every day at 09:00');
    expect(text).toContain('1 firing a day');
    expect(text).not.toContain('not running');
    expect((reply['result'] as { structuredContent?: RoutineProposalAck }).structuredContent).toMatchObject({
      proposed: true,
      armed: true,
    });
  });

  it('hands a refusal back as a tool error the model has to account for', async () => {
    const { json } = await proposing(async () => {
      throw new Error('You have already proposed a Routine this turn.');
    });
    const reply = await json('tools/call', {
      name: 'propose_routine',
      arguments: { name: 'another', prompt: 'do it again', schedule: { every: 'hour', minute: 0 } },
    });
    expect((reply['result'] as { isError?: boolean }).isError).toBe(true);
    expect(toolText(reply)).toContain('already proposed');
  });
});

/**
 * Ticket 03's `record_entry`, on the wire. An agent writes to its own Handbook and to no other.
 */
describe('the recording tool', () => {
  async function recording(
    answer?: (call: RecordEntryCall) => Promise<RecordEntryAck>,
  ): Promise<{ calls: RecordEntryCall[]; json: Harness['json'] }> {
    const calls: RecordEntryCall[] = [];
    const server = new PeerMessageServer({
      handler: async () => ({ delivered: true, recipient: 'Bob', status: 'started' }),
      recordEntry: async (call) => {
        calls.push(call);
        if (answer !== undefined) return answer(call);
        return {
          recorded: call.entries.map((entry, index) => ({
            id: `e${index + 1}`,
            ordinal: index + 1,
            text: entry.text,
          })),
          withdrew: [],
        };
      },
    });
    await server.start();
    running = server;
    const endpoint = server.endpointFor('alice');
    const json = async (method: string, params?: unknown): Promise<Record<string, unknown>> =>
      (await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${endpoint.token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          ...(params === undefined ? {} : { params }),
        }),
      }).then((response) => response.json())) as Record<string, unknown>;
    return { calls, json };
  }

  it('is not advertised by a server with nowhere to keep a Handbook', async () => {
    const { json } = await harness();
    const tools = (
      (await json('tools/list'))['result'] as { tools: { name: string }[] }
    ).tools;
    expect(tools.map((tool) => tool.name)).toEqual(['message_agent']);
  });

  it('takes a list, and names no agent, because the token is the caller', async () => {
    const { json } = await recording();
    const tools = (
      (await json('tools/list'))['result'] as {
        tools: { name: string; inputSchema: { properties: Record<string, unknown> } }[];
      }
    ).tools;
    const schema = tools.find((tool) => tool.name === 'record_entry')?.inputSchema;
    // There is no argument by which Bob could write into Mara's Handbook, and no check is
    // needed for it: the absence of the field is the rule, as it is on propose_routine.
    expect(Object.keys(schema?.properties ?? {})).toEqual(['entries']);
  });

  it('carries the caller from the token and the entries as given', async () => {
    const { calls, json } = await recording();
    await json('tools/call', {
      name: 'record_entry',
      arguments: {
        entries: [
          { text: 'nothing ships on a Friday', source: 'told' },
          { text: 'the tone is dry', source: 'noticed', replaces: 2 },
        ],
      },
    });

    expect(calls[0]?.from).toBe('alice');
    expect(calls[0]?.entries).toEqual([
      { text: 'nothing ships on a Friday', source: 'told' },
      { text: 'the tone is dry', source: 'noticed', replaces: 2 },
    ]);
  });

  it('tells the agent what was recorded, and that a person can remove it', async () => {
    const { json } = await recording();
    const reply = await json('tools/call', {
      name: 'record_entry',
      arguments: { entries: [{ text: 'nothing ships on a Friday', source: 'told' }] },
    });

    expect(toolText(reply)).toContain('Recorded 1 in your Handbook');
    expect(toolText(reply)).toContain('can remove any of it');
  });

  it('hands a refusal back as a tool error the model has to account for', async () => {
    const { json } = await recording(async () => {
      throw new Error('your handbook would be 9,000 characters and the limit is 8,000');
    });
    const reply = await json('tools/call', {
      name: 'record_entry',
      arguments: { entries: [{ text: 'one more thing', source: 'told' }] },
    });

    expect((reply['result'] as { isError?: boolean }).isError).toBe(true);
    expect(toolText(reply)).toContain('the limit is 8,000');
  });

  it('refuses an entry with no source rather than choosing one', async () => {
    const { calls, json } = await recording();
    const reply = await json('tools/call', {
      name: 'record_entry',
      arguments: { entries: [{ text: 'something' }] },
    });

    // It cannot be derived: the agent calls this tool in every case, including the one that
    // looks like the user's, so there is nothing to infer an author from.
    expect((reply['result'] as { isError?: boolean }).isError).toBe(true);
    expect(calls).toEqual([]);
  });
});
