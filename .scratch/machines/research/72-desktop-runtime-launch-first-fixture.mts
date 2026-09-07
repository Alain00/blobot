// Opt-in, signed-out production launch measurement. Never sends a prompt or auth request.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DesktopMachines, DesktopBoxMachine } from '../../../apps/desktop/src/main/machines.ts';
import { runtimeFor, imageFor } from '../../../apps/desktop/src/main/runtime-for.ts';
import { PeerMessageServer } from '../../../packages/core/src/mcp/peer-message-server.ts';
import { sbxClientEnvironment } from '../../../packages/core/src/machines/sbx/client-environment.ts';
import { agentGitEnvironment } from '../../../packages/core/src/workspace/git-identity.ts';

assert.equal(process.env.BLOBOT_LIVE_DESKTOP_RUNTIME, '1');
const run = promisify(execFile);
const root = await realpath(await mkdtemp('/private/tmp/blobot-research72-'));
const reportPath = new URL('./72-desktop-runtime-launch-results.json', import.meta.url);
const report: any = { startedAt: new Date().toISOString(), root, runtimes: [], cleanup: {},
  scope: 'DesktopMachines(preview=true) + runtimeFor + production MCP; fresh synthetic homes/worktrees. No login, prompt, inference, host credentials or host skills.' };
const tokens: string[] = [];
const safe = (s: string) => tokens.reduce((v, token) => v.replaceAll(token, '<fixture-bearer>'), s)
  .replace(/https?:\/\/[^\s<>"']+/g, value => { try { const u = new URL(value); return u.origin + u.pathname + (u.search ? '?<redacted>' : ''); } catch { return '<url>'; } });
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const checkpoint = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
const guard = async () => { const fs = await statfs(root); const free = Number(fs.bavail) * Number(fs.bsize);
  report.minimumFreeBytes = Math.min(report.minimumFreeBytes ?? Infinity, free); assert(free >= 2 * 1024 ** 3); };
const bounded = async <T>(task: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([task, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timeout ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer!); }
};
const sbx = async (args: string[]) => (await run('/opt/homebrew/bin/sbx', args,
  { env: sbxClientEnvironment(), timeout: 120_000, maxBuffer: 2 * 1024 ** 2 })).stdout;
const json = async (args: string[]) => JSON.parse(await sbx(args));
const step = async (record: any, phase: string, action: () => Promise<any>) => {
  await guard(); console.log(JSON.stringify({ runtime: record.runtimeId, phase }));
  const row: any = { phase }; (record.steps ??= []).push(row); const start = performance.now();
  try { const value = await action(); row.ms = performance.now() - start; row.passed = true; await checkpoint(); return value; }
  catch (error: any) { row.ms = performance.now() - start; row.error = safe(error.message); row.passed = false; await checkpoint(); throw error; }
};
const sourceFiles = [
  'apps/desktop/src/main/machines.ts', 'apps/desktop/src/main/runtime-for.ts',
  'packages/core/src/workspace/box-mounts.ts', 'packages/core/src/machines/sbx/owned-machine.ts',
  'packages/core/src/machines/sbx/transport.ts', 'packages/core/src/machines/sbx/bootstrap.ts',
  'packages/core/src/mcp/peer-message-server.ts', 'packages/core/src/adapters/acp/npm-bridge.ts',
  ...['codex', 'opencode', 'cursor'].flatMap(id => [
    `packages/core/src/adapters/${id}/image.ts`, `packages/core/src/adapters/${id}/${id}-agent-runtime.ts`,
    `packages/core/src/adapters/${id}/${id === 'codex' ? 'stdio-bridge' : 'stdio'}.ts`]),
];
const sources = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path =>
  [path, hash(await readFile(new URL('../../../' + path, import.meta.url)))])));
