// Opt-in synthetic preservation probe. All private archive bytes remain in pipes/memory.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';

if (process.env.BLOBOT_LIVE_SBX_HELD_EXEC !== '1') throw new Error('Explicit opt-in required');
const [tarPath, candidate, expectedManifest] = process.argv.slice(2);
assert(tarPath?.startsWith('/')); assert(/^blobot-machine-probe:[a-z0-9-]+$/.test(candidate)); assert(/^sha256:[a-f0-9]{64}$/.test(expectedManifest));
const exec = promisify(execFile), env = sbxClientEnvironment(), uuid = randomUUID();
const snapshot = 'blobot-held-fixture:' + uuid, [repository, tag] = candidate.split(':');
const temp = await mkdtemp(join(tmpdir(), 'blobot-held-fixture-'));
const worker = await readFile(new URL('./30-held-exec-worker.cjs', import.meta.url), 'utf8');
const report = { date: new Date().toISOString(), uuid, candidate, expectedManifest, scope: 'synthetic-only', commands: [], heldCommands: [], checks: {}, cleanup: {}, memory: { baseline: process.memoryUsage(), peakRss: 0, peakArrayBuffers: 0, maxRelayFrame: 0 } };
const intended = new Set(), refs = new Map(), channels = new Set();
let loadedOwned = false, loadedId, snapshotIntended = false, snapshotId;
const memory = setInterval(() => { const m = process.memoryUsage(); report.memory.peakRss = Math.max(report.memory.peakRss, m.rss); report.memory.peakArrayBuffers = Math.max(report.memory.peakArrayBuffers, m.arrayBuffers); }, 50);
const requireDiskSpace = async label => { const s = await statfs(temp, { bigint: true }); const available = s.bavail * s.bsize;
  (report.diskChecks ??= []).push({ label, availableBytes: String(available), minimumBytes: String(2 * 1024 ** 3) });
  assert(available >= BigInt(2 * 1024 ** 3), 'Less than 2 GiB host disk available before ' + label); };
const run = async (args, label, timeout = 60_000) => {
  const start = performance.now();
  try { const out = await exec('sbx', args, { env, timeout, maxBuffer: 8 * 1024 ** 2 }); if (label) report.commands.push({ label, ms: performance.now() - start, code: 0 }); return out.stdout; }
  catch (e) { report.commands.push({ label: label ?? args.slice(0, 2).join(' '), ms: performance.now() - start, code: e.code }); throw new Error(`Command ${label ?? args.slice(0, 2).join(' ')} (${e.code}): ${String(e.stderr ?? '').slice(-2000)}`); }
};
const json = async args => JSON.parse(await run(args));
const boxes = async () => (await json(['ls', '--json'])).sandboxes;
const images = async () => (await json(['template', 'ls', '--json'])).images;
const matching = async (repo, imageTag) => (await images()).filter(i => i.tag === imageTag && (i.repository === repo || i.repository.endsWith('/' + repo)));
const verify = async ref => { const found = (await boxes()).filter(b => b.name === ref.name); assert.equal(found.length, 1); assert.equal(found[0].id, ref.id); return found[0]; };
const create = async (role, image, cpus, memory) => {
  const name = 'blobot-held-' + uuid + '-' + role, dir = join(temp, role);
  assert(!(await boxes()).some(b => b.name === name)); await mkdir(dir);
  const kit = { schemaVersion: '2', kind: 'sandbox', name: 'blobot-synthetic',
    sandbox: { image, entrypoint: ['/usr/bin/node'], command: { default: ['--version'] } },
    security: { privileged: true }, credentials: [], permissions: { network: { allow: [], deny: [] } },
    setup: { install: [{ user: '0', command: 'chown 1000:1000 /home/agent /workspace && chmod 0700 /home/agent /workspace' }] },
    volumes: [{ path: '/home/agent', size: String(8 * 1024 ** 3), mode: '0700' },
      { path: '/workspace', size: String(512 * 1024 ** 2), mode: '0700' },
      { path: '/var/lib/docker', size: String(20 * 1024 ** 3), mode: '0700' }] };
  await writeFile(join(dir, 'spec.yaml'), JSON.stringify(kit)); intended.add(name);
  await run(['create', '--name', name, '--cpus', String(cpus), '--memory', memory, dir], 'create-' + role);
  const found = (await boxes()).filter(b => b.name === name); assert.equal(found.length, 1); const ref = { name, id: found[0].id }; refs.set(name, ref);
  (report.boxes ??= []).push({ ...ref, cpus, memory, kit }); return ref;
};
const write = async (stream, buffer) => { if (!stream.write(buffer)) await once(stream, 'drain'); };
const frameWrite = async (stream, type, payload) => { const body = type === 1 ? Buffer.from(JSON.stringify(payload)) : payload;
  assert(body.length <= 1024 ** 2); const header = Buffer.alloc(5); header[0] = type; header.writeUInt32BE(body.length, 1); await write(stream, Buffer.concat([header, body])); };
