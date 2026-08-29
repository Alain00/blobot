// Minimal MCP server over Streamable HTTP, bound to 127.0.0.1.
// Exposes one tool: blobot_message_agent({agent, message}) -> text ack.
// Logs every HTTP request (method, path, headers, body) to LOG.
//
// env:
//   PORT       (default 0 -> ephemeral, printed as "PORT <n>" on stdout)
//   LOG        (default ./httpmcp.log)
//   TOKEN      if set, requires "Authorization: Bearer <TOKEN>"; otherwise 401
//   MODE       json | sse   (how tool/list/call responses are framed; default json)
//   DIE_AFTER  if set to N, process.exit(0) after the Nth tools/call is received
//              (used for the "unreachable mid-turn" scenario)
import http from 'node:http';
import fs from 'node:fs';

const LOG = process.env.LOG || 'httpmcp.log';
const TOKEN = process.env.TOKEN || '';
const MODE = process.env.MODE || 'json';
const DIE_AFTER = process.env.DIE_AFTER ? Number(process.env.DIE_AFTER) : 0;
const log = fs.createWriteStream(LOG, { flags: 'a' });
const t0 = Date.now();
const L = (...a) => log.write(`[${String(Date.now() - t0).padStart(6)}ms] ` + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');

let callCount = 0;
const SESSION_ID = 'blobot-http-session-1';

const TOOLS = [{
  name: 'message_agent',
  description: 'Send an asynchronous message to a teammate agent. Use this whenever you are asked to send, relay, or deliver a message to another agent by name.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Name of the teammate agent to message' },
      message: { type: 'string', description: 'The message body' },
    },
    required: ['agent', 'message'],
    additionalProperties: false,
  },
}];

function handle(msg) {
  const { method, id, params } = msg;
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id, result: {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'blobot-http', version: '0.0.1' },
      },
    };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
  if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
  if (method === 'tools/call') {
    callCount++;
    L('!!! TOOL CALLED #' + callCount, JSON.stringify(params));
    if (DIE_AFTER && callCount >= DIE_AFTER) {
      L('!!! DIE_AFTER reached — exiting without responding');
      log.end();
      setTimeout(() => process.exit(0), 50);
      return null;
    }
    const a = params?.arguments || {};
    return {
      jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `BLOBOT-ACK: queued message for ${a.agent}: "${a.message}"` }],
      },
    };
  }
  if (id !== undefined) return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
  return null;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    L('REQ', req.method, req.url, JSON.stringify(req.headers), 'BODY=' + body);

    if (TOKEN) {
      const auth = req.headers['authorization'] || '';
      if (auth !== 'Bearer ' + TOKEN) {
        L('AUTH REJECT — got', JSON.stringify(auth));
        res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized' }, id: null }));
        return;
      }
      L('AUTH OK');
    }

    if (req.method === 'GET') {
      // Optional server->client SSE stream. Open it and keep it alive.
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': ok\n\n');
      const iv = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
      req.on('close', () => clearInterval(iv));
      return;
    }
    if (req.method === 'DELETE') { res.writeHead(200).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }

    let msgs;
    try { msgs = JSON.parse(body); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'parse error' }, id: null }));
      return;
    }
    const arr = Array.isArray(msgs) ? msgs : [msgs];
    const out = arr.map(handle).filter(Boolean);

    if (out.length === 0) { res.writeHead(202, { 'Mcp-Session-Id': SESSION_ID }).end(); return; }

    const payload = Array.isArray(msgs) ? out : out[0];
    if (MODE === 'sse') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Mcp-Session-Id': SESSION_ID });
      res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': SESSION_ID });
      res.end(JSON.stringify(payload));
    }
    L('RES', JSON.stringify(payload).slice(0, 400));
  });
});

server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
  const p = server.address().port;
  L('LISTENING on 127.0.0.1:' + p, 'TOKEN=' + (TOKEN ? 'yes' : 'no'), 'MODE=' + MODE);
  console.log('PORT ' + p);
});
