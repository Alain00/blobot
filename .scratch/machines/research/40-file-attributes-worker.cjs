// Sent as source to one maintained guest exec. It never runs on the host.
const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { once } = require('node:events');
const config = JSON.parse(process.argv[1]);
assert.match(config.uuid, /^[a-f0-9-]{36}$/);
const roots = ['/home/agent', '/var/lib/docker'];
const rootfsRoots = ['/opt/blobot-rootfs35', '/opt/blobot-synthetic', '/etc/blobot-synthetic.conf', '/var/lib/dpkg', '/etc/issue', '/etc/issue.net'];
const deletedRootfsPaths = ['/etc/debian_version'];
const transferRoots = [...roots, ...rootfsRoots];
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
  '--acls', '--xattrs', '--xattrs-include=*', '--sparse', '--sparse-version=0.0', '--numeric-owner', '--one-file-system', '-C', '/', '-cf', '-', ...transferRoots.map(p => p.slice(1))];
const completion = child => new Promise((resolve, reject) => {
  let stderr = ''; child.stderr.on('data', d => { stderr = (stderr + d).slice(-8192); });
  child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Child failed ' + code + ': ' + stderr)));
});
const write = async (stream, data) => { if (!stream.write(data)) await once(stream, 'drain'); };
const send = async (type, payload) => { const body = type === 1 ? Buffer.from(JSON.stringify(payload)) : payload;
  assert(body.length <= 32 * 1024 ** 2); const head = Buffer.alloc(5); head[0] = type; head.writeUInt32BE(body.length, 1); await write(process.stdout, Buffer.concat([head, body])); };
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
  for (const root of [...rootfsRoots, ...deletedRootfsPaths]) fs.rmSync(root, { recursive: true, force: true });
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

