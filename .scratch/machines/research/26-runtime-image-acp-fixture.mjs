#!/usr/bin/env node
// Standalone, opt-in Docker fixture. Only --version, a UID/home probe and ACP initialize.
// No host mounts, authentication calls, sessions or prompts are implemented here.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  if (at < 0 || !args[at + 1]) throw new Error(`Missing ${name}`);
  return args[at + 1];
};
const receipts = resolve(option('--receipts'));
const resultsPath = resolve(option('--results'));
const runtimes = option('--runtimes').split(',');
const dockerConfig = resolve(option('--docker-config'));
const dockerHost = option('--docker-host');
const known = new Set(['claude', 'codex', 'fx', 'opencode', 'cursor']);
if (runtimes.some((name) => !known.has(name))) throw new Error('Unknown runtime');
if (!dockerHost.startsWith('unix:///')) throw new Error('Only an explicit local Docker socket is allowed');
const dockerEnv = { ...process.env, DOCKER_CONFIG: dockerConfig, DOCKER_HOST: dockerHost };
const request = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: 'blobot-runtime-image-acp-fixture', version: '1' },
  },
};
const report = args.includes('--append') ? JSON.parse(await readFile(resultsPath, 'utf8')) : {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  scope: 'Docker image checks only: UID/home, CLI --version and ACP initialize. No sessions, login or inference.',
  isolation: { network: 'none', user: 'agent', cpus: 1, memoryBytes: 1073741824, hostMounts: [], home: 'empty private tmpfs' },
  request,
  results: [],
};
if (args.includes('--append')) {
  if (report.schemaVersion !== 1 || JSON.stringify(report.request) !== JSON.stringify(request)) {
    throw new Error('Existing report is not from this fixture protocol');
  }
  if (runtimes.some((runtime) => report.results.some((entry) => entry.runtime === runtime))) {
    throw new Error('Append would duplicate a runtime; use a separate results file for a new attempt');
  }
  delete report.finishedAt;
}

function docker(argv, { stdin, onLine, timeoutMs = 45000 } = {}) {
  return new Promise((resolvePromise) => {
    const started = performance.now();
    const child = spawn('docker', argv, { env: dockerEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', partial = '', timedOut = false;
    let eofAtMs = null;
    const endInput = () => {
      if (eofAtMs === null) eofAtMs = performance.now() - started;
      child.stdin.end();
    };
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdout = (stdout + text).slice(0, 131072);
      partial += text;
      for (;;) {
        const newline = partial.indexOf('\n');
        if (newline < 0) break;
        const line = partial.slice(0, newline);
        partial = partial.slice(newline + 1);
        onLine?.(line, { endInput, elapsedMs: performance.now() - started });
      }
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(0, 131072); });
    child.once('error', (error) => { stderr += `\nDocker spawn failed: ${error.message}`; });
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    const forceTimeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs + 3000);
    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout); clearTimeout(forceTimeout);
      resolvePromise({ stdout, stderr, exitCode, signal, timedOut, elapsedMs: performance.now() - started, inputEofAtMs: eofAtMs });
    });
    if (stdin !== undefined) child.stdin.write(stdin);
    else endInput();
  });
}

async function runContainer(runtime, receipt, phase, executable, commandArgs, acp = false) {
  const name = `blobot-image-acp-${runtime}-${phase}-${randomUUID()}`;
  const argv = [
    'run', '--rm', '--init', '-i', '--name', name,
    '--label', 'blobot.fixture=runtime-image-acp-26',
    '--network', 'none', '--user', 'agent', '--cpus', '1', '--memory', '1g',
    '--tmpfs', '/home/agent:rw,nosuid,nodev,uid=1000,gid=1000,mode=0700',
    '--env', 'HOME=/home/agent', '--env', 'NO_COLOR=1',
    '--workdir', '/home/agent', '--entrypoint', executable,
    receipt.imageId, ...commandArgs,
  ];
  const protocolMessages = [];
  let initializeResponse = null;
  let initializeResponseAtMs = null;
  let result;
  try {
    result = await docker(argv, acp ? {
      stdin: `${JSON.stringify(request)}\n`,
      onLine: (line, control) => {
        let value;
        try { value = JSON.parse(line); } catch { return; }
        protocolMessages.push(value);
        if (value.id === 1 && (value.result !== undefined || value.error !== undefined) && initializeResponse === null) {
          initializeResponse = value;
          initializeResponseAtMs = control.elapsedMs;
          control.endInput();
        }
      },
    } : { timeoutMs: 20000 });
  } finally {
    // --rm handles ordinary exits; this exact name also covers timeout/startup failures.
    const removal = await docker(['rm', '-f', name], { timeoutMs: 10000 });
    const absence = await docker(['container', 'inspect', name, '--format', '{{.Id}}'], { timeoutMs: 10000 });
    const absent = absence.exitCode !== 0 && /No such (object|container)/i.test(absence.stderr);
    if (!result) result = {};
    result.cleanup = { exactName: name, absent, removeExitCode: removal.exitCode, inspectStderr: absence.stderr.trim() };
    if (!absent) throw new Error(`Fixture container cleanup could not be verified for ${name}`);
  }
  return {
    phase, name, command: { executable, args: commandArgs }, ...result,
    ...(acp ? { protocolMessages, initializeResponse, initializeResponseAtMs } : {}),
  };
}

for (const runtime of runtimes) {
  const receipt = JSON.parse(await readFile(join(receipts, `${runtime}-arm64.json`), 'utf8'));
  if (receipt.runtime !== runtime || receipt.arch !== 'arm64' || !/^sha256:[0-9a-f]{64}$/.test(receipt.imageId)) {
    throw new Error(`Invalid immutable image receipt for ${runtime}`);
  }
  const entry = { runtime, receipt, startedAt: new Date().toISOString(), checks: [] };
  report.results.push(entry);
  const probe = 'console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),home:process.env.HOME,homeEntries:require("node:fs").readdirSync(process.env.HOME),node:process.version}))';
  entry.checks.push(await runContainer(runtime, receipt, 'identity', '/usr/bin/node', ['-e', probe]));
  entry.checks.push(await runContainer(runtime, receipt, 'version', receipt.executable, ['--version']));
  const bridgePackage = runtime === 'claude' ? 'claude-agent-acp' : runtime === 'codex' ? 'codex-acp' : null;
  const executable = bridgePackage ? '/usr/bin/node' : receipt.executable;
  const commandArgs = bridgePackage
    ? [`/opt/blobot/node_modules/@agentclientprotocol/${bridgePackage}/dist/index.js`]
    : runtime === 'cursor' ? ['acp', '--workspace', '/home/agent'] : ['acp'];
  entry.checks.push(await runContainer(runtime, receipt, 'initialize', executable, commandArgs, true));
  entry.finishedAt = new Date().toISOString();
  await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`);
  const init = entry.checks.at(-1);
  console.log(JSON.stringify({ runtime, response: init.initializeResponse, exitCode: init.exitCode, timedOut: init.timedOut, elapsedMs: init.elapsedMs, cleanupVerified: init.cleanup.absent }));
}
report.finishedAt = new Date().toISOString();
await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`);
