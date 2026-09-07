// Synthetic RC5 measurement; never uses the host Docker Engine or host data mounts.
// Only the caller-supplied, initially absent candidate and one UUID box are removed.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';
import { sbxKit } from '../../../packages/core/dist/machines/sbx/kit.js';

if (process.env.BLOBOT_LIVE_SBX_EXPLICIT_DOCKER !== '1') throw new Error('Explicit opt-in required');
const [tarPath, candidate, expectedManifest] = process.argv.slice(2);
assert(tarPath?.startsWith('/'));
assert(/^blobot-machine-probe:[a-z0-9-]+$/.test(candidate));
assert(/^sha256:[a-f0-9]{64}$/.test(expectedManifest));
const exec = promisify(execFile), env = sbxClientEnvironment();
const name = `blobot-explicit-${randomUUID()}`;
const temp = await mkdtemp(join(tmpdir(), 'blobot-explicit-docker-'));
const [repository, tag] = candidate.split(':');
const report = { date: new Date().toISOString(), candidate, expectedManifest, commands: [], checks: {}, cleanup: {} };
let intendedBox = false, intendedImage = false, boxId, imageId;
const run = async (args, label, timeout = 60_000) => {
  const start = performance.now();
  try {
    const out = await exec('sbx', args, { env, timeout, maxBuffer: 8 * 1024 ** 2 });
    if (label) report.commands.push({ label, ms: performance.now() - start, code: 0 });
    return out.stdout;
  } catch (e) {
    report.commands.push({ label: label ?? args.slice(0, 2).join(' '), ms: performance.now() - start, code: e.code });
    throw new Error(`Command ${label ?? args.slice(0, 2).join(' ')} failed (${e.code}): ${String(e.stderr ?? '').slice(-2000)}`);
  }
};
const json = async args => JSON.parse(await run(args));
const boxes = async () => (await json(['ls', '--json'])).sandboxes;
const ownImages = async () => (await json(['template', 'ls', '--json'])).images.filter(i => i.tag === tag && (i.repository === repository || i.repository.endsWith('/' + repository)));
const verify = async () => {
  const found = (await boxes()).filter(b => b.name === name);
  assert.equal(found.length, 1); assert.equal(found[0].id, boxId); return found[0];
};
const common = `
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const read=p=>{try{return fs.readFileSync(p,'utf8')}catch(e){if(e.code==='ENOENT')return null;throw e}};
const docker=args=>cp.execFileSync('docker',args,{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
const dockerJSON=args=>JSON.parse(docker(args));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const processes=()=>fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p)).flatMap(p=>{
 try{const comm=read('/proc/'+p+'/comm')?.trim();if(!/^(dockerd|containerd|containerd-shim)/.test(comm))return [];
 return [{pid:Number(p),comm,args:read('/proc/'+p+'/cmdline').split('\\0').filter(Boolean),start:read('/proc/'+p+'/stat').split(') ')[1].split(' ')[19]}]}catch{return []}});
const boot=()=>({id:read('/proc/sys/kernel/random/boot_id').trim(),pid1:read('/proc/1/stat').split(') ')[1].split(' ')[19]});
`;
const guest = async (source, label, uid = '0') => {
  await verify();
  return JSON.parse(await run(['exec', '-u', uid, name, '/usr/bin/node', '-e', common + source], label));
};
const inventoryCode = `
const procs=processes(),configs=[];
for(const p of procs.filter(p=>p.comm==='containerd'||p.comm==='dockerd')){
 let cfg=p.comm==='dockerd'?'/etc/docker/daemon.json':'/etc/containerd/config.toml';
 for(let i=0;i<p.args.length;i++)if(['--config','--config-file','-c'].includes(p.args[i]))cfg=p.args[i+1];else if(/^--config(?:-file)?=/.test(p.args[i]))cfg=p.args[i].split('=',2)[1];
 configs.push({comm:p.comm,path:cfg,text:read(cfg)});
}
let info;try{const i=dockerJSON(['info','--format','{{json .}}']);info={running:true,root:i.DockerRootDir,driver:i.Driver,driverStatus:i.DriverStatus,version:i.ServerVersion,liveRestore:i.LiveRestoreEnabled,security:i.SecurityOptions}}catch{info={running:false}}
const mounts=read('/proc/self/mountinfo').trim().split('\\n');
const capacity=Object.fromEntries(['/home/agent','/var/lib/docker'].map(p=>{
 const m=mounts.filter(l=>l.split(' ')[4]===p).map(l=>{const parts=l.split(' '),dev=parts[2],sectors=read('/sys/dev/block/'+dev+'/size');return {mountinfo:l,device:dev,sectors:sectors?.trim()??null,blockBytes:sectors===null?null:String(BigInt(sectors.trim())*512n)}});
 const s=fs.statfsSync(p,{bigint:true});return [p,{mounts:m,filesystem:Object.fromEntries(['bsize','blocks','bfree','bavail','files','ffree'].map(k=>[k,String(s[k])])),filesystemBytes:String(s.bsize*s.blocks),availableBytes:String(s.bsize*s.bavail)}];
}));
const status=read('/proc/self/status');
console.log(JSON.stringify({boot:boot(),processes:procs,configs,docker:info,mounts,capacity,uid:process.getuid(),groups:process.getgroups(),privileges:{capLastCap:read('/proc/sys/kernel/cap_last_cap').trim(),status:status.split('\\n').filter(l=>/^(Cap|Seccomp|NoNewPrivs)/.test(l))}}));`;
const quiesceCode = `
(async()=>{
 const before=processes(),b=boot();
 const i=dockerJSON(['info','--format','{{json .}}']);assert.equal(i.LiveRestoreEnabled,false);
 assert.equal(docker(['ps','-aq']),'','This fixture never creates Docker containers');
 const daemons=before.filter(p=>p.comm==='dockerd');assert.equal(daemons.length,1);
 const terminate=expected=>{const actual=processes().find(p=>p.pid===expected.pid);if(!actual)return;assert.equal(actual.comm,expected.comm);assert.equal(actual.start,expected.start);process.kill(actual.pid,'SIGTERM')};
 terminate(daemons[0]);
 const end=Date.now()+20000;while(processes().some(p=>p.comm==='dockerd')&&Date.now()<end)await delay(100);
 assert(!processes().some(p=>p.comm==='dockerd'),'dockerd did not exit');
 for(const p of before.filter(p=>p.comm==='containerd'))terminate(p);
 const end2=Date.now()+10000;while(processes().length&&Date.now()<end2)await delay(100);
 assert.equal(processes().length,0,'A Docker/containerd writer remains');
 cp.execFileSync('sync');console.log(JSON.stringify({before,after:processes(),boot:b}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});`;
