// Sent as source to one maintained guest exec. It never runs on the host.
const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { once } = require('node:events');
const config = JSON.parse(process.argv[1]);
assert.match(config.uuid, /^[a-f0-9-]{36}$/);
const roots = ['/home/agent', '/var/lib/docker'];
const image = 'blobot-inner-fixture:' + config.uuid, container = 'blobot-inner-' + config.uuid;
const volume = 'blobot-volume-' + config.uuid;
const rootPaths = ['/opt/blobot-synthetic/installed.txt', '/etc/blobot-synthetic.conf'];
const home = '/home/agent/.blobot-synthetic';
const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const exec = (cmd, args, options = {}) => cp.execFileSync(cmd, args, { encoding: 'utf8', timeout: 20_000, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
const docker = args => exec('docker', args), dockerJSON = args => JSON.parse(docker(args));
const delay = ms => new Promise(r => setTimeout(r, ms));
const boot = () => ({ id: read('/proc/sys/kernel/random/boot_id').trim(), pid1: read('/proc/1/stat').split(') ')[1].split(' ')[19] });
const processes = () => fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).flatMap(p => {
  try {
    const comm = read('/proc/' + p + '/comm')?.trim();
    if (!/^(dockerd|containerd|containerd-shim)/.test(comm)) return [];
    return [{ pid: Number(p), comm, args: read('/proc/' + p + '/cmdline').split('\0').filter(Boolean), start: read('/proc/' + p + '/stat').split(') ')[1].split(' ')[19] }];
  } catch { return []; }
});
const file = p => { const s = fs.lstatSync(p); return { mode: s.mode & 4095, uid: s.uid, gid: s.gid, size: s.size, mtimeMs: s.mtimeMs,
  ...(s.isSymbolicLink() ? { link: fs.readlinkSync(p) } : s.isFile() ? { sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') } : {}) }; };
const packageState = () => ({ status: exec('dpkg-query', ['-W', '-f=${Status}|${Version}|${Architecture}', 'blobot-synthetic-fixture']),
  files: Object.fromEntries(rootPaths.map(p => [p, file(p)])), conffiles: exec('dpkg-query', ['-W', '-f=${Conffiles}', 'blobot-synthetic-fixture']) });
const homeState = () => ({ files: Object.fromEntries(['session', 'hardlink', 'symlink', 'sparse'].map(p => [p, file(home + '/' + p)])),
  hardlinkSameInode: fs.statSync(home + '/session').ino === fs.statSync(home + '/hardlink').ino,
  xattr: exec('python3', ['-c', 'import os; print(os.getxattr(' + JSON.stringify(home + '/session') + ', "user.blobot").decode())']),
  sparseBlocks: fs.statSync(home + '/sparse').blocks });
const state = () => {
  const i = dockerJSON(['image', 'inspect', image])[0], c = dockerJSON(['container', 'inspect', container])[0], v = dockerJSON(['volume', 'inspect', volume])[0];
  assert.equal(c.State.Running, false);
  const cpArchive = cp.execFileSync('docker', ['cp', container + ':/container-sentinel', '-'], { timeout: 15_000, maxBuffer: 1024 ** 2 });
  const layerSentinel = exec('tar', ['-xOf', '-'], { input: cpArchive });
  return { image: { id: i.Id, rootfs: i.RootFS }, container: { id: c.Id, image: c.Image, status: c.State.Status, restart: c.HostConfig.RestartPolicy,
    mounts: c.Mounts.map(m => ({ type: m.Type, name: m.Name, source: m.Source, destination: m.Destination })) },
    volume: { name: v.Name, driver: v.Driver, mountpoint: v.Mountpoint, sentinel: file(path.join(v.Mountpoint, 'volume-sentinel')) },
    layerSentinel, package: packageState(), home: homeState() };
};
const inventory = () => {
  const i = dockerJSON(['info', '--format', '{{json .}}']), procs = processes();
  const c = procs.find(p => p.comm === 'containerd'); assert(c);
  const at = c.args.indexOf('--config'); assert(at !== -1);
  const containerdConfig = { path: c.args[at + 1], text: read(c.args[at + 1]) };
  assert.match(containerdConfig.text, /^root = '\/var\/lib\/docker\/containerd\/daemon'$/m);
  const mounts = read('/proc/self/mountinfo').trim().split('\n');
  const capacity = Object.fromEntries(roots.map(p => {
    const m = mounts.filter(l => l.split(' ')[4] === p); assert.equal(m.length, 1);
    return [p, { mount: m[0], blockBytes: String(BigInt(read('/sys/dev/block/' + m[0].split(' ')[2] + '/size').trim()) * 512n) }];
  }));
  assert.equal(capacity['/home/agent'].blockBytes, String(8 * 1024 ** 3));
  assert.equal(capacity['/var/lib/docker'].blockBytes, String(20 * 1024 ** 3));
  assert.equal(i.DockerRootDir, '/var/lib/docker'); assert.equal(i.LiveRestoreEnabled, false);
  return { boot: boot(), workerPid: process.pid, processes: procs, mounts, capacity, containerdConfig,
    resources: { cpuCount: require('node:os').cpus().length, memTotalKiB: Number(read('/proc/meminfo').match(/^MemTotal:\s+(\d+)/m)[1]),
      cgroupMemoryMax: read('/sys/fs/cgroup/memory.max')?.trim(), cgroupCpuMax: read('/sys/fs/cgroup/cpu.max')?.trim() },
    docker: { version: i.ServerVersion, root: i.DockerRootDir, driver: i.Driver, driverStatus: i.DriverStatus, liveRestore: i.LiveRestoreEnabled },
    uid: process.getuid(), groups: process.getgroups(), privileges: read('/proc/self/status').split('\n').filter(l => /^(Cap|Seccomp|NoNewPrivs)/.test(l)) };
};
let quiesced = false, guardViolation = null, guardSamples = 0;
const monitor = setInterval(() => { if (quiesced) { guardSamples++; const p = processes(); if (p.length && !guardViolation) guardViolation = p; } }, 100);
const quiet = () => {
  assert(quiesced, 'Maintenance mode required'); assert.equal(guardViolation, null, 'Writer appeared during maintenance');
  assert.deepEqual(processes(), [], 'Writer is running');
  const nested = read('/proc/self/mountinfo').trim().split('\n').filter(l => roots.some(root => l.split(' ')[4].startsWith(root + '/')));
  assert.deepEqual(nested, [], 'A nested mount would be omitted by one-file-system tar');
};
const quiesce = async () => {
  assert(!quiesced); assert.equal(docker(['ps', '-q']), '', 'Synthetic container must be stopped');
  assert.equal(dockerJSON(['info', '--format', '{{json .}}']).LiveRestoreEnabled, false);
  const before = processes(); assert.equal(before.filter(p => p.comm === 'dockerd').length, 1);
  const terminate = expected => { const actual = processes().find(p => p.pid === expected.pid); if (!actual) return;
    assert.equal(actual.comm, expected.comm); assert.equal(actual.start, expected.start); process.kill(actual.pid, 'SIGTERM'); };
  terminate(before.find(p => p.comm === 'dockerd'));
  let end = Date.now() + 20_000; while (processes().some(p => p.comm === 'dockerd') && Date.now() < end) await delay(100);
  assert(!processes().some(p => p.comm === 'dockerd'));
  for (const p of before.filter(p => p.comm === 'containerd')) terminate(p);
  end = Date.now() + 10_000; while (processes().length && Date.now() < end) await delay(100);
  assert.deepEqual(processes(), []); exec('sync', []); quiesced = true; quiet();
  return { before, after: processes(), boot: boot(), workerPid: process.pid };
};
const resume = async () => {
  quiet(); quiesced = false;
  const fd = fs.openSync('/var/log/blobot-fixture-dockerd.log', 'a');
  const child = cp.spawn('dockerd', [], { detached: true, stdio: ['ignore', fd, fd] }); child.unref(); fs.closeSync(fd);
  const end = Date.now() + 20_000;
  for (;;) { try { docker(['info']); break; } catch (e) { if (Date.now() >= end) throw e; await delay(100); } }
  return inventory();
};
const archiveArgs = ['--sort=name', '--format=pax', '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
  '--acls', '--xattrs', '--xattrs-include=*', '--sparse', '--sparse-version=0.0', '--numeric-owner', '--one-file-system', '-C', '/', '-cf', '-', ...roots.map(p => p.slice(1))];
const completion = child => new Promise((resolve, reject) => {
  let stderr = ''; child.stderr.on('data', d => { stderr = (stderr + d).slice(-8192); });
  child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Child failed ' + code + ': ' + stderr)));
});
const write = async (stream, data) => { if (!stream.write(data)) await once(stream, 'drain'); };
const send = async (type, payload) => { const body = type === 1 ? Buffer.from(JSON.stringify(payload)) : payload;
  assert(body.length <= 1024 ** 2); const head = Buffer.alloc(5); head[0] = type; head.writeUInt32BE(body.length, 1); await write(process.stdout, Buffer.concat([head, body])); };
async function* frames(input) {
  let pending = Buffer.alloc(0);
  for await (const chunk of input) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= 5) {
      const type = pending[0], length = pending.readUInt32BE(1); assert([1, 2].includes(type)); assert(length <= 1024 ** 2);
      if (pending.length < 5 + length) break;
      const payload = pending.subarray(5, 5 + length); pending = pending.subarray(5 + length); yield { type, payload };
    }
  }
  assert.equal(pending.length, 0, 'Truncated protocol frame');
}
const archive = async stream => {
  quiet(); const child = cp.spawn('tar', archiveArgs, { stdio: ['ignore', 'pipe', 'pipe'] }); const done = completion(child); done.catch(() => {});
  const hash = crypto.createHash('sha256'); let bytes = 0;
  try {
    for await (const chunk of child.stdout) {
      quiet(); bytes += chunk.length; assert(bytes <= 128 * 1024 ** 2, 'Synthetic archive exceeded 128 MiB'); hash.update(chunk);
      if (stream) for (let offset = 0; offset < chunk.length; offset += 64 * 1024) await send(2, chunk.subarray(offset, offset + 64 * 1024));
    }
    await done; quiet(); return { sha256: hash.digest('hex'), bytes, guardSamples, boot: boot(), workerPid: process.pid };
  } catch (e) { child.kill(); await done.catch(() => {}); throw e; }
};
let restoring = null;
const restoreStart = () => {
  quiet(); assert.equal(restoring, null); assert.equal(config.role, 'target');
  for (const root of roots) { assert.equal(fs.realpathSync(root), root); for (const name of fs.readdirSync(root)) fs.rmSync(path.join(root, name), { recursive: true, force: true }); }
  const child = cp.spawn('tar', ['--acls', '--xattrs', '--xattrs-include=*', '--sparse', '--numeric-owner', '-C', '/', '-xpf', '-'], { stdio: ['pipe', 'ignore', 'pipe'] });
  const done = completion(child); done.catch(() => {}); restoring = { child, done, hash: crypto.createHash('sha256'), bytes: 0 };
  return { ready: true };
};
const restoreEnd = async () => { quiet(); assert(restoring); const r = restoring; r.child.stdin.end(); await r.done;
  restoring = null; exec('sync', []); quiet(); return { sha256: r.hash.digest('hex'), bytes: r.bytes, guardSamples, boot: boot(), workerPid: process.pid }; };
const seed = async () => {
  assert.equal(config.role, 'source'); assert.equal(docker(['ps', '-aq']), '');
  const dir = '/tmp/blobot-seed-' + config.uuid, imgdir = path.join(dir, 'image'), pkg = path.join(dir, 'package');
  fs.mkdirSync(imgdir, { recursive: true });
  const copyBinary = (from, to) => { const dest = path.join(imgdir, to); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(from, dest); fs.chmodSync(dest, 0o755);
    for (const line of exec('ldd', [from]).split('\n')) { const m = line.match(/=> (\/[^ ]+)/) || line.match(/^\s*(\/[^ ]+)/); if (m) { const target = path.join(imgdir, m[1]); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(m[1], target); } } };
  copyBinary('/bin/dash', '/bin/sh'); copyBinary('/usr/bin/sleep', '/bin/sleep');
  fs.writeFileSync(path.join(imgdir, 'fixture.sh'), '#!/bin/sh\nprintf "volume:' + config.uuid + '\\n" > /data/volume-sentinel\nprintf "layer:' + config.uuid + '\\n" > /container-sentinel\ntrap "exit 0" TERM INT\nwhile :; do /bin/sleep 1; done\n', { mode: 0o755 });
  const tar = cp.spawn('tar', ['-C', imgdir, '-cf', '-', '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const imp = cp.spawn('docker', ['import', '-', image], { stdio: ['pipe', 'ignore', 'pipe'] });
  const td = completion(tar), id = completion(imp); tar.stdout.pipe(imp.stdin); await Promise.all([td, id]);
  docker(['volume', 'create', volume]); docker(['create', '--name', container, '--restart', 'unless-stopped', '--mount', 'type=volume,source=' + volume + ',target=/data', image, '/bin/sh', '/fixture.sh']);
  docker(['start', container]); await delay(1200); assert.equal(dockerJSON(['inspect', container])[0].State.Running, true); docker(['stop', '--time', '5', container]);
  for (const sub of ['DEBIAN', 'opt/blobot-synthetic', 'etc']) fs.mkdirSync(path.join(pkg, sub), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'DEBIAN/control'), 'Package: blobot-synthetic-fixture\nVersion: 1.0\nArchitecture: all\nMaintainer: Synthetic Fixture <fixture@example.invalid>\nDescription: Synthetic persistence marker only\n');
  fs.writeFileSync(path.join(pkg, 'DEBIAN/conffiles'), '/etc/blobot-synthetic.conf\n');
  fs.writeFileSync(path.join(pkg, 'opt/blobot-synthetic/installed.txt'), 'package:' + config.uuid, { mode: 0o640 });
  fs.writeFileSync(path.join(pkg, 'etc/blobot-synthetic.conf'), 'default:' + config.uuid, { mode: 0o600 });
  exec('dpkg-deb', ['--build', '--root-owner-group', pkg, path.join(dir, 'synthetic.deb')]); exec('dpkg', ['-i', path.join(dir, 'synthetic.deb')]);
  fs.writeFileSync('/etc/blobot-synthetic.conf', 'configured:' + config.uuid, { mode: 0o600 });
  fs.mkdirSync(home, { mode: 0o700 }); fs.chownSync(home, 1000, 1000);
  fs.writeFileSync(home + '/session', 'synthetic-session:' + config.uuid, { mode: 0o640 }); fs.chownSync(home + '/session', 1000, 1000);
  fs.linkSync(home + '/session', home + '/hardlink'); fs.symlinkSync('session', home + '/symlink'); fs.lchownSync(home + '/symlink', 1000, 1000);
  const sparse = fs.openSync(home + '/sparse', 'w', 0o600); fs.writeSync(sparse, Buffer.from('tail:' + config.uuid), 0, 41, 1024 ** 2); fs.closeSync(sparse); fs.chownSync(home + '/sparse', 1000, 1000);
  exec('python3', ['-c', 'import os; os.setxattr(' + JSON.stringify(home + '/session') + ', "user.blobot", b"synthetic-xattr")']);
  fs.rmSync(dir, { recursive: true }); return state();
};
const operations = {
  inventory, seed, state, quiesce, resume,
  quiet: () => { quiet(); return { boot: boot(), workerPid: process.pid, processes: processes(), guardSamples, guardViolation, package: packageState(), home: config.role === 'source' || fs.existsSync(home) ? homeState() : null }; },
  digest: () => archive(false), archive: () => archive(true), restoreStart, restoreEnd,
  runRestored: async () => { assert(!quiesced); docker(['start', container]); await delay(500); const running = dockerJSON(['inspect', container])[0].State.Running;
    assert.equal(running, true); docker(['stop', '--time', '5', container]); return { ran: true, stopped: true }; },
  mutateTarget: () => { assert.equal(config.role, 'target'); assert(!quiesced); const v = dockerJSON(['volume', 'inspect', volume])[0];
    fs.writeFileSync(path.join(v.Mountpoint, 'volume-sentinel'), 'target-only'); fs.writeFileSync(home + '/session', 'target-only'); fs.writeFileSync('/etc/blobot-synthetic.conf', 'target-only'); return { mutated: true }; },
  close: () => ({ closed: true }),
};
(async () => {
  await send(1, { id: 0, result: { protocol: 1, role: config.role, boot: boot(), workerPid: process.pid } });
  for await (const frame of frames(process.stdin)) {
    if (frame.type === 2) { quiet(); assert(restoring); restoring.bytes += frame.payload.length; assert(restoring.bytes <= 128 * 1024 ** 2);
      restoring.hash.update(frame.payload); await write(restoring.child.stdin, frame.payload); continue; }
    const request = JSON.parse(frame.payload); assert(Number.isSafeInteger(request.id)); assert(Object.hasOwn(operations, request.op));
    try { const result = await operations[request.op](); await send(1, { id: request.id, result }); }
    catch (e) { await send(1, { id: request.id, error: e.stack }); throw e; }
    if (request.op === 'close') break;
  }
})().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; }).finally(() => { clearInterval(monitor); if (restoring) restoring.child.kill(); process.stdin.destroy(); });
