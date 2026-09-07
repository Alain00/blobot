// Real CLI, deterministic localhost Messages API. No external provider or real credential.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const bridge = createRequire(join(repo, 'packages/core/package.json')).resolve('@agentclientprotocol/claude-agent-acp/dist/lib.js');
const sdkPath = createRequire(bridge).resolve('@anthropic-ai/claude-agent-sdk');
const cliPath = '/Users/guillermo/.local/share/claude/versions/2.1.260';
const syntheticKey = 'sk-ant-synthetic-local-fixture-44-not-a-real-key';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = path => access(path).then(() => true, () => false);
const helperPath = join(repo, 'packages/core/src/adapters/claude/sandbox.ts');
const { claudeSandboxFor } = await import(pathToFileURL(helperPath));
const policy = claudeSandboxFor('local');
assert.deepEqual(policy, { enabled: true, failIfUnavailable: true,
  autoAllowBashIfSandboxed: false, allowUnsandboxedCommands: false });

function envFor(root, port) {
  return {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8',
    CLAUDE_CONFIG_DIR: join(root, 'config'), CLAUDE_CODE_TMPDIR: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
    ANTHROPIC_API_KEY: syntheticKey, ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1',
    DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
  };
}
function guard(root, port) {
  return `(version 1)
(allow default)
(deny network*)
(allow network-outbound (remote ip "localhost:${port}"))
(deny file-write*)
(allow file-write* (subpath ${JSON.stringify(root)}) (literal "/dev/null"))
(deny file-read*
  (subpath "/Users/guillermo/.claude") (literal "/Users/guillermo/.claude.json")
  (subpath "/Users/guillermo/.aws") (subpath "/Users/guillermo/.ssh")
  (literal "/Users/guillermo/.gitconfig") (subpath "/Users/guillermo/.config/git")
  (literal "/Users/guillermo/.bashrc") (literal "/Users/guillermo/.bash_profile")
  (literal "/Users/guillermo/.zshrc") (literal "/Users/guillermo/.zshenv")
  (literal "/Users/guillermo/.profile")
  (subpath "/Users/guillermo/Library/Keychains") (subpath "/Library/Keychains")
  (subpath "/Library/Application Support/ClaudeCode") (subpath "/Library/Managed Preferences"))
(deny mach-lookup (global-name "com.apple.securityd"))`;
}
function reply(res, body, tool, serial) {
  const isTool = Boolean(tool);
  const content = isTool ? { type: 'tool_use', id: 'toolu_fixture44', name: 'Bash', input: tool }
    : { type: 'text', text: 'Synthetic final response after the Bash result.' };
  const message = { id: `msg_fixture44_${serial}`, type: 'message', role: 'assistant',
    model: body.model, content: [content], stop_reason: isTool ? 'tool_use' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(message)); return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'request-id': message.id });
  const send = event => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  send({ type: 'message_start', message: { ...message, content: [], stop_reason: null } });
  send({ type: 'content_block_start', index: 0, content_block: isTool ? { ...content, input: {} } : { type: 'text', text: '' } });
  send({ type: 'content_block_delta', index: 0, delta: isTool
    ? { type: 'input_json_delta', partial_json: JSON.stringify(tool) }
    : { type: 'text_delta', text: content.text } });
  send({ type: 'content_block_stop', index: 0 });
  send({ type: 'message_delta', delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 10 } });
  send({ type: 'message_stop' }); res.end();
}

