// ACP stdio driver that hands the agent an HTTP MCP server via session/new.mcpServers.
// Works against both runtimes; pick with AGENT=opencode|claude.
//
// env:
//   AGENT      opencode | claude          (default opencode)
//   PROJ       cwd for the session        (required)
//   OUT        transcript jsonl path      (required)
//   URL        http url of the MCP server (required)
//   TOKEN      bearer token to put in headers (optional)
//   PROMPT     prompt text
//   SCENARIO   basic | load | noprompt    (default basic)
//   PROMPT2    second prompt for `load`
//   RELOAD_MCP 1 = re-supply mcpServers on session/load, 0 = omit  (default 1)
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const AGENT = process.env.AGENT || 'opencode';
const PROJ = process.env.PROJ;
const OUT = process.env.OUT;
const URL_ = process.env.URL;
const TOKEN = process.env.TOKEN || '';
const SCENARIO = process.env.SCENARIO || 'basic';
const PROMPT = process.env.PROMPT || 'Send the message "hello from Alice" to the agent named Bob. Then tell me exactly what the tool returned.';
const RELOAD_MCP = process.env.RELOAD_MCP !== '0';

const CMD = AGENT === 'claude'
  ? ['/home/alain/.npm/_npx/fca12915ff656968/node_modules/.bin/claude-agent-acp', []]
  : ['/home/alain/.opencode/bin/opencode', ['acp']];

const log = fs.createWriteStream(OUT, { flags: 'w' });
const t0 = Date.now();
const rec = (dir, msg, note) => log.write(JSON.stringify({ t: Date.now() - t0, dir, ...(note ? { note } : {}), msg }) + '\n');

const child = spawn(CMD[0], CMD[1], {
  cwd: PROJ, stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env, NO_COLOR: '1',
    CLAUDE_CODE_EXECUTABLE: '/home/alain/.local/bin/claude',
  },
});
child.stderr.on('data', d => rec('stderr', String(d)));
child.on('exit', (c, s) => rec('exit', { code: c, signal: s }));

let nextId = 1;
const pending = new Map();
const send = o => { rec('out', o); child.stdin.write(JSON.stringify(o) + '\n'); };
const call = (method, params) => {
  const id = nextId++;
  send({ jsonrpc: '2.0', id, method, params });
  return new Promise(res => {
    pending.set(id, res);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ __timeout: true }); } }, Number(process.env.TIMEOUT || 180000));
  });
};

let buf = '';
child.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { rec('in-unparsed', line); continue; }
    rec('in', m);
    if (m.id !== undefined && m.method === undefined) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (p) p(m.error ? { __error: m.error } : { ok: m.result });
    } else if (m.method === 'session/update') {
      // recorded already
    } else if (m.method && m.id !== undefined) {
      if (m.method === 'session/request_permission') {
        const opts = m.params.options || [];
        const pick = opts.find(o => /allow_once|allow/i.test(o.kind || o.optionId || '')) || opts[0];
        send({ jsonrpc: '2.0', id: m.id, result: { outcome: { outcome: 'selected', optionId: pick && pick.optionId } } });
      } else if (m.method === 'fs/read_text_file') {
        try { send({ jsonrpc: '2.0', id: m.id, result: { content: fs.readFileSync(m.params.path, 'utf8') } }); }
        catch (e) { send({ jsonrpc: '2.0', id: m.id, error: { code: -32603, message: String(e) } }); }
      } else if (m.method === 'fs/write_text_file') {
        try { fs.writeFileSync(m.params.path, m.params.content); send({ jsonrpc: '2.0', id: m.id, result: null }); }
        catch (e) { send({ jsonrpc: '2.0', id: m.id, error: { code: -32603, message: String(e) } }); }
      } else {
        send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'not implemented' } });
      }
    }
  }
});

