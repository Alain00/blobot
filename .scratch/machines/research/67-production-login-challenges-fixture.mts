// No raw login text, URL queries, codes or state values may leave process memory.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MachineLogin, GUEST_LOGIN_SOURCE, loginText, type LoginChallenge } from '../../../packages/core/src/adapters/login.ts';
import { CLAUDE_LOGIN } from '../../../packages/core/src/adapters/claude/login.ts';
import { CODEX_LOGIN } from '../../../packages/core/src/adapters/codex/login.ts';
import { CURSOR_LOGIN } from '../../../packages/core/src/adapters/cursor/login.ts';
import { OPENCODE_LOGIN } from '../../../packages/core/src/adapters/opencode/login.ts';
import { FX_LOGIN } from '../../../packages/core/src/adapters/fx/login.ts';
import { CLAUDE_MACHINE_IMAGE } from '../../../packages/core/src/adapters/claude/image.ts';
import { CODEX_MACHINE_IMAGE } from '../../../packages/core/src/adapters/codex/image.ts';
import { CURSOR_MACHINE_IMAGE } from '../../../packages/core/src/adapters/cursor/image.ts';
import { OPENCODE_MACHINE_IMAGE } from '../../../packages/core/src/adapters/opencode/image.ts';
import { FX_MACHINE_IMAGE } from '../../../packages/core/src/adapters/fx/image.ts';
import { OwnedSbxMachine } from '../../../packages/core/src/machines/sbx/owned-machine.ts';
import { SbxRegistry } from '../../../packages/core/src/machines/sbx/registry.ts';
import { SbxImageStore } from '../../../packages/core/src/machines/sbx/image-store.ts';
import { sbxClientEnvironment } from '../../../packages/core/src/machines/sbx/client-environment.ts';
import { agentGitEnvironment } from '../../../packages/core/src/workspace/git-identity.ts';

assert.equal(process.env.BLOBOT_LIVE_LOGIN_CHALLENGES, '1');
const reportPath = new URL('./67-production-login-challenges-results.json', import.meta.url);
const root = await realpath(await mkdtemp('/private/tmp/blobot-login-challenges-'));
const exec = promisify(execFile), env = sbxClientEnvironment();
const sbx = async (args: string[]) => (await exec('/opt/homebrew/bin/sbx', args, { env, timeout: 120_000, maxBuffer: 2 * 1024 ** 2 })).stdout;
const json = async (args: string[]) => JSON.parse(await sbx(args));
const report: any = { startedAt: new Date().toISOString(), root, images: [], attempts: [], cleanup: {},
  scope: 'First production login challenges only, followed by immediate AbortController cancellation. No browser opened, no code supplied, no login completed, no inference.' };
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
const guard = async () => {
  const disk = await statfs(root); const free = Number(disk.bavail) * Number(disk.bsize);
  report.minimumFreeBytes = Math.min(report.minimumFreeBytes ?? Infinity, free);
  assert(free >= 2 * 1024 ** 3, 'Disk guard');
};
function errorShape(error: any) {
  const message = String(error?.message ?? '');
  return { name: typeof error?.name === 'string' && /^[A-Za-z]+$/.test(error.name) ? error.name : 'Error',
    kind: /Sign-in did not complete/.test(message) ? 'login-exited-incomplete'
      : /output exceeded/.test(message) ? 'output-limit' : /abort/i.test(message) ? 'aborted'
      : /closed before completion/.test(message) ? 'closed-before-completion'
      : /unsupported browser callback/.test(message) ? 'unsupported-callback'
      : /exceeded fixture deadline/.test(message) ? 'fixture-deadline' : 'other-error',
    messageCharacters: message.length };
}
const bounded = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: any;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('exceeded fixture deadline')), ms); })]); }
  finally { clearTimeout(timer); }
};
const field = (value: string | undefined | null) => ({ present: value !== undefined && value !== null && value.length > 0, length: value?.length ?? 0 });
function urlShape(value: string) {
  const url = new URL(value);
  const shape: any = { origin: url.origin, path: url.pathname, hasQuery: !!url.search, hasFragment: !!url.hash,
    state: field(url.searchParams.get('state')), code: field(url.searchParams.get('user_code') ?? url.searchParams.get('code')),
    challenge: field(url.searchParams.get('code_challenge') ?? url.searchParams.get('challenge')) };
  const redirect = url.searchParams.get('redirect_uri');
  if (redirect) { try { const target = new URL(redirect); shape.redirect = { origin: target.origin, path: target.pathname, hasQuery: !!target.search }; } catch {} }
  return shape;
}
function challengeShape(value: LoginChallenge) {
  if (value.kind === 'choice') return { kind: value.kind, label: field(value.label), choices: value.choices.map(choice => ({ value: field(choice.value), label: field(choice.label) })) };
  return { kind: value.kind, url: urlShape(value.url), code: field(value.code), input: field(value.input),
    ...(value.callback ? { callback: { origin: `http://localhost:${value.callback.port}`, path: value.callback.path, state: field(value.callback.state) } } : {}) };
}
const markers = ["If the browser didn't open, visit:", 'Opening browser to sign in', 'Paste code here if prompted',
  'Open this link in your browser', 'Enter this one-time code', 'Open a browser and navigate to this link:',
  'Go to: ', 'Enter code: ', 'enter code: ', 'Open https://', 'Code: ', 'Open this URL to sign in with Codex:',
  'Open this URL to sign in with Grok:', 'Select a Vercel team for AI Gateway:', 'Failed to authorize', 'Error',
  'error', 'Login failed:', '401', '403', '429', 'certificate', 'TLS', 'timed out', 'Auth not supported', 'Unknown provider',
  'Login method', 'Sign in', 'Connect account', 'Could not', 'Failed to', 'Unable to', 'Device authorization', 'user code'];
