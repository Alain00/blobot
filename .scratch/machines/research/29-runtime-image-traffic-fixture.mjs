#!/usr/bin/env node
// Opt-in, one-image-at-a-time sbx traffic observation. No login/session/prompt/inference.
// Coordinate exclusive sbx access before setting the opt-in; this file is preparation only.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm, stat, statfs } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { sbxKit } from '../../../packages/core/dist/machines/sbx/kit.js';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';
import { readSbxNetworkRules, verifySbxNetworkRules, verifySbxNetworkCheck, verifySbxVersion, SBX_BOUNDARY_PROBE, verifySbxBoundary } from '../../../packages/core/dist/machines/sbx/observations.js';

if (process.env.BLOBOT_LIVE_SBX_RUNTIME_TRAFFIC !== '1') throw new Error('Explicit opt-in and exclusive engine handoff required');
const args = process.argv.slice(2);
const option = name => {
  const at = args.indexOf(name);
  if (at < 0 || !args[at + 1]) throw new Error(`Missing ${name}`);
  return args[at + 1];
};
const receiptPath = resolve(option('--receipt'));
const outputPath = resolve(option('--results'));
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
assert(['claude', 'codex', 'fx', 'opencode', 'cursor'].includes(receipt.runtime));
assert.equal(receipt.arch, 'arm64');
assert(/^sha256:[a-f0-9]{64}$/.test(receipt.imageId));
const dockerHost = option('--docker-host');
assert(dockerHost.startsWith('unix:///'));
const dockerEnv = { ...process.env, DOCKER_CONFIG: resolve(option('--docker-config')), DOCKER_HOST: dockerHost };
const sbxEnv = sbxClientEnvironment();
const exec = promisify(execFile);
const uuid = randomUUID(), name = `blobot-traffic-${receipt.runtime}-${uuid}`;
const reuseReceiptExport = args.includes('--reuse-receipt-export');
const deleteReceiptExport = args.includes('--delete-receipt-export');
assert(!deleteReceiptExport || reuseReceiptExport);
if (reuseReceiptExport) {
  assert(typeof receipt.asset === 'string' && /^[a-z0-9.-]+\.tar$/.test(receipt.asset));
  assert(/^[a-f0-9]{64}$/.test(receipt.sha256) && Number.isSafeInteger(receipt.bytes));
}
const candidate = reuseReceiptExport ? receipt.reference : `blobot-traffic-probe:${receipt.runtime}-${uuid}`;
assert(/^blobot-(traffic-probe|machine-[a-z]+):[a-z0-9-]+$/.test(candidate));
const [repository, tag] = candidate.split(':');
const temp = await mkdtemp('/private/tmp/blobot-runtime-traffic.');
const archive = reuseReceiptExport ? join(dirname(receiptPath), receipt.asset) : join(temp, 'candidate.tar');
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), receiptPath, receipt,
  scope: 'One credential-free local build in sbx deny-all; idle boot, version, signed-out status, ACP initialize only.',
  candidate, commands: [], policySnapshots: [], phases: [], cleanup: {},
  observationWindowsMs: { idleBoot: 15000, afterVersion: 3000, afterStatus: 10000, initializeAfterResponse: 10000 },
};
let intendedDockerTag = false, intendedImage = false, intendedBox = false, boxId, imageId;
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
async function run(tool, argv, label, { timeout = 60000, acceptable = [0] } = {}) {
  const started = performance.now();
  let result;
  try {
    const r = await exec(tool, argv, { env: tool === 'sbx' ? sbxEnv : dockerEnv, timeout, maxBuffer: 4 * 1024 ** 2 });
    result = { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) { result = { code: e.code, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? ''), killed: e.killed }; }
  report.commands.push({ label, tool, ms: performance.now() - started, code: result.code, killed: result.killed ?? false });
  if (!acceptable.includes(result.code)) throw new Error(`${label} failed (${result.code}): ${result.stderr.slice(-1500)}`);
  return result;
}
const sbxJson = async argv => JSON.parse((await run('sbx', argv, argv.slice(0, 2).join(' '))).stdout);
const boxes = async () => (await sbxJson(['ls', '--json'])).sandboxes;
const ownImages = async () => (await sbxJson(['template', 'ls', '--json'])).images.filter(x => x.tag === tag && (x.repository === repository || x.repository.endsWith('/' + repository)));
async function verifyBox() {
  const found = (await boxes()).filter(x => x.name === name);
  assert.equal(found.length, 1); assert.equal(found[0].id, boxId);
}
async function verifyDenyAll() {
  const global = await sbxJson(['policy', 'ls', '--type', 'network', '--json']);
  const globalRules = readSbxNetworkRules(global);
  verifySbxNetworkRules(globalRules);
  if (!boxId) return { global };
  await verifyBox();
  const scoped = await sbxJson(['policy', 'ls', name, '--type', 'network', '--json']);
  verifySbxNetworkRules(readSbxNetworkRules(scoped));
  const target = 'blobot-traffic-fixture.invalid:443';
  const checked = JSON.parse((await run('sbx', ['policy', 'check', 'network', '--sandbox', name, '--json', target], 'effective-deny-all', { acceptable: [0, 1] })).stdout);
  verifySbxNetworkCheck(checked, name, target, false);
  return { global, scoped, checked };
}
async function policySnapshot(label) {
  await verifyBox();
  const log = await sbxJson(['policy', 'log', name, '--json']);
  assert(Array.isArray(log.blocked_hosts) && Array.isArray(log.allowed_hosts));
  const previous = report.policySnapshots.at(-1)?.log;
  const diff = key => log[key].filter(x => !previous?.[key].some(y => JSON.stringify(y) === JSON.stringify(x)));
  const snapshot = { label, at: new Date().toISOString(), log, newOrChangedRows: { blocked_hosts: diff('blocked_hosts'), allowed_hosts: diff('allowed_hosts') } };
  report.policySnapshots.push(snapshot);
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  assert.equal(log.allowed_hosts.length, 0, 'An allowed host appeared under expected deny-all; stop this fixture');
  console.log(JSON.stringify({ runtime: receipt.runtime, phase: label, blocked: log.blocked_hosts, allowed: log.allowed_hosts }));
  return snapshot;
}

