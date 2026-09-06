// Guest-only one-shot worker. Supplied via exec arguments; no persistent control file.
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const config = JSON.parse(process.argv[1]), python = process.argv[2];
assert.match(config.uuid, /^[a-f0-9-]{36}$/);
const read = p => fs.readFileSync(p, 'utf8');
const exec = (cmd, args, options = {}) => cp.execFileSync(cmd, args, { encoding: 'utf8', timeout: 20_000, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
const delay = ms => new Promise(r => setTimeout(r, ms));
const processes = () => fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).flatMap(p => {
  try {
    const comm = read('/proc/' + p + '/comm').trim();
    if (!/^(dockerd|containerd|containerd-shim)/.test(comm)) return [];
    return [{ pid: Number(p), comm, start: read('/proc/' + p + '/stat').split(') ')[1].split(' ')[19] }];
  } catch { return []; }
});
const waitUntil = async (fn, ms) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await delay(50); assert(fn()); };
const report = { kernel: require('node:os').release(), arch: require('node:os').arch(), bootId: read('/proc/sys/kernel/random/boot_id').trim(), workerPid: process.pid };
let scope, maintenance;
(async () => {
  assert.equal(exec('docker', ['ps', '-q']), '');
  assert.equal(JSON.parse(exec('docker', ['info', '--format', '{{json .}}'])).LiveRestoreEnabled, false);
  report.dockerBefore = processes(); assert.equal(report.dockerBefore.filter(p => p.comm === 'dockerd').length, 1);
  const terminate = expected => { const actual = processes().find(p => p.pid === expected.pid); if (!actual) return; assert.deepEqual(actual, expected); process.kill(actual.pid, 'SIGTERM'); };
  terminate(report.dockerBefore.find(p => p.comm === 'dockerd'));
  await waitUntil(() => !processes().some(p => p.comm === 'dockerd'), 20_000);
  for (const p of report.dockerBefore.filter(p => p.comm === 'containerd')) terminate(p);
  await waitUntil(() => processes().length === 0, 10_000); exec('sync', []);
  report.dockerAfter = processes();
  const relative = read('/proc/self/cgroup').trim().match(/^0::(\/docker\/[a-f0-9]{64})$/)?.[1]; assert(relative);
  assert.equal(read('/proc/1/cgroup').trim(), '0::' + relative);
  scope = '/sys/fs/cgroup' + relative;
  const parent = '/sys/fs/cgroup/docker';
  const siblings = fs.readdirSync(parent).filter(n => fs.lstatSync(parent + '/' + n).isDirectory());
  assert.deepEqual(siblings, [relative.split('/').at(-1)]);
  maintenance = parent + '/blobot-maintenance54-' + config.uuid; assert(!fs.existsSync(maintenance)); fs.mkdirSync(maintenance);
  fs.writeFileSync(maintenance + '/cgroup.procs', String(process.pid));
  assert.equal(read('/proc/self/cgroup').trim(), '0::/docker/blobot-maintenance54-' + config.uuid);
  fs.writeFileSync(scope + '/cgroup.freeze', '1');
  await waitUntil(() => /^frozen 1$/m.test(read(scope + '/cgroup.events')), 10_000);
  report.freeze = { relative, scope, maintenance, events: read(scope + '/cgroup.events') };
  const originalMounts = read('/proc/self/mountinfo'), originalNamespace = fs.readlinkSync('/proc/self/ns/mnt');
  const script = String.raw`
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const config=JSON.parse(process.argv[1]),python=process.argv[2],base='/run/blobot-control54-'+config.uuid,view=base+'/root';
const rootMount=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').find(l=>l.split(' ')[4]==='/');
assert(rootMount.includes(' - overlay '));
const runMount=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').find(l=>l.split(' ')[4]==='/run');assert(runMount.includes(' - tmpfs '));
fs.mkdirSync(base,{mode:0o700});fs.mkdirSync(view,{mode:0o700});let mounted=false;
try {
 cp.execFileSync('mount',['--bind','/',view]);mounted=true;
 const mounts=fs.readFileSync('/proc/self/mountinfo','utf8').trim().split('\n');
 const children=mounts.filter(l=>{const p=l.split(' ')[4];return p===view||p.startsWith(view+'/');});assert.equal(children.length,1);
 const result=JSON.parse(cp.execFileSync('/usr/bin/node',['-e',python,view,config.uuid],{encoding:'utf8',timeout:30000,maxBuffer:2*1024**2,env:{PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',LC_ALL:'C',TZ:'UTC'}}));
 console.log(JSON.stringify({rootFilesystem:'overlay',privateViewMountCount:children.length,result}));
}finally{if(mounted)cp.execFileSync('umount',[view]);fs.rmdirSync(view);fs.rmdirSync(base);}
`;
  report.probe = JSON.parse(exec('unshare', ['--mount', '--propagation', 'private', '/usr/bin/node', '-e', script, JSON.stringify(config), python], { timeout: 45_000, maxBuffer: 4 * 1024 ** 2 }));
  assert.equal(read('/proc/self/mountinfo'), originalMounts); assert.equal(fs.readlinkSync('/proc/self/ns/mnt'), originalNamespace);
  assert.match(read(scope + '/cgroup.events'), /^frozen 1$/m); assert.deepEqual(processes(), []);
  report.originalMountNamespaceUnchanged = true;
  report.completed = true;
})().catch(e => { report.completed = false; report.error = e.stack; process.exitCode = 1; }).finally(async () => {
  try {
    if (scope && maintenance) {
      fs.writeFileSync(scope + '/cgroup.freeze', '0');
      await waitUntil(() => /^frozen 0$/m.test(read(scope + '/cgroup.events')), 10_000);
      fs.writeFileSync(scope + '/cgroup.procs', String(process.pid));
      assert.equal(read(maintenance + '/cgroup.procs').trim(), ''); fs.rmdirSync(maintenance);
      report.thaw = { events: read(scope + '/cgroup.events'), membership: read('/proc/self/cgroup').trim(), maintenanceRemoved: !fs.existsSync(maintenance) };
    }
  } catch (e) { report.cleanupError = e.stack; process.exitCode = 1; }
  console.log(JSON.stringify(report));
});
