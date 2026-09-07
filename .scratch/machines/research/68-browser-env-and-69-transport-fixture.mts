import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MachineLogin, GUEST_LOGIN_SOURCE } from '../../../packages/core/src/adapters/login.ts';
import { CLAUDE_LOGIN } from '../../../packages/core/src/adapters/claude/login.ts';
import { CLAUDE_MACHINE_IMAGE } from '../../../packages/core/src/adapters/claude/image.ts';
import { OwnedSbxMachine } from '../../../packages/core/src/machines/sbx/owned-machine.ts';
import { SbxRegistry } from '../../../packages/core/src/machines/sbx/registry.ts';
import { SbxImageStore } from '../../../packages/core/src/machines/sbx/image-store.ts';
import { sbxClientEnvironment } from '../../../packages/core/src/machines/sbx/client-environment.ts';
import { agentGitEnvironment } from '../../../packages/core/src/workspace/git-identity.ts';
import { runTransportProbes, runSseProbe } from './69-transport-stream-probes.mts';

assert.equal(process.env.BLOBOT_LIVE_BROWSER_ENV, '1');
const loginOnly = process.env.BLOBOT_LOGIN_ONLY === '1';
const root = await realpath(await mkdtemp('/private/tmp/blobot-browser-env-'));
const reportPath = new URL('./68-browser-env-results.json', import.meta.url);
const mechanicalPath = new URL('./69-transport-stream-results.json', import.meta.url);
const exec = promisify(execFile), env = sbxClientEnvironment();
const sbx = async (args: string[]) => (await exec('/opt/homebrew/bin/sbx', args, { env, timeout: 120_000, maxBuffer: 2 * 1024 ** 2 })).stdout;
const json = async (args: string[]) => JSON.parse(await sbx(args));
const report: any = { startedAt: new Date().toISOString(), root, execEvents: [], challenge: null, cleanup: {},
  scope: 'Exact published Linux Claude subscription login; only attempt-scoped BROWSER=/bin/true; no opener replacement, URL opening, code input, auth completion or inference.' };
const mechanical: any = { startedAt: report.startedAt, sharedWith: '68-browser-env-results.json', cleanup: {} };
const save = async () => { await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); if (!loginOnly) await writeFile(mechanicalPath, JSON.stringify(mechanical, null, 2) + '\n'); };
const guard = async () => { const stat = await statfs(root); const free = Number(stat.bavail) * Number(stat.bsize);
  report.minimumFreeBytes = Math.min(report.minimumFreeBytes ?? Infinity, free); assert(free >= 2 * 1024 ** 3, 'Disk guard'); };
const bounded = async <T>(promise: Promise<T>, ms: number): Promise<T> => { let timer: any;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('fixture deadline')), ms); })]); }
  finally { clearTimeout(timer); } };
const errorShape = (error: any) => ({ name: /^[A-Za-z]+$/.test(error?.name ?? '') ? error.name : 'Error',
  kind: /abort/i.test(error?.message ?? '') ? 'aborted' : /deadline/.test(error?.message ?? '') ? 'deadline' : 'other', messageCharacters: String(error?.message ?? '').length });