// The guest owns the complete process group. Every signal targets only its own child group;
// sbx-client cancellation is not mistaken for guest-process cleanup.
const GUEST_RUNNER = String.raw`
const cp=require('node:child_process'),fs=require('node:fs');
const request=JSON.parse(process.argv[1]);
if(process.getuid()!==1000)throw Error('Expected Agent UID');
const allowed=new Set(['/opt/blobot/bin/claude','/opt/blobot/bin/codex','/opt/blobot/bin/fx','/opt/blobot/bin/opencode','/opt/blobot/bin/cursor-agent','/opt/blobot/bin/docker','/usr/bin/node']);
if(!allowed.has(request.executable))throw Error('Unexpected executable');
const started=performance.now();
const child=cp.spawn(request.executable,request.args,{cwd:'/workspace',env:process.env,detached:true,stdio:['pipe','pipe','pipe']});
let stdout='',stderr='',partial='',response=null,responseAtMs=null,inputEofAtMs=null,timedOut=false,eofTimer,termTimer,killTimer;
const signals=[];
const signal=s=>{try{process.kill(-child.pid,s);signals.push(s)}catch(e){if(e.code!=='ESRCH')throw e}};
const endInput=()=>{if(inputEofAtMs===null)inputEofAtMs=performance.now()-started;child.stdin.end();};
const terminate=()=>{signal('SIGTERM');killTimer=setTimeout(()=>signal('SIGKILL'),2000);};
const deadline=setTimeout(()=>{timedOut=true;endInput();terminate();},request.timeoutMs);
child.stdin.on('error',()=>{});
child.stderr.on('data',d=>stderr=(stderr+d.toString()).slice(0,131072));
child.stdout.on('data',d=>{const text=d.toString();stdout=(stdout+text).slice(0,131072);partial+=text;
for(;;){const i=partial.indexOf('\n');if(i<0)break;const line=partial.slice(0,i);partial=partial.slice(i+1);let msg;try{msg=JSON.parse(line)}catch{continue}
if(request.initialize&&msg.id===1&&(msg.result!==undefined||msg.error!==undefined)&&response===null){response=msg;responseAtMs=performance.now()-started;
eofTimer=setTimeout(()=>{endInput();termTimer=setTimeout(terminate,3000);},request.observeAfterResponseMs);}}});
child.on('error',e=>stderr+='\n'+e.message);
child.on('close',(code,exitSignal)=>{
clearTimeout(deadline);clearTimeout(eofTimer);clearTimeout(termTimer);clearTimeout(killTimer);
// Close can follow an ordinary parent exit while a child still holds the process group.
try{process.kill(-child.pid,0);signal('SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}
console.log(JSON.stringify({uid:process.getuid(),pid:child.pid,command:{executable:request.executable,args:request.args},code,exitSignal,stdout,stderr,response,responseAtMs,inputEofAtMs,elapsedMs:performance.now()-started,timedOut,signals}));});
if(request.initialize)child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'blobot-deny-all-traffic-fixture',version:'1'}}})+'\n');else endInput();
`;
async function guest(source, label, argv = [], uid = '1000') {
  await verifyBox();
  const r = await run('sbx', ['exec', '-u', uid, name, '/usr/bin/node', '-e', source, ...argv], label, { timeout: 60000 });
  return JSON.parse(r.stdout);
}
async function runtimePhase(label, executable, argv, { initialize = false, settle = 0 } = {}) {
  const before = await verifyDenyAll();
  const result = await guest(GUEST_RUNNER, label, [JSON.stringify({ executable, args: argv, initialize, timeoutMs: initialize ? 45000 : 15000, observeAfterResponseMs: 10000 })]);
  report.phases.push({ label, at: new Date().toISOString(), policy: before, result });
  if (settle) await delay(settle);
  await policySnapshot(label);
}