async function worker(root) {
  const { query } = await import(pathToFileURL(sdkPath));
  const input = JSON.parse(await readFile(join(root, 'case.json'), 'utf8'));
  let native, q, stderr = '', messages = [], approvals = [], error, forcedCleanup = false;
  const out = { name: input.name, approvals, messages };
  const deadline = setTimeout(() => { forcedCleanup = true; native?.kill('SIGKILL'); }, 35000);
  try {
    q = query({ prompt: 'Run the one synthetic Bash command provided by the fixture, then finish.', options: {
      cwd: join(root, 'project'), pathToClaudeCodeExecutable: cliPath, env: envFor(root, input.port),
      model: 'claude-sonnet-4-6', thinking: { type: 'disabled' }, maxTurns: 3,
      tools: ['Bash'], allowedTools: [], permissionMode: 'default',
      sandbox: input.sandbox, settingSources: ['user', 'project', 'local'],
      settings: { apiKeyHelper: '' },
      persistSession: false, strictMcpConfig: true, mcpServers: {}, debugFile: join(root, 'cli-debug.log'),
      canUseTool: async (name, toolInput, context) => {
        approvals.push({ name, input: toolInput, toolUseID: context.toolUseID, decision: input.decision });
        assert.equal(name, 'Bash'); assert.equal(toolInput.command, input.command);
        return input.decision === 'allow'
          ? { behavior: 'allow', updatedInput: toolInput, decisionClassification: 'user_temporary' }
          : { behavior: 'deny', message: 'Synthetic fixture denied this Bash approval.', decisionClassification: 'user_reject' };
      },
      spawnClaudeCodeProcess(options) {
        // The worker already inherits the exact endpoint/write-root guard.
        native = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'] });
        native.stderr.on('data', b => { stderr += b; });
        return native;
      },
    } });
    await q.initializationResult(); out.initialized = true;
    for await (const message of q) {
      if (message.type === 'assistant' || message.type === 'user') messages.push({ type: message.type,
        content: message.message?.content, tool_use_result: message.tool_use_result });
      else if (message.type === 'result') messages.push({ type: 'result', subtype: message.subtype,
        is_error: message.is_error, errors: message.errors, result: message.result });
      else messages.push({ type: message.type, subtype: message.subtype });
    }
  } catch (e) { error = e.message; }
  finally {
    q?.close();
    if (native && native.exitCode === null && native.signalCode === null) {
      const cleanupTimer = setTimeout(() => { forcedCleanup = true; native.kill('SIGKILL'); }, 3000);
      await once(native, 'exit').catch(() => {}); clearTimeout(cleanupTimer);
    }
    clearTimeout(deadline);
  }
  let sandboxDebug = [];
  try { sandboxDebug = (await readFile(join(root, 'cli-debug.log'), 'utf8')).split('\n')
    .filter(line => /Failed to initialize sandbox|sandbox_exec|Sandbox is required|Sandbox is enabled/.test(line))
    .map(line => line.slice(0, 900)); } catch {}
  process.stdout.write(JSON.stringify({ ...out, error, stderr, sandboxDebug,
    nativeExitCode: native?.exitCode, nativeExitSignal: native?.signalCode, forcedCleanup }));
}

