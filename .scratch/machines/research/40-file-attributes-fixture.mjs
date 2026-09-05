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

if (process.env.BLOBOT_LIVE_SBX_ATTRIBUTES !== '1') throw new Error('Explicit opt-in required');
const [tarPath, candidate, expectedManifest] = process.argv.slice(2);
assert(tarPath?.startsWith('/')); assert(/^blobot-machine-probe:[a-z0-9-]+$/.test(candidate)); assert(/^sha256:[a-f0-9]{64}$/.test(expectedManifest));
const exec = promisify(execFile), env = sbxClientEnvironment(), uuid = randomUUID();
const snapshot = 'blobot-attributes40-fixture:' + uuid, [repository, tag] = candidate.split(':');
const temp = await mkdtemp('/private/tmp/blobot-attributes40-fixture-');
const syntheticMounts=['worktree','common-git','skills'].map(name=>join(temp,name));
for(const path of syntheticMounts){await mkdir(path);await writeFile(join(path,'marker'),'synthetic-'+uuid);}
const worker = await readFile(new URL('./40-file-attributes-worker.cjs', import.meta.url), 'utf8');
const report = { date: new Date().toISOString(), uuid, candidate, expectedManifest, scope: 'synthetic-only', commands: [], heldCommands: [], checks: {}, cleanup: {}, memory: { baseline: process.memoryUsage(), peakRss: 0, peakArrayBuffers: 0, maxRelayFrame: 0 } };
let concurrent;
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
  const name = 'blobot-attributes40-' + uuid + '-' + role, dir = join(temp, role);
  assert(!(await boxes()).some(b => b.name === name)); await mkdir(dir);
  const kit = { schemaVersion: '2', kind: 'sandbox', name: 'blobot-synthetic',
    sandbox: { image, entrypoint: ['/usr/bin/node'], command: { default: ['--version'] } },
    security: { privileged: true }, credentials: [], permissions: { network: { allow: [], deny: [] } },
    setup: { install: [{ user: '0', command: 'chown 1000:1000 /home/agent /workspace && chmod 0700 /home/agent /workspace' }] },
    volumes: [{ path: '/home/agent', size: String(8 * 1024 ** 3), mode: '0700' },
      { path: '/workspace', size: String(512 * 1024 ** 2), mode: '0700' },
      { path: '/var/lib/docker', size: String(20 * 1024 ** 3), mode: '0700' }] };
  await writeFile(join(dir, 'spec.yaml'), JSON.stringify(kit)); intended.add(name);
  await run(['create', '--name', name, '--cpus', String(cpus), '--memory', memory, dir, syntheticMounts[0], syntheticMounts[1], syntheticMounts[2]+':ro'], 'create-' + role);
  const found = (await boxes()).filter(b => b.name === name); assert.equal(found.length, 1); const ref = { name, id: found[0].id }; refs.set(name, ref);
  (report.boxes ??= []).push({ ...ref, cpus, memory, kit }); return ref;
};
const write = async (stream, buffer) => { if (!stream.write(buffer)) await once(stream, 'drain'); };
const frameWrite = async (stream, type, payload) => { const body = type === 1 ? Buffer.from(JSON.stringify(payload)) : payload;
  assert(body.length <= 32 * 1024 ** 2); const header = Buffer.alloc(5); header[0] = type; header.writeUInt32BE(body.length, 1); await write(stream, Buffer.concat([header, body])); };