const build = CLAUDE_MACHINE_IMAGE.builds.find(build => build.arch === 'arm64')!;
report.build = { imageId: build.imageId, archiveSha256: build.sha256, bytes: build.bytes, cliVersion: CLAUDE_MACHINE_IMAGE.cliVersion };
const source = join(root, 'source'), workspace = join(root, 'worktree'), agentId = `research68_${randomUUID()}`;
const registry = new SbxRegistry(join(root, 'registry'));
let machine: OwnedSbxMachine | undefined, transport: any, beforeImages: any[] = [], loaded = false;
const abort = new AbortController();
let timer: any;
const wrapperHash = createHash('sha256').update(GUEST_LOGIN_SOURCE).digest('hex');
const observer = await readFile(new URL('./68-login-exec-observer.py', import.meta.url), 'utf8');
const snapshot = `const fs=require('node:fs'),crypto=require('node:crypto');const names=['xdg-open','open','sensible-browser','x-www-browser','www-browser','firefox','chromium','chromium-browser','google-chrome'];const files=[];for(const path of ['/bin/true','/usr/bin/python3','/opt/blobot/runtime/claude',...['/opt/blobot/bin','/usr/local/bin','/usr/bin'].flatMap(dir=>names.map(name=>dir+'/'+name))]){try{const s=fs.lstatSync(path);files.push({path,mode:s.mode,symlink:s.isSymbolicLink()?fs.readlinkSync(path):null,sha256:s.isFile()?crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'):null});}catch(e){if(e.code!=='ENOENT')throw e;}}const rows=[];for(const p of fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x))){if(Number(p)===process.pid)continue;try{const exe=fs.readlinkSync('/proc/'+p+'/exe'),args=fs.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0'),stat=fs.readFileSync('/proc/'+p+'/stat','utf8'),parts=stat.slice(stat.lastIndexOf(')')+2).split(' ');rows.push({pid:Number(p),startTicks:parts[19],executable:exe,ownedLogin:exe.startsWith('/opt/blobot/')||crypto.createHash('sha256').update(args[2]??'').digest('hex')===${JSON.stringify(wrapperHash)}||exe.includes('python')});}catch{}}console.log(JSON.stringify({browserPresent:process.env.BROWSER!==undefined,python:fs.existsSync('/usr/bin/python3'),truePath:fs.realpathSync('/bin/true'),files,rows}));`;
try {
  await guard(); report.engine = await json(['version', '--json']); assert.equal(report.engine.server.version, 'v0.42.0-rc5');
  assert.deepEqual((await json(['ls', '--json'])).sandboxes, []);
  beforeImages = (await json(['template', 'ls', '--json'])).images; report.beforeImages = beforeImages;
  const paths = ['adapters/login.ts', 'adapters/claude/login.ts', 'adapters/claude/image.ts', 'machines/sbx/transport.ts', 'machines/sbx/bootstrap.ts', 'machines/sbx/owned-machine.ts'];
  report.sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path,
    createHash('sha256').update(await readFile(new URL(`../../../packages/core/src/${path}`, import.meta.url))).digest('hex')])));
  report.observerSha256 = createHash('sha256').update(observer).digest('hex');
  const store = new SbxImageStore(join(root, 'cache')); assert.equal((await store.readiness(build)).state, 'not_installed'); loaded = true;
  console.log(JSON.stringify({ phase: 'load-Claude' })); const started = performance.now();
  await store.install(build, { signal: AbortSignal.timeout(240_000) }); report.installMs = performance.now() - started;
  await mkdir(source);
  const git = (args: string[]) => exec('/usr/bin/git', args, { cwd: source, env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1', ...agentGitEnvironment('Research68') } });
  await git(['init', '-b', 'main']); await writeFile(join(source, 'README.md'), '# Synthetic fixture\n');
  await git(['add', '.']); await git(['commit', '-m', 'Synthetic']); await git(['worktree', 'add', '-b', 'research68', workspace]);
  machine = new OwnedSbxMachine({ agentId, registry, kit: { image: build.reference, guestNode: CLAUDE_MACHINE_IMAGE.guestNode,
    dataBytes: 8 * 1024 ** 3, dockerBytes: 20 * 1024 ** 3, workspace: { path: workspace, commonGit: [join(source, '.git')] } },
    limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 }, transport: { moduleRoot: CLAUDE_MACHINE_IMAGE.moduleRoot,
      allowedEnvironment: [...CLAUDE_MACHINE_IMAGE.allowedEnvironment, 'BROWSER'] },
    sbxExecutable: '/opt/homebrew/bin/sbx', commandTimeoutMs: 120_000 });
  console.log(JSON.stringify({ phase: 'start-owned' })); await machine.start({ mailboxPort: 34567, runtime: { image: build.reference } });
  const active = (await registry.read(agentId))!.active!; report.box = { id: active.id, name: active.name };
  const before = JSON.parse(await sbx(['exec', '-u', '0', active.name, '/usr/bin/node', '-e', snapshot])); report.before = before;
  assert.equal(before.browserPresent, false); assert(before.python, 'Python observer must already exist; no installs or opener replacements');
  const ordinaryEnv = async () => {
    const channel = machine!.spawn({ cwd: workspace, command: { kind: 'exec', executable: '/usr/bin/node', args: ['-e', "console.log(JSON.stringify({browserPresent:process.env.BROWSER!==undefined,uid:process.getuid()}))"] } });
    const lines: string[] = []; for await (const line of channel.lines()) lines.push(line); await channel.close(); return JSON.parse(lines.join('\n'));
  };
  report.ordinaryBefore = await ordinaryEnv(); assert.equal(report.ordinaryBefore.browserPresent, false);
  const originalSpawn = machine.spawn.bind(machine);
  machine.spawn = request => { transport = originalSpawn(request); return transport; };
  const originalSpec = CLAUDE_LOGIN.spec('subscription');
  const spec = { ...originalSpec, executable: '/usr/bin/python3', args: ['-c', observer, originalSpec.executable, ...originalSpec.args],
    env: { ...originalSpec.env, BROWSER: '/bin/true' },
    parse(text: string) {
      // Observer records are already metadata-only. Vendor text and queries are never retained.
      const events = [...text.matchAll(/^BLOBOT_RESEARCH68 (\{[^\n]+\})$/gm)].map(match => JSON.parse(match[1]!));
      report.execEvents = events;
      return originalSpec.parse(text);
    } };
  report.command = { executable: originalSpec.executable, args: originalSpec.args, environment: { BROWSER: '/bin/true' }, observer: '/usr/bin/python3' };
  console.log(JSON.stringify({ phase: 'login-with-scoped-BROWSER' }));
  const start = performance.now(); timer = setTimeout(() => { report.timeout = true; abort.abort(); }, 60_000);
  try {
    await bounded(new MachineLogin(machine, '/usr/bin/node', spec).run(abort.signal, challenge => {
      assert.equal(challenge.kind, 'browser'); if (challenge.kind !== 'browser') return;
      const url = new URL(challenge.url), target = new URL(url.searchParams.get('redirect_uri')!);
      report.challenge = { origin: url.origin, path: url.pathname, stateLength: url.searchParams.get('state')?.length ?? 0,
        pkceLength: url.searchParams.get('code_challenge')?.length ?? 0, inputPresent: !!challenge.input,
        codePresent: !!challenge.code, redirect: { origin: target.origin, path: target.pathname } };
      report.challengeMs = performance.now() - start; abort.abort();
    }), 75_000);
    report.unexpectedSuccessfulReturn = true;
  } catch (error) { report.runError = errorShape(error); }
  finally { clearTimeout(timer); abort.abort(); report.loginMs = performance.now() - start; }
  await transport?.close(); machine.spawn = originalSpawn;
  report.ordinaryAfter = await ordinaryEnv();
  const after = JSON.parse(await sbx(['exec', '-u', '0', active.name, '/usr/bin/node', '-e', snapshot]));
  report.after = { browserPresent: after.browserPresent, filesUnchanged: JSON.stringify(after.files) === JSON.stringify(before.files),
    ownedLoginProcesses: after.rows.filter((row: any) => row.ownedLogin),
    newProcesses: after.rows.filter((row: any) => !before.rows.some((prior: any) => prior.pid === row.pid && prior.startTicks === row.startTicks)) };
  report.trueExecuted = report.execEvents.some((event: any) => event.executable === before.truePath && event.browserIsTrue);
  report.unexpectedOpenerBlocked = report.execEvents.some((event: any) => event.blockedUnexpectedOpener);
  report.passed = !!report.challenge && report.runError?.name === 'AbortError' && report.trueExecuted && !report.unexpectedOpenerBlocked &&
    report.after.filesUnchanged && !report.ordinaryAfter.browserPresent && report.after.ownedLoginProcesses.length === 0 && report.after.newProcesses.length === 0;
  await save(); console.log(JSON.stringify({ loginPassed: report.passed, trueExecuted: report.trueExecuted, challenge: report.challenge, execEvents: report.execEvents }));
  // Independent mechanical probes, with login already cancelled and BROWSER absent again.
  if (!loginOnly) {
    await guard(); console.log(JSON.stringify({ phase: '6-MiB-transport' }));
    mechanical.transport = await runTransportProbes(active.name, workspace); await save();
    console.log(JSON.stringify({ phase: 'generic-mailbox-SSE' }));
    mechanical.sse = await runSseProbe(machine, workspace); mechanical.passed = mechanical.transport.passed && mechanical.sse.passed; await save();
  }
} catch (error) { report.fixtureError = errorShape(error); }
finally {
  clearTimeout(timer); abort.abort(); await transport?.close().catch(() => {});
  await machine?.stop().catch(error => { report.cleanup.stopError = errorShape(error); });
  const record = await registry.read(agentId);
  const refs = [record?.active, ...record?.retained ?? [], ...(record?.pending?.id ? [{ name: record.pending.name, id: record.pending.id }] : [])].filter(Boolean);
  const boxes = (await json(['ls', '--json'])).sandboxes;
  report.cleanup.stopped = refs.every(ref => boxes.some((box: any) => box.id === ref!.id && box.name === ref!.name && box.status === 'stopped'));
  for (const ref of refs) if (boxes.some((box: any) => box.id === ref!.id && box.name === ref!.name)) await sbx(['rm', '-f', ref!.name]);
  if (loaded) { const [repository, tag] = build.reference.split(':');
    if ((await json(['template', 'ls', '--json'])).images.some((image: any) => image.repository === `docker.io/library/${repository}` && image.tag === tag)) await sbx(['template', 'rm', build.reference]); }
  report.cleanup.boxes = (await json(['ls', '--json'])).sandboxes;
  report.cleanup.images = (await json(['template', 'ls', '--json'])).images;
  report.cleanup.imagesUnchanged = JSON.stringify(report.cleanup.images) === JSON.stringify(beforeImages);
  await guard();
  if (report.cleanup.boxes.length === 0) { await rm(root, { recursive: true, force: true }); report.cleanup.temporaryRootRemoved = true; }
  report.finishedAt = new Date().toISOString(); mechanical.finishedAt = report.finishedAt; mechanical.cleanup = report.cleanup;
  await save(); console.log(JSON.stringify({ loginPassed: report.passed, mechanicalPassed: mechanical.passed, cleanup: report.cleanup }));
}