async function runCase(root, name, sandbox, decision) {
  const caseRoot = join(root, name);
  for (const part of ['config', 'tmp', 'project/.claude']) await mkdir(join(caseRoot, part), { recursive: true });
  const marker = join(caseRoot, 'project', 'marker');
  const command = `printf fixture44-ok > '${marker}'`;
  const requests = []; let messagesSent = 0;
  const server = createServer(async (req, res) => {
    try {
      let bytes = ''; for await (const b of req) { bytes += b; if (bytes.length > 4 * 1024 * 1024) throw Error('Request too large'); }
      const body = bytes ? JSON.parse(bytes) : {};
      const toolResults = (body.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : [])
        .filter(c => c.type === 'tool_result');
      requests.push({ path: req.url, method: req.method, model: body.model, stream: body.stream,
        toolNames: body.tools?.map(t => t.name), apiKeyWasSynthetic: req.headers['x-api-key'] === syntheticKey,
        toolResults });
      if (req.url?.startsWith('/v1/messages/count_tokens')) {
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":10}'); return;
      }
      if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages') || !body.tools?.some(t => t.name === 'Bash') || messagesSent >= 2) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Only the two synthetic Bash fixture requests are accepted.' } })); return;
      }
      messagesSent++;
      reply(res, body, messagesSent === 1 ? { command, description: 'Write a synthetic fixture marker', timeout: 1000 } : null, messagesSent);
    } catch (e) { res.writeHead(400); res.end(String(e.message)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await writeFile(join(caseRoot, 'case.json'), JSON.stringify({ name, port, sandbox, decision, command }));
  const profile = guard(caseRoot, port);
  let processResult;
  try {
    processResult = await new Promise(resolve => {
      const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, process.execPath, fileURLToPath(import.meta.url), '--worker', caseRoot],
        { cwd: join(caseRoot, 'project'), env: envFor(caseRoot, port), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      const timer = setTimeout(() => child.kill('SIGKILL'), 40000);
      child.on('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
      child.on('error', e => { clearTimeout(timer); resolve({ error: e.message, stdout, stderr }); });
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  let observation; try { observation = JSON.parse(processResult.stdout); } catch { observation = { rawOutput: processResult.stdout }; }
  return { name, sandbox, decision, profile, command, requests, messagesSent,
    workerExitCode: processResult.code, workerExitSignal: processResult.signal, workerStderr: processResult.stderr,
    observation, markerExists: await exists(marker), markerContent: await readFile(marker, 'utf8').catch(() => null) };
}

function verify(report) {
  let assertions = 0;
  const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
  const matches = (actual, pattern) => { assert.match(actual, pattern); assertions++; };
  check(report.cases.length, 3, 'all three cases must exercise the provider');
  for (const test of report.cases) {
    check(test.messagesSent, 2); check(test.workerExitCode, 0); check(test.workerExitSignal, null);
    check(test.workerStderr, ''); check(test.observation.initialized, true);
    check(test.observation.error, undefined); check(test.observation.nativeExitCode, 0);
    check(test.observation.nativeExitSignal, null); check(test.observation.forcedCleanup, false);
    check(test.observation.stderr, '');
    check(test.requests.filter(r => r.method === 'POST').every(r => r.apiKeyWasSynthetic), true);
    check(test.observation.approvals.length, 1);
    check(test.observation.approvals[0].name, 'Bash');
    check(test.observation.approvals[0].input.command, test.command);
    check(test.observation.approvals[0].decision, test.decision);
    const results = test.observation.messages.filter(m => m.type === 'user').flatMap(m => m.content)
      .filter(c => c.type === 'tool_result');
    check(results.length, 1); check(results[0].tool_use_id, 'toolu_fixture44');
    check(test.requests.flatMap(r => r.toolResults).length, 1);
    check(test.observation.messages.at(-1).subtype, 'success');
    if (test.name === 'required-allow-approval') {
      check(test.markerExists, false); check(results[0].is_error, true);
      matches(results[0].content, /Sandbox is required but failed to initialize: EPERM:.*srt-mux-.*Restart to retry\./);
      check(test.observation.sandboxDebug.filter(line => line.includes('Failed to initialize sandbox')).length, 2);
    } else if (test.name === 'disabled-control') {
      check(test.markerExists, true); check(test.markerContent, 'fixture44-ok');
      check(results[0].is_error, false); check(test.observation.sandboxDebug, []);
    } else {
      check(test.markerExists, false); check(results[0].is_error, true);
      check(results[0].content, 'Synthetic fixture denied this Bash approval.');
      check(test.observation.sandboxDebug.filter(line => line.includes('Failed to initialize sandbox')).length, 1);
    }
  }
  return assertions;
}

if (process.argv[2] === '--verify-results') {
  const report = JSON.parse(await readFile(join(here, '44-claude-bash-failure-results.json'), 'utf8'));
  console.log(`${verify(report)} assertions passed (saved observations; no CLI or provider launched)`);
} else if (process.argv[2] === '--worker') await worker(process.argv[3]);
else {
  const root = await mkdtemp('/private/tmp/blobot-claude44-');
  const report = { fixture: '44-claude-bash-failure', uuid: randomUUID(), createdAt: new Date().toISOString(),
    pins: { cli: '2.1.260', sdk: '0.3.232', cliSha256: sha(await readFile(cliPath)), sdkSha256: sha(await readFile(sdkPath)),
      helperPath, helperSha256: sha(await readFile(helperPath)), helperPolicy: policy }, cases: [] };
  try {
    for (const [name, sandbox, decision] of [
      ['required-allow-approval', policy, 'allow'],
      ['disabled-control', { enabled: false }, 'allow'],
      ['required-deny-approval', policy, 'deny'],
    ]) {
      const result = await runCase(root, name, sandbox, decision); report.cases.push(result);
      console.log(`${name}: ${result.messagesSent} synthetic responses; approvals=${result.observation.approvals?.length}; marker=${result.markerExists}; error=${result.observation.error ?? 'none'}`);
      // Stop immediately when the endpoint does not exercise the intended path.
      if (result.messagesSent !== 2 || !result.observation.initialized) break;
    }
    report.assertionsPassed = verify(report);
  } finally {
    await rm(root, { recursive: true, force: true }); report.temporaryTreeRemoved = true;
    await writeFile(join(here, '44-claude-bash-failure-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
}