async function* frames(input) {
  let pending = Buffer.alloc(0);
  for await (const chunk of input) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= 5) { const type = pending[0], length = pending.readUInt32BE(1); assert([1, 2].includes(type)); assert(length <= 32 * 1024 ** 2);
      if (pending.length < 5 + length) break; const payload = pending.subarray(5, 5 + length); pending = pending.subarray(5 + length); yield { type, payload }; }
  }
  assert.equal(pending.length, 0);
}
const connect = async (ref, role, phase) => {
  await verify(ref);
  const child = spawn('sbx', ['exec', '-i', '-u', '0', ref.name, '/usr/bin/node', '-e', worker, JSON.stringify({ uuid, role, syntheticMounts })], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', sequence = 1, stopped = false;
  const pending = new Map(); let dataSink = null;
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-8192); });
  const errorAll = error => { for (const p of pending.values()) p.reject(error); pending.clear(); };
  const exited = new Promise(resolve => { child.on('error', e => errorAll(e)); child.on('close', code => { stopped = true; errorAll(new Error(`Held exec ${phase} exited ${code}: ${stderr}`)); resolve({ code, stderr }); }); });
  const waitResponse = (id, timeout = 180_000) => new Promise((resolve, reject) => {
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

try {
  assert.equal((await json(['daemon', 'status', '--json'])).status, 'running'); report.version = await json(['version', '--json']);
  assert.equal(report.version.client.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a'); assert.equal(report.version.server.revision, report.version.client.revision);
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  assert.equal((await boxes()).length, 0, 'Exclusive sbx use required'); assert.equal((await matching('blobot-attributes40-fixture', uuid)).length, 0);
  await requireDiskSpace('candidate-load-and-source-create');
  let loaded = await matching(repository, tag);
  if (!loaded.length) { loadedOwned = true; await run(['template', 'load', tarPath], 'load-candidate', 120_000); loaded = await matching(repository, tag); }
  assert.equal(loaded.length, 1); loadedId = loaded[0].id; report.loaded = loaded[0];
  assert(expectedManifest.slice(7).startsWith(loadedId.replace(/^sha256:/, '')));
  const source = await create('source', candidate, 2, '2g');
  const channel = await connect(source, 'source', 'namespace');
  report.inventory = await channel.request('inventory');
  report.host={platform:process.platform,arch:process.arch}; assert.equal(process.platform,'darwin');
  report.scope=await channel.request('originalScope36');
  report.quiescence=await channel.request('quiesce'); report.frozen=await channel.request('freeze36');
  report.attributes=await channel.request('attributes40');
  report.thaw=await channel.request('thaw36');await channel.close();
  report.passed = true;
} catch (e) { report.passed = false; report.error = e.stack; process.exitCode = 1; }
finally {
  concurrent?.kill('SIGKILL');
  for (const channel of channels) { channel.child.kill(); channel.child.stdin.destroy(); }
  const killTimers = [...channels].map(channel => setTimeout(() => channel.child.kill('SIGKILL'), 2000));
  await Promise.allSettled([...channels].map(c => c.exited));
  for (const timer of killTimers) clearTimeout(timer);
  const errors = [];
  for (const name of intended) try { const found = (await boxes()).filter(b => b.name === name); if (!found.length) continue;
    assert.equal(found.length, 1); if (refs.has(name)) assert.equal(found[0].id, refs.get(name).id); await run(['rm', '-f', name], 'remove-owned-box');
  } catch (e) { errors.push({ name, error: e.message }); }
  for (const entry of [{ owned: snapshotIntended, repo: 'blobot-attributes40-fixture', tag: uuid, id: snapshotId, ref: snapshot }, { owned: loadedOwned, repo: repository, tag, id: loadedId, ref: candidate }]) {
    if (!entry.owned) continue;
    try { const found = await matching(entry.repo, entry.tag); if (!found.length) continue; assert.equal(found.length, 1); if (entry.id) assert.equal(found[0].id, entry.id); await run(['template', 'rm', entry.ref], 'remove-owned-template'); }
    catch (e) { errors.push({ ref: entry.ref, error: e.message }); }
  }
  report.cleanup = { errors, remainingBoxes: (await boxes()).filter(b => intended.has(b.name)), remainingSnapshot: await matching('blobot-attributes40-fixture', uuid), remainingOwnedCandidate: loadedOwned ? await matching(repository, tag) : [] };
  if (errors.length || report.cleanup.remainingBoxes.length || report.cleanup.remainingSnapshot.length || report.cleanup.remainingOwnedCandidate.length) process.exitCode = 1;
  await rm(temp, { recursive: true, force: true }); clearInterval(memory); report.memory.final = process.memoryUsage();
  await writeFile(new URL('./40-file-attributes-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, heldExecCopyPassed: report.heldExecCopyPassed, gateFailure: report.gateFailure,
    error: report.error, checks: report.checks, snapshotRootfsExact: report.snapshotRootfsExact, relay: report.relay, memory: report.memory, cleanup: report.cleanup }));
}
