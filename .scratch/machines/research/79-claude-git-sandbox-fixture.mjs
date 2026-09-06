// Real ACP bridge and pinned CLI, fixed localhost Messages API and empty fixture HOME/config.
// No real provider or credentials. The one Bash command is constructed below, not generated.
// Do not wrap this process in sandbox-exec: macOS rejects the CLI's nested sandbox_apply.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const bridge = createRequire(join(repo, 'packages/core/package.json')).resolve('@agentclientprotocol/claude-agent-acp/dist/lib.js');
const sdkPath = createRequire(bridge).resolve('@anthropic-ai/claude-agent-sdk');
const cliPath = '/Users/guillermo/.local/share/claude/versions/2.1.260';
const syntheticKey = 'sk-ant-synthetic-local-fixture-79-not-a-real-key';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const helperPath = join(repo, 'packages/core/src/adapters/claude/sandbox.ts');
const { claudeSandboxFor } = await import(pathToFileURL(helperPath));
const policy = claudeSandboxFor('local');

function envFor(root, port) {
  return {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8',
    HOME: join(root, 'config'), XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'tmp'),
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    CLAUDE_CONFIG_DIR: join(root, 'config'), CLAUDE_CODE_TMPDIR: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
    ANTHROPIC_API_KEY: syntheticKey, ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1',
    DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
  };
}
function reply(res, body, tool, serial) {
  const isTool = Boolean(tool);
  const content = isTool ? { type: 'tool_use', id: 'toolu_fixture79', name: 'Bash', input: tool }
    : { type: 'text', text: 'Synthetic final response after the Bash result.' };
  const message = { id: `msg_fixture79_${serial}`, type: 'message', role: 'assistant',
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
  const { ClaudeAgentRuntime } = await import(pathToFileURL(join(repo, 'packages/core/dist/index.js')));
  const input = JSON.parse(await readFile(join(root, 'case.json'), 'utf8'));
  const runtime = new ClaudeAgentRuntime({ agentId: 'fixture79', cwd: input.project,
    claudeExecutable: cliPath, env: envFor(root, input.port), trust: 'careful',
    gitDirectories: input.gitDirectories, options: { model: 'claude-sonnet-4-6' },
  });
  const events = [], approvals = [];
  let error, initialized = false;
  runtime.setPermissionHandler(async request => {
    approvals.push({ title: request.title, kinds: request.options.map(option => option.kind) });
    return request.options.find(option => option.kind === 'allow_once')?.optionId ?? null;
  });
  try {
    await runtime.start(); initialized = true;
    for await (const event of runtime.sendPrompt({ text: 'Run the one synthetic Bash command supplied by this fixture, then finish.', from: 'user' })) events.push(event);
  } catch (failure) { error = String(failure); }
  finally { await runtime.stop(); }
  process.stdout.write(JSON.stringify({ initialized, error, approvals, events }));
}

async function runCase(root, nested, allowGitWrites = true) {
  const caseRoot = join(root, nested ? (allowGitWrites ? 'nested' : 'nested-control') : 'ordinary');
  const project = join(caseRoot, 'project');
  for (const part of ['config', 'tmp', 'source', ...(nested ? ['project'] : [])]) await mkdir(join(caseRoot, part), { recursive: true });
  const names = nested ? ['one', 'two'] : [''];
  const gitDirectories = [];
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', env: {
      PATH: process.env.PATH, HOME: join(caseRoot, 'config'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    } });
  for (const name of names) {
    const source = join(caseRoot, 'source', name);
    await mkdir(source, { recursive: true });
    git(source, 'init', '-q'); git(source, 'commit', '--allow-empty', '-qm', 'initial');
    git(source, 'worktree', 'add', '-qb', 'fixture-agent', join(project, name));
    gitDirectories.push(join(source, '.git'));
  }
  const quoted = value => `'${value.replaceAll("'", "'\\''")}'`;
  const gitCommands = names.map(name => {
    const cwd = quoted(join(project, name));
    return `printf fixture79 > ${quoted(join(project, name, 'fixture.txt'))} && git -C ${cwd} add fixture.txt && git -C ${cwd} -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -m fixture79`;
  });
  const binding = 'require("node:net").createServer().listen(0,"127.0.0.1",function(){console.log("fixture79-loopback");this.close()})';
  const command = `${gitCommands.join(' && ')} && ${quoted(process.execPath)} -e ${quoted(binding)}`;
  const requests = []; let messagesSent = 0;
  const server = createServer(async (req, res) => {
    try {
      let bytes = ''; for await (const b of req) { bytes += b; if (bytes.length > 4 * 1024 * 1024) throw Error('Request too large'); }
      const body = bytes ? JSON.parse(bytes) : {};
      const toolResults = (body.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : []).filter(c => c.type === 'tool_result');
      requests.push({ path: req.url, method: req.method, apiKeyWasSynthetic: req.headers['x-api-key'] === syntheticKey, toolResults });
      if (req.url?.startsWith('/v1/messages/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":10}'); return; }
      if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages') || !body.tools?.some(t => t.name === 'Bash') || messagesSent >= 2) {
        res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Only synthetic Bash fixture requests are accepted.' } })); return;
      }
      messagesSent++;
      reply(res, body, messagesSent === 1 ? { command, description: 'Commit synthetic files in fixture worktrees', timeout: 10000 } : null, messagesSent);
    } catch (error) { res.writeHead(400); res.end(String(error.message)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await writeFile(join(caseRoot, 'case.json'), JSON.stringify({ port, project, gitDirectories: allowGitWrites ? gitDirectories : [] }));
  let result;
  try {
    result = await new Promise(resolve => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', caseRoot],
        { cwd: project, env: envFor(caseRoot, port), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 55000);
      child.on('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
      child.on('error', error => { clearTimeout(timer); resolve({ error: error.message, stdout, stderr }); });
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  let observation; try { observation = JSON.parse(result.stdout); } catch { observation = { raw: result.stdout }; }
  return { nested, allowGitWrites, policy: claudeSandboxFor('local', allowGitWrites ? gitDirectories : []), command, messagesSent, requests,
    process: { ...result, stdout: undefined }, observation,
    commits: names.map(name => git(join(project, name), 'log', '-1', '--format=%s').trim()) };
}

function verify(report) {
  assert.equal(report.temporaryTreeRemoved, true);
  assert.equal(report.cases.length, 3);
  for (const result of report.cases) {
    assert.equal(result.process.code, 0); assert.equal(result.observation.initialized, true);
    assert.equal(result.observation.error, undefined); assert.equal(result.messagesSent, 2);
    assert.equal(result.observation.approvals.length, 1);
    assert.equal(result.requests.filter(request => request.method === 'POST').every(request => request.apiKeyWasSynthetic), true);
    assert.equal(result.commits.every(commit => commit === 'fixture79'), result.allowGitWrites);
    const output = JSON.stringify(result.requests.flatMap(request => request.toolResults));
    if (result.allowGitWrites) assert.match(output, /fixture79-loopback/);
    else assert.match(output, /Operation not permitted|Permission denied/);
  }
}

if (process.argv[2] === '--verify-results') {
  verify(JSON.parse(await readFile(join(here, '79-claude-git-sandbox-results.json'), 'utf8')));
  console.log('Saved native Git and loopback observations verified.');
} else if (process.argv[2] === '--worker') await worker(process.argv[3]);
else {
  const root = await mkdtemp('/private/tmp/blobot-claude79-');
  const report = { fixture: '79-claude-git-sandbox', createdAt: new Date().toISOString(),
    pins: { cli: '2.1.260', sdkSha256: sha(await readFile(sdkPath)), cliSha256: sha(await readFile(cliPath)), bridgeSha256: sha(await readFile(bridge)),
      helperSha256: sha(await readFile(helperPath)) }, cases: [] };
  try {
    for (const [nested, allowGitWrites] of [[false, true], [true, false], [true, true]]) {
      const result = await runCase(root, nested, allowGitWrites); report.cases.push(result);
      console.log(JSON.stringify({ nested, allowGitWrites, messagesSent: result.messagesSent, process: result.process, initialized: result.observation.initialized,
        error: result.observation.error, approvals: result.observation.approvals?.length, commits: result.commits,
        toolResults: result.requests.flatMap(request => request.toolResults) }));
    }
  } finally {
    await rm(root, { recursive: true, force: true }); report.temporaryTreeRemoved = true;
    await writeFile(join(here, '79-claude-git-sandbox-results.json'), JSON.stringify(report, null, 2)+'\n');
  }
  verify(report);
}
