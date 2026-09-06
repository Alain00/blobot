// Two disposable same-image boxes. The host relays data frames opaquely and stores aggregates only.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm, statfs, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';
import { prepareSbxStateMaintenance } from '../../../packages/core/dist/machines/sbx/state-maintenance.js';
import { readSbxStateTree } from '../../../packages/core/dist/machines/sbx/state-tree.js';
import { createStateArchiveVerifier } from '../../../packages/core/dist/machines/sbx/state-archive.js';
import { createSbxArchiveIndex, selectSbxArchiveMembers } from '../../../packages/core/dist/machines/sbx/state-archive-index.js';
assert.equal(process.env.BLOBOT_LIVE_SBX_COMPARE56, '1'); assert.equal(process.platform, 'darwin');
const candidate = 'blobot-machine-probe:explicit-docker-20260905', manifest = 'sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c';
const archive = '/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar', uuid = randomUUID();
const temp = await mkdtemp('/private/tmp/blobot-compare56-'), env = sbxClientEnvironment(), exec = promisify(execFile);
const sourceFunctions = { prepare: prepareSbxStateMaintenance, read: readSbxStateTree, verify: createStateArchiveVerifier, index: createSbxArchiveIndex, select: selectSbxArchiveMembers };
const sources = Object.fromEntries(Object.entries(sourceFunctions).map(([k, fn]) => [k, fn.toString()]));
const worker = await readFile(new URL('./56-base-selection-worker.cjs', import.meta.url), 'utf8');
const scanner = await readFile(new URL('./56-base-selection-attributes.py', import.meta.url), 'utf8');
const seed = await readFile(new URL('./56-base-selection-seed.py', import.meta.url), 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { date: new Date().toISOString(), uuid, candidate, manifest, commands: [], diskChecks: [], boxes: [],
  scripts: { worker: hash(worker), scanner: hash(scanner), seed: hash(seed) }, functionHashes: Object.fromEntries(Object.entries(sources).map(([k, value]) => [k, hash(value)])),
  relay: { bytes: 0, frames: 0, maxFrame: 0, opaque: true, persisted: false }, memory: { peakRss: process.memoryUsage().rss, peakArrayBuffers: 0 }, cleanup: {} };
let loadedOwned = false, imageId, monitor, minSpace, spaceFailure;
const intended = new Set(), refs = new Map(), channels = [];
const disk = async label => { const s = await statfs(temp, { bigint: true }), n = s.bavail * s.bsize; report.diskChecks.push({ label, availableBytes: n.toString() }); assert(n >= 2n * 1024n ** 3n); };
const run = async (args, label, timeout = 90_000) => { const start = performance.now(); try { const r = await exec('sbx', args, { env, timeout, maxBuffer: 4 * 1024 ** 2 }); report.commands.push({ label, code: 0, ms: performance.now() - start }); return r.stdout; } catch (e) { report.commands.push({ label, code: e.code, ms: performance.now() - start }); throw new Error('Owned fixture command failed: ' + label); } };
const json = async (args, label) => JSON.parse(await run(args, label));
const boxes = async () => (await json(['ls', '--json'], 'list-boxes')).sandboxes;
const matching = async () => (await json(['template', 'ls', '--json'], 'list-images')).images.filter(i => i.tag === candidate.split(':')[1] && (i.repository === candidate.split(':')[0] || i.repository.endsWith('/' + candidate.split(':')[0])));
const write = async (stream, data) => { if (!stream.write(data)) await once(stream, 'drain'); };
const send = async (stream, type, data) => { const b = type === 1 ? Buffer.from(JSON.stringify(data)) : data; const header = Buffer.alloc(5); header[0] = type; header.writeUInt32BE(b.length, 1); await write(stream, header); await write(stream, b); };
async function* frames(stream) {
  let pending = Buffer.alloc(0);
  for await (const chunk of stream) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= 5) { const type = pending[0], length = pending.readUInt32BE(1); assert([1, 2].includes(type)); assert(length <= (type === 1 ? 1024 ** 2 : 65536)); if (pending.length < length + 5) break;
      const data = pending.subarray(5, 5 + length); pending = pending.subarray(5 + length); yield { type, data }; }
  }
  assert.equal(pending.length, 0);
}
function connect(ref, role, worktree, onData) {
  const token = randomUUID(), child = spawn('sbx', ['exec', '-i', '-u', '0', ref.name, '/usr/bin/unshare', '--mount', '--propagation', 'private', '/usr/bin/node', '-e', worker,
    JSON.stringify({ uuid, token, role, worktree }), JSON.stringify(sources), scanner, seed], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderrBytes = 0, failure; const waiting = new Map(), received = new Map();
  child.stderr.on('data', b => { stderrBytes += b.length; });
  const fail = error => { failure ??= error; for (const promise of waiting.values()) promise.reject(failure); waiting.clear(); };
  child.stdin.on('error', () => fail(new Error('Owned guest input closed.')));
  const closed = new Promise(resolve => { child.on('error', () => fail(new Error('Owned guest failed to start.'))); child.on('close', (code, signal) => { if (code !== 0) fail(new Error('Owned guest exited unsuccessfully.')); resolve({ code, signal, stderrBytes }); }); });
  const pump = (async () => { for await (const frame of frames(child.stdout)) {
    if (frame.type === 2) { assert(onData); await onData(frame.data); continue; }
    const event = JSON.parse(frame.data); if (event.event === 'error') { report.guestError = event; fail(new Error('Guest failed at ' + event.stage)); continue; }
    const pending = waiting.get(event.event); if (pending) { waiting.delete(event.event); pending.resolve(event); } else received.set(event.event, event);
  } })().catch(error => { fail(error); child.kill('SIGTERM'); });
  const channel = { role, child, closed, pump, send: message => send(child.stdin, 1, message), data: data => send(child.stdin, 2, data),
    wait: event => { if (received.has(event)) { const value = received.get(event); received.delete(event); return Promise.resolve(value); } if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => { const timer = setTimeout(() => { waiting.delete(event); reject(new Error('Guest event timeout: ' + role + '/' + event)); child.kill('SIGTERM'); }, 240_000);
        waiting.set(event, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } }); }); } };
  channels.push(channel); return channel;
}
try {
  await disk('before-load'); assert((await stat(archive)).isFile());
  assert.equal((await json(['daemon', 'status', '--json'], 'daemon-status')).status, 'running');
  report.version = await json(['version', '--json'], 'version'); assert.equal(report.version.client.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a'); assert.equal(report.version.server.revision, report.version.client.revision);
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'], 'read-ssh-forwarding')).value, false); assert.deepEqual(await boxes(), []);
  let image = await matching(); if (!image.length) { loadedOwned = true; await run(['template', 'load', archive], 'load-local', 120_000); image = await matching(); }
  assert.equal(image.length, 1); imageId = image[0].id; report.image = image[0]; assert(manifest.slice(7).startsWith(imageId.replace(/^sha256:/, '')));
  const kitDir = join(temp, 'kit'), worktree = join(temp, 'synthetic-worktree'); await mkdir(kitDir); await mkdir(worktree); await writeFile(join(worktree, 'marker'), 'synthetic-' + uuid, { mode: 0o600 });
  const kit = { schemaVersion: '2', kind: 'sandbox', name: 'blobot-synthetic-compare56', sandbox: { image: candidate, entrypoint: ['/usr/bin/node'], command: { default: ['--version'] } },
    security: { privileged: true }, credentials: [], permissions: { network: { allow: [], deny: [] } }, volumes: [{ path: '/home/agent', size: String(8 * 1024 ** 3), mode: '0700' }, { path: '/var/lib/docker', size: String(20 * 1024 ** 3), mode: '0700' }] };
  report.kit = kit; await writeFile(join(kitDir, 'spec.yaml'), JSON.stringify(kit), { mode: 0o600 });
  for (const role of ['source', 'target']) { await disk('before-create-' + role); const name = 'blobot-compare56-' + uuid + '-' + role; intended.add(name);
    await run(['create', '--name', name, '--cpus', '2', '--memory', '2g', kitDir, worktree], 'create-' + role);
    const found = (await boxes()).filter(b => b.name === name); assert.equal(found.length, 1); refs.set(role, found[0]); report.boxes.push({ role, ...found[0] }); }
  monitor = setInterval(() => { const m = process.memoryUsage(); report.memory.peakRss = Math.max(report.memory.peakRss, m.rss); report.memory.peakArrayBuffers = Math.max(report.memory.peakArrayBuffers, m.arrayBuffers);
    statfs(temp, { bigint: true }).then(s => { const n = s.bavail * s.bsize; minSpace = minSpace === undefined || n < minSpace ? n : minSpace; if (n < 2n * 1024n ** 3n) { spaceFailure = true; for (const c of channels) c.child.kill('SIGTERM'); } }).catch(() => { spaceFailure = true; }); }, 250);
  const target = connect(refs.get('target'), 'target', worktree);
  const relayHash = createHash('sha256');
  const source = connect(refs.get('source'), 'source', worktree, async data => { report.relay.bytes += data.length; report.relay.frames++; report.relay.maxFrame = Math.max(report.relay.maxFrame, data.length); relayHash.update(data); await target.data(data); });
  const ready = await Promise.all([source.wait('ready'), target.wait('ready')]); report.ready = ready;
  await source.send({ op: 'send' }); const end = await source.wait('bundle-end');
  assert.equal(end.bytes, report.relay.bytes); assert.equal(end.sha256, relayHash.digest('hex')); report.relay.sha256 = end.sha256;
  await target.send(end); report.comparison = (await target.wait('comparison')).result;
  await source.send({ op: 'release' }); await target.send({ op: 'release' });
  report.guestCleanup = await Promise.all([source.wait('finished'), target.wait('finished')]);
  report.guestExits = await Promise.all(channels.map(c => c.closed)); await Promise.all(channels.map(c => c.pump));
  assert(report.guestExits.every(e => e.code === 0)); assert(report.guestCleanup.every(e => e.cleanup.ownedFlagsCleared && e.cleanup.viewsRemoved));
  assert(report.comparison.completed && !report.comparison.rootRestorationInvoked); assert.equal(spaceFailure, undefined);
  report.minimumObservedSpace = minSpace?.toString(); await disk('after-comparison'); report.passed = true;
} catch (e) { report.passed = false; report.error = e.stack; process.exitCode = 1; }
finally {
  clearInterval(monitor);
  for (const c of channels) if (c.child.exitCode === null && c.child.signalCode === null) c.child.kill('SIGTERM');
  const kill = setTimeout(() => { for (const c of channels) if (c.child.exitCode === null && c.child.signalCode === null) c.child.kill('SIGKILL'); }, 2000);
  await Promise.allSettled(channels.map(c => c.closed)); clearTimeout(kill);
  const errors = [];
  for (const name of intended) try { const found = (await boxes()).filter(b => b.name === name); assert(found.length <= 1); if (found.length) { const expected = [...refs.values()].find(b => b.name === name); if (expected) assert.equal(found[0].id, expected.id); await run(['rm', '-f', name], 'remove-owned-box'); } } catch (e) { errors.push(e.message); }
  if (loadedOwned) try { const found = await matching(); assert(found.length <= 1); if (found.length) { assert.equal(found[0].id, imageId); await run(['template', 'rm', candidate], 'remove-owned-alias'); } } catch (e) { errors.push(e.message); }
  report.cleanup = { errors, remainingOwnedBoxes: (await boxes()).filter(b => intended.has(b.name)), remainingOwnedImages: loadedOwned ? await matching() : [] };
  await disk('after-cleanup'); await rm(temp, { recursive: true, force: true }); report.cleanup.tempRemoved = true;
  if (errors.length || report.cleanup.remainingOwnedBoxes.length || report.cleanup.remainingOwnedImages.length) { report.passed = false; process.exitCode = 1; }
  await writeFile(new URL('./56-base-selection-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, error: report.error, counts: report.comparison?.counts, selected: report.comparison?.selectedMembers, relay: report.relay, cleanup: report.cleanup }));
}