async function* frames(input) {
  let pending = Buffer.alloc(0);
  for await (const chunk of input) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= 5) { const type = pending[0], length = pending.readUInt32BE(1); assert([1, 2].includes(type)); assert(length <= 1024 ** 2);
      if (pending.length < 5 + length) break; const payload = pending.subarray(5, 5 + length); pending = pending.subarray(5 + length); yield { type, payload }; }
  }
  assert.equal(pending.length, 0);
}
const connect = async (ref, role, phase) => {
  await verify(ref);
  const child = spawn('sbx', ['exec', '-i', '-u', '0', ref.name, '/usr/bin/node', '-e', worker, JSON.stringify({ uuid, role })], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', sequence = 1, stopped = false;
  const pending = new Map(); let dataSink = null;
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-8192); });
  const errorAll = error => { for (const p of pending.values()) p.reject(error); pending.clear(); };
  const exited = new Promise(resolve => { child.on('error', e => errorAll(e)); child.on('close', code => { stopped = true; errorAll(new Error(`Held exec ${phase} exited ${code}: ${stderr}`)); resolve({ code, stderr }); }); });
  const waitResponse = (id, timeout = 60_000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Held command timed out: ' + phase + '/' + id)); child.kill(); }, timeout);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
  });
  const ready = waitResponse(0);
  const pump = (async () => {
    for await (const frame of frames(child.stdout)) {
      if (frame.type === 2) { assert(dataSink, 'Unexpected archive bytes'); assert(frame.payload.length <= 64 * 1024); report.memory.maxRelayFrame = Math.max(report.memory.maxRelayFrame, frame.payload.length); await dataSink(frame.payload); continue; }
      const message = JSON.parse(frame.payload), p = pending.get(message.id); assert(p, 'Unexpected held response'); pending.delete(message.id);
      if (message.error) p.reject(new Error(message.error)); else p.resolve(message.result);
    }
  })().catch(e => { errorAll(e); child.kill(); });
  const channel = {
    phase, child, exited, pump,
    request: async op => {
      assert(!stopped, 'Held exec already stopped'); const id = sequence++, promise = waitResponse(id); promise.catch(() => {}); const start = performance.now();
      try { await frameWrite(child.stdin, 1, { id, op }); const result = await promise; report.heldCommands.push({ phase, op, ms: performance.now() - start }); return result; }
      catch (e) { promise.catch(() => {}); throw e; }
    },
    setSink: fn => { dataSink = fn; },
    data: payload => frameWrite(child.stdin, 2, payload),
    close: async () => { if (!stopped) { await channel.request('close'); child.stdin.end(); } const result = await exited; await pump; assert.equal(result.code, 0, result.stderr); channels.delete(channel); },
  };
  channels.add(channel); report[phase + 'Ready'] = await ready; return channel;
};
const stop = async ref => { await verify(ref); await run(['stop', ref.name], 'stop-' + ref.name.split('-').at(-1)); assert.equal((await verify(ref)).status, 'stopped'); };
const sameDigest = (a, b) => { assert.equal(a.sha256, b.sha256); assert.equal(a.bytes, b.bytes); };
const sameState = (a, b) => assert.deepEqual(a, b);
const compareSavedPackage = (actual, expected) => {
  // RC5 template save has been observed to truncate rootfs mtime fractions. Keep
  // that failed fidelity gate explicit while allowing the independent volume
  // copy experiment to run. Every other measured package field remains exact.
  const normalized = structuredClone(actual), mtimeDifferences = [];
  for (const [path, file] of Object.entries(expected.files)) {
    const observed = actual.files[path]; assert(observed);
    assert.equal(Math.floor(observed.mtimeMs / 1000), Math.floor(file.mtimeMs / 1000));
    if (observed.mtimeMs !== file.mtimeMs) mtimeDifferences.push({ path, before: file.mtimeMs, after: observed.mtimeMs });
    normalized.files[path].mtimeMs = file.mtimeMs;
  }
  assert.deepEqual(normalized, expected);
  return { contentModeOwnerPackageDbExact: true, mtimeExact: mtimeDifferences.length === 0, mtimeDifferences };
};
try {
  assert.equal((await json(['daemon', 'status', '--json'])).status, 'running'); report.version = await json(['version', '--json']);
  assert.equal(report.version.client.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a'); assert.equal(report.version.server.revision, report.version.client.revision);
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  assert.equal((await boxes()).length, 0, 'Exclusive sbx use required'); assert.equal((await matching('blobot-held-fixture', uuid)).length, 0);
  await requireDiskSpace('candidate-load-and-source-create');
  let loaded = await matching(repository, tag);
  if (!loaded.length) { loadedOwned = true; await run(['template', 'load', tarPath], 'load-candidate', 120_000); loaded = await matching(repository, tag); }
  assert.equal(loaded.length, 1); loadedId = loaded[0].id; report.loaded = loaded[0];
  assert(expectedManifest.slice(7).startsWith(loadedId.replace(/^sha256:/, '')));
  const source = await create('source', candidate, 2, '2g');
  const seedWorker = await connect(source, 'source', 'seed');
  report.sourceInitial = await seedWorker.request('inventory'); report.before = await seedWorker.request('seed');
  report.seedQuiescence = await seedWorker.request('quiesce'); await seedWorker.close();
  await stop(source); report.sourceBeforeSave = await verify(source); snapshotIntended = true;
  await run(['template', 'save', source.name, snapshot], 'save-stopped-source-rootfs', 120_000);
  const saved = await matching('blobot-held-fixture', uuid); assert.equal(saved.length, 1); snapshotId = saved[0].id; report.saved = saved[0];
  report.sourceAfterSave = await verify(source); assert.equal(report.sourceAfterSave.status, 'stopped'); report.checks.saveLeavesStoppedSourceStopped = true;

  // Only these two exec sessions may touch the guests throughout the copy interval.
  const sourceWorker = await connect(source, 'source', 'sourceMaintenance');
  report.sourceReopened = await sourceWorker.request('inventory');
  report.sourceStateBeforeCopy = await sourceWorker.request('state'); sameState(report.sourceStateBeforeCopy, report.before);
  report.sourceQuiescence = await sourceWorker.request('quiesce');
  report.digestBefore = await sourceWorker.request('digest');
  await requireDiskSpace('second-VM-create');
  const target = await create('target', snapshot, 3, '3g');
  const targetWorker = await connect(target, 'target', 'targetMaintenance');
  report.targetInitial = await targetWorker.request('inventory'); report.targetQuiescence = await targetWorker.request('quiesce');
  assert.equal(report.sourceReopened.resources.cpuCount, 2); assert.equal(report.targetInitial.resources.cpuCount, 3);
  assert(report.sourceReopened.resources.memTotalKiB > 1.8 * 1024 ** 2 && report.sourceReopened.resources.memTotalKiB < 2 * 1024 ** 2);
  assert(report.targetInitial.resources.memTotalKiB > 2.8 * 1024 ** 2 && report.targetInitial.resources.memTotalKiB < 3 * 1024 ** 2);
  report.targetBeforeCopy = await targetWorker.request('quiet');
  report.rootfsPackageComparison = compareSavedPackage(report.targetBeforeCopy.package, report.before.package);
  assert.equal(report.targetBeforeCopy.home, null);
  await targetWorker.request('restoreStart');
  const relayHash = createHash('sha256'); let relayBytes = 0; const start = performance.now();
  sourceWorker.setSink(async payload => { relayBytes += payload.length; assert(relayBytes <= 128 * 1024 ** 2); relayHash.update(payload); await targetWorker.data(payload); });
  report.sourceArchive = await sourceWorker.request('archive'); sourceWorker.setSink(null);
  report.targetRestored = await targetWorker.request('restoreEnd');
  report.relay = { bytes: relayBytes, sha256: relayHash.digest('hex'), ms: performance.now() - start };
  report.digestSourceAfter = await sourceWorker.request('digest'); report.digestTarget = await targetWorker.request('digest');
  for (const measured of [report.sourceArchive, report.targetRestored, report.relay, report.digestSourceAfter, report.digestTarget]) sameDigest(measured, report.digestBefore);
  report.sourceQuietAfterCopy = await sourceWorker.request('quiet'); report.targetQuietAfterCopy = await targetWorker.request('quiet');
  assert.deepEqual(report.sourceQuietAfterCopy.boot, report.sourceQuiescence.boot); assert.equal(report.sourceQuietAfterCopy.workerPid, report.sourceQuiescence.workerPid);
  assert.deepEqual(report.targetQuietAfterCopy.boot, report.targetQuiescence.boot); assert.equal(report.targetQuietAfterCopy.workerPid, report.targetQuiescence.workerPid);
  assert.deepEqual(report.targetQuietAfterCopy.package, report.targetBeforeCopy.package); assert.deepEqual(report.targetQuietAfterCopy.home, report.before.home);
  report.targetResumed = await targetWorker.request('resume'); report.after = await targetWorker.request('state');
  sameState(report.after, { ...report.before, package: report.targetBeforeCopy.package });
  report.targetRun = await targetWorker.request('runRestored'); report.targetMutation = await targetWorker.request('mutateTarget');
  report.originalDigestAfterTargetMutation = await sourceWorker.request('digest'); sameDigest(report.originalDigestAfterTargetMutation, report.digestBefore);
  report.originalQuietAfterTargetMutation = await sourceWorker.request('quiet'); assert.deepEqual(report.originalQuietAfterTargetMutation.home, report.before.home); assert.deepEqual(report.originalQuietAfterTargetMutation.package, report.before.package);
  report.originalResumed = await sourceWorker.request('resume'); report.originalFinalState = await sourceWorker.request('state'); sameState(report.originalFinalState, report.before);
  await targetWorker.close(); await sourceWorker.close();
  report.checks = { ...report.checks, source2Cpu2GiBTarget3Cpu3GiB: true, privateVolumesExact: true, realContainerdRootMeasured: true,
    rootfsPackageAndConffileContentModeOwnerPreserved: true, rootfsMtimeExact: report.rootfsPackageComparison.mtimeExact,
    opaquePrivateArchiveExactBeforeAfter: true, sameHeldExecDuringCopy: true,
    homeUidGidModesHardlinkSymlinkXattrAndSparsePreserved: true, DockerImageStoppedContainerNamedVolumePreserved: true,
    restoredContainerRuns: true, originalIndependentAndRecoverable: true };
  report.heldExecCopyPassed = true;
  report.passed = report.rootfsPackageComparison.mtimeExact;
  if (!report.passed) { report.gateFailure = 'Rootfs snapshot loses subsecond mtime precision'; process.exitCode = 1; }
} catch (e) { report.passed = false; report.error = e.stack; process.exitCode = 1; }
finally {
  for (const channel of channels) { channel.child.kill(); channel.child.stdin.destroy(); }
  const killTimers = [...channels].map(channel => setTimeout(() => channel.child.kill('SIGKILL'), 2000));
  await Promise.allSettled([...channels].map(c => c.exited));
  for (const timer of killTimers) clearTimeout(timer);
  const errors = [];
  for (const name of intended) try { const found = (await boxes()).filter(b => b.name === name); if (!found.length) continue;
    assert.equal(found.length, 1); if (refs.has(name)) assert.equal(found[0].id, refs.get(name).id); await run(['rm', '-f', name], 'remove-owned-box');
  } catch (e) { errors.push({ name, error: e.message }); }
  for (const entry of [{ owned: snapshotIntended, repo: 'blobot-held-fixture', tag: uuid, id: snapshotId, ref: snapshot }, { owned: loadedOwned, repo: repository, tag, id: loadedId, ref: candidate }]) {
    if (!entry.owned) continue;
    try { const found = await matching(entry.repo, entry.tag); if (!found.length) continue; assert.equal(found.length, 1); if (entry.id) assert.equal(found[0].id, entry.id); await run(['template', 'rm', entry.ref], 'remove-owned-template'); }
    catch (e) { errors.push({ ref: entry.ref, error: e.message }); }
  }
  report.cleanup = { errors, remainingBoxes: (await boxes()).filter(b => intended.has(b.name)), remainingSnapshot: await matching('blobot-held-fixture', uuid), remainingOwnedCandidate: loadedOwned ? await matching(repository, tag) : [] };
  if (errors.length || report.cleanup.remainingBoxes.length || report.cleanup.remainingSnapshot.length || report.cleanup.remainingOwnedCandidate.length) process.exitCode = 1;
  await rm(temp, { recursive: true, force: true }); clearInterval(memory); report.memory.final = process.memoryUsage();
  await writeFile(new URL('./30-held-exec-fixture-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, heldExecCopyPassed: report.heldExecCopyPassed, gateFailure: report.gateFailure,
    error: report.error, checks: report.checks, rootfsPackageComparison: report.rootfsPackageComparison, relay: report.relay, memory: report.memory, cleanup: report.cleanup }));
}
