// Synthetic, opt-in acceptance of current production source. No prompts or login.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { OwnedSbxMachine } from '../../../packages/core/src/machines/sbx/owned-machine.ts';
import { SbxRegistry } from '../../../packages/core/src/machines/sbx/registry.ts';
import { SbxImageStore } from '../../../packages/core/src/machines/sbx/image-store.ts';
import { sbxClientEnvironment } from '../../../packages/core/src/machines/sbx/client-environment.ts';
import { sbxNameFor } from '../../../packages/core/src/machines/sbx/kit.ts';
import { CLAUDE_MACHINE_IMAGE } from '../../../packages/core/src/adapters/claude/image.ts';
import { spawnClaudeBridge } from '../../../packages/core/src/adapters/claude/stdio-bridge.ts';
import { ClaudeAgentRuntime } from '../../../packages/core/src/adapters/claude/claude-agent-runtime.ts';
import { PeerMessageServer } from '../../../packages/core/src/mcp/peer-message-server.ts';
import { agentGitEnvironment } from '../../../packages/core/src/workspace/git-identity.ts';

assert.equal(process.env.BLOBOT_LIVE_PRODUCTION_BOX, '1');
const reportPath = new URL('./64-production-box-launch-results.json', import.meta.url);
const root = await realpath(await mkdtemp('/private/tmp/blobot-production-launch-'));
const run = promisify(execFile);
const clientEnv = sbxClientEnvironment();
const sbx = async (args: string[]) => (await run('/opt/homebrew/bin/sbx', args,
  { env: clientEnv, timeout: 120_000, maxBuffer: 2 * 1024 ** 2 })).stdout;
const json = async (args: string[]) => JSON.parse(await sbx(args));
const report: any = { startedAt: new Date().toISOString(), root, steps: [], rounds: [], launches: [], cleanup: {},
  scope: 'Published Claude arm64; current OwnedSbxMachine and ClaudeAgentRuntime/spawnClaudeBridge. No prompt, login, credential import, provider turn or global setting change.' };
