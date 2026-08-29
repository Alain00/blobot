// Generic ACP stdio driver. Logs every frame both directions with timestamps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.env.OUT || 'transcript.jsonl';
const CWD = process.env.PROJ;
const PROMPT = process.env.PROMPT || 'Say hello in exactly three words.';
const SCENARIO = process.env.SCENARIO || 'basic';
const PERMMODE = process.env.PERMMODE || 'allow'; // allow | deny
const log = fs.createWriteStream(OUT, { flags: 'w' });
const t0 = Date.now();
function rec(dir, obj, note) {
  log.write(JSON.stringify({ t: Date.now() - t0, dir, ...(note?{note}:{}) , msg: obj }) + '\n');
}

const child = spawn('/home/alain/.opencode/bin/opencode', ['acp'], {
  cwd: CWD, stdio: ['pipe','pipe','pipe'],
  env: { ...process.env, NO_COLOR: '1' },
});
child.stderr.on('data', d => rec('stderr', String(d)));
child.on('exit', (c, s) => { rec('exit', { code: c, signal: s }); log.end(); });

let nextId = 1;
const pending = new Map();
function send(obj) { rec('out', obj); child.stdin.write(JSON.stringify(obj) + '\n'); }
function call(method, params) {
  const id = nextId++;
  send({ jsonrpc: '2.0', id, method, params });
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
function respond(id, result) { send({ jsonrpc: '2.0', id, result }); }
function respondErr(id, error) { send({ jsonrpc: '2.0', id, error }); }

let buf = '';
const handlers = {};
child.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch (e) { rec('in-unparsed', line); continue; }
    rec('in', m);
    if (m.id !== undefined && m.method === undefined) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (p) (m.error ? p.rej(m.error) : p.res(m.result));
    } else if (m.method) {
      handleRequest(m);
    }
  }
});

let sessionId = null;
let permCount = 0;
function handleRequest(m) {
  const { method, params, id } = m;
  if (method === 'session/update') { onUpdate(params); return; }
  if (id === undefined) return; // notification we don't handle
  if (method === 'session/request_permission') {
    permCount++;
    const opts = params.options || [];
    let pick;
    if (PERMMODE === 'deny') pick = opts.find(o => /reject|deny/i.test(o.kind||o.optionId||''))
    else pick = opts.find(o => /allow_once|allow/i.test(o.kind||o.optionId||''));
    pick = pick || opts[0];
    respond(id, { outcome: { outcome: 'selected', optionId: pick && pick.optionId } });
    return;
  }
  if (method === 'fs/read_text_file') {
    try { respond(id, { content: fs.readFileSync(params.path, 'utf8') }); }
    catch (e) { respondErr(id, { code: -32603, message: String(e) }); }
    return;
  }
  if (method === 'fs/write_text_file') {
    try { fs.writeFileSync(params.path, params.content); respond(id, null); }
    catch (e) { respondErr(id, { code: -32603, message: String(e) }); }
    return;
  }
  respondErr(id, { code: -32601, message: 'Method not found: ' + method });
}

function onUpdate(p) { /* already recorded */ }

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  try {
    const init = await call('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: false,
      },
    });
    rec('note', init, 'initialize result');

    const ns = await call('session/new', { cwd: CWD, mcpServers: [] });
    sessionId = ns.sessionId;
    rec('note', ns, 'session/new result');

    if (SCENARIO === 'cancel') {
      const pr = call('session/prompt', { sessionId, prompt: [{ type: 'text', text: PROMPT }] });
      await sleep(Number(process.env.CANCEL_AFTER || 4000));
      send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
      const r = await pr.catch(e => ({ __error: e }));
      rec('note', r, 'prompt result after cancel');
      await sleep(2000);
    } else if (SCENARIO === 'badmethod') {
      const r = await call('nonexistent/method', {}).catch(e => ({ __error: e }));
      rec('note', r, 'bad method result');
      const r2 = await call('session/prompt', { sessionId: 'bogus-session', prompt: [{type:'text',text:'hi'}] }).catch(e => ({ __error: e }));
      rec('note', r2, 'bad session result');
    } else if (SCENARIO === 'twoturns') {
      const r1 = await call('session/prompt', { sessionId, prompt: [{ type: 'text', text: PROMPT }] }).catch(e=>({__error:e}));
      rec('note', r1, 'turn1 result');
      const r2 = await call('session/prompt', { sessionId, prompt: [{ type: 'text', text: process.env.PROMPT2 || 'What did I just ask you?' }] }).catch(e=>({__error:e}));
      rec('note', r2, 'turn2 result');
    } else {
      const r = await call('session/prompt', { sessionId, prompt: [{ type: 'text', text: PROMPT }] }).catch(e => ({ __error: e }));
      rec('note', r, 'prompt result');
    }
    rec('note', { permissionRequests: permCount }, 'summary');
  } catch (e) {
    rec('note', { fatal: String(e), detail: e }, 'driver error');
  }
  await sleep(500);
  child.kill('SIGTERM');
  await sleep(500);
  process.exit(0);
})();