const mcpEntry = () => ({
  type: 'http',
  name: 'blobot',
  url: URL_,
  headers: TOKEN ? [{ name: 'Authorization', value: 'Bearer ' + TOKEN }] : [],
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P = o => JSON.stringify(o);

(async () => {
  const init = await call('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
  });
  rec('note', init, 'initialize result');
  console.log('INIT caps:', P(init.ok?.agentCapabilities));

  const ns = await call('session/new', { cwd: PROJ, mcpServers: [mcpEntry()] });
  rec('note', ns, 'session/new result');
  console.log('SESSION/NEW:', ns.__error ? 'ERROR ' + P(ns.__error) : ns.__timeout ? 'TIMEOUT' : 'ok sid=' + ns.ok.sessionId);
  if (!ns.ok) { child.kill('SIGTERM'); await sleep(300); process.exit(0); }
  const sessionId = ns.ok.sessionId;

  if (SCENARIO !== 'noprompt') {
    const r = await call('session/prompt', { sessionId, prompt: [{ type: 'text', text: PROMPT }] });
    rec('note', r, 'prompt result');
    console.log('PROMPT1:', P(r).slice(0, 600));
  }

  if (SCENARIO === 'load') {
    // kill this process's agent, then reconnect a fresh agent process and session/load
    child.kill('SIGTERM'); await sleep(1200);
    const c2 = spawn(CMD[0], CMD[1], {
      cwd: PROJ, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', CLAUDE_CODE_EXECUTABLE: '/home/alain/.local/bin/claude' },
    });
    c2.stderr.on('data', d => rec('stderr2', String(d)));
    let b2 = '', id2 = 1; const pend2 = new Map();
    const send2 = o => { rec('out2', o); c2.stdin.write(JSON.stringify(o) + '\n'); };
    const call2 = (method, params) => { const id = id2++; send2({ jsonrpc: '2.0', id, method, params }); return new Promise(res => { pend2.set(id, res); setTimeout(() => { if (pend2.has(id)) { pend2.delete(id); res({ __timeout: true }); } }, 180000); }); };
    c2.stdout.on('data', d => {
      b2 += d.toString(); let i;
      while ((i = b2.indexOf('\n')) >= 0) {
        const line = b2.slice(0, i); b2 = b2.slice(i + 1); if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        rec('in2', m);
        if (m.id !== undefined && m.method === undefined) { const p = pend2.get(m.id); pend2.delete(m.id); if (p) p(m.error ? { __error: m.error } : { ok: m.result }); }
        else if (m.method && m.id !== undefined && m.method !== 'session/update') {
          if (m.method === 'session/request_permission') {
            const opts = m.params.options || [];
            const pick = opts.find(o => /allow_once|allow/i.test(o.kind || o.optionId || '')) || opts[0];
            send2({ jsonrpc: '2.0', id: m.id, result: { outcome: { outcome: 'selected', optionId: pick && pick.optionId } } });
          } else send2({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'ni' } });
        }
      }
    });
    await call2('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false } });
    const loadParams = { sessionId, cwd: PROJ };
    if (RELOAD_MCP) loadParams.mcpServers = [mcpEntry()];
    else loadParams.mcpServers = [];
    const lr = await call2('session/load', loadParams);
    rec('note', lr, 'session/load result (RELOAD_MCP=' + RELOAD_MCP + ')');
    console.log('SESSION/LOAD:', P(lr).slice(0, 400));
    const r2 = await call2('session/prompt', { sessionId, prompt: [{ type: 'text', text: process.env.PROMPT2 || 'Now send the message "second message" to the agent named Carol using the same tool. Tell me exactly what it returned.' }] });
    rec('note', r2, 'prompt2 result');
    console.log('PROMPT2:', P(r2).slice(0, 600));
    await sleep(500); c2.kill('SIGTERM');
  }

  await sleep(500);
  child.kill('SIGTERM');
  await sleep(500);
  log.end();
  process.exit(0);
})();