const rootfsInventoryPython = String.raw`
import os, stat, json, hashlib, base64
roots = ['/opt/blobot-rootfs35','/opt/blobot-synthetic','/etc/blobot-synthetic.conf','/etc/issue','/etc/issue.net','/var/lib/dpkg/info/blobot-synthetic-fixture.list','/var/lib/dpkg/info/blobot-synthetic-fixture.md5sums','/var/lib/dpkg/info/blobot-synthetic-fixture.conffiles']
result = {}; links = {}
def visit(p):
    if not os.path.lexists(p): result[p]=None; return
    s = os.lstat(p)
    item = dict(mode=s.st_mode,uid=s.st_uid,gid=s.st_gid,mtimeNs=str(s.st_mtime_ns),nlink=s.st_nlink)
    item['xattrs'] = {k:base64.b64encode(os.getxattr(p,k,follow_symlinks=False)).decode() for k in sorted(os.listxattr(p,follow_symlinks=False))}
    if stat.S_ISREG(s.st_mode):
        fd=os.open(p,os.O_RDONLY|os.O_NOATIME)
        try:
            h=hashlib.sha256()
            while True:
                b=os.read(fd,65536)
                if not b: break
                h.update(b)
            item.update(size=s.st_size,sha256=h.hexdigest())
            if p.endswith('/sparse'):
                os.lseek(fd,0,os.SEEK_SET); data=os.read(fd,s.st_size)
                item['expectedContent']=data==b'\0'*(1024*1024)+b'sparse tail'
                item['nonzeroBeforeTail']=sum(b!=0 for b in data[:1024*1024])
                item['tailMatches']=data[1024*1024:]==b'sparse tail'
                holes=[]; offset=0
                while offset<s.st_size:
                    try: data=os.lseek(fd,offset,os.SEEK_DATA)
                    except OSError: break
                    hole=os.lseek(fd,data,os.SEEK_HOLE); holes.append([data,hole]); offset=hole
                item.update(blocks=s.st_blocks,dataExtents=holes)
        finally: os.close(fd)
        links.setdefault((s.st_dev,s.st_ino),[]).append(p)
    elif stat.S_ISLNK(s.st_mode): item['link']=os.readlink(p)
    elif stat.S_ISDIR(s.st_mode):
        item['children']=sorted(os.listdir(p))
        for name in item['children']: visit(p+'/'+name)
    result[p]=item
for p in roots: visit(p)
print(json.dumps(dict(files=result,hardlinks=sorted(sorted(v) for v in links.values() if len(v)>1),deleted={p:not os.path.lexists(p) for p in ['/etc/debian_version']})))
`;
const rootfsState = () => JSON.parse(exec('python3', ['-c', rootfsInventoryPython]));
const seedRootfs = () => {
  assert.equal(config.role, 'source');
  exec('python3', ['-c', String.raw`
import os, struct, shutil, stat
root='/opt/blobot-rootfs35'; os.mkdir(root,0o755)
with open(root+'/file','wb') as f: f.write(b'rootfs35 synthetic\x00\xff data')
os.chown(root+'/file',1000,1001); os.chmod(root+'/file',0o750)
os.link(root+'/file',root+'/hardlink'); os.symlink('file',root+'/symlink')
os.lchown(root+'/symlink',1000,1001)
os.setxattr(root+'/file','user.blobot',b'binary\x00\xffxattr')
def acl(entries): return struct.pack('<I',2)+b''.join(struct.pack('<HHI',*e) for e in entries)
entries=[(1,7,0xffffffff),(2,4,12345),(4,5,0xffffffff),(16,5,0xffffffff),(32,0,0xffffffff)]
os.setxattr(root+'/file','system.posix_acl_access',acl(entries))
os.mkdir(root+'/directory',0o750); os.chown(root+'/directory',1000,1001); os.chmod(root+'/directory',0o2750)
os.setxattr(root+'/directory','system.posix_acl_default',acl(entries))
with open(root+'/sparse','wb') as f: f.seek(1024*1024); f.write(b'sparse tail')
os.chmod(root+'/sparse',0o640)
shutil.copyfile('/usr/bin/sleep',root+'/capability-binary'); os.chmod(root+'/capability-binary',0o755)
os.setxattr(root+'/capability-binary','security.capability',struct.pack('<IIIII',0x02000001,1<<10,0,0,0))
os.mkfifo(root+'/fifo',0o620)
assert stat.S_ISREG(os.lstat('/etc/debian_version').st_mode); os.unlink('/etc/debian_version')
assert stat.S_ISREG(os.lstat('/etc/issue').st_mode); os.unlink('/etc/issue'); os.mkdir('/etc/issue',0o751)
with open('/etc/issue/replacement','w') as f:f.write('directory replaces base file')
assert stat.S_ISREG(os.lstat('/etc/issue.net').st_mode); os.unlink('/etc/issue.net'); os.symlink('/opt/blobot-rootfs35/file','/etc/issue.net')
# Exact deliberately fractional nanoseconds, also on directories and symlinks.
for base in [root,'/opt/blobot-synthetic','/etc/issue']:
    for directory,dirs,files in os.walk(base,topdown=False,followlinks=False):
        for name in dirs+files: os.utime(directory+'/'+name,ns=(1700000000000000000,1788635508123456789),follow_symlinks=False)
        os.utime(directory,ns=(1700000000000000000,1788635508123456789),follow_symlinks=False)
for p in ['/etc/blobot-synthetic.conf','/etc/issue.net']:
    os.utime(p,ns=(1700000000000000000,1788635508123456789),follow_symlinks=False)
`]);
  return rootfsState();
};
const driftTargetRootfs = () => {
  quiet(); assert.equal(config.role, 'target');
  fs.writeFileSync('/opt/blobot-rootfs35/target-only', 'must be removed');
  fs.writeFileSync('/etc/debian_version', 'must remain deleted');
  return { injected: ['/opt/blobot-rootfs35/target-only', '/etc/debian_version'] };
};

