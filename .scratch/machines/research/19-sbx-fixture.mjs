// Disposable RC5 primitive measurements. Run only with an already-running, admitted engine.
// Rebuild core first if its implementation changed; this uses its verified data-copy helper.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { copySbxData } from '../../../packages/core/dist/machines/sbx/data-transfer.js';
import { renderSbxKit } from '../../../packages/core/dist/machines/sbx/kit.js';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';

if (process.env.BLOBOT_LIVE_SBX_RESEARCH !== '1') throw new Error('Explicit opt-in required');
const exec = promisify(execFile);
const env = sbxClientEnvironment();
const report = { date: new Date().toISOString(), kind: 'minimal-shell-not-full-Agent', commands: [], phases: [], checks: {}, cleanup: {} };
const prefix = `blobot-cost-${randomUUID()}`;
const intended = new Set();
const refs = new Map();
const root = await mkdtemp(join(tmpdir(), 'blobot-sbx-cost-'));
const output = new URL('./19-sbx-fixture-results.json', import.meta.url);
const run = async (args, label, accepted = [0]) => {
  const start = performance.now();
  let result;
  try { result = { ...await exec('sbx', args, { env, timeout: 60_000, maxBuffer: 1024 * 1024 }), code: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', code: error.code, killed: error.killed }; }
  if (label) report.commands.push({ label, ms: performance.now() - start, code: result.code });
  if (!accepted.includes(result.code) || result.killed) throw new Error(`Fixture command failed: ${label ?? args.slice(0, 2).join(' ')} (${result.code})`);
  return result.stdout;
};
const json = async (args) => JSON.parse(await run(args));
const inventory = async () => (await json(['ls', '--json'])).sandboxes;
const verify = async (reference) => {
  const matched = (await inventory()).filter((x) => x.name === reference.name);
  assert.equal(matched.length, 1); assert.equal(matched[0].id, reference.id);
  return matched[0];
};
// Match the Engine primitive fixture's UID 0; not the production Agent's UID 1000.
const guest = (reference, script, label) => run(['exec', '-u', '0', reference.name, '/bin/sh', '-c', script], label);
const metricsSource = `const fs=require('node:fs'),os=require('node:os');const read=p=>{try{return fs.readFileSync(p,'utf8').trim()}catch{return null}};console.log(JSON.stringify({uid:process.getuid(),kernel:os.release(),cpuCount:os.cpus().length,meminfo:read('/proc/meminfo').split('\\n').filter(l=>/^(MemTotal|MemAvailable|Shmem):/.test(l)),cgroupMemoryCurrent:read('/sys/fs/cgroup/memory.current'),cgroupMemoryMax:read('/sys/fs/cgroup/memory.max'),cgroupCpuMax:read('/sys/fs/cgroup/cpu.max'),cgroupCpuStat:read('/sys/fs/cgroup/cpu.stat')}))`;
const snapshot = async (label, reference) => {
  const boxes = await inventory();
  const ps = (await exec('/bin/ps', ['-axo', 'pid=,rss=,comm='], { maxBuffer: 1024 * 1024 })).stdout;
  const shims = ps.split('\n').filter((line) => /containerd-shim-nerdbox-v1(?:\s|$)/.test(line)).map((line) => {
    const [pid, rssKiB] = line.trim().split(/\s+/); return { pid: Number(pid), rssKiB: Number(rssKiB) };
  });
  report.phases.push({ label, inventory: boxes.map(({ name, id, status }) => ({ name, id, status })),
    allBoxesAreFixture: boxes.every((box) => intended.has(box.name)), shimProcesses: shims,
    aggregateShimRssKiB: shims.reduce((sum, x) => sum + x.rssKiB, 0),
    ...(reference ? { guest: JSON.parse(await run(['exec', '-u', '0', reference.name, '/usr/bin/node', '-e', metricsSource])) } : {}) });
};
const create = async (suffix, cpus, memory) => {
  const name = `${prefix}-${suffix}`;
  assert(!(await inventory()).some((x) => x.name === name));
  intended.add(name);
  await run(['create', '--name', name, '--cpus', String(cpus), '--memory', memory, join(root, 'kit')], `create-${suffix}`);
  const matches = (await inventory()).filter((x) => x.name === name);
  assert.equal(matches.length, 1);
  const reference = { name, id: matches[0].id };
  refs.set(name, reference);
  await verify(reference);
  return reference;
};
const stop = async (reference, label) => {
  await verify(reference); await run(['stop', reference.name], label);
  assert.equal((await verify(reference)).status, 'stopped');
};
const digest = (reference) => guest(reference, 'sha256sum /workspace/payload.bin; stat -c "%a %u %g %s" /workspace/payload.bin /home/agent/.session; cat /home/agent/.session; find /workspace/fixture -type f | wc -l');
try {
  assert.equal((await json(['daemon', 'status', '--json'])).status, 'running');
  const version = await json(['version', '--json']);
  assert.equal(version.client.version, 'v0.42.0-rc5');
  assert.equal(version.server.version, version.client.version);
  assert.equal(version.client.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a');
  assert.equal(version.server.revision, version.client.revision);
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  assert.equal((await inventory()).length, 0, 'Empty sbx inventory required for bounded aggregate attribution');
  assert((await json(['template', 'ls', '--json'])).images.some((x) => x.tag === 'shell-docker'));
  report.version = version;
  report.limits = { cpus: 2, memoryBytes: 2 * 1024 ** 3, volumeBytesEach: 512 * 1024 ** 2 };
  report.image = 'docker/sandbox-templates:shell-docker (cached; not same image as Engine fixture)';
  await mkdir(join(root, 'kit'));
  await writeFile(join(root, 'kit/spec.yaml'), renderSbxKit({ image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 }));
  await snapshot('before');
  const source = await create('old', 2, '2g');
  await guest(source, 'true', 'first-exec');
  await snapshot('one-empty', source);
  for (let i = 0; i < 3; i++) {
    await stop(source, `stop-${i}`);
    await snapshot(`stopped-${i}`);
    await guest(source, 'true', `wake-exec-${i}`);
    await guest(source, 'true', `warm-exec-${i}`);
  }
  await guest(source, 'mkdir -p /workspace/fixture; dd if=/dev/zero of=/workspace/payload.bin bs=1048576 count=64 2>/dev/null; i=0; while [ "$i" -lt 256 ]; do printf "fixture-%s\\n" "$i" > "/workspace/fixture/file-$i"; i=$((i+1)); done; printf "synthetic-session\\n" > /home/agent/.session; chmod 600 /home/agent/.session; sync', 'seed-64MiB-256-files');
  const before = await digest(source);
  await snapshot('data-seeded', source);
  await guest(source, 'dd if=/dev/zero of=/dev/shm/blobot-memory bs=1048576 count=32 2>/dev/null', 'tmpfs-allocate-32MiB');
  await snapshot('tmpfs-held', source);
  await guest(source, 'rm /dev/shm/blobot-memory', 'tmpfs-release');
  await snapshot('tmpfs-released', source);
  await guest(source, 'i=0; while [ "$i" -lt 8 ]; do sha256sum /workspace/payload.bin >/dev/null; i=$((i+1)); done', 'hash64MiBx8');
  await stop(source, 'source-stop-before-copy');
  const target = await create('new', 3, '3g');
  await guest(source, 'true');
  await snapshot('two-running-before-copy', source);
  const copyStart = performance.now();
  const copied = await copySbxData({ source, target, guestNode: '/usr/bin/node', timeoutMs: 60_000 });
  report.commands.push({ label: 'verified-copy-64MiB-256-files', ms: performance.now() - copyStart, bytes: copied.bytes, code: 0 });
  assert.equal(await digest(target), before);
  await stop(target, 'target-stop');
  assert.equal(await digest(target), before);
  await guest(target, 'printf "replacement-write\\n" > /home/agent/.session');
  assert.equal(await digest(source), before);
  report.checks = { copiedDigestMetadataAndCountMatch: true, targetStopWakePreservesData: true, independentOriginalUnaffectedByTargetWrite: true, syntheticBytes: 64 * 1024 ** 2, smallFiles: 256 };
  await snapshot('two-running-after-copy', target);
  await stop(source, 'final-source-stop'); await stop(target, 'final-target-stop');
  await snapshot('both-stopped');
  report.passed = true;
} catch (error) {
  report.passed = false; report.error = error.message;
  process.exitCode = 1;
} finally {
  const errors = [];
  for (const name of intended) {
    try {
      const matches = (await inventory()).filter((x) => x.name === name);
      if (matches.length === 0) continue;
      assert.equal(matches.length, 1);
      const ref = refs.get(name);
      if (ref) assert.equal(matches[0].id, ref.id);
      // Name was randomly generated and absent before our create, including partial creates.
      await run(['rm', '-f', name]);
    } catch (error) { errors.push({ name, error: error.message }); }
  }
  report.cleanup = { errors, remainingFixture: (await inventory()).filter((x) => intended.has(x.name)) };
  if (errors.length || report.cleanup.remainingFixture.length) process.exitCode = 1;
  await rm(root, { recursive: true, force: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, error: report.error, commands: report.commands, cleanup: report.cleanup }));
}
