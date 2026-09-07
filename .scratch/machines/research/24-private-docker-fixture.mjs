// Opt-in, synthetic RC5 Docker preservation. Only UUID-owned sbx objects are changed.
// No host mounts, credentials, inference, network pulls, global settings or host data archive.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';
import { sbxKit } from '../../../packages/core/dist/machines/sbx/kit.js';

if (process.env.BLOBOT_LIVE_SBX_PRIVATE_DOCKER !== '1') throw new Error('Explicit opt-in required');
const exec = promisify(execFile), env = sbxClientEnvironment(), uuid = randomUUID();
const prefix = `blobot-dind-${uuid}`, template = `blobot-private-docker-fixture:${uuid}`;
const image = `blobot-inner-fixture:${uuid}`, container = `blobot-inner-${uuid}`, volume = `blobot-volume-${uuid}`;
const refs = new Map(), intended = new Set();
const temp = await mkdtemp(join(tmpdir(), 'blobot-private-docker-fixture-'));
const report = { date: new Date().toISOString(), scope: 'synthetic-private-Docker-only', commands: [], checks: {}, cleanup: {} };
try {
  const previous = JSON.parse(await readFile(new URL('./24-private-docker-fixture-results.json', import.meta.url), 'utf8'));
  if (!previous.passed) report.previousAttempts = [...(previous.previousAttempts ?? []), { date: previous.date, error: previous.error, commands: previous.commands, cleanup: previous.cleanup }];
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let intendedTemplate = false, savedId;
const run = async (args, label, timeout = 60_000) => {
  const start = performance.now();
  try {
    const r = await exec('sbx', args, { env, timeout, maxBuffer: 8 * 1024 ** 2 });
    if (label) report.commands.push({ label, ms: performance.now() - start, code: 0 });
    return r.stdout;
  } catch (error) {
    report.commands.push({ label: label ?? args.slice(0, 2).join(' '), ms: performance.now() - start, code: error.code, killed: error.killed });
    throw new Error(`Fixture command failed: ${label ?? args.slice(0, 2).join(' ')} (${error.code}): ${(error.stderr ?? '').slice(-2000)}`);
  }
};
const json = async args => JSON.parse(await run(args));
const boxes = async () => (await json(['ls', '--json'])).sandboxes;
const templates = async () => (await json(['template', 'ls', '--json'])).images;
const ownTemplates = async () => (await templates()).filter(x => x.tag === uuid && /(?:^|\/)blobot-private-docker-fixture$/.test(x.repository));
const verify = async ref => {
  const found = (await boxes()).filter(x => x.name === ref.name);
  assert.equal(found.length, 1); assert.equal(found[0].id, ref.id); return found[0];
};
const common = `
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=p=>{try{return fs.readFileSync(p,'utf8')}catch(e){if(e.code==='ENOENT')return null;throw e}};
const docker=args=>cp.execFileSync('docker',args,{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
const dockerJSON=args=>JSON.parse(docker(args));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const processes=()=>fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p)).flatMap(p=>{
 try{const comm=fs.readFileSync('/proc/'+p+'/comm','utf8').trim();
 if(!/^(dockerd|containerd|containerd-shim)/.test(comm))return [];
 return [{pid:Number(p),comm,args:fs.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0').filter(Boolean),
 start:fs.readFileSync('/proc/'+p+'/stat','utf8').split(') ')[1].split(' ')[19]}]}catch{return []}});
const boot=()=>({id:read('/proc/sys/kernel/random/boot_id').trim(),pid1:read('/proc/1/stat').split(') ')[1].split(' ')[19]});
const files=paths=>Object.fromEntries(paths.map(p=>{const s=fs.statSync(p);return [p,{sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),mode:s.mode&511,uid:s.uid,gid:s.gid}]}));
`;
const guest = async (ref, source, label, uid = '0') => {
  await verify(ref);
  return JSON.parse(await run(['exec', '-u', uid, ref.name, '/usr/bin/node', '-e', common + source], label));
};
const inventoryCode = `
const procs=processes(),configs=[];
for(const p of procs.filter(p=>p.comm==='containerd'||p.comm==='dockerd')){
 let cfg=p.comm==='dockerd'?'/etc/docker/daemon.json':'/etc/containerd/config.toml';
 for(let i=0;i<p.args.length;i++)if(['--config','--config-file','-c'].includes(p.args[i]))cfg=p.args[i+1];else if(/^--config(?:-file)?=/.test(p.args[i]))cfg=p.args[i].split('=',2)[1];
 const text=read(cfg);configs.push({comm:p.comm,path:cfg,text});
}
let info;try{const i=dockerJSON(['info','--format','{{json .}}']);info={running:true,root:i.DockerRootDir,driver:i.Driver,driverStatus:i.DriverStatus,version:i.ServerVersion,liveRestore:i.LiveRestoreEnabled,security:i.SecurityOptions}}catch{info={running:false}}
console.log(JSON.stringify({boot:boot(),processes:procs,configs,docker:info,mounts:read('/proc/self/mountinfo').trim().split('\\n'),uid:process.getuid(),groups:process.getgroups()}));`;
const create = async (part, base, cpus, memory) => {
  const name = `${prefix}-${part}`, kitDir = join(temp, part);
  assert(!(await boxes()).some(x => x.name === name)); await mkdir(kitDir);
  // Reuse the validated synthetic home/workspace kit. /workspace remains empty and is
  // fixture-only, not the host-worktree product architecture. Docker storage is automatic.
  await writeFile(join(kitDir, 'spec.yaml'), JSON.stringify(sbxKit({ image: base,
    guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 })));
  intended.add(name);
  await run(['create', '--name', name, '--cpus', String(cpus), '--memory', memory, kitDir], `create-${part}`);
  const found = (await boxes()).filter(x => x.name === name); assert.equal(found.length, 1);
  const ref = { name, id: found[0].id }; refs.set(name, ref); return ref;
};
const stop = async ref => { await verify(ref); await run(['stop', ref.name], 'stop-outer'); assert.equal((await verify(ref)).status, 'stopped'); };
const quiesceCode = `
(async()=>{
 const before=processes(),b=boot();
 const i=dockerJSON(['info','--format','{{json .}}']);assert.equal(i.LiveRestoreEnabled,false);
 assert.equal(docker(['ps','-q']),'','All synthetic containers must already be stopped');
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
const quiesce = async (ref, label) => {
  const stopped = await guest(ref, quiesceCode, label);
  const warm = await guest(ref, inventoryCode, `${label}-independent-exec`);
  (report.quiescenceTrials ??= []).push({ label, stopped, warm });
  report.checks.sameVmBetweenQuiescenceAndWarmExec = JSON.stringify(warm.boot) === JSON.stringify(stopped.boot);
  report.checks.independentWarmExecKeepsDockerStopped = warm.processes.length === 0 && !warm.docker.running;
  assert.deepEqual(warm.boot, stopped.boot);
  assert.equal(warm.processes.length, 0, 'Independent sbx exec restarted private Docker in the same VM; copying is refused');
  assert.equal(warm.docker.running, false);
  return { stopped, warm };
};
const archiveArgs = roots => ['--sort=name', '--format=pax', '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
  '--acls', '--xattrs', '--xattrs-include=*', '--sparse', '--sparse-version=0.0', '--numeric-owner', '--one-file-system',
  '-C', '/', '-cf', '-', ...roots.map(x => x.slice(1))];
const digest = (ref, roots, label) => guest(ref, `
assert.equal(processes().length,0);const h=crypto.createHash('sha256');const c=cp.spawn('tar',${JSON.stringify(archiveArgs(roots))},{stdio:['ignore','pipe','pipe']});let err='';c.stdout.on('data',d=>h.update(d));c.stderr.on('data',d=>err+=d);c.on('close',code=>{if(code!==0){console.error(err);process.exitCode=1}else console.log(JSON.stringify({sha256:h.digest('hex')}))});`, label);
const copy = async (source, target, roots) => {
  await verify(source); await verify(target);
  const before = await digest(source, roots, 'digest-source-before');
  await guest(target, `assert.equal(processes().length,0);for(const root of ${JSON.stringify(roots)}){assert(root==='/home/agent'||root.startsWith('/var/lib/'));assert.equal(fs.realpathSync(root),root);for(const n of fs.readdirSync(root))fs.rmSync(path.join(root,n),{recursive:true,force:true});}console.log('{}');`, 'clear-new-private-data');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60_000);
  const start = performance.now(); let bytes = 0;
  const reader = spawn('sbx', ['exec', '-u', '0', source.name, 'tar', ...archiveArgs(roots)], { env, signal: controller.signal, stdio: ['ignore', 'pipe', 'pipe'] });
  const writer = spawn('sbx', ['exec', '-i', '-u', '0', target.name, 'tar', '--acls', '--xattrs', '--xattrs-include=*', '--sparse', '--numeric-owner', '-C', '/', '-xpf', '-'], { env, signal: controller.signal, stdio: ['pipe', 'ignore', 'pipe'] });
  const done = child => new Promise((resolve, reject) => { let err='';child.stderr.on('data',d=>err+=d); child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`Synthetic copy process ${code}: ${err.slice(-500)}`))); });
  const count = new Transform({ transform(chunk, encoding, cb) { bytes += chunk.length; cb(null, chunk); } });
  try { await Promise.all([done(reader), done(writer), pipeline(reader.stdout, count, writer.stdin, { signal: controller.signal })]); }
  finally { clearTimeout(timer); controller.abort(); reader.kill(); writer.kill(); }
  const after = await digest(source, roots, 'digest-source-after'), restored = await digest(target, roots, 'digest-target');
  assert.deepEqual(after, before); assert.deepEqual(restored, before);
  return { bytes, ms: performance.now() - start, before, after, restored };
};
const rootFile = '/opt/blobot-private-docker-sentinel', homeFile = '/home/agent/.synthetic-session';
const stateCode = `
const image=dockerJSON(['image','inspect',${JSON.stringify(image)}])[0],container=dockerJSON(['container','inspect',${JSON.stringify(container)}])[0],volume=dockerJSON(['volume','inspect',${JSON.stringify(volume)}])[0];
assert.equal(container.State.Running,false);
console.log(JSON.stringify({image:{id:image.Id,rootfs:image.RootFS},container:{id:container.Id,image:container.Image,status:container.State.Status,restart:container.HostConfig.RestartPolicy,mounts:container.Mounts.map(m=>({type:m.Type,name:m.Name,source:m.Source,destination:m.Destination}))},volume:{name:volume.Name,driver:volume.Driver,mountpoint:volume.Mountpoint},files:files([${JSON.stringify(rootFile)},${JSON.stringify(homeFile)},path.join(volume.Mountpoint,'volume-sentinel')])}));`;
const equivalentState = (actual, expected) => {
  assert.deepEqual(actual.image, expected.image); assert.deepEqual(actual.container, expected.container);
  assert.deepEqual(actual.volume, expected.volume); assert.deepEqual(actual.files, expected.files);
};
try {
  assert.equal((await json(['daemon', 'status', '--json'])).status, 'running');
  report.version = await json(['version', '--json']);
  assert.equal(report.version.client.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a');
  assert.equal(report.version.server.revision, report.version.client.revision);
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  assert.equal((await boxes()).length, 0); assert.equal((await ownTemplates()).length, 0);
  report.base = (await templates()).find(x => x.repository === 'docker.io/docker/sandbox-templates' && x.tag === 'shell-docker'); assert(report.base, 'Cached shell image required');
  const source = await create('source', 'docker/sandbox-templates:shell-docker', 2, '2g');
  report.sourceInitial = await guest(source, inventoryCode, 'inventory-source');
  report.policyAtCleanBoot = await json(['policy', 'log', source.name, '--json']);
  assert.equal(report.sourceInitial.docker.running, true);
  assert.equal(report.sourceInitial.mounts.filter(l => l.split(' ')[4] === '/var/lib/docker').length, 1);
  report.checks.oneAutomaticDockerMount = true;
  report.uid1000Docker = await guest(source, `
const probe=(command,args)=>{try{const i=JSON.parse(cp.execFileSync(command,args,{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}));return {ok:true,server:i.ServerVersion,root:i.DockerRootDir}}catch(e){return {ok:false,code:e.status,stderr:String(e.stderr).trim()}}};
const socket=fs.statSync('/var/run/docker.sock');console.log(JSON.stringify({uid:process.getuid(),groups:process.getgroups(),socket:{uid:socket.uid,gid:socket.gid,mode:socket.mode&511},dockerGroup:read('/etc/group').split('\\n').filter(l=>l.startsWith('docker:')),direct:probe('docker',['info','--format','{{json .}}']),sudo:probe('sudo',['-n','docker','info','--format','{{json .}}'])}));`, 'uid1000-docker-access', '1000');
  // Determine actual containerd storage, rather than assuming /var/lib/containerd.
  const containerdConfig = report.sourceInitial.configs.find(x => x.comm === 'containerd'); assert(containerdConfig?.text);
  const rootMatch = containerdConfig.text.match(/^root\s*=\s*['"]([^'"]+)['"]/m); assert(rootMatch, 'Actual containerd root must be explicit');
  report.containerdRoot = rootMatch[1];
  report.checks.actualContainerdRootMeasured = true;
  assert.equal(report.sourceInitial.docker.root, '/var/lib/docker');
  assert(report.containerdRoot.startsWith('/var/lib/'));
  report.transferRoots = ['/home/agent', '/var/lib/docker', ...(report.containerdRoot.startsWith('/var/lib/docker/') ? [] : [report.containerdRoot])];
  report.seed = await guest(source, `
(async()=>{
 const dir='/tmp/blobot-import-${uuid}';fs.mkdirSync(dir,{recursive:true});
 const copyBinary=(from,to)=>{const dest=path.join(dir,to);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(from,dest);fs.chmodSync(dest,0o755);
 const ldd=cp.execFileSync('ldd',[from],{encoding:'utf8'});for(const line of ldd.split('\\n')){const m=line.match(/=> (\\/[^ ]+)/)||line.match(/^\\s*(\\/[^ ]+)/);if(m){const target=path.join(dir,m[1]);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(m[1],target)}}};
 copyBinary('/bin/dash','/bin/sh');copyBinary('/usr/bin/sleep','/bin/sleep');
 fs.writeFileSync(path.join(dir,'fixture.sh'),'#!/bin/sh\\nprintf "synthetic:${uuid}\\\\n" > /data/volume-sentinel\\nprintf "private-layer:${uuid}\\\\n" > /container-sentinel\\ntrap "exit 0" TERM INT\\nwhile :; do /bin/sleep 1; done\\n',{mode:0o755});
 const tar=cp.spawn('tar',['-C',dir,'-cf','-','.'],{stdio:['ignore','pipe','pipe']}),imp=cp.spawn('docker',['import','-',${JSON.stringify(image)}],{stdio:['pipe','pipe','pipe']});
 let output='',err='';imp.stdout.on('data',d=>output+=d);imp.stderr.on('data',d=>err+=d);tar.stderr.on('data',d=>err+=d);tar.stdout.pipe(imp.stdin);
 const completed=c=>new Promise((resolve,reject)=>{c.on('error',reject);c.on('close',n=>n===0?resolve():reject(new Error('synthetic import failed '+n+': '+err)))});
 await Promise.all([completed(tar),completed(imp)]);
 const createdVolume=docker(['volume','create',${JSON.stringify(volume)}]);
 const cid=docker(['create','--name',${JSON.stringify(container)},'--restart','unless-stopped','--mount',${JSON.stringify('type=volume,source='+volume+',target=/data')},${JSON.stringify(image)},'/bin/sh','/fixture.sh']);
 docker(['start',cid]);await delay(1500);assert.equal(dockerJSON(['inspect',cid])[0].State.Running,true);docker(['stop','--time','5',cid]);
 fs.writeFileSync(${JSON.stringify(rootFile)},'system:${uuid}',{mode:0o640});fs.writeFileSync(${JSON.stringify(homeFile)},'session:${uuid}',{mode:0o600});fs.chownSync(${JSON.stringify(homeFile)},1000,1000);
 fs.rmSync(dir,{recursive:true});console.log(JSON.stringify({imageId:output.trim(),volume:createdVolume,containerId:cid,writerRan:true,stopped:true}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});`, 'seed-real-Docker');
  report.before = await guest(source, stateCode, 'state-before');
  report.quiescenceInitial = await quiesce(source, 'quiesce-source-before-snapshot');
  await stop(source); intendedTemplate = true;
  await run(['template', 'save', source.name, template], 'save-system-layer', 120_000);
  const saved = await ownTemplates(); assert.equal(saved.length, 1); savedId = saved[0].id; report.snapshot = saved[0];
  // A wake starts Docker again; explicitly quiesce before copying any private storage.
  report.sourceAfterWake = await guest(source, inventoryCode, 'source-wake');
  equivalentState(await guest(source, stateCode, 'state-source-after-wake'), report.before);
  report.quiescenceSource = await quiesce(source, 'quiesce-source-for-copy');
  const target = await create('target', template, 3, '3g');
  report.targetInitial = await guest(target, inventoryCode, 'inventory-target');
  assert.equal(report.targetInitial.mounts.filter(l => l.split(' ')[4] === '/var/lib/docker').length, 1);
  assert.equal(report.targetInitial.docker.root, '/var/lib/docker');
  report.quiescenceTarget = await quiesce(target, 'quiesce-target-for-copy');
  report.copy = await copy(source, target, report.transferRoots);
  report.targetBeforeRestart = await guest(target, `assert.equal(processes().length,0);console.log(JSON.stringify({boot:boot(),files:files([${JSON.stringify(rootFile)},${JSON.stringify(homeFile)}])}));`, 'target-remains-quiescent');
  await stop(target);
  report.targetAfterRestart = await guest(target, inventoryCode, 'restart-restored-Docker');
  report.after = await guest(target, stateCode, 'state-restored'); equivalentState(report.after, report.before);
  // Execute the restored image again, then stop, demonstrating a usable restored image/store.
  await guest(target, `docker(['start',${JSON.stringify(container)}]);console.log(JSON.stringify({running:dockerJSON(['inspect',${JSON.stringify(container)}])[0].State.Running}));`, 'run-restored-container');
  await guest(target, `docker(['stop','--time','5',${JSON.stringify(container)}]);const v=dockerJSON(['volume','inspect',${JSON.stringify(volume)}])[0];fs.writeFileSync(path.join(v.Mountpoint,'volume-sentinel'),'replacement-only');console.log('{}');`, 'change-replacement-only');
  report.originalFinal = await guest(source, inventoryCode, 'original-remains-quiescent');
  assert.equal(report.originalFinal.processes.length, 0);
  await stop(source); await guest(source, inventoryCode, 'reopen-original');
  report.originalStateAfter = await guest(source, stateCode, 'original-state-unchanged'); equivalentState(report.originalStateAfter, report.before);
  report.checks = { oneAutomaticDockerMount: true, actualContainerdRootMeasured: true, uid1000DirectDockerWorks: report.uid1000Docker.direct.ok, uid1000SudoDockerWorks: report.uid1000Docker.sudo.ok,
    independentWarmExecKeepsDockerStopped: true, verifiedOpaquePrivateCopy: true, imageContainerVolumeAndFileMetadataPreserved: true,
    restoredImageRuns: true, originalUnaffectedByReplacementWrite: true };
  report.policyAtEnd = await json(['policy', 'log', source.name, '--json']); report.passed = true;
} catch (error) { report.passed = false; report.error = error.message; process.exitCode = 1; }
finally {
  const errors = [];
  for (const name of intended) {
    try { const found = (await boxes()).filter(x => x.name === name); if (!found.length) continue; assert.equal(found.length, 1);
      if (refs.has(name)) assert.equal(found[0].id, refs.get(name).id); await run(['rm', '-f', name], 'remove-owned-box');
    } catch (error) { errors.push({ name, error: error.message }); }
  }
  if (intendedTemplate) {
    try { const found = await ownTemplates(); if (found.length) { assert.equal(found.length, 1); if (savedId) assert.equal(found[0].id, savedId); await run(['template', 'rm', template], 'remove-owned-template'); } }
    catch (error) { errors.push({ template, error: error.message }); }
  }
  report.cleanup = { errors, remainingBoxes: (await boxes()).filter(x => intended.has(x.name)), remainingTemplates: await ownTemplates() };
  if (errors.length || report.cleanup.remainingBoxes.length || report.cleanup.remainingTemplates.length) process.exitCode = 1;
  await rm(temp, { recursive: true, force: true });
  await writeFile(new URL('./24-private-docker-fixture-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, error: report.error, checks: report.checks, commands: report.commands, cleanup: report.cleanup }));
}