const checkpoint = async () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
const guard = async () => {
  const disk = await statfs(root);
  const available = Number(disk.bavail) * Number(disk.bsize);
  report.minimumFreeBytes = Math.min(report.minimumFreeBytes ?? Infinity, available);
  assert(available >= 2 * 1024 ** 3, 'Retain at least 2 GiB free disk');
};
const bounded = async <T>(task: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([task, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timed out after ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer!); }
};
const step = async (name: string, action: () => Promise<any>) => {
  await guard(); console.log(JSON.stringify({ phase: name }));
  const item: any = { name, startedAt: new Date().toISOString() };
  report.steps.push(item); const start = performance.now();
  try { const value = await action(); item.ms = performance.now() - start; item.passed = true; await checkpoint(); return value; }
  catch (error: any) { item.ms = performance.now() - start; item.error = error.message; item.passed = false; await checkpoint(); throw error; }
};
const build = CLAUDE_MACHINE_IMAGE.builds.find(build => build.arch === 'arm64')!;
report.build = build;
const agentId = `research64_${randomUUID()}`;
report.agentId = agentId;
report.encodedAgentName = sbxNameFor(agentId);
assert(report.encodedAgentName.startsWith('blobot-research64.'));
const registry = new SbxRegistry(join(root, 'registry'));
const source = join(root, 'source'), workspace = join(root, 'worktree');
const gitEnv = { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...agentGitEnvironment('Research64') };
const git = async (args: string[]) => (await run('/usr/bin/git', args, { cwd: source, env: gitEnv, timeout: 15_000 })).stdout.trim();
let machine: OwnedSbxMachine | undefined, runtime: ClaudeAgentRuntime | undefined, loaded = false;
let server: PeerMessageServer | undefined;
let activeTransport: any;
let beforeImages: any[] = [];
const identity = agentGitEnvironment('Research64');
const tokens: string[] = [];
const safe = (text: string) => tokens.reduce((value, token) => value.replaceAll(token, '<fixture-bearer>'), text);
try {
  report.engine = await json(['version', '--json']);
  assert.equal(report.engine.server.version, 'v0.42.0-rc5');
  assert.deepEqual((await json(['ls', '--json'])).sandboxes, []);
  beforeImages = (await json(['template', 'ls', '--json'])).images;
  report.beforeImages = beforeImages;
  const sourceFiles = ['adapters/acp/npm-bridge.ts', 'adapters/claude/stdio-bridge.ts', 'adapters/claude/image.ts',
    'adapters/claude/claude-agent-runtime.ts', 'machines/sbx/transport.ts', 'machines/sbx/bootstrap.ts', 'machines/sbx/kit.ts', 'machines/sbx/owned-machine.ts'];
  report.sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path =>
    [path, createHash('sha256').update(await readFile(new URL(`../../../packages/core/src/${path}`, import.meta.url))).digest('hex')])));
  const store = new SbxImageStore(join(root, 'cache'));
  assert.equal((await store.readiness(build)).state, 'not_installed');
  loaded = true; // Own only this initially absent reference, including a partial load.
  await step('download-verify-load-published-image', () => store.install(build, { signal: AbortSignal.timeout(240_000),
    onProgress: (received, total) => { report.download = { received, total }; } }));
  assert.equal((await store.readiness(build)).state, 'ready');
  await mkdir(source);
  await git(['init', '-b', 'main']); await writeFile(join(source, 'README.md'), '# Synthetic research64\n');
  await git(['add', '.']); await git(['commit', '-m', 'Synthetic fixture']);
  await git(['worktree', 'add', '-b', 'research64', workspace]);
  report.sourceHead = await git(['rev-parse', 'HEAD']);
  machine = new OwnedSbxMachine({ agentId, registry,
    kit: { image: build.reference, guestNode: CLAUDE_MACHINE_IMAGE.guestNode, dataBytes: 8 * 1024 ** 3, dockerBytes: 20 * 1024 ** 3,
      workspace: { path: workspace, commonGit: [join(source, '.git')] } },
    limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 },
    transport: { moduleRoot: CLAUDE_MACHINE_IMAGE.moduleRoot, allowedEnvironment: CLAUDE_MACHINE_IMAGE.allowedEnvironment },
    sbxExecutable: '/opt/homebrew/bin/sbx', commandTimeoutMs: 120_000,
  });
  const originalSpawn = machine.spawn.bind(machine);
  machine.spawn = request => {
    report.launches.push({ command: request.command.kind === 'node-module' ? request.command : { kind: 'exec', executable: request.command.executable },
      cwd: request.cwd, env: request.env, configs: request.configs ?? [] });
    return originalSpawn(request);
  };
  // These are synthetic tripwires, never host credential/config values. Box launcher must ignore both.
  process.env.BLOBOT_CLAUDE_BRIDGE = '/nonexistent/research64-host-bridge';
  process.env.CLAUDE_CODE_EXECUTABLE = '/nonexistent/research64-host-claude';
  process.env.BLOBOT_RESEARCH64_SENTINEL = 'synthetic-host-only';
  let firstId: string | undefined;
  for (const round of ['fresh', 'reopened']) {
    const record: any = { round, mcpLogs: [], requests: [], replies: [], stderr: [], closes: [], toolCalls: 0 };
    report.rounds.push(record);
    server = new PeerMessageServer({ handler: async () => { record.toolCalls++; throw Error('No tool call authorized in startup acceptance'); },
      onLog: line => record.mcpLogs.push(safe(line)) });
    await server.start();
    await step(`${round}:owned-start`, () => machine!.start({ mailboxPort: server!.port, runtime: { image: build.reference } }));
    const owned = (await registry.read(agentId))!.active!;
    record.owned = owned;
    if (firstId) assert.equal(owned.id, firstId); else firstId = owned.id;
    record.detection = await machine.detectRuntime('claude-code', { agentId, power: 'awake', inspect: async read => read() });
    assert.equal(record.detection.readiness, 'needs_sign_in');
    const probe = machine.spawn({ cwd: workspace, command: { kind: 'exec', executable: '/usr/bin/node', args: ['-e',
      `const fs=require('node:fs'),os=require('node:os');console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),home:process.env.HOME,node:process.execPath,path:process.env.PATH,hostSentinelPresent:!!process.env.BLOBOT_RESEARCH64_SENTINEL,hostBridgeOverridePresent:!!process.env.BLOBOT_CLAUDE_BRIDGE,sshSocketPresent:fs.existsSync('/run/ssh-agent.sock'),credentialFilePresent:fs.existsSync('/home/agent/.claude/.credentials.json'),cpus:os.cpus().length,memTotal:fs.readFileSync('/proc/meminfo','utf8').match(/^MemTotal:.*$/m)[0],homeEntries:fs.readdirSync('/home/agent').sort(),mainCheckoutVisible:fs.existsSync(${JSON.stringify(join(source, 'README.md'))})}));`] } });
    const lines: string[] = []; for await (const line of probe.lines()) lines.push(line); await probe.close();
    record.guest = JSON.parse(lines.join('\n'));
    assert.equal(record.guest.uid, 1000); assert.equal(record.guest.cpus, 2);
    assert.equal(record.guest.hostSentinelPresent, false); assert.equal(record.guest.hostBridgeOverridePresent, false);
    assert.equal(record.guest.sshSocketPresent, false); assert.equal(record.guest.credentialFilePresent, false);
    assert.equal(record.guest.mainCheckoutVisible, false);
    const endpoint = server.endpointFor(agentId, machine.mailboxHostname); tokens.push(endpoint.token);
    const requests = new Map<any, any>();
    runtime = new ClaudeAgentRuntime({ agentId, machine, cwd: workspace, env: identity,
      claudeExecutable: '/nonexistent/research64-explicit-host-claude',
      mcpServers: [{ type: 'http', name: 'blobot', url: endpoint.url, headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }] }],
      onStderr: line => record.stderr.push(safe(line)),
      spawn: options => {
        const transport = spawnClaudeBridge(options); activeTransport = transport;
        const start = performance.now();
        transport.onClose(reason => record.closes.push({ ms: performance.now() - start, reason: reason ?? null }));
        return {
          write(line) {
            const message = JSON.parse(line); assert.notEqual(message.method, 'session/prompt');
            if (message.id !== undefined) requests.set(message.id, { method: message.method, ms: performance.now() - start });
            if (message.method) record.requests.push({ method: message.method, ms: performance.now() - start,
              ...(message.method === 'session/new' ? { sandbox: message.params?._meta?.claudeCode?.options?.sandbox,
                settingSources: message.params?._meta?.claudeCode?.options?.settingSources, mcpServers: message.params?.mcpServers?.map((s: any) => ({ type: s.type, name: s.name, url: s.url, headerNames: s.headers?.map((h: any) => h.name) })) } : {}) });
            transport.write(line);
          },
          async *lines() {
            for await (const line of transport.lines()) {
              const message = JSON.parse(line);
              if (message.id !== undefined && !message.method) record.replies.push({ ...requests.get(message.id), responseMs: performance.now() - start,
                result: message.result, error: message.error });
              yield line;
            }
          },
          close: () => transport.close(), onClose: listener => transport.onClose(listener),
        };
      },
    });
    await step(`${round}:production-runtime-start`, () => bounded(runtime!.start(), 60_000, 'runtime start'));
    record.lifecycle = runtime.lifecycle; record.sessionId = runtime.sessionId; record.permissionMode = runtime.permissionMode;
    record.mailboxReady = await server.whenReady(agentId, 10_000);
    assert.equal(record.mailboxReady, true, 'Runtime must actually handshake with the production MCP listener');
    assert.equal(record.toolCalls, 0);
    record.cliProcesses = JSON.parse(await sbx(['exec', '-u', '1000', owned.name, '/usr/bin/node', '-e',
      `const fs=require('node:fs');const rows=[];for(const pid of fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x))){try{const raw=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\\0');if(raw[0]==='/opt/blobot/bin/claude')rows.push({pid:Number(pid),executable:raw[0],exe:fs.readlinkSync('/proc/'+pid+'/exe')});}catch{}}console.log(JSON.stringify(rows));`]));
    await step(`${round}:runtime-close`, () => bounded(runtime!.stop(), 15_000, 'runtime stop'));
    runtime = undefined; activeTransport = undefined;
    await step(`${round}:owned-stop`, () => machine!.stop());
    record.stopped = (await json(['ls', '--json'])).sandboxes.find((box: any) => box.id === owned.id)?.status;
    assert.equal(record.stopped, 'stopped');
    await server.stop(); server = undefined;
    await checkpoint();
  }
  report.passed = true;
} catch (error: any) {
  report.passed = false; report.error = safe(error.stack ?? error.message); process.exitCode = 1;
} finally {
  const errors: string[] = [];
  if (runtime) await bounded(runtime.stop(), 15_000, 'cleanup runtime').catch(error => errors.push(error.message));
  if (activeTransport) await activeTransport.close().catch((error: any) => errors.push(error.message));
  if (machine) await machine.stop().catch(error => errors.push(error.message));
  if (server) await bounded(server.stop(), 10_000, 'cleanup server').catch(error => errors.push(error.message));
  const record = await registry.read(agentId);
  const refs = [record?.active, ...record?.retained ?? [], ...(record?.pending?.id ? [{ name: record.pending.name, id: record.pending.id }] : [])].filter(Boolean);
  const inventory = (await json(['ls', '--json'])).sandboxes;
  for (const ref of refs) if (inventory.some((box: any) => box.id === ref!.id && box.name === ref!.name)) {
    await sbx(['rm', '-f', ref!.name]).catch(error => errors.push(error.message));
  }
  if (loaded) {
    const [repository, tag] = build.reference.split(':');
    const images = (await json(['template', 'ls', '--json'])).images;
    if (images.some((image: any) => image.repository === `docker.io/library/${repository}` && image.tag === tag)) {
      await sbx(['template', 'rm', build.reference]).catch(error => errors.push(error.message));
    }
  }
  report.cleanup = { errors, boxes: (await json(['ls', '--json'])).sandboxes, images: (await json(['template', 'ls', '--json'])).images };
  report.cleanup.imagesUnchanged = JSON.stringify(report.cleanup.images) === JSON.stringify(beforeImages);
  await guard();
  await rm(root, { recursive: true, force: true });
  report.cleanup.temporaryRootRemoved = true;
  report.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(JSON.stringify({ passed: report.passed, error: report.error, cleanup: report.cleanup }));
}
