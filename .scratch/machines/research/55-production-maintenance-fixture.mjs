// Explicit opt-in, one disposable UUID sandbox, local archive only. No pulls/provider/login.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, statfs, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';

assert.equal(process.env.BLOBOT_LIVE_SBX_MAINTENANCE55, '1', 'Explicit opt-in required');
assert.equal(process.platform, 'darwin');
const candidate = 'blobot-machine-probe:explicit-docker-20260905';
const manifest = 'sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c';
const archive = '/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar';
const uuid = randomUUID(), name = 'blobot-maintenance55-' + uuid;
const temp = await mkdtemp('/private/tmp/blobot-maintenance55-');
const env = sbxClientEnvironment(), exec = promisify(execFile);
const worker = await readFile(new URL('./55-production-maintenance-worker.cjs', import.meta.url), 'utf8');
const { prepareSbxStateMaintenance } = await import('../../../packages/core/dist/machines/sbx/state-maintenance.js');
const prepare = prepareSbxStateMaintenance.toString();
const { createStateArchiveVerifier } = await import('../../../packages/core/dist/machines/sbx/state-archive.js');
const { createSbxArchiveIndex } = await import('../../../packages/core/dist/machines/sbx/state-archive-index.js');
const { readSbxStateTree } = await import('../../../packages/core/dist/machines/sbx/state-tree.js');
const sources = JSON.stringify({ verify: createStateArchiveVerifier.toString(), index: createSbxArchiveIndex.toString(), read: readSbxStateTree.toString() });
const report = { date: new Date().toISOString(), uuid, name, candidate, manifest, scope: 'synthetic disposable guest only', commands: [], diskChecks: [], cleanup: {},
  scripts: { workerSha256: createHash('sha256').update(worker).digest('hex'), prepareSha256: createHash('sha256').update(prepare).digest('hex') } };
let ownedImage = false, imageId, boxId, intendedBox = false, child, monitor, spaceFailure;
const disk = async label => { const s = await statfs(temp, { bigint: true }), available = s.bavail * s.bsize;
  report.diskChecks.push({ label, availableBytes: String(available) }); assert(available >= 2n * 1024n ** 3n, 'Less than 2 GiB available'); return available; };
const run = async (args, label, timeout = 60_000) => {
  const start = performance.now();
  try { const r = await exec('sbx', args, { env, timeout, maxBuffer: 4 * 1024 ** 2 }); report.commands.push({ label, code: 0, ms: performance.now() - start }); return r.stdout; }
  catch (e) { report.commands.push({ label, code: e.code, ms: performance.now() - start }); throw new Error(label + ': ' + String(e.stderr ?? e.message).slice(-4000)); }
};
const json = async (args, label) => JSON.parse(await run(args, label));
const boxes = async () => (await json(['ls', '--json'], 'list-boxes')).sandboxes;
const images = async () => (await json(['template', 'ls', '--json'], 'list-images')).images;
const matchingImage = async () => (await images()).filter(i => i.tag === candidate.split(':')[1] && (i.repository === candidate.split(':')[0] || i.repository.endsWith('/' + candidate.split(':')[0])));
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
  await disk('before-create');
  const kitDir = join(temp, 'kit'), worktree = join(temp, 'synthetic-worktree'); await mkdir(kitDir); await mkdir(worktree);
  await writeFile(join(worktree, 'marker'), 'synthetic-' + uuid, { mode: 0o600 });
  const kit = { schemaVersion: '2', kind: 'sandbox', name: 'blobot-synthetic-maintenance55',
    sandbox: { image: candidate, entrypoint: ['/usr/bin/node'], command: { default: ['--version'] } },
    security: { privileged: true }, credentials: [], permissions: { network: { allow: [], deny: [] } },
    volumes: [{ path: '/home/agent', size: String(8 * 1024 ** 3), mode: '0700' },
      { path: '/var/lib/docker', size: String(20 * 1024 ** 3), mode: '0700' }] };
  report.kit = kit; await writeFile(join(kitDir, 'spec.yaml'), JSON.stringify(kit), { mode: 0o600 });
  intendedBox = true; await run(['create', '--name', name, '--cpus', '2', '--memory', '2g', kitDir, worktree], 'create-owned-box', 90_000);
  const found = (await boxes()).filter(b => b.name === name); assert.equal(found.length, 1); boxId = found[0].id; report.box = found[0];
  await disk('before-probe');
  let minSpace;
  monitor = setInterval(() => { statfs(temp, { bigint: true }).then(s => { const n = s.bavail * s.bsize; minSpace = minSpace === undefined || n < minSpace ? n : minSpace; if (n < 2n * 1024n ** 3n) { spaceFailure = true; child?.kill('SIGTERM'); } }).catch(() => { spaceFailure = true; child?.kill('SIGTERM'); }); }, 250);
  report.guests = [];
  for (const role of ['source', 'target']) {
    const config = { token: randomUUID(), role, worktree };
    child = spawn('sbx', ['exec', '-u', '0', name, '/usr/bin/unshare', '--mount', '--propagation', 'private',
      '/usr/bin/node', '-e', worker, JSON.stringify(config), prepare, sources], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; if (stdout.length > 1024 ** 2) child.kill(); });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-8000); });
    const timer = setTimeout(() => child.kill('SIGTERM'), 180_000);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    clearTimeout(timer);
    const guest = JSON.parse(stdout || '{}');
    report.guests.push({ role, code, stderr, guest });
    assert.equal(code, 0); assert(guest.completed); assert.equal(spaceFailure, undefined);
    assert(Object.values(guest.checks).every(Boolean));
    await run(['stop', name], 'stop-after-' + role, 30_000);
    await disk('after-' + role);
  }
  clearInterval(monitor); monitor = undefined;
  report.minimumObservedSpace = minSpace?.toString();
  await disk('after-probe'); report.passed = true;
} catch (e) { report.passed = false; report.error = e.stack; process.exitCode = 1; }
finally {
  clearInterval(monitor);
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  const errors = [];
  if (intendedBox) try { const found = (await boxes()).filter(b => b.name === name); assert(found.length <= 1); if (found.length) { if (boxId) assert.equal(found[0].id, boxId); await run(['rm', '-f', name], 'remove-owned-box', 90_000); } } catch (e) { errors.push(e.message); }
  if (ownedImage) try { const found = await matchingImage(); assert(found.length <= 1); if (found.length) { if (imageId) assert.equal(found[0].id, imageId); await run(['template', 'rm', candidate], 'remove-owned-local-alias'); } } catch (e) { errors.push(e.message); }
  report.cleanup = { errors, remainingOwnedBoxes: (await boxes()).filter(b => b.name === name), remainingOwnedImages: ownedImage ? await matchingImage() : [] };
  await disk('after-cleanup'); await rm(temp, { recursive: true, force: true }); report.cleanup.tempRemoved = true;
  if (errors.length || report.cleanup.remainingOwnedBoxes.length || report.cleanup.remainingOwnedImages.length) { report.passed = false; process.exitCode = 1; }
  await writeFile(new URL('./55-production-maintenance-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, error: report.error, guests: report.guests, cleanup: report.cleanup }));
}
