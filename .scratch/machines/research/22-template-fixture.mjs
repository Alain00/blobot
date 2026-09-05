// Synthetic local snapshot coverage, independent of the proposed release-image base.
// No provider, real host mount, credentials, tar export or shared daemon mutation.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { sbxKit } from '../../../packages/core/dist/machines/sbx/kit.js';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';

if (process.env.BLOBOT_LIVE_SBX_TEMPLATE !== '1') throw new Error('Explicit opt-in required');
const exec = promisify(execFile), env = sbxClientEnvironment();
const suffix = randomUUID(), prefix = `blobot-snapshot-${suffix}`;
const imageTag = `blobot-snapshot-fixture:${suffix}`;
const report = { date: new Date().toISOString(), scope: 'synthetic-rootfs-and-volume-files-only', commands: [], checks: {}, cleanup: {} };
const refs = new Map(), intended = new Set();
const root = await mkdtemp(join(tmpdir(), 'blobot-template-fixture-'));
let imageIntended = false, imageId;
const run = async (args, label, timeout = 60_000) => {
  const start = performance.now();
  try {
    const result = await exec('sbx', args, { env, timeout, maxBuffer: 2 * 1024 ** 2 });
    if (label) report.commands.push({ label, ms: performance.now() - start, code: 0 });
    return result.stdout;
  } catch (error) {
    report.commands.push({ label: label ?? args.slice(0, 2).join(' '), ms: performance.now() - start, code: error.code, killed: error.killed });
    throw new Error(`Fixture command failed: ${label ?? args.slice(0, 2).join(' ')} (${error.code}): ${(error.stderr ?? '').slice(-1500)}`);
  }
};
const json = async args => JSON.parse(await run(args));
const boxes = async () => (await json(['ls', '--json'])).sandboxes;
const images = async () => (await json(['template', 'ls', '--json'])).images;
const fixtureImages = async () => (await images()).filter(x => x.tag === suffix && /(?:^|\/)blobot-snapshot-fixture$/.test(x.repository));
const verify = async ref => {
  const found = (await boxes()).filter(x => x.name === ref.name);
  assert.equal(found.length, 1); assert.equal(found[0].id, ref.id);
  return found[0];
};
const guest = async (ref, script, label) => {
  await verify(ref);
  return JSON.parse(await run(['exec', '-u', '0', ref.name, '/usr/bin/node', '-e', script], label));
};
const paths = ['/usr/local/share/blobot-snapshot-fixture', '/opt/blobot-snapshot-fixture',
  '/etc/blobot-snapshot-fixture', '/root/blobot-snapshot-fixture',
  '/home/agent/blobot-snapshot-fixture', '/workspace/blobot-snapshot-fixture',
  '/var/lib/docker/blobot-snapshot-fixture', '/var/lib/containerd/blobot-snapshot-fixture'];