try {
  // Do not export or load until the coordinator has handed over the engine.
  assert.equal((await sbxJson(['daemon', 'status', '--json'])).status, 'running');
  report.engine = await sbxJson(['version', '--json']); verifySbxVersion(report.engine);
  assert.equal((await sbxJson(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  assert.equal((await boxes()).length, 0, 'Another task owns the engine; stop and coordinate');
  assert.equal((await ownImages()).length, 0);
  report.policyBeforeCreate = await verifyDenyAll();
  const space = await statfs(temp, { bigint: true });
  const available = space.bsize * space.bavail;
  const required = BigInt(receipt.imageBytes) * (reuseReceiptExport ? 1n : 2n) + 1024n ** 3n;
  report.hostSpace = { availableBytes: String(available), requiredBytes: String(required) };
  assert(available >= required, 'Insufficient host headroom for one export plus engine import');
  const original = JSON.parse((await run('docker', ['image', 'inspect', receipt.reference], 'verify-built-image')).stdout)[0];
  assert.equal(original.Id, receipt.imageId);
  if (!reuseReceiptExport) {
    const collision = await run('docker', ['image', 'inspect', candidate], 'verify-owned-tag-absent', { acceptable: [0, 1] });
    assert.equal(collision.code, 1);
    intendedDockerTag = true;
    await run('docker', ['image', 'tag', receipt.imageId, candidate], 'tag-owned-export');
    await run('docker', ['image', 'save', '--output', archive, candidate], 'export-one-image', { timeout: 120000 });
  }
  const index = JSON.parse((await exec('tar', ['-xOf', archive, 'index.json'], { maxBuffer: 1024 ** 2 })).stdout);
  assert.equal(index.manifests?.length, 1); assert.equal(index.manifests[0].digest, receipt.imageId);
  assert.equal(index.manifests[0].annotations?.['io.containerd.image.name'], `docker.io/library/${candidate}`);
  const legacy = JSON.parse((await exec('tar', ['-xOf', archive, 'manifest.json'], { maxBuffer: 1024 ** 2 })).stdout);
  assert.deepEqual(legacy.map(x => x.RepoTags), [[candidate]]);
  const hash = createHash('sha256'); for await (const chunk of createReadStream(archive)) hash.update(chunk);
  report.export = { bytes: (await stat(archive)).size, sha256: hash.digest('hex'), manifest: index.manifests[0] };
  if (reuseReceiptExport) { assert.equal(report.export.bytes, receipt.bytes); assert.equal(report.export.sha256, receipt.sha256); }
  intendedImage = true;
  await run('sbx', ['template', 'load', archive], 'load-one-image', { timeout: 120000 });
  const loaded = await ownImages(); assert.equal(loaded.length, 1); imageId = loaded[0].id;
  assert(receipt.imageId.slice(7).startsWith(imageId.replace(/^sha256:/, '')));
  report.loaded = loaded[0];
  if (!reuseReceiptExport || deleteReceiptExport) await rm(archive);
  report.export.deletedAfterLoad = !reuseReceiptExport || deleteReceiptExport;
  const kit = structuredClone(sbxKit({ image: candidate, guestNode: '/usr/bin/node', dataBytes: 8 * 1024 ** 3, workspaceBytes: 512 * 1024 ** 2 }));
  kit.security = { privileged: true };
  if (!kit.volumes.some(x => x.path === '/var/lib/docker')) kit.volumes.push({ path: '/var/lib/docker', size: String(20 * 1024 ** 3), mode: '0700' });
  assert.deepEqual(kit.credentials, []); assert.deepEqual(kit.permissions, { network: { allow: [], deny: [] } });
  assert.equal(kit.setup.startup, undefined);
  report.kit = kit;
  await writeFile(join(temp, 'spec.yaml'), JSON.stringify(kit));
  intendedBox = true;
  await run('sbx', ['create', '--name', name, '--cpus', '2', '--memory', '2g', temp], 'create-credential-free-box');
  const found = (await boxes()).filter(x => x.name === name); assert.equal(found.length, 1); boxId = found[0].id;
  report.box = { name, id: boxId };
  report.policyAfterCreate = await verifyDenyAll();
  report.boundary = await guest(String.raw`const fs=require('node:fs');const names=['ANTHROPIC_API_KEY','CLAUDE_CODE_OAUTH_TOKEN','OPENAI_API_KEY','CODEX_API_KEY','CURSOR_API_KEY','CURSOR_AUTH_TOKEN','AI_GATEWAY_API_KEY','VERCEL_OIDC_TOKEN'];const mountinfo=fs.readFileSync('/proc/self/mountinfo','utf8');const roots=Object.fromEntries(['/home/agent','/workspace','/var/lib/docker'].map(path=>{const s=fs.lstatSync(path),mounts=mountinfo.trim().split('\n').filter(l=>l.split(' ')[4]===path).map(line=>{const device=line.split(' ')[2];let sectors,error;try{sectors=fs.readFileSync('/sys/dev/block/'+device+'/size','utf8').trim()}catch(e){error={code:e.code,message:e.message}}return{line,device,sectors,error,blockBytes:sectors?String(BigInt(sectors)*512n):null}});return[path,{uid:s.uid,gid:s.gid,mode:s.mode&4095,directory:s.isDirectory(),mounts}]}));console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),home:process.env.HOME,node:process.version,homeEntries:fs.readdirSync('/home/agent'),workspaceEntries:fs.readdirSync('/workspace'),credentialVariablesPresent:names.filter(k=>Boolean(process.env[k])),roots,mountinfo}));`, 'credential-free-boundary');
  assert.equal(report.boundary.uid, 1000); assert.equal(report.boundary.credentialVariablesPresent.length, 0);
  await policySnapshot('immediate-boot');
  await runtimePhase('private-docker-info', '/opt/blobot/bin/docker', ['info', '--format', '{{json .}}']);
  await runtimePhase('private-docker-compose', '/opt/blobot/bin/docker', ['compose', 'version', '--short']);
  const coreRoots = [JSON.stringify(['/home/agent', '/workspace', '/var/lib/docker'])];
  const coreLimits = { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 };
  const coreStorage = { homeBytes: 8 * 1024 ** 3, dockerBytes: 20 * 1024 ** 3 };
  const coreRoot = await guest(SBX_BOUNDARY_PROBE, 'core-boundary-root', coreRoots, '0');
  const coreAgent = await guest(SBX_BOUNDARY_PROBE, 'core-boundary-agent', coreRoots);
  report.coreBoundary = { root: coreRoot, agent: coreAgent, limits: coreLimits, storage: coreStorage, passed: false };
  const baseline = verifySbxBoundary(coreRoot, coreLimits, 0, undefined, undefined, coreStorage);
  verifySbxBoundary(coreAgent, coreLimits, 1000, baseline, undefined, coreStorage);
  report.coreBoundary.passed = true;
  await delay(report.observationWindowsMs.idleBoot);
  await policySnapshot('idle-boot-15s');
  await runtimePhase('version', receipt.executable, ['--version'], { settle: report.observationWindowsMs.afterVersion });
  const statusArgs = { claude: ['auth', 'status'], codex: ['login', 'status'], fx: ['status', '--json'], opencode: ['auth', 'list'], cursor: ['status', '--format', 'json'] }[receipt.runtime];
  await runtimePhase('signed-out-status', receipt.executable, statusArgs, { settle: report.observationWindowsMs.afterStatus });
  const bridge = receipt.runtime === 'claude' ? 'claude-agent-acp' : receipt.runtime === 'codex' ? 'codex-acp' : null;
  await runtimePhase('initialize-only', bridge ? '/usr/bin/node' : receipt.executable,
    bridge ? [`/opt/blobot/node_modules/@agentclientprotocol/${bridge}/dist/index.js`] : receipt.runtime === 'cursor' ? ['acp', '--workspace', '/workspace'] : ['acp'], { initialize: true });
  report.policyAtEnd = await verifyDenyAll();
  report.measurementCompleted = true;
} catch (e) { report.measurementCompleted = false; report.error = e.message; process.exitCode = 1; }
finally {
  const errors = [];
  if (intendedBox) try {
    const found = (await boxes()).filter(x => x.name === name);
    if (found.length) { assert.equal(found.length, 1); if (boxId) assert.equal(found[0].id, boxId); await run('sbx', ['rm', '-f', name], 'remove-owned-box'); }
  } catch (e) { errors.push({ name, error: e.message }); }
  if (intendedImage) try {
    const found = await ownImages();
    if (found.length) { assert.equal(found.length, 1); if (imageId) assert.equal(found[0].id, imageId); await run('sbx', ['template', 'rm', candidate], 'remove-owned-template'); }
  } catch (e) { errors.push({ candidate, error: e.message }); }
  if (intendedDockerTag) try { await run('docker', ['image', 'rm', candidate], 'remove-owned-export-tag'); }
  catch (e) { errors.push({ candidate, error: e.message }); }
  report.cleanup = { errors, remainingBoxes: intendedBox ? (await boxes()).filter(x => x.name === name) : [], remainingImages: intendedImage ? await ownImages() : [] };
  if (errors.length || report.cleanup.remainingBoxes.length || report.cleanup.remainingImages.length) process.exitCode = 1;
  await rm(temp, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ runtime: receipt.runtime, measurementCompleted: report.measurementCompleted, error: report.error, cleanup: report.cleanup }));
}
