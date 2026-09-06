// Explicit opt-in: two fresh UUID-owned guests, local image, no providers or credentials.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, statfs, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';
import { prepareSbxStateExec, sbxStateExecSource } from '../../../packages/core/dist/machines/sbx/state-exec.js';
import { SbxStateChannel } from '../../../packages/core/dist/machines/sbx/state-channel.js';
import { copySbxState } from '../../../packages/core/dist/machines/sbx/state-transfer.js';

assert.equal(process.env.BLOBOT_LIVE_SBX_STATE60, '1', 'Explicit opt-in required');
assert.equal(process.platform, 'darwin');
const candidate = 'blobot-machine-probe:explicit-docker-20260905';
const manifest = 'sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c';
const archive = '/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar';
const uuid = randomUUID(), temp = await mkdtemp('/private/tmp/blobot-state60-');
const env = sbxClientEnvironment(), exec = promisify(execFile);
const report = { date: new Date().toISOString(), uuid, candidate, manifest,
  scope: 'two fresh disposable same-image Machines; no user Agent', commands: [], diskChecks: [], cleanup: {},
  sourceSha256: createHash('sha256').update(sbxStateExecSource()).digest('hex'), progress: [], boxes: [] };
const owned = [], children = [], channels = [];
let ownedImage = false, imageId, monitor, spaceFailure, minimum;
const controller = new AbortController();
const diagnostics = `
const originalPlan=attributes.plan.bind(attributes);
attributes.plan=(path,source,target,assertHeld)=>{
 const plan=originalPlan(path,source,target,assertHeld),codec=functions.attributeCodec();
 const a=codec.decode(source.attributes,source.members),b=codec.decode(target.attributes,target.members);
 const bytes=functions.select(source.members,target.members,plan.changed);
 const selected=new Set(bytes===null?[]:bytes.subarray(0,-1).toString('latin1').split('\\0').map(k=>k.replace(/\\/$/,'')));
 const unknown={},different={};
 for(const key of selected){const v=a.get(key),type=source.members.get(key).type;if(typeof v[0]!=='number'){const kind=type+':'+v[0]+':'+v[2]+':'+v[3];unknown[kind]=(unknown[kind]??0)+1;}}
 for(const key of plan.changed){const type=source.members.get(key).type;different[type]=(different[type]??0)+1;}
 process.stderr.write(JSON.stringify({event:'selection',members:source.members.size,selected:selected.size,attributeChanges:plan.changed.size,unknownSelected:unknown,differentByType:different})+'\\n');
 return {...plan,prepare:async selection=>{try{await plan.prepare(selection);process.stderr.write('{"event":"attributes-prepared"}\\n');}catch(e){process.stderr.write('{"event":"attributes-prepare-rejected"}\\n');throw e;}},finish:async()=>{try{await plan.finish();process.stderr.write('{"event":"attributes-finished"}\\n');}catch(e){process.stderr.write('{"event":"attributes-finish-rejected"}\\n');throw e;}}};
};
`;
const disk = async label => {
  const s = await statfs(temp, { bigint: true }), available = s.bavail * s.bsize;
  report.diskChecks.push({ label, availableBytes: String(available) });
  assert(available >= 2n * 1024n ** 3n, 'Less than 2 GiB available');
};
const run = async (args, label, timeout = 60_000) => {
  const start = performance.now();
  try { const r = await exec('sbx', args, { env, timeout, maxBuffer: 4 * 1024 ** 2 }); report.commands.push({ label, code: 0, ms: performance.now() - start }); return r.stdout; }
  catch (e) { report.commands.push({ label, code: e.code, ms: performance.now() - start }); throw new Error(label + ': ' + String(e.stderr ?? e.message).slice(-2000)); }
};
const json = async (args, label) => JSON.parse(await run(args, label));
const boxes = async () => (await json(['ls', '--json'], 'list-boxes')).sandboxes;
const matchingImage = async () => (await json(['template', 'ls', '--json'], 'list-images')).images.filter(i => i.tag === candidate.split(':')[1] && (i.repository === candidate.split(':')[0] || i.repository.endsWith('/' + candidate.split(':')[0])));
class ObservedChannel extends SbxStateChannel {
  constructor(child, role) { super(child.stdout, child.stdin); this.role = role; }
  async request(operation, fields, onData) {
    const entry = { role: this.role, operation, tree: fields?.tree, started: new Date().toISOString() };
    report.progress.push(entry); console.log(JSON.stringify(entry));
    const result = await super.request(operation, fields, onData);
    entry.completed = new Date().toISOString(); return result;
  }
}
try {
  await disk('before-load'); assert((await stat(archive)).isFile());
  assert.equal((await json(['daemon', 'status', '--json'], 'daemon-status')).status, 'running');
  report.version = await json(['version', '--json'], 'version');
  assert.equal(report.version.client.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a');
  assert.equal(report.version.server.revision, report.version.client.revision);
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'], 'read-ssh-forwarding')).value, false);
  assert.deepEqual(await boxes(), []);
  let matches = await matchingImage();
  if (matches.length === 0) { ownedImage = true; await run(['template', 'load', archive], 'load-local-archive', 120_000); matches = await matchingImage(); }
  assert.equal(matches.length, 1); imageId = matches[0].id; report.image = matches[0];
  assert(manifest.slice(7).startsWith(imageId.replace(/^sha256:/, '')));
  const kitDir = join(temp, 'kit'); await mkdir(kitDir);
  const kit = { schemaVersion: '2', kind: 'sandbox', name: 'blobot-synthetic-state60',
    sandbox: { image: candidate, entrypoint: ['/usr/bin/node'], command: { default: ['--version'] } },
    security: { privileged: true }, credentials: [], permissions: { network: { allow: [], deny: [] } },
    volumes: [{ path: '/home/agent', size: String(8 * 1024 ** 3), mode: '0700' },
      { path: '/var/lib/docker', size: String(20 * 1024 ** 3), mode: '0700' }] };
  report.kit = kit; await writeFile(join(kitDir, 'spec.yaml'), JSON.stringify(kit), { mode: 0o600 });
  for (const role of ['source', 'target']) {
    await disk('before-create-' + role);
    const name = 'blobot-state60-' + role + '-' + uuid, worktree = join(temp, role + '-worktree');
    await mkdir(worktree); await writeFile(join(worktree, 'marker'), 'synthetic-' + role + '-' + uuid, { mode: 0o600 });
    const ref = { name, role }; owned.push(ref);
    await run(['create', '--name', name, '--cpus', '2', '--memory', '2g', kitDir, worktree], 'create-' + role, 90_000);
    const found = (await boxes()).filter(b => b.name === name); assert.equal(found.length, 1);
    ref.id = found[0].id; report.boxes.push(found[0]);
  }
  monitor = setInterval(() => {
    statfs(temp, { bigint: true }).then(s => {
      const available = s.bavail * s.bsize;
      minimum = minimum === undefined || available < minimum ? available : minimum;
      if (available < 2n * 1024n ** 3n) { spaceFailure = true; controller.abort(); }
    }).catch(() => { spaceFailure = true; controller.abort(); });
  }, 500);
  for (const ref of owned) {
    const args = [...prepareSbxStateExec({ name: ref.name, guestNode: '/usr/bin/node', token: randomUUID(), role: ref.role, maximumTreeBytes: 4 * 1024 ** 3 })];
    args[11] = args[11].replace('const backend=functions.backend', diagnostics + '\nconst backend=functions.backend');
    report.diagnosticSourceSha256 = createHash('sha256').update(args[11]).digest('hex');
    const child = spawn('sbx', [...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const state = { child, role: ref.role, stderrBytes: 0, diagnostics: '' };
    child.on('error', () => { state.spawnFailed = true; controller.abort(); });
    child.stderr.on('data', bytes => { state.stderrBytes += bytes.length; state.diagnostics += bytes.toString(); if (state.diagnostics.length > 8000) controller.abort(); });
    state.completed = new Promise(resolve => child.on('close', code => { state.code = code; resolve(); }));
    children.push(state); channels.push(new ObservedChannel(child, ref.role));
  }
  const timeout = setTimeout(() => controller.abort(), 10 * 60_000);
  try {
    report.receipt = await copySbxState(channels[0], channels[1], { maxBytes: 4 * 1024 ** 3, signal: controller.signal });
    report.heldTransferVerified = true;
  } finally { clearTimeout(timeout); }
  assert.equal(spaceFailure, undefined);
  for (const channel of channels) channel.close();
  for (const state of children) {
    const timer = setTimeout(() => state.child.kill('SIGTERM'), 3000);
    await state.completed; clearTimeout(timer);
  }
  for (const ref of owned) await run(['stop', ref.name], 'stop-' + ref.role, 30_000);
  // Deliberately no postboot equality claim: ordinary startup writers are a separate gate.
  report.passed = true;
} catch (e) { report.passed = false; report.error = e.stack; process.exitCode = 1; }
finally {
  clearInterval(monitor); controller.abort();
  for (const channel of channels) channel.close();
  for (const state of children) if (state.child.exitCode === null && state.child.signalCode === null) state.child.kill('SIGKILL');
  const errors = [];
  for (const ref of owned) try {
    const found = (await boxes()).filter(b => b.name === ref.name); assert(found.length <= 1);
    if (found.length) { if (ref.id) assert.equal(found[0].id, ref.id); await run(['rm', '-f', ref.name], 'remove-' + ref.role, 90_000); }
  } catch (e) { errors.push(e.message); }
  if (ownedImage) try {
    const found = await matchingImage(); assert(found.length <= 1);
    if (found.length) { if (imageId) assert.equal(found[0].id, imageId); await run(['template', 'rm', candidate], 'remove-owned-local-alias'); }
  } catch (e) { errors.push(e.message); }
  report.children = children.map(({ role, code, stderrBytes, spawnFailed, diagnostics }) => ({ role, code, stderrBytes, spawnFailed, diagnostics }));
  report.minimumObservedSpace = minimum?.toString();
  report.cleanup = { errors, remainingOwnedBoxes: (await boxes()).filter(b => owned.some(ref => ref.name === b.name)), remainingOwnedImages: ownedImage ? await matchingImage() : [] };
  await disk('after-cleanup'); await rm(temp, { recursive: true, force: true }); report.cleanup.tempRemoved = true;
  if (errors.length || report.cleanup.remainingOwnedBoxes.length || report.cleanup.remainingOwnedImages.length) { report.passed = false; process.exitCode = 1; }
  await writeFile(new URL('./60-composed-state-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, error: report.error, receipt: report.receipt, progress: report.progress, cleanup: report.cleanup }));
}