const originalHomedir = os.homedir;
const emptyLookup = join(root, 'empty-home-lookup'); await mkdir(emptyLookup);
// Prevent Desktop's default operator-skills lookup from visiting/mounting the real home.
// The engine client environment is unchanged. No process.env HOME or global config is changed.
os.homedir = () => emptyLookup; syncBuiltinESMExports();
let beforeImages: any[] = [];
try {
  report.host = { platform: process.platform, arch: process.arch, node: process.version,
    os: (await run('/usr/bin/sw_vers', [])).stdout.trim() };
  report.engine = await json(['version', '--json']);
  assert.equal(report.engine.server.version, 'v0.42.0-rc5');
  assert.deepEqual((await json(['ls', '--json'])).sandboxes, []);
  report.beforeImages = beforeImages = (await json(['template', 'ls', '--json'])).images;
  report.sourceHashes = await sources();
  for (const runtimeId of ['codex', 'opencode', 'cursor']) {
    const image = imageFor(runtimeId)!; const build = image.builds.find(b => b.arch === 'arm64')!;
    const id = `research72_${randomUUID()}`;
    const area = join(root, runtimeId); await mkdir(area);
    const source = join(area, 'source'), workspace = join(area, 'worktree'); await mkdir(source);
    const env = { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...agentGitEnvironment('Research72') };
    const git = (args: string[]) => run('/usr/bin/git', args, { cwd: source, env, timeout: 15_000 });
    await git(['init', '-b', 'main']); await writeFile(join(source, 'README.md'), '# Synthetic research72\n');
    await git(['add', '.']); await git(['commit', '-m', 'Synthetic fixture']); await git(['worktree', 'add', '-b', 'research72', workspace]);
    const services = new DesktopMachines(join(area, 'desktop'), true);
    const team = { id: 'research72', name: 'Research72', workspaceKind: 'git' as const, workspacePath: source, turnBudget: 1 };
    const record = { id, teamId: team.id, name: 'Research72', role: 'Synthetic startup probe', runtimeId, workspacePath: workspace, createdAt: 0,
      machine: { kind: 'box' as const, limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 } } };
    const machine = services.forAgent(record, team); assert(machine instanceof DesktopBoxMachine);
    const item: any = { runtimeId, agentId: id, cliVersion: image.cliVersion, build, rounds: [], steps: [], cleanup: {} };
    report.runtimes.push(item);
    let server: PeerMessageServer | undefined, runtime: ReturnType<typeof runtimeFor> | undefined;
    let initiallyAbsent = false; let firstBox: string | undefined;
    const active = new Set<any>();
    const originalSpawn = machine.spawn.bind(machine);
    let round: any;
    machine.spawn = request => {
      const transport = originalSpawn(request); active.add(transport);
      transport.onClose(() => active.delete(transport));
      const observing = !!round?.observing;
      if (!observing) return transport;
      round.launches.push({ command: request.command, cwd: request.cwd,
        env: Object.fromEntries(Object.entries(request.env ?? {}).map(([k, v]) => [k, v === undefined ? '<unset>' : safe(v)])),
        configs: request.configs ?? [] });
      const starts = new Map<any, { method: string, ms: number }>(); const since = performance.now();
      transport.onClose(reason => round.closes.push({ ms: performance.now() - since, reason: reason ?? null }));
      return {
        write(line: string) {
          const message = JSON.parse(line);
          assert(!['session/prompt', 'authenticate'].includes(message.method), 'Prompt and auth forbidden');
          if (message.id !== undefined && message.method) starts.set(message.id, { method: message.method, ms: performance.now() - since });
          if (message.method) round.requests.push({ method: message.method, ms: performance.now() - since,
            ...(message.method === 'session/new' ? { cwd: message.params?.cwd, mcpServers: message.params?.mcpServers?.map((s: any) =>
              ({ type: s.type, name: s.name, url: safe(s.url ?? ''), headerNames: s.headers?.map((h: any) => h.name) })) } : {}) });
          transport.write(line);
        },
        async *lines() {
          for await (const line of transport.lines()) {
            const m = JSON.parse(line);
            if (m.id !== undefined && !m.method) round.replies.push({ ...starts.get(m.id), responseMs: performance.now() - since,
              ...(m.error ? { error: { code: m.error.code, message: safe(m.error.message ?? '') } } : {}),
              ...(m.result ? { result: { protocolVersion: m.result.protocolVersion, agentInfo: m.result.agentInfo,
                authMethods: m.result.authMethods?.map((a: any) => ({ id: a.id, name: a.name })),
                sessionIdHash: m.result.sessionId ? hash(m.result.sessionId) : undefined,
                modes: m.result.modes, configOptionCount: m.result.configOptions?.length } } : {}) });
            if (m.method) round.inboundMethods.push(m.method);
            yield line;
          }
        },
        close: () => transport.close(), onClose: (listener: any) => transport.onClose(listener),
      };
    };
    try {
      initiallyAbsent = (await services.images().readiness(build)).state === 'not_installed';
      item.initiallyAbsent = initiallyAbsent;
      await step(item, 'desktop-install-image', () => bounded(services.installImage(build), 240_000, 'install image'));
      for (const label of ['fresh', 'reopened']) {
        round = { label, launches: [], requests: [], replies: [], inboundMethods: [], stderr: [], mcpLogs: [], closes: [], toolCalls: 0 };
        item.rounds.push(round);
        const captureRound = round;
        server = new PeerMessageServer({ handler: async () => { captureRound.toolCalls++; throw Error('Tools not authorized in startup fixture'); },
          onLog: line => captureRound.mcpLogs.push(safe(line)) }); await server.start();
        await step(item, `${label}:desktop-machine-start`, () => bounded(machine.start({ mailboxPort: server!.port, runtime: { image: build.reference } }), 120_000, 'machine start'));
        const ownedRecord = (await services.registry.read(id))!; const owned = ownedRecord.active!;
        round.owned = owned; round.mounts = ownedRecord.kit.workspace;
        assert.equal(ownedRecord.kit.workspace?.sharedSkillsPath, undefined);
        assert.deepEqual(ownedRecord.kit.workspace?.commonGit, [join(source, '.git')]);
        if (firstBox) assert.equal(owned.id, firstBox); else firstBox = owned.id;
        round.detection = await machine.checkRuntime();
        try { await machine.beforeRuntimeStart(); round.desktopGate = { passed: true }; }
        catch (error: any) { round.desktopGate = { passed: false, refusal: safe(error.message) }; }
        const inspect = async () => {
          const probe = machine.spawn({ cwd: workspace, command: { kind: 'exec', executable: '/usr/bin/node', args: ['-e',
            `const fs=require('node:fs'),os=require('node:os');console.log(JSON.stringify({uid:process.getuid(),home:process.env.HOME,cpus:os.cpus().length,memTotal:fs.readFileSync('/proc/meminfo','utf8').match(/^MemTotal:.*$/m)[0],sshSocketPresent:fs.existsSync('/run/ssh-agent.sock'),mainCheckoutVisible:fs.existsSync(${JSON.stringify(join(source, 'README.md'))}),hostSecretEnvNames:['OPENAI_API_KEY','CODEX_API_KEY','ANTHROPIC_API_KEY','CURSOR_API_KEY','CURSOR_AUTH_TOKEN','BLOBOT_RESEARCH72_SENTINEL'].filter(k=>process.env[k]!==undefined),homeEntries:fs.readdirSync('/home/agent').sort()}));`] } });
          const lines: string[] = []; for await (const line of probe.lines()) lines.push(line); await probe.close(); return JSON.parse(lines.join('\n'));
        };
        round.guestBefore = await inspect(); assert.equal(round.guestBefore.uid, 1000); assert.equal(round.guestBefore.cpus, 2);
        assert.equal(round.guestBefore.sshSocketPresent, false); assert.equal(round.guestBefore.mainCheckoutVisible, false);
        assert.deepEqual(round.guestBefore.hostSecretEnvNames, []);
        const endpoint = server.endpointFor(id, machine.mailboxHostname); tokens.push(endpoint.token);
        // Call the launcher directly for signed-out ACP evidence; Desktop gate above is retained separately.
        runtime = runtimeFor({ machine, runtimeId, agentId: id, agentName: 'Research72', cwd: workspace, persona: '',
          executablePath: '/nonexistent/research72-host-binary',
          mcpServers: [{ type: 'http', name: 'blobot', url: endpoint.url, headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }] }],
          onStderr: line => { if (captureRound.stderr.join('').length < 65536) captureRound.stderr.push(safe(line)); } });
        round.observing = true;
        try { await step(item, `${label}:runtimeFor-start`, () => bounded(runtime!.start(), 60_000, 'runtime start')); round.runtimeStarted = true; }
        catch (error: any) { round.runtimeStarted = false; round.refusal = safe(error.message); }
        round.lifecycle = runtime.lifecycle; round.sessionIdHash = runtime.sessionId ? hash(runtime.sessionId) : undefined;
        round.mailboxReady = await server.whenReady(id, round.runtimeStarted ? 10_000 : 1000);
        assert.equal(round.toolCalls, 0);
        await step(item, `${label}:runtime-stop`, () => bounded(runtime!.stop(), 15_000, 'runtime stop')); runtime = undefined;
        round.observing = false;
        round.guestAfter = await inspect();
        assert.deepEqual(round.guestAfter.hostSecretEnvNames, []);
        await step(item, `${label}:desktop-machine-stop`, () => bounded(machine.stop(), 30_000, 'machine stop'));
        round.stopped = (await json(['ls', '--json'])).sandboxes.find((b: any) => b.id === owned.id)?.status;
        assert.equal(round.stopped, 'stopped');
        await bounded(server.stop(), 10_000, 'server stop'); server = undefined;
        await checkpoint();
      }
      item.completed = true;
    } catch (error: any) { item.completed = false; item.error = safe(error.stack ?? error.message); }
    finally {
      const errors: string[] = [];
      if (runtime) await bounded(runtime.stop(), 15_000, 'cleanup runtime').catch(e => errors.push(safe(e.message)));
      for (const channel of active) await bounded(channel.close(), 10_000, 'cleanup channel').catch(e => errors.push(safe(e.message)));
      await bounded(machine.stop(), 30_000, 'cleanup stop').catch(e => errors.push(safe(e.message)));
      if (server) await bounded(server.stop(), 10_000, 'cleanup server').catch(e => errors.push(safe(e.message)));
      // Remove only UUID references that this fixture's private journal actually owns.
      const saved = await services.registry.read(id);
      const refs = [saved?.active, ...(saved?.retained ?? []), ...(saved?.pending?.id ? [{ id: saved.pending.id, name: saved.pending.name }] : [])].filter(Boolean);
      for (const ref of refs) if ((await json(['ls', '--json'])).sandboxes.some((b: any) => b.id === ref!.id && b.name === ref!.name))
        await sbx(['rm', '-f', ref!.name]).catch(e => errors.push(safe(e.message)));
      await services.close().catch(e => errors.push(safe(e.message)));
      if (initiallyAbsent) {
        const [repository, tag] = build.reference.split(':');
        if ((await json(['template', 'ls', '--json'])).images.some((im: any) => im.repository === `docker.io/library/${repository}` && im.tag === tag))
          await sbx(['template', 'rm', build.reference]).catch(e => errors.push(safe(e.message)));
      }
      item.cleanup = { errors, boxes: (await json(['ls', '--json'])).sandboxes, images: (await json(['template', 'ls', '--json'])).images };
      item.cleanup.imagesUnchanged = JSON.stringify(item.cleanup.images) === JSON.stringify(beforeImages);
      await guard(); await rm(area, { recursive: true, force: true }); item.cleanup.temporaryAreaRemoved = true;
      await checkpoint();
      assert.equal(errors.length, 0); assert.equal(item.cleanup.boxes.length, 0); assert.equal(item.cleanup.imagesUnchanged, true);
    }
  }
  report.completed = report.runtimes.every((r: any) => r.completed);
} catch (error: any) { report.completed = false; report.error = safe(error.stack ?? error.message); process.exitCode = 1; }
finally {
  report.postflightSourceHashes = await sources();
  report.cleanup = { boxes: (await json(['ls', '--json'])).sandboxes, images: (await json(['template', 'ls', '--json'])).images };
  report.cleanup.imagesUnchanged = JSON.stringify(report.cleanup.images) === JSON.stringify(beforeImages);
  await guard(); os.homedir = originalHomedir; syncBuiltinESMExports();
  await rm(root, { recursive: true, force: true }); report.cleanup.temporaryRootRemoved = true;
  report.finishedAt = new Date().toISOString(); await checkpoint();
  console.log(JSON.stringify({ completed: report.completed, runtimes: report.runtimes.map((r: any) => ({ runtimeId: r.runtimeId, completed: r.completed,
    rounds: r.rounds.map((x: any) => ({ label: x.label, runtimeStarted: x.runtimeStarted, mailboxReady: x.mailboxReady, refusal: x.refusal })) })), cleanup: report.cleanup }));
}