const namespaceProbe = () => {
  quiet();
  const beforeMounts = read('/proc/self/mountinfo'), beforeNamespace = fs.readlinkSync('/proc/self/ns/mnt');
  const probe = String.raw`
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const uuid = process.argv[1], view = '/tmp/blobot-root-view-' + uuid;
const parentNamespace = process.argv[2], childNamespace = fs.readlinkSync('/proc/self/ns/mnt');
assert.notEqual(parentNamespace, childNamespace); fs.mkdirSync(view,{mode:0o700});
let mounted = false;
try {
  cp.execFileSync('mount',['--bind','/',view]); mounted = true;
  const all = fs.readFileSync('/proc/self/mountinfo','utf8').trim().split('\n');
  const viewMounts = all.filter(l => { const p=l.split(' ')[4]; return p===view || p.startsWith(view+'/'); });
  assert.equal(viewMounts.length,1); assert.equal(fs.statSync(view).dev,fs.statSync('/').dev);
  const child = "const fs=require('node:fs'); console.log(JSON.stringify({rootfsFile:fs.existsSync('/opt/blobot-rootfs35/file'),privateHomeFile:fs.existsSync('/home/agent/.blobot-synthetic/session'),privateDockerEntries:fs.existsSync('/var/lib/docker')?fs.readdirSync('/var/lib/docker'):[],procEntries:fs.existsSync('/proc')?fs.readdirSync('/proc'):[],devEntries:fs.existsSync('/dev')?fs.readdirSync('/dev'):[]}));";
  const chroot = JSON.parse(cp.execFileSync('chroot',[view,'/usr/bin/node','-e',child],{encoding:'utf8'}));
  assert(chroot.rootfsFile); assert.equal(chroot.privateHomeFile,false); assert.deepEqual(chroot.privateDockerEntries,[]); assert.deepEqual(chroot.procEntries,[]);
  console.log(JSON.stringify({parentNamespace,childNamespace,viewMounts,chroot,excludedMountpoints:all.filter(l=>l.split(' ')[4]!=='/'&&!l.split(' ')[4].startsWith(view)).map(l=>l.split(' ')[4])}));
} finally { if(mounted)cp.execFileSync('umount',[view]); fs.rmdirSync(view); }
`;
  const namespace = JSON.parse(exec('unshare', ['--mount','--propagation','private','/usr/bin/node','-e',probe,config.uuid,beforeNamespace], { maxBuffer: 4 * 1024 ** 2 }));
  assert.equal(read('/proc/self/mountinfo'), beforeMounts); assert.equal(fs.readlinkSync('/proc/self/ns/mnt'), beforeNamespace); quiet();
  const processInventory = fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p)).flatMap(p=>{
    try { const status=read('/proc/'+p+'/status'); return [{pid:Number(p),comm:read('/proc/'+p+'/comm').trim(),uid:status.match(/^Uid:\s+(.+)$/m)?.[1],cgroup:read('/proc/'+p+'/cgroup').trim()}]; } catch{return [];} });
  const writable = p => {try{fs.accessSync(p,fs.constants.W_OK);return true;}catch{return false;}};
  return {namespace,originalMountNamespaceUnchanged:true,processInventory,cgroup:{self:read('/proc/self/cgroup'),mounts:beforeMounts.trim().split('\n').filter(l=>l.includes(' - cgroup')),rootWritable:writable('/sys/fs/cgroup'),freeze:read('/sys/fs/cgroup/cgroup.freeze'),controllers:read('/sys/fs/cgroup/cgroup.controllers')}};
};