try {
  assert.equal((await json(['daemon', 'status', '--json'])).status, 'running');
  report.version = await json(['version', '--json']);
  assert.equal(report.version.client.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a');
  assert.equal(report.version.server.revision, report.version.client.revision);
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  assert.equal((await boxes()).length, 0, 'Coordinate exclusive sbx use first');
  assert.equal((await ownImages()).length, 0, 'Do not adopt a preexisting image');
  intendedImage = true;
  await run(['template', 'load', tarPath], 'load-candidate', 120_000);
  const images = await ownImages(); assert.equal(images.length, 1);
  report.loaded = images[0]; imageId = images[0].id;
  assert(expectedManifest.slice(7).startsWith(imageId.replace(/^sha256:/, '')), 'Loaded image differs from parent-supplied manifest');
  const kit = sbxKit({ image: candidate, guestNode: '/usr/bin/node', dataBytes: 8 * 1024 ** 3, workspaceBytes: 512 * 1024 ** 2 });
  kit.security = { privileged: true };
  kit.volumes.push({ path: '/var/lib/docker', size: String(20 * 1024 ** 3), mode: '0700' });
  assert.equal(kit.setup.startup, undefined);
  report.kit = kit;
  await writeFile(join(temp, 'spec.yaml'), JSON.stringify(kit));
  intendedBox = true;
  await run(['create', '--name', name, '--cpus', '2', '--memory', '2g', temp], 'create-explicit-Docker');
  const found = (await boxes()).filter(b => b.name === name); assert.equal(found.length, 1); boxId = found[0].id;
  report.box = { name, id: boxId };
  report.initial = await guest(inventoryCode, 'inventory');
  report.policyAtCleanBoot = await json(['policy', 'log', name, '--json']);
  for (const [path, size] of [['/home/agent', 8 * 1024 ** 3], ['/var/lib/docker', 20 * 1024 ** 3]]) {
    const c = report.initial.capacity[path];
    report.checks[path + 'SingleMount'] = c.mounts.length === 1;
    report.checks[path + 'ExactBlockCapacity'] = c.mounts.length === 1 && c.mounts[0].blockBytes === String(size);
    assert.equal(c.mounts.length, 1); assert.equal(c.mounts[0].blockBytes, String(size));
  }
  const status = Object.fromEntries(report.initial.privileges.status.map(l => l.split(/:\s*/, 2)));
  report.checks.allRootCapabilities = BigInt('0x' + status.CapEff) === (1n << (BigInt(report.initial.privileges.capLastCap) + 1n)) - 1n;
  report.checks.rootSeccompDisabled = status.Seccomp === '0';
  assert(report.checks.allRootCapabilities); assert(report.checks.rootSeccompDisabled);
  report.checks.DockerReadyWithoutStartupHook = report.initial.docker.running;
  if (report.initial.docker.running) {
    report.quiescence = await guest(quiesceCode, 'quiesce-private-daemons');
    report.warm = await guest(inventoryCode, 'independent-warm-exec');
    report.checks.sameVmAcrossWarmExec = JSON.stringify(report.quiescence.boot) === JSON.stringify(report.warm.boot);
    report.checks.independentWarmExecKeepsDockerStopped = report.warm.processes.length === 0 && !report.warm.docker.running;
    assert(report.checks.sameVmAcrossWarmExec);
  }
  report.measurementCompleted = true;
  report.preservationGatePassed = report.checks.independentWarmExecKeepsDockerStopped === true;
} catch (e) { report.measurementCompleted = false; report.error = e.message; process.exitCode = 1; }
finally {
  const errors = [];
  if (intendedBox) try {
    const found = (await boxes()).filter(b => b.name === name);
    if (found.length) { assert.equal(found.length, 1); if (boxId) assert.equal(found[0].id, boxId); await run(['rm', '-f', name], 'remove-owned-box'); }
  } catch (e) { errors.push({ name, error: e.message }); }
  if (intendedImage) try {
    const found = await ownImages();
    if (found.length) { assert.equal(found.length, 1); if (imageId) assert.equal(found[0].id, imageId); await run(['template', 'rm', candidate], 'remove-loaded-candidate'); }
  } catch (e) { errors.push({ candidate, error: e.message }); }
  report.cleanup = { errors, remainingBoxes: (await boxes()).filter(b => b.name === name), remainingImages: await ownImages() };
  if (errors.length || report.cleanup.remainingBoxes.length || report.cleanup.remainingImages.length) process.exitCode = 1;
  await rm(temp, { recursive: true, force: true });
  await writeFile(new URL('./28-explicit-docker-fixture-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ measurementCompleted: report.measurementCompleted, error: report.error, preservationGatePassed: report.preservationGatePassed, checks: report.checks, commands: report.commands, cleanup: report.cleanup }));
}