const observeSource = `const fs=require('node:fs'),os=require('node:os'),cp=require('node:child_process');
const paths=${JSON.stringify(paths)};
const read=p=>{try{const s=fs.statSync(p);return {text:fs.readFileSync(p,'utf8'),mode:s.mode&511,uid:s.uid,gid:s.gid}}catch(e){if(e.code==='ENOENT')return null;throw e}};
let docker;try{docker=JSON.parse(cp.execFileSync('docker',['info','--format','{{json .}}'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}));docker={running:true,root:docker.DockerRootDir,driver:docker.Driver,version:docker.ServerVersion}}catch{docker={running:false}}
console.log(JSON.stringify({files:Object.fromEntries(paths.map(p=>[p,read(p)])),cpus:os.cpus().length,memTotal:fs.readFileSync('/proc/meminfo','utf8').split('\\n').find(l=>l.startsWith('MemTotal:')),docker,
mounts:fs.readFileSync('/proc/self/mountinfo','utf8').split('\\n').filter(l=>['/home/agent','/workspace','/var/lib/docker','/var/lib/containerd'].includes(l.split(' ')[4]))}));`;
const create = async (nameSuffix, image, cpus, memory) => {
  const name = `${prefix}-${nameSuffix}`, dir = join(root, nameSuffix);
  assert(!(await boxes()).some(x => x.name === name));
  await mkdir(dir);
  const kit = sbxKit({ image, guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 });
  // Deliberately no daemon startup changes: these are mount sentinels, not a Docker restore test.
  await writeFile(join(dir, 'spec.yaml'), JSON.stringify({ ...kit, volumes: [...kit.volumes,
    { path: '/var/lib/docker', size: '512m', mode: '0700' },
    { path: '/var/lib/containerd', size: '512m', mode: '0700' }] }));
  intended.add(name);
  await run(['create', '--name', name, '--cpus', String(cpus), '--memory', memory, dir], `create-${nameSuffix}`);
  const found = (await boxes()).filter(x => x.name === name);
  assert.equal(found.length, 1);
  const ref = { name, id: found[0].id }; refs.set(name, ref);
  return ref;
};
const stop = async ref => {
  await verify(ref); await run(['stop', ref.name], 'stop');
  assert.equal((await verify(ref)).status, 'stopped');
};
try {
  assert.equal((await json(['daemon', 'status', '--json'])).status, 'running');
  report.version = await json(['version', '--json']);
  assert.equal(report.version.client.version, 'v0.42.0-rc5');
  assert.equal(report.version.server.version, report.version.client.version);
  assert.equal(report.version.client.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a');
  assert.equal(report.version.server.revision, report.version.client.revision);
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  assert.equal((await boxes()).length, 0);
  report.base = (await images()).find(x => x.repository === 'docker.io/docker/sandbox-templates' && x.tag === 'shell-docker');
  assert(report.base, 'Cached shell required; no download');
  assert.equal((await fixtureImages()).length, 0);
  const original = await create('original', 'docker/sandbox-templates:shell-docker', 2, '2g');
  await guest(original, `const fs=require('node:fs'),path=require('node:path');for(const p of ${JSON.stringify(paths)}){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'synthetic:${suffix}:'+p,{mode:0o640});}fs.chownSync('/home/agent/blobot-snapshot-fixture',1000,1000);console.log('{}')`, 'seed');
  report.original = await guest(original, observeSource, 'observe-original');
  await stop(original);
  imageIntended = true;
  await run(['template', 'save', original.name, imageTag], 'snapshot-local-store', 120_000);
  const saved = await fixtureImages(); assert.equal(saved.length, 1);
  imageId = saved[0].id; report.snapshot = saved[0];
  const restored = await create('restored', imageTag, 3, '3g');
  report.restored = await guest(restored, observeSource, 'observe-restored');
  const files = report.original.files;
  for (const p of paths.slice(0, 4)) assert.deepEqual(report.restored.files[p], files[p], `Rootfs sentinel ${p}`);
  assert.equal(report.restored.cpus, 3);
  await stop(restored);
  report.reopened = await guest(restored, observeSource, 'observe-reopened');
  assert.deepEqual(report.reopened.files, report.restored.files);
  await guest(restored, `require('node:fs').writeFileSync(${JSON.stringify(paths[0])},'replacement-write');console.log('{}')`, 'replacement-write');
  report.originalAfter = await guest(original, observeSource, 'verify-original-unchanged');
  assert.deepEqual(report.originalAfter.files, report.original.files);
  report.checks = { rootfsSentinelsPreserved: true, samePathPrivateVolumeSentinels: Object.fromEntries(paths.slice(4).map(p => [p, report.restored.files[p] !== null])),
    replacementCpuLimit: report.restored.cpus, restoredStopStartPreservesObservedFiles: true, originalUnchanged: true };
  report.passed = true;
} catch (error) {
  report.passed = false; report.error = error.message; process.exitCode = 1;
} finally {
  const errors = [];
  for (const name of intended) {
    try {
      const found = (await boxes()).filter(x => x.name === name);
      if (!found.length) continue;
      assert.equal(found.length, 1);
      if (refs.has(name)) assert.equal(found[0].id, refs.get(name).id);
      await run(['rm', '-f', name], 'remove-owned-box');
    } catch (error) { errors.push({ name, error: error.message }); }
  }
  if (imageIntended) {
    try {
      const saved = await fixtureImages();
      if (saved.length) {
        assert.equal(saved.length, 1);
        if (imageId) assert.equal(saved[0].id, imageId);
        await run(['template', 'rm', imageTag], 'remove-owned-template');
      }
    } catch (error) { errors.push({ imageTag, error: error.message }); }
  }
  report.cleanup = { errors, remainingBoxes: (await boxes()).filter(x => intended.has(x.name)), remainingTemplates: await fixtureImages() };
  if (errors.length || report.cleanup.remainingBoxes.length || report.cleanup.remainingTemplates.length) process.exitCode = 1;
  await rm(root, { recursive: true, force: true });
  await writeFile(new URL('./22-template-fixture-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, error: report.error, checks: report.checks, commands: report.commands, cleanup: report.cleanup }));
}