let freezeRecord = null;
const waitFrozen = async (dir, value) => {
  const end=Date.now()+5000;
  while(!new RegExp('^frozen '+value+'$','m').test(read(dir+'/cgroup.events'))) { if(Date.now()>end)throw new Error('Freezer acknowledgement timeout'); await delay(10); }
};
const cgroupPids = dir => read(dir+'/cgroup.procs').trim().split('\n').filter(Boolean).map(Number);
const freezeWorkload = async () => {
  quiet(); assert.equal(freezeRecord,null);
  const self=read('/proc/self/cgroup').trim().match(/^0::(\/docker\/[a-f0-9]{64})$/); assert(self,'Unexpected cgroup ownership scope');
  const relative=self[1], parent='/sys/fs/cgroup'+relative, dir=parent+'/blobot-research35-'+config.uuid;
  assert.equal(fs.realpathSync(parent),parent); assert(!fs.existsSync(dir));
  const properties={type:read(parent+'/cgroup.type').trim(),controllers:read(parent+'/cgroup.controllers').trim(),subtreeControl:read(parent+'/cgroup.subtree_control').trim()};
  fs.mkdirSync(dir); freezeRecord={relative,parent,dir,moved:[],properties};
  fs.writeFileSync(dir+'/cgroup.freeze','1'); await waitFrozen(dir,1);
  let stable=0;
  for(let round=0;round<100;round++) {
    const pids=cgroupPids(parent).filter(pid=>pid!==process.pid);
    if(pids.length===0) { if(++stable===5)break; await delay(20); continue; } stable=0;
    for(const pid of pids) {
      let info; try { info={pid,comm:read('/proc/'+pid+'/comm').trim(),start:read('/proc/'+pid+'/stat').split(') ')[1].split(' ')[19]}; } catch {continue;}
      if(read('/proc/'+pid+'/cgroup').trim()!=='0::'+relative)continue;
      try {fs.writeFileSync(dir+'/cgroup.procs',String(pid)); freezeRecord.moved.push(info);} catch(e) {if(e.code!=='ESRCH')throw e;}
    }
  }
  assert.deepEqual(cgroupPids(parent),[process.pid]); await waitFrozen(dir,1);
  return {...freezeRecord,events:read(dir+'/cgroup.events'),controlPids:cgroupPids(parent),frozenPids:cgroupPids(dir)};
};
const thawWorkload = async () => {
  if(!freezeRecord)return;
  const r=freezeRecord; fs.writeFileSync(r.dir+'/cgroup.freeze','0'); await waitFrozen(r.dir,0);
  for(let round=0;round<100;round++) {
    const pids=cgroupPids(r.dir); if(!pids.length)break;
    for(const pid of pids)try {fs.writeFileSync(r.parent+'/cgroup.procs',String(pid));}catch(e){if(e.code!=='ESRCH')throw e;}
    await delay(10);
  }
  assert.deepEqual(cgroupPids(r.dir),[]); fs.rmdirSync(r.dir); freezeRecord=null;
};
const freezerProbe = async () => {
  quiet(); const counter='/tmp/blobot-counter35-'+config.uuid;
  const script="const fs=require('node:fs'); let n=0;setInterval(()=>fs.writeFileSync(process.argv[1],String(++n)),10);";
  const writer=cp.spawn('/usr/bin/node',['-e',script,counter],{stdio:'ignore'});
  let late, result;
  try {
    for(let n=0;n<100&&Number(read(counter)??0)<3;n++)await delay(10); assert(Number(read(counter))>=3);
    const frozen=await freezeWorkload(), before=read(counter); await delay(300); assert.equal(read(counter),before);
    const digest=await archive(false); assert.equal(read(counter),before);
    // An intentionally late child inherits the unfrozen control group. It models
    // the remaining admission gap without issuing another sbx exec.
    const latePath=counter+'-late'; late=cp.spawn('/usr/bin/node',['-e',script,latePath],{stdio:'ignore'});
    for(let n=0;n<100&&Number(read(latePath)??0)<3;n++)await delay(10); assert(Number(read(latePath))>=3);
    const lateEvidence={pid:late.pid,cgroup:read('/proc/'+late.pid+'/cgroup').trim(),writes:Number(read(latePath))};
    late.kill('SIGTERM'); await once(late,'close'); late=null;
    assert.equal(read(counter),before);
    await thawWorkload();
    for(let n=0;n<100&&read(counter)===before;n++)await delay(10); assert.notEqual(read(counter),before);
    result={frozen,before,afterThaw:read(counter),workerPid:process.pid,digest,lateControlWriter:lateEvidence,normalThawAndMembershipRestore:true};
  } finally { if(late)late.kill('SIGKILL'); await thawWorkload(); writer.kill('SIGTERM'); await once(writer,'close'); fs.rmSync(counter,{force:true}); fs.rmSync(counter+'-late',{force:true}); }
  return result;
};
const freezeAndExit = async () => { const frozen=await freezeWorkload(); return {frozen,intendedExit:75,thawIntentionallyOmitted:true}; };
const freezerRecovery = () => {
  const relative=read('/proc/self/cgroup').trim().match(/^0::(\/docker\/[a-f0-9]{64})$/)[1], parent='/sys/fs/cgroup'+relative;
  const ownedChildren=fs.readdirSync(parent).filter(n=>n==='blobot-research35-'+config.uuid);
  assert.deepEqual(ownedChildren,[]); assert.equal(read(parent+'/cgroup.freeze').trim(),'0');
  return {boot:boot(),relative,ownedChildren,events:read(parent+'/cgroup.events'),freeze:read(parent+'/cgroup.freeze')};
};