function textShape(text: string) {
  const clean = loginText(text);
  const urls = [...clean.matchAll(/https?:\/\/[^\s<>"']+/g)].slice(0, 8).flatMap(match => { try { return [urlShape(match[0])]; } catch { return []; } });
  return { characters: clean.length, hasFinalNewline: clean.endsWith('\n'), urls,
    markers: markers.filter(marker => clean.includes(marker)),
    // Structure only: no raw line, word, code, state, server message or account name.
    lines: clean.split('\n').slice(-24).map(line => ({ characters: line.length, leadingSpaces: /^ */.exec(line)![0].length,
      boxDrawingPrefix: /^[│|●•◇■ox]/.test(line), containsUrl: /https?:\/\//.test(line),
      markers: markers.filter(marker => line.includes(marker)), tokens: line.trim().split(/\s+/).filter(Boolean).map(word => word.length) })) };
}
const targets = [
  { id: 'claude', image: CLAUDE_MACHINE_IMAGE, login: CLAUDE_LOGIN, methods: ['subscription'] },
  { id: 'codex', image: CODEX_MACHINE_IMAGE, login: CODEX_LOGIN, methods: ['device'] },
  { id: 'cursor', image: CURSOR_MACHINE_IMAGE, login: CURSOR_LOGIN, methods: ['browser'] },
  { id: 'opencode', image: OPENCODE_MACHINE_IMAGE, login: OPENCODE_LOGIN, methods: ['openai', 'xai'] },
  { id: 'fx', image: FX_MACHINE_IMAGE, login: FX_LOGIN, methods: ['vercel', 'codex', 'grok'] },
];
const wrapperHash = createHash('sha256').update(GUEST_LOGIN_SOURCE).digest('hex');
const processProbe = `const fs=require('node:fs'),crypto=require('node:crypto');const rows=[];for(const p of fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x))){if(Number(p)===process.pid)continue;try{const exe=fs.readlinkSync('/proc/'+p+'/exe'),args=fs.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0'),stat=fs.readFileSync('/proc/'+p+'/stat','utf8'),parts=stat.slice(stat.lastIndexOf(')')+2).split(' ');const owned=exe.startsWith('/opt/blobot/')||crypto.createHash('sha256').update(args[2]??'').digest('hex')===${JSON.stringify(wrapperHash)};rows.push({pid:Number(p),ppid:Number(parts[1]),startTicks:parts[19],executable:exe,ownedLogin:owned});}catch{}}console.log(JSON.stringify({rows,browserSuppressionCalls:fs.existsSync('/tmp/blobot67-browser-suppressed')?fs.statSync('/tmp/blobot67-browser-suppressed').size:0}));`;
let beforeImages: any[] = [];
try {
  await guard(); report.engine = await json(['version', '--json']);
  assert.equal(report.engine.server.version, 'v0.42.0-rc5');
  assert.deepEqual((await json(['ls', '--json'])).sandboxes, []);
  beforeImages = (await json(['template', 'ls', '--json'])).images; report.beforeImages = beforeImages;
  const sources = ['adapters/login.ts', 'machines/sbx/transport.ts', 'machines/sbx/bootstrap.ts', 'machines/sbx/owned-machine.ts',
    ...targets.flatMap(target => [`adapters/${target.id}/login.ts`, `adapters/${target.id}/image.ts`])];
  report.sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path,
    createHash('sha256').update(await readFile(new URL(`../../../packages/core/src/${path}`, import.meta.url))).digest('hex')])));
  for (const target of targets) {
    await guard();
    const build = target.image.builds.find(build => build.arch === 'arm64')!;
    const imageRecord: any = { runtime: target.id, imageId: build.imageId, archiveSha256: build.sha256, bytes: build.bytes, version: target.image.cliVersion };
    report.images.push(imageRecord);
    const cache = join(root, `cache-${target.id}`), store = new SbxImageStore(cache);
    let loaded = false;
    try {
      console.log(JSON.stringify({ phase: 'image', runtime: target.id }));
      assert.equal((await store.readiness(build)).state, 'not_installed'); loaded = true;
      const imageStart = performance.now();
      await store.install(build, { signal: AbortSignal.timeout(240_000) });
      imageRecord.installMs = performance.now() - imageStart; imageRecord.ready = true; await save();
      for (const method of target.methods) {
        await guard(); assert.deepEqual((await json(['ls', '--json'])).sandboxes, []);
        const attempt: any = { runtime: target.id, method, startedAt: new Date().toISOString(), challenges: [], frames: { stdoutBytes: 0, stderrBytes: 0, exits: [] }, cleanup: {} };
        report.attempts.push(attempt); console.log(JSON.stringify({ phase: 'attempt', runtime: target.id, method }));
        const temporary = join(root, `attempt-${randomUUID()}`), source = join(temporary, 'source'), workspace = join(temporary, 'worktree');
        await mkdir(source, { recursive: true });
        const git = async (args: string[]) => exec('/usr/bin/git', args, { cwd: source, env: { PATH: '/usr/bin:/bin',
          GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...agentGitEnvironment('Research67') }, timeout: 15_000 });
        await git(['init', '-b', 'main']); await writeFile(join(source, 'README.md'), '# Synthetic login fixture\n');
        await git(['add', '.']); await git(['commit', '-m', 'Synthetic fixture']); await git(['worktree', 'add', '-b', 'login-fixture', workspace]);
        const agentId = `research67_${randomUUID()}`, registry = new SbxRegistry(join(temporary, 'registry'));
        const machine = new OwnedSbxMachine({ agentId, registry, kit: { image: build.reference, guestNode: target.image.guestNode,
          dataBytes: 8 * 1024 ** 3, dockerBytes: 20 * 1024 ** 3, workspace: { path: workspace, commonGit: [join(source, '.git')] } },
          limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 }, transport: { moduleRoot: target.image.moduleRoot, allowedEnvironment: target.image.allowedEnvironment },
          sbxExecutable: '/opt/homebrew/bin/sbx', commandTimeoutMs: 120_000 });
        let transport: any; const abort = new AbortController(); let timer: any;
        try {
          const start = performance.now(); await machine.start({ mailboxPort: 34567, runtime: { image: build.reference } });
          attempt.machineStartMs = performance.now() - start;
          const active = (await registry.read(agentId))!.active!; attempt.box = { id: active.id, name: active.name };
          // Fixture-only guest no-op openers: CLI argv/spec remain production, and no URL leaves to a browser.
          const suppress = `const fs=require('node:fs');const names=['xdg-open','open','sensible-browser','x-www-browser','www-browser','firefox','chromium','chromium-browser','google-chrome'];const paths=[];for(const dir of ['/opt/blobot/bin','/usr/local/bin','/usr/bin'])for(const name of names){const path=dir+'/'+name;try{if(fs.lstatSync(path).isSymbolicLink())fs.unlinkSync(path);}catch(e){if(e.code!=='ENOENT')throw e;}fs.writeFileSync(path,'#!/bin/sh\\nprintf . >> /tmp/blobot67-browser-suppressed\\nexit 0\\n',{mode:493});paths.push(path);}console.log(JSON.stringify({stubCount:paths.length}));`;
          attempt.browserSuppression = JSON.parse(await sbx(['exec', '-u', '0', active.name, target.image.guestNode, '-e', suppress]));
          const before = JSON.parse(await sbx(['exec', '-u', '0', active.name, target.image.guestNode, '-e', processProbe]));
          const originalSpawn = machine.spawn.bind(machine);
          machine.spawn = request => {
            const raw = originalSpawn(request); transport = raw;
            attempt.launch = { cwd: request.cwd, executable: request.command.kind === 'exec' ? request.command.executable : null, environmentNames: Object.keys(request.env ?? {}) };
            raw.onClose(reason => { attempt.transportClosed = true; attempt.transportCloseReasonPresent = reason !== undefined; });
            return { write: line => { throw Error('Fixture never supplies login input'); },
              async *lines() {
                for await (const line of raw.lines()) {
                  const frame = JSON.parse(line);
                  if (frame.type === 'data') attempt.frames[frame.stream === 'stdout' ? 'stdoutBytes' : 'stderrBytes'] += Buffer.from(frame.data, 'base64').length;
                  if (frame.type === 'exit') attempt.frames.exits.push(frame.code);
                  yield line;
                }
              }, close: () => raw.close(), onClose: listener => raw.onClose(listener) };
          };
          const spec = target.login.spec(method);
          attempt.command = { executable: spec.executable, args: spec.args, environmentNames: Object.keys(spec.env ?? {}) };
          const watched = { ...spec, parse: (text: string) => { attempt.textShape = textShape(text); return spec.parse(text); } };
          const login = new MachineLogin(machine, target.image.guestNode, watched);
          const loginStart = performance.now();
          timer = setTimeout(() => { attempt.timeout = true; abort.abort(); }, 60_000);
          try {
            await bounded(login.run(abort.signal, challenge => {
              attempt.challengeMs = performance.now() - loginStart;
              attempt.challenges.push(challengeShape(challenge));
              attempt.abortRequestedAtChallenge = true; abort.abort();
            }), 75_000);
            attempt.loginRunReturnedNormally = true;
          } catch (error) { attempt.runError = errorShape(error); }
          finally { clearTimeout(timer); attempt.loginMs = performance.now() - loginStart; abort.abort(); }
          if (transport) await bounded(transport.close(), 5_000).catch(error => { attempt.extraCloseError = errorShape(error); });
          const after = JSON.parse(await sbx(['exec', '-u', '0', active.name, target.image.guestNode, '-e', processProbe]));
          attempt.afterCancel = { ownedLoginProcesses: after.rows.filter((row: any) => row.ownedLogin), browserSuppressionCalls: after.browserSuppressionCalls,
            newProcesses: after.rows.filter((row: any) => !before.rows.some((prior: any) => prior.pid === row.pid && prior.startTicks === row.startTicks)) };
          attempt.challengeAndCancelPassed = attempt.challenges.length > 0 && attempt.abortRequestedAtChallenge === true &&
            attempt.loginRunReturnedNormally !== true && attempt.afterCancel.ownedLoginProcesses.length === 0;
        } catch (error) { attempt.fixtureError = errorShape(error); }
        finally {
          clearTimeout(timer); abort.abort();
          if (transport) await bounded(transport.close(), 5_000).catch(error => { attempt.cleanup.transportError = errorShape(error); });
          await machine.stop().catch(error => { attempt.cleanup.stopError = errorShape(error); });
          const record = await registry.read(agentId);
          const refs = [record?.active, ...record?.retained ?? [], ...(record?.pending?.id ? [{ name: record.pending.name, id: record.pending.id }] : [])].filter(Boolean);
          const boxes = (await json(['ls', '--json'])).sandboxes;
          attempt.cleanup.stopped = refs.every(ref => boxes.some((box: any) => box.id === ref!.id && box.name === ref!.name && box.status === 'stopped'));
          for (const ref of refs) if (boxes.some((box: any) => box.id === ref!.id && box.name === ref!.name)) await sbx(['rm', '-f', ref!.name]);
          attempt.cleanup.boxes = (await json(['ls', '--json'])).sandboxes;
          assert.deepEqual(attempt.cleanup.boxes, []);
          await rm(temporary, { recursive: true, force: true }); attempt.cleanup.temporaryRemoved = true;
          attempt.finishedAt = new Date().toISOString(); await save();
          console.log(JSON.stringify({ runtime: target.id, method, challenge: attempt.challenges[0], passed: attempt.challengeAndCancelPassed, error: attempt.runError ?? attempt.fixtureError, cleanup: attempt.cleanup }));
        }
      }
    } catch (error) { imageRecord.error = errorShape(error); }
    finally {
      if (loaded) {
        const [repository, tag] = build.reference.split(':');
        if ((await json(['template', 'ls', '--json'])).images.some((row: any) => row.repository === `docker.io/library/${repository}` && row.tag === tag)) await sbx(['template', 'rm', build.reference]);
      }
      await rm(cache, { recursive: true, force: true }); await save();
    }
  }
  report.completed = true;
} catch (error) { report.error = errorShape(error); }
finally {
  report.cleanup.boxes = (await json(['ls', '--json'])).sandboxes;
  report.cleanup.images = (await json(['template', 'ls', '--json'])).images;
  report.cleanup.imagesUnchanged = JSON.stringify(beforeImages) === JSON.stringify(report.cleanup.images);
  await guard();
  if (report.cleanup.boxes.length === 0) { await rm(root, { recursive: true, force: true }); report.cleanup.temporaryRootRemoved = true; }
  report.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ completed: report.completed, attempts: report.attempts.length, challenges: report.attempts.filter((attempt: any) => attempt.challenges.length > 0).length, cleanup: report.cleanup }));
}
