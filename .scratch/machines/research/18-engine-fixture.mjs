// Opt-in, disposable Docker Engine mechanism/cost fixture; never starts Docker Desktop.
// Run: BLOBOT_LIVE_ENGINE_RESEARCH=1 node .scratch/machines/research/18-engine-fixture.mjs
// Uses an already-cached image by immutable ID, no pull/network/host mounts/real login.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

if (process.env.BLOBOT_LIVE_ENGINE_RESEARCH !== '1') throw new Error('Explicit opt-in required');
const docker = '/usr/local/bin/docker';
const image = 'sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99';
const prefix = `blobot-engine-research-${randomUUID().slice(0, 8)}`;
const label = 'dev.blobot.engine-research';
const env = Object.fromEntries(['HOME', 'PATH', 'TMPDIR'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
const result = { startedAt: new Date().toISOString(), prefix, image, commands: [], phases: [], timings: {}, cleanup: [] };
const containers = new Map();
const volumes = [];
const deadline = Date.now() + 270_000;
let cleaning = false;

async function run(binary, args, { allowFailure = false, record = true, timeout = 25_000 } = {}) {
  const started = performance.now();
  const remaining = cleaning ? 25_000 : deadline - Date.now();
  if (remaining <= 0 && !allowFailure) throw new Error('Fixture deadline reached');
  const response = await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, Math.max(1000, Math.min(timeout, remaining)));
    child.stdout.on('data', b => { stdout += b; if (stdout.length > 1_000_000) child.kill('SIGKILL'); });
    child.stderr.on('data', b => { stderr += b; if (stderr.length > 1_000_000) child.kill('SIGKILL'); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut, stdout: stdout.trim(), stderr: stderr.trim(), ms: performance.now() - started }); });
  });
  if (record) result.commands.push({ args, ...response });
  if ((response.code !== 0 || response.timedOut) && !allowFailure) throw new Error(`Command failed: ${args[0]}: ${response.stderr}`);
  return response;
}
const d = (args, options) => run(docker, ['--context', 'desktop-linux', ...args], options);
const j = async args => JSON.parse((await d(args)).stdout);
const inventory = async () => {
  const rows = (await d(['ps', '-a', '--format', '{"ID":{{json .ID}},"Names":{{json .Names}},"State":{{json .State}}}'])).stdout;
  return rows === '' ? [] : rows.split('\n').map(JSON.parse);
};
async function owned(name) {
  const observed = await j(['inspect', '--format', `{"id":{{json .Id}},"label":{{json (index .Config.Labels "${label}")}}}`, name]);
  if (observed.label !== prefix || (containers.get(name) && containers.get(name) !== observed.id)) throw new Error(`Ownership mismatch for ${name}`);
  return observed.id;
}
async function remove(name) {
  const id = await owned(name);
  await d(['rm', '-f', id]);
  containers.delete(name);
}
async function create(name, withVolumes = true) {
  containers.set(name, undefined); // Record intent before create, including ambiguous failure.
  const args = ['create', '--pull=never', '--name', name, '--label', `${label}=${prefix}`,
    '--cpus', '2', '--memory', '2g', '--memory-swap', '2g', '--pids-limit', '64',
    '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', '0:0', '--stop-timeout', '2', '--tmpfs', '/data:size=1048576',
    '--entrypoint', '/bin/sh'];
  if (withVolumes) args.push('--mount', `type=volume,src=${volumes[0]},dst=/home/agent,volume-nocopy`,
    '--mount', `type=volume,src=${volumes[1]},dst=/workspace,volume-nocopy`);
  args.push(image, '-c', "trap 'exit 0' TERM INT; while :; do sleep 1 & wait $!; done");
  const out = await d(args);
  containers.set(name, out.stdout);
  await owned(name);
  return { id: out.stdout, ms: out.ms };
}
async function exec(id, script) { return d(['exec', '-u', '0:0', id, '/bin/sh', '-c', script]); }
async function config(id) {
  return j(['inspect', '--format', '{"id":{{json .Id}},"image":{{json .Image}},"state":{{json .State}},"nanoCpus":{{json .HostConfig.NanoCpus}},"memory":{{json .HostConfig.Memory}},"memorySwap":{{json .HostConfig.MemorySwap}},"mounts":{{json .Mounts}},"network":{{json .HostConfig.NetworkMode}},"capDrop":{{json .HostConfig.CapDrop}},"securityOpt":{{json .HostConfig.SecurityOpt}}}', id]);
}
async function hostRss() {
  const response = await run('/bin/ps', ['-axo', 'pid=,ppid=,rss=,comm='], { record: false });
  return response.stdout.split('\n').filter(line => /\/Applications\/Docker\.app\/|com\.apple\.Virtualization\.VirtualMachine$/.test(line));
}
async function phase(name, ids = []) {
  const phase = { name, at: new Date().toISOString(), hostProcessRssKiB: await hostRss(), containers: [] };
  for (const id of ids) {
    const conf = await config(id);
    const item = { config: conf };
    if (conf.state.Running) {
      item.cgroup = (await exec(id, "for f in memory.current memory.max memory.swap.max memory.events cpu.max cpu.stat; do printf '%s\\n' \"$f\"; cat /sys/fs/cgroup/\"$f\"; done")).stdout;
      item.stats = JSON.parse((await d(['stats', '--no-stream', '--format', '{{json .}}', id])).stdout);
    }
    phase.containers.push(item);
  }
  result.phases.push(phase);
  console.log(`phase ${name}`);
}
const manifestScript = "find /home/agent /workspace -type f -exec sha256sum {} \\; | sort; find /home/agent /workspace -exec stat -c '%n|%a|%u|%g|%s' {} \\; | sort";
async function manifest(id) { return (await exec(id, manifestScript)).stdout; }
function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  result.version = await j(['version', '--format', '{{json .Server}}']);
  result.engine = await j(['info', '--format', '{"id":{{json .ID}},"cgroupVersion":{{json .CgroupVersion}},"cgroupDriver":{{json .CgroupDriver}},"cpus":{{json .NCPU}},"memory":{{json .MemTotal}}}']);
  assert(result.version.Version === '29.6.1' && result.version.Os === 'linux' && result.version.Arch === 'arm64', 'Unapproved Engine/version/platform');
  assert(result.engine.cgroupVersion === '2', 'Expected cgroup v2');
  assert(await j(['image', 'inspect', image, '--format', '{{json .Id}}']) === image, 'Cached image mismatch');
  result.initialContainers = await inventory();
  assert(result.initialContainers.every(c => c.State === 'exited'), 'Unrelated running or unknown work: defer benchmark');
  await phase('engine-baseline');
  for (const suffix of ['home', 'workspace']) {
    const name = `${prefix}-${suffix}`;
    const exists = await d(['volume', 'inspect', name], { allowFailure: true });
    assert(exists.code !== 0 && /no such volume/i.test(exists.stderr), 'Volume name is not demonstrably absent');
    volumes.push(name);
    await d(['volume', 'create', '--label', `${label}=${prefix}`, name]);
  }
  result.timings.cachedCreateMs = [];
  let source;
  const sourceName = `${prefix}-source`;
  for (let i = 0; i < 3; i++) {
    source = await create(sourceName);
    result.timings.cachedCreateMs.push(source.ms);
    if (i < 2) await remove(sourceName);
  }
  result.timings.cycles = [];
  for (let i = 0; i < 3; i++) {
    const start = await d(['start', source.id]);
    const command = await exec(source.id, 'true');
    const stop = await d(['stop', source.id]);
    assert((await config(source.id)).state.Running === false, 'Stop not verified');
    result.timings.cycles.push({ startMs: start.ms, execTrueMs: command.ms, startPlusExecMs: start.ms + command.ms, stopMs: stop.ms });
  }
  await d(['start', source.id]);
  await phase('one-empty-container', [source.id]);
  const seed = await exec(source.id, "chmod 0700 /home/agent /workspace; printf 'synthetic-session-only\\n' > /home/agent/session.txt; chmod 0600 /home/agent/session.txt; dd if=/dev/zero of=/workspace/payload.bin bs=1048576 count=64 2>/dev/null; mkdir /workspace/small; i=0; while [ $i -lt 256 ]; do printf 'file-%s\\n' \"$i\" > /workspace/small/\"$i\"; i=$((i+1)); done; sync");
  result.timings.seedMs = seed.ms;
  const originalManifest = await manifest(source.id);
  result.originalManifest = originalManifest;
  await d(['stop', source.id]);
  await d(['start', source.id]);
  assert(await manifest(source.id) === originalManifest, 'Persistence mismatch after stop/start');
  result.stopStartPersistence = true;
  await phase('memory-before', [source.id]);
  await exec(source.id, 'dd if=/dev/zero of=/dev/shm/blobot-memory bs=1048576 count=32 2>/dev/null');
  await phase('memory-held-tmpfs-32MiB', [source.id]);
  await exec(source.id, 'rm /dev/shm/blobot-memory');
  await phase('memory-released-tmpfs-32MiB', [source.id]);
  result.timings.hash64MiBx8Ms = (await exec(source.id, 'i=0; while [ $i -lt 8 ]; do sha256sum /workspace/payload.bin >/dev/null; i=$((i+1)); done')).ms;
  await d(['update', '--cpus', '1', source.id]);
  await phase('before-update-1cpu-2GiB', [source.id]);
  const update = await d(['update', '--cpus', '2', '--memory', '3g', '--memory-swap', '3g', source.id]);
  result.timings.liveUpdateMs = update.ms;
  const after = await config(source.id);
  assert(after.id === source.id && after.nanoCpus === 2_000_000_000 && after.memory === 3 * 1024 ** 3 && after.state.Running, 'Live update not effective');
  await phase('live-updated-2cpu-3GiB', [source.id]);
  const invalid = await d(['update', '--memory', '1m', source.id], { allowFailure: true });
  assert(invalid.code !== 0, 'Invalid tiny memory unexpectedly accepted');
  result.invalidUpdate = invalid;
  const unchanged = await config(source.id);
  assert(unchanged.id === source.id && unchanged.memory === after.memory && unchanged.nanoCpus === after.nanoCpus && unchanged.state.Running, 'Failed update changed configuration');
  result.invalidUpdateReadbackUnchanged = true;
  await d(['stop', source.id]);
  await d(['update', '--cpus', '1', '--memory', '2g', '--memory-swap', '2g', source.id]);
  await phase('stopped-updated-1cpu-2GiB', [source.id]);
  await d(['start', source.id]);
  await phase('stopped-update-reopened', [source.id]);
  const peer = await create(`${prefix}-peer`, false);
  await d(['start', peer.id]);
  await phase('two-containers-peer-empty-no-data-volumes', [source.id, peer.id]);
  await remove(`${prefix}-peer`);
  await d(['stop', source.id]);
  const replacement = await create(`${prefix}-replacement`);
  await d(['start', replacement.id]);
  assert(await manifest(replacement.id) === originalManifest, 'Volume reuse mismatch');
  result.replacementPersistence = true;
  await exec(replacement.id, "printf 'replacement-wrote-this\\n' > /home/agent/session.txt");
  await d(['stop', replacement.id]);
  await d(['start', source.id]);
  result.oldContainerSeesReplacementWrite = (await exec(source.id, 'cat /home/agent/session.txt')).stdout === 'replacement-wrote-this';
  assert(result.oldContainerSeesReplacementWrite, 'Shared-volume rollback demonstration failed');
  await d(['stop', source.id]);
  await remove(sourceName);
  await d(['start', replacement.id]);
  assert((await exec(replacement.id, 'sha256sum /workspace/payload.bin')).stdout === originalManifest.split('\n').find(line => line.endsWith('  /workspace/payload.bin')), 'Payload lost after old container removal');
  result.persistenceAfterOriginalRemoval = true;
  await d(['stop', replacement.id]);
  await phase('all-fixture-containers-stopped', [replacement.id]);
  result.success = true;
} catch (error) {
  result.success = false;
  result.error = error.stack ?? String(error);
  console.error(result.error);
} finally {
  cleaning = true;
  for (const [name] of containers) {
    try { await remove(name); result.cleanup.push({ container: name, removed: true }); }
    catch (error) { result.cleanup.push({ container: name, removed: false, error: String(error) }); }
  }
  for (const name of volumes) {
    try {
      const observed = await j(['volume', 'inspect', '--format', `{{json (index .Labels "${label}")}}`, name]);
      assert(observed === prefix, 'Volume ownership mismatch');
      await d(['volume', 'rm', name]);
      result.cleanup.push({ volume: name, removed: true });
    } catch (error) { result.cleanup.push({ volume: name, removed: false, error: String(error) }); }
  }
  result.finalContainers = await inventory();
  result.finishedAt = new Date().toISOString();
  result.hostRssScope = 'Docker.app processes plus VirtualMachine-name candidates; comm/parent/RSS only. VirtualMachine ownership not established; never per-container RSS.';
  result.fixtureUid = 0;
  result.output = new URL('./18-engine-fixture-results.json', import.meta.url).pathname;
  await writeFile(result.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ success: result.success, timings: result.timings, cleanup: result.cleanup, output: result.output }));
}