let sibling36 = null, writer36 = null;
const originalScope36 = () => {
  const relative=read('/proc/self/cgroup').trim().match(/^0::(\/docker\/[a-f0-9]{64})$/)?.[1]; assert(relative,'Expected own container cgroup');
  assert.equal(read('/proc/1/cgroup').trim(),'0::'+relative);
  const container='/sys/fs/cgroup'+relative, parent='/sys/fs/cgroup/docker';
  assert.equal(fs.realpathSync(container),container); assert.equal(fs.realpathSync(parent),parent);
  const siblings=fs.readdirSync(parent).filter(n=>fs.lstatSync(parent+'/'+n).isDirectory());
  assert.deepEqual(siblings,[relative.split('/').at(-1)],'Unexpected other cgroups in this VM docker subtree');
  const rootMount=read('/proc/self/mountinfo').split('\n').find(l=>l.split(' ')[4]==='/'); assert(rootMount.includes('/run/bundles/'+relative.split('/').at(-1)+'/'));
  return {relative,container,parent,siblings,boot:boot(),kernel:{platform:require('node:os').platform(),release:require('node:os').release(),arch:require('node:os').arch()},
    namespaces:{mnt:fs.readlinkSync('/proc/self/ns/mnt'),cgroup:fs.readlinkSync('/proc/self/ns/cgroup'),pid:fs.readlinkSync('/proc/self/ns/pid')},
    mount:read('/proc/self/mountinfo').split('\n').find(l=>l.includes(' - cgroup2 ')),
    parentProperties:{type:read(parent+'/cgroup.type'),subtreeControl:read(parent+'/cgroup.subtree_control')},
    containerProperties:{type:read(container+'/cgroup.type'),subtreeControl:read(container+'/cgroup.subtree_control')}};
};
const startWriter36 = async () => {
  const counter='/tmp/blobot-counter36-'+config.uuid; assert.equal(writer36,null);
  const child=cp.spawn('/usr/bin/node',['-e',"const fs=require('node:fs');let n=0;setInterval(()=>fs.writeFileSync(process.argv[1],String(++n)),10)",counter],{stdio:'ignore'});
  writer36={child,counter};for(let n=0;n<100&&Number(read(counter)??0)<3;n++)await delay(10); assert(Number(read(counter))>=3);
  return {pid:child.pid,cgroup:read('/proc/'+child.pid+'/cgroup').trim(),counter:read(counter)};
};
const freeze36 = async () => {
  quiet(); assert.equal(sibling36,null); const scope=originalScope36();
  const name='blobot-maintenance36-'+config.uuid, dir=scope.parent+'/'+name;
  assert(!fs.existsSync(dir)); fs.mkdirSync(dir); sibling36={...scope,dir,name};
  try {
    fs.writeFileSync(dir+'/cgroup.procs',String(process.pid));
    assert.equal(read('/proc/self/cgroup').trim(),'0::/docker/'+name); assert.deepEqual(cgroupPids(dir),[process.pid]);
    assert(!cgroupPids(scope.container).includes(process.pid));
    fs.writeFileSync(scope.container+'/cgroup.freeze','1'); await waitFrozen(scope.container,1);
    const initialPids=cgroupPids(scope.container); sibling36.initialPids=initialPids;
    sibling36.counter=writer36?read(writer36.counter):null;
    return {...scope,maintenance:dir,maintenancePids:cgroupPids(dir),frozenPids:initialPids,events:read(scope.container+'/cgroup.events'),counter:sibling36.counter};
  }catch(e){await thaw36();throw e;}
};
const observeFrozen36 = async () => {
  assert(sibling36); const r=sibling36; assert.match(read(r.container+'/cgroup.events'),/^frozen 1$/m);
  if(writer36)assert.equal(read(writer36.counter),r.counter);
  const marker='/tmp/blobot-exec36-'+config.uuid; assert.equal(fs.existsSync(marker),false);
  const processes=cgroupPids(r.container).map(pid=>({pid,comm:read('/proc/'+pid+'/comm')?.trim(),cgroup:read('/proc/'+pid+'/cgroup')?.trim(),state:read('/proc/'+pid+'/status')?.match(/^State:\s+(.+)$/m)?.[1]}));
  const digest=await archive(false); if(writer36)assert.equal(read(writer36.counter),r.counter); assert.equal(fs.existsSync(marker),false);
  return {events:read(r.container+'/cgroup.events'),counter:r.counter,markerAbsent:true,processes,newPids:processes.filter(p=>!r.initialPids.includes(p.pid)),digest};
};
const thaw36 = async () => {
  if(!sibling36)return; const r=sibling36;
  // Releasing the complete container admits Docker startup by concurrent sbx exec.
  quiesced=false; fs.writeFileSync(r.container+'/cgroup.freeze','0'); await waitFrozen(r.container,0);
  fs.writeFileSync(r.container+'/cgroup.procs',String(process.pid)); assert.equal(read('/proc/self/cgroup').trim(),'0::'+r.relative);
  assert.deepEqual(cgroupPids(r.dir),[]); fs.rmdirSync(r.dir); sibling36=null;
  if(writer36) {for(let n=0;n<100&&read(writer36.counter)===r.counter;n++)await delay(10); assert.notEqual(read(writer36.counter),r.counter);}
  return {originalMembershipRestored:true,maintenanceRemoved:!fs.existsSync(r.dir),counter:writer36?read(writer36.counter):null,events:read(r.container+'/cgroup.events')};
};
const stopWriter36 = async () => {if(writer36){writer36.child.kill('SIGTERM');await once(writer36.child,'close');fs.rmSync(writer36.counter,{force:true});writer36=null;}fs.rmSync('/tmp/blobot-exec36-'+config.uuid,{force:true});return {stopped:true};};
const freezeAndExit36 = async () => ({frozen:await freeze36(),intendedExit:75,thawIntentionallyOmitted:true});
const recovery36 = () => {const scope=originalScope36();assert.equal(read(scope.container+'/cgroup.freeze').trim(),'0');return {...scope,events:read(scope.container+'/cgroup.events'),maintenanceAbsent:!fs.existsSync(scope.parent+'/blobot-maintenance36-'+config.uuid)};};


const attributes40Python = "# Synthetic guest-only attribute probe. Full inventory reads metadata, not file contents.\nimport os,sys,stat,json,hashlib,subprocess,fcntl,struct,ctypes,io,tarfile,shutil\nVIEW,UUID=sys.argv[1:]\nassert sys.byteorder=='little' and os.uname().machine=='aarch64'\nGETFLAGS,SETFLAGS,GETX,SETX=0x80086601,0x40086602,0x801c581f,0x401c5820\nlibc=ctypes.CDLL(None,use_errno=True)\nlibc.statx.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_uint,ctypes.c_void_p]\nlibc.statx.restype=ctypes.c_int\nENV={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','TZ':'UTC'}\nFLAGS=['--incremental','--sort=name','--format=pax','--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime','--numeric-owner','--acls','--xattrs','--xattrs-include=*','--sparse','--sparse-version=0.0','--atime-preserve=system']\nATTRS={'compressed':0x4,'immutable':0x10,'append':0x20,'nodump':0x40,'encrypted':0x800,'automount':0x1000,'mount_root':0x2000,'verity':0x100000,'dax':0x200000,'write_atomic':0x400000}\ndef err(e):return {'errno':e.errno,'error':e.strerror}\ndef sx(p):\n    b=ctypes.create_string_buffer(256)\n    if libc.statx(-100,os.fsencode(p),0x100|0x800,0x7ff,b):return err(OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno())))\n    attrs,mask=struct.unpack_from('<Q',b.raw,8)[0],struct.unpack_from('<Q',b.raw,56)[0]\n    return {'attributes':attrs,'attributesMask':mask,'bits':{n:bool(attrs&bit) if mask&bit else None for n,bit in ATTRS.items()}}\ndef query(p):\n    s=os.lstat(p);r={'type':'file' if stat.S_ISREG(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'symlink' if stat.S_ISLNK(s.st_mode) else 'other','statx':sx(p)}\n    if r['type'] not in ['file','directory']:return r\n    try:fd=os.open(p,os.O_RDONLY|os.O_NOATIME|os.O_NOFOLLOW|os.O_NONBLOCK)\n    except OSError as e:r['open']=err(e);return r\n    try:\n        for key,request,size in [('getflags',GETFLAGS,4),('fsgetxattr',GETX,28)]:\n            try:\n                b=bytearray(size);fcntl.ioctl(fd,request,b,True)\n                r[key]={'flags':struct.unpack('<I',b)[0]} if key=='getflags' else dict(zip(['xflags','extsize','nextents','projid','cowextsize'],struct.unpack('<5I8x',b)))\n            except OSError as e:r[key]=err(e)\n    finally:os.close(fd)\n    return r\ndef inventory(root):\n    count=0;types={};apis={k:{} for k in ['getflags','fsgetxattr','statx']};examples={k:{} for k in apis};errors=[];h=hashlib.sha256()\n    def visit(p,relative):\n        nonlocal count\n        try:\n            r=query(p);count+=1;types[r['type']]=types.get(r['type'],0)+1\n            h.update(json.dumps([relative,r],sort_keys=True,separators=(',',':')).encode())\n            if 'open' in r:errors.append({'path':relative,**r['open']})\n            for api in apis:\n                if api not in r:continue\n                key=json.dumps(r[api],sort_keys=True,separators=(',',':'));apis[api][key]=apis[api].get(key,0)+1\n                if key not in examples[api]:examples[api][key]=relative\n            if r['type']=='directory':\n                for name in sorted(os.listdir(p)):visit(p+'/'+name,relative.rstrip('/')+'/'+name)\n        except OSError as e:errors.append({'path':relative,**err(e)})\n    visit(root,'/')\n    return {'count':count,'types':types,'apis':{api:[{'value':json.loads(k),'count':n,'example':examples[api][k]} for k,n in values.items()] for api,values in apis.items()},'errors':errors,'sha256':h.hexdigest()}\ndef setting(p,api,before,bit,enabled):\n    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)\n    try:\n        if api=='getflags':\n            value=before['flags']|bit if enabled else before['flags'];b=struct.pack('<I',value);fcntl.ioctl(fd,SETFLAGS,b)\n        else:\n            value=before['xflags']|bit if enabled else before['xflags'];b=struct.pack('<5I8x',value,before['extsize'],before['nextents'],before['projid'],before['cowextsize']);fcntl.ioctl(fd,SETX,b)\n        return {'ok':True}\n    except OSError as e:return err(e)\n    finally:os.close(fd)\ndef create_tar(root):\n    p=subprocess.run(['tar',*FLAGS,'-C',root,'-cf','-','.'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,timeout=10)\n    assert len(p.stdout)<=1024**2\n    members=[]\n    if p.returncode==0:\n        with tarfile.open(fileobj=io.BytesIO(p.stdout),mode='r:') as tf:\n            members=[{'name':m.name,'type':m.type.decode(),'paxKeys':sorted(m.pax_headers)} for m in tf]\n    return p.stdout,{'exitCode':p.returncode,'stderr':p.stderr.decode(),'bytes':len(p.stdout),'sha256':hashlib.sha256(p.stdout).hexdigest(),'members':members}\ndef extract_tar(data,root):\n    p=subprocess.run(['tar','--incremental','--numeric-owner','--acls','--xattrs','--xattrs-include=*','--delay-directory-restore','-C',root,'-xpf','-'],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,timeout=10)\n    return {'exitCode':p.returncode,'stderr':p.stderr.decode()}\ndef make_item(base,kind,text):\n    os.mkdir(base);p=base+'/item'\n    if kind=='directory':os.mkdir(p);open(p+'/child','w').write(text)\n    else:open(p,'w').write(text)\n    return p\ndef trial(root,api,name,kind,gbit,xbit):\n    base=root+'/'+api+'-'+name+'-'+kind;os.mkdir(base)\n    src,clean,blocked=base+'/source',base+'/clean',base+'/blocked'\n    p=make_item(src,kind,'source synthetic payload\\n');os.mkdir(clean)\n    target=make_item(blocked,kind,'target synthetic payload\\n')\n    before=query(p);target_before=query(target);bit=gbit if api=='getflags' else xbit\n    result={'api':api,'flag':name,'kind':kind,'before':before};source_changed=target_changed=False\n    try:\n        if api not in before or 'errno' in before[api]:result['skip']='source query unavailable';return result\n        baseline_data,result['baselineArchive']=create_tar(src)\n        result['set']=setting(p,api,before[api],bit,True);source_changed=True\n        result['afterSet']=query(p)\n        if not result['set'].get('ok'):return result\n        result['readBackHasRequestedBit']=bool(result['afterSet'][api].get('flags' if api=='getflags' else 'xflags',0)&bit)\n        data,result['archive']=create_tar(src);result['archiveEqualWithFlag']=data==baseline_data\n        if result['archive']['exitCode']==0:\n            result['cleanExtract']=extract_tar(data,clean)\n            if os.path.lexists(clean+'/item'):result['cleanRestored']=query(clean+'/item')\n            result['targetSet']=setting(target,api,target_before[api],bit,True);target_changed=True\n            result['targetBeforeExtract']=query(target)\n            if result['targetSet'].get('ok'):\n                result['protectedExtract']=extract_tar(data,blocked)\n                if os.path.lexists(target):result['targetAfterExtract']=query(target)\n        return result\n    finally:\n        if target_changed and os.path.lexists(target):result['targetRevert']=setting(target,api,target_before[api],bit,False);result['targetAfterRevert']=query(target)\n        if source_changed:result['sourceRevert']=setting(p,api,before[api],bit,False);result['sourceAfterRevert']=query(p)\n        # A failed revert is a hard failure; cleanup must never recursively delete flagged data blindly.\n        for key in ['targetRevert','sourceRevert']:\n            if key in result:assert result[key].get('ok'),json.dumps(result)\n        for q,prior in [(p,before),(target,target_before)]:\n            if os.path.lexists(q):\n                now=query(q)\n                for a in ['getflags','fsgetxattr']:\n                    if a in prior and 'errno' not in prior[a]:assert now[a]==prior[a],json.dumps({'path':q,'before':prior,'after':now})\n        shutil.rmtree(base)\n\nroots={'upper':VIEW+'/opt/blobot-attributes40-'+UUID,'home':'/home/agent/blobot-attributes40-'+UUID,'docker':'/var/lib/docker/blobot-attributes40-'+UUID}\nreport={'interfaces':{'getflags':hex(GETFLAGS),'setflags':hex(SETFLAGS),'fsgetxattr':hex(GETX),'fssetxattr':hex(SETX)},'samples':{},'inventories':{},'trials':[]}\ntry:\n    for root in roots.values():os.mkdir(root);open(root+'/sample','w').write('synthetic attribute sample\\n')\n    samples={'lowerFile':VIEW+'/.rock/metadata.yaml','lowerDirectory':VIEW+'/.rock','upperFile':roots['upper']+'/sample','upperDirectory':roots['upper'],'homeFile':roots['home']+'/sample','homeDirectory':roots['home'],'dockerFile':roots['docker']+'/sample','dockerDirectory':roots['docker']}\n    report['samples']={name:{'path':p.removeprefix(VIEW),**query(p)} for name,p in samples.items()}\n    assert report['samples']['lowerFile']['type']=='file' and report['samples']['lowerDirectory']['type']=='directory'\n    for name,path in [('root',VIEW),('home','/home/agent'),('docker','/var/lib/docker')]:\n        report['inventories'][name]=inventory(path);assert not report['inventories'][name]['errors']\n    for area,root in roots.items():\n        for api in ['getflags','fsgetxattr']:\n            for name,gbit,xbit,kinds in [('immutable',0x10,0x8,['file','directory']),('append',0x20,0x10,['file','directory']),('nodump',0x40,0x80,['file','directory']),('projinherit',0x20000000,0x200,['directory'])]:\n                for kind in kinds:report['trials'].append({'area':area,**trial(root,api,name,kind,gbit,xbit)})\n    report['completed']=True\nfinally:\n    for root in roots.values():\n        if os.path.exists(root):shutil.rmtree(root)\nprint(json.dumps(report,separators=(',',':')))\n";
const attributes40 = () => {
  quiet(); assert(sibling36); assert.match(read(sibling36.container+'/cgroup.events'),/^frozen 1$/m);
  const originalMounts=read('/proc/self/mountinfo'), originalNamespace=fs.readlinkSync('/proc/self/ns/mnt');
  const script=String.raw`
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const config=JSON.parse(process.argv[1]),python=process.argv[2],base='/run/blobot-control40-'+config.uuid,view=base+'/root';
fs.mkdirSync(base,{mode:0o700});fs.mkdirSync(view,{mode:0o700});let mounted=false;
try {
  cp.execFileSync('mount',['--bind','/',view]);mounted=true;
  const mounts=fs.readFileSync('/proc/self/mountinfo','utf8').trim().split('\n');
  const children=mounts.filter(l=>{const p=l.split(' ')[4];return p===view||p.startsWith(view+'/');});assert.equal(children.length,1);
  const result=JSON.parse(cp.execFileSync('/usr/bin/python3',['-c',python,view,config.uuid],{encoding:'utf8',timeout:120000,maxBuffer:8*1024**2,env:{PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',LC_ALL:'C',TZ:'UTC'}}));
  console.log(JSON.stringify({namespace:fs.readlinkSync('/proc/self/ns/mnt'),viewMounts:children,mounts,...result}));
}finally{if(mounted)cp.execFileSync('umount',[view]);fs.rmdirSync(view);fs.rmdirSync(base);}
`;
  const result=JSON.parse(exec('unshare',['--mount','--propagation','private','/usr/bin/node','-e',script,JSON.stringify(config),attributes40Python],{timeout:150000,maxBuffer:8*1024**2}));
  assert.equal(read('/proc/self/mountinfo'),originalMounts);assert.equal(fs.readlinkSync('/proc/self/ns/mnt'),originalNamespace);
  quiet();assert.match(read(sibling36.container+'/cgroup.events'),/^frozen 1$/m);
  return {...result,originalMountNamespaceUnchanged:true};
};
const operations = {
  attributes40,
  originalScope36, startWriter36, freeze36, observeFrozen36, thaw36, stopWriter36, freezeAndExit36, recovery36,
  seedRootfs, rootfsState, driftTargetRootfs, namespaceProbe, freezerProbe, freezeAndExit, freezerRecovery,
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
    if (request.op === 'freezeAndExit' || request.op === 'freezeAndExit36') process.exit(75);
    if (request.op === 'close') break;
  }
})().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; }).finally(() => { clearInterval(monitor); if (restoring) restoring.child.kill(); process.stdin.destroy(); });
