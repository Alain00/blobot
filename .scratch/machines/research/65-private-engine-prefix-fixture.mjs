// Explicitly authorized RC5 prefix experiment. No installation, login, pulls or config writes.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, lstat, readdir, realpath, statfs, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';

assert.equal(process.env.BLOBOT_LIVE_ENGINE_PREFIX65, '1');
assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64');
const exec = promisify(execFile), env = sbxClientEnvironment();
const archive = '/private/tmp/blobot-sbx-rc5-install.wsOUYz/DockerSandboxes-darwin.tar.gz';
const expectedSha = '670ce2f469fe2a9d36046e448eb69769c0ebf77ac8ad9215b657dfd4c073916a';
const revision = 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a';
const previous = '/opt/homebrew/bin/sbx';
const temp = await mkdtemp('/private/tmp/wayfinder-engine65-');
const prefix = join(temp, 'engine', 'v0.42.0-rc5'), privateBin = join(prefix, 'bin', 'sbx');
const privateEnv = { ...env, PATH: join(prefix, 'bin') + ':/usr/bin:/bin:/usr/sbin:/sbin' };
const uuid = randomUUID(), name = 'wayfinder-prefix65-' + uuid;
const report = { started: new Date().toISOString(), uuid, commands: [], diskChecks: [], cleanup: {} };
let oldStopped = false, boxIntended = false, boxId, active = previous;
const sha = async path => { const h = createHash('sha256'); for await (const chunk of createReadStream(path)) h.update(chunk); return h.digest('hex'); };
const disk = async label => { const s = await statfs(temp, { bigint: true }); const n = s.bavail * s.bsize; report.diskChecks.push({ label, availableBytes: String(n) }); assert(n >= 2n * 1024n ** 3n, 'disk-floor'); };
async function run(bin, args, label, options = {}) {
  const start = performance.now();
  try { const r = await exec(bin, args, { env: bin === privateBin ? privateEnv : env, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 ** 2, ...options }); report.commands.push({ label, code: 0, ms: Math.round(performance.now() - start) }); return r; }
  catch (e) { report.commands.push({ label, code: e.code ?? null, signal: e.signal ?? null, ms: Math.round(performance.now() - start) }); throw new Error(label + ' failed (code ' + String(e.code) + ')'); }
}
const json = async (bin, args, label) => JSON.parse((await run(bin, args, label)).stdout);
const boxes = async bin => (await json(bin, ['ls', '--json'], 'sandbox-inventory')).sandboxes;
const images = async bin => (await json(bin, ['template', 'ls', '--json'], 'template-inventory')).images.map(({ id, repository, tag }) => ({ id, repository, tag }));
const diagnostic = async bin => { const d = await json(bin, ['diagnose', '--json'], 'diagnose-sanitized'); return { version: d.version, checks: d.checks.map(({ name, status }) => ({ name, status })), summary: d.summary }; };
async function daemonPaths() {
  const out = (await run('/bin/ps', ['-axo', 'pid=,ppid=,command='], 'daemon-path-observation')).stdout;
  return out.split('\n').flatMap(line => { const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+) daemon start$/); return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), executable: m[3] }] : []; });
}
const version = async bin => { const v = await json(bin, ['version', '--json'], 'engine-version'); assert.equal(v.client.revision, revision); assert.equal(v.server.revision, revision); assert.equal(v.server.state, 'running'); return v; };
async function start(bin) { await run(bin, ['daemon', 'start', '-d'], bin === privateBin ? 'start-private-daemon' : 'restore-previous-daemon'); active = bin; return version(bin); }
async function walk(dir) { const paths = []; for (const name of await readdir(dir)) { const path = join(dir, name), s = await lstat(path); paths.push({ name: relative(prefix, path), type: s.isDirectory() ? 'directory' : s.isFile() ? 'regular' : 'other', mode: (s.mode & 0o7777).toString(8), size: s.isFile() ? s.size : 0 }); if (s.isDirectory()) paths.push(...await walk(path)); } return paths.sort((a,b)=>a.name.localeCompare(b.name)); }
try {
  await disk('before-extraction');
  report.before = { sandboxCount: (await boxes(previous)).length, version: await version(previous), templates: await images(previous), previousExecutable: previous, previousResolvedExecutable: await realpath(previous) };
  assert.equal(report.before.sandboxCount, 0);
  const initialDaemons = await daemonPaths(); assert.equal(initialDaemons.length, 1); assert.equal(await realpath(initialDaemons[0].executable), report.before.previousResolvedExecutable);
  report.before.daemonMatchesPreviousExecutable = true;
  assert.equal((await json(previous, ['settings', 'get', '--json', 'ssh.agentForwardingEnabled'], 'check-ssh-forwarding-disabled')).value, false);
  report.archive = { bytes: (await lstat(archive)).size, sha256: await sha(archive) }; assert.equal(report.archive.sha256, expectedSha);
  const code = `import tarfile,json,sys\nwith tarfile.open(sys.argv[1],'r:gz') as t:\n print(json.dumps([dict(name=m.name,type=m.type.decode(),mode=oct(m.mode)[2:],size=m.size,paxKeys=sorted(m.pax_headers)) for m in t]))`;
  report.archive.members = JSON.parse((await run('/usr/bin/python3', ['-c', code, archive], 'read-public-archive-manifest')).stdout);
  const seen = new Set();
  for (const m of report.archive.members) { assert(!m.name.startsWith('/') && !m.name.split('/').some(x => x === '..' || x === '.' || x === '')); assert(['0','5'].includes(m.type)); assert(!seen.has(m.name)); seen.add(m.name); }
  assert.equal(report.archive.members.length, 59);
  await mkdir(prefix, { recursive: true, mode: 0o700 });
  await run('/usr/bin/tar', ['-xzf', archive, '-C', prefix], 'native-tar-extraction');
  report.extracted = { paths: await walk(prefix), cliSha256: await sha(privateBin), previousCliSha256: await sha(report.before.previousResolvedExecutable) };
  assert.equal(report.extracted.cliSha256, report.extracted.previousCliSha256);
  const excludedAppleDouble = 'libexec/._nerdbox-rootfs-arm64.erofs';
  for (const m of report.archive.members) { const actual = report.extracted.paths.find(p=>p.name===m.name); if (!actual && m.name === excludedAppleDouble) continue; assert(actual, 'missing-public-member'); assert.equal(actual.type, m.type === '0' ? 'regular' : 'directory'); assert.equal(actual.mode, m.mode); assert.equal(actual.size, m.size); }
  report.extracted.appleDoubleMaterializedAsFile = report.extracted.paths.some(p=>p.name===excludedAppleDouble);
  report.signatures = [];
  for (const rel of ['bin/sbx','bin/llmman','libexec/containerd-shim-nerdbox-v1','libexec/lib/libsailor.dylib','libexec/mkfs.ext4','libexec/mkfs.erofs','libexec/nerdbox-rootfs-arm64.erofs']) {
    await run('/usr/bin/codesign', ['--verify', '--strict', join(prefix, rel)], 'verify-signature-' + rel);
    const display = await run('/usr/bin/codesign', ['--display', '--verbose=4', join(prefix, rel)], 'display-signature-' + rel);
    report.signatures.push({ path: rel, strictValid: true, team: display.stderr.match(/^TeamIdentifier=(.+)$/m)?.[1] ?? null, authorities: [...display.stderr.matchAll(/^Authority=(.+)$/mg)].map(m=>m[1]) });
  }
  const ent = await run('/usr/bin/codesign', ['--display', '--entitlements', ':-', join(prefix,'libexec/containerd-shim-nerdbox-v1')], 'shim-entitlement');
  report.hypervisorEntitlement = /<key>com.apple.security.hypervisor<\/key>\s*<true\/>/.test(ent.stdout + ent.stderr); assert(report.hypervisorEntitlement);
  report.rootfsXattrNames = (await run('/usr/bin/xattr', [join(prefix,'libexec/nerdbox-rootfs-arm64.erofs')], 'rootfs-signature-xattr-names')).stdout.trim().split('\n').filter(Boolean);
  assert(report.rootfsXattrNames.includes('com.apple.cs.CodeSignature'));
  report.before.diagnose = await diagnostic(previous);
  await disk('before-daemon-handoff'); assert.deepEqual(await boxes(previous), []);
  console.log(JSON.stringify({ stage: 'validated-prefix', archiveMembers: report.archive.members.length, diskEntries: report.extracted.paths.length, signaturesValid: report.signatures.length }));
  oldStopped = true;
  await run(previous, ['daemon', 'stop'], 'stop-empty-previous-daemon');
  report.stoppedStatus = (await json(previous, ['daemon','status','--json'], 'stopped-daemon-status')).status;
  assert.equal((await daemonPaths()).length, 0);
  report.private = { version: await start(privateBin) };
  const privateDaemons = await daemonPaths(); assert.equal(privateDaemons.length, 1); assert.equal(await realpath(privateDaemons[0].executable), privateBin);
  report.private.actualDaemonExecutableWithinPrefix = true;
  report.private.diagnose = await diagnostic(privateBin);
  assert.deepEqual(await images(privateBin), report.before.templates);
  const localShell = report.before.templates.filter(i => i.id === '5fc81bc7a127' && i.tag === 'shell-docker'); assert.equal(localShell.length, 1);
  const kitDir = join(temp,'kit'); await mkdir(kitDir);
  const kit = { schemaVersion:'2', kind:'sandbox', name:'wayfinder-prefix65', sandbox:{ image:'docker.io/docker/sandbox-templates:shell-docker', entrypoint:['/bin/sh'], command:{ default:['-c','printf prefix65'] } }, security:{privileged:true}, credentials:[], permissions:{network:{allow:[],deny:[]}}, volumes:[{path:'/home/agent',size:String(512*1024**2),mode:'0700'},{path:'/var/lib/docker',size:String(512*1024**2),mode:'0700'}] };
  await writeFile(join(kitDir,'spec.yaml'), JSON.stringify(kit), {mode:0o600}); report.private.kit = kit;
  await disk('before-owned-box'); boxIntended = true;
  await run(privateBin, ['create','--name',name,'--cpus','2','--memory','2g',kitDir], 'create-single-owned-shell', {timeout:60000});
  const found = (await boxes(privateBin)).filter(b=>b.name===name); assert.equal(found.length,1); boxId=found[0].id;
  report.private.box = {id:boxId,name,sourceImageId:localShell[0].id,cpus:2,memoryGiB:2};
  const probe = await run(privateBin, ['exec',name,'/bin/sh','-c','test "$(uname -m)" = aarch64 && printf prefix65-ok'], 'guest-shell-probe');
  assert.equal(probe.stdout.trim(),'prefix65-ok'); report.private.guestShellProbe = 'prefix65-ok';
  const ps = (await run('/bin/ps',['-axo','pid=,command='],'private-shim-process')).stdout;
  const shims = ps.split('\n').filter(line=>line.includes(join(prefix,'libexec/containerd-shim-nerdbox-v1')));
  assert.equal(shims.length,1); const shimPid = Number(shims[0].trim().split(/\s+/)[0]);
  report.private.shimExecutableWithinPrefix = true;
  const openFiles = (await run('/usr/sbin/lsof',['-p',String(shimPid),'-Fn'],'private-helper-open-files')).stdout;
  report.private.openPrefixPaths = [...new Set(openFiles.split('\n').filter(x=>x.startsWith('n'+prefix+'/')).map(x=>x.slice(prefix.length+2)))].sort();
  assert(report.private.openPrefixPaths.includes('libexec/containerd-shim-nerdbox-v1'));
  assert(report.private.openPrefixPaths.includes('libexec/lib/libsailor.dylib'));
  assert(report.private.openPrefixPaths.includes('libexec/nerdbox-rootfs-arm64.erofs'));
  await disk('after-owned-box'); report.passed = true;
} catch (e) { report.passed = false; report.error = e.message; process.exitCode = 1; }
finally {
  const errors = [];
  if (boxIntended) try { const own = (await boxes(active)).filter(b=>b.name===name); assert(own.length<=1); if(own.length) { if(boxId)assert.equal(own[0].id,boxId); await run(active,['rm','-f',name],'remove-owned-box'); } } catch(e) {errors.push(e.message);}
  if (oldStopped) try {
    const remaining = await boxes(active); assert.equal(remaining.length,0,'foreign-sandboxes-prevent-daemon-restoration');
    await run(active,['daemon','stop'],'stop-empty-private-daemon');
    report.cleanup.restoredVersion = await start(previous);
    const d = await daemonPaths(); assert.equal(d.length,1); assert.equal(await realpath(d[0].executable),report.before.previousResolvedExecutable);
    report.cleanup.previousDaemonExecutableRestored = true;
    report.cleanup.diagnose = await diagnostic(previous);
  } catch(e) {errors.push(e.message);}
  try { report.cleanup.remainingSandboxCount = (await boxes(active)).length; report.cleanup.templatesUnchanged = JSON.stringify(await images(active)) === JSON.stringify(report.before?.templates); await disk('after-cleanup'); } catch(e) {errors.push(e.message);}
  try { const d = await daemonPaths(); assert(!d.some(p=>p.executable.startsWith(temp+'/')),'private-daemon-still-live'); await rm(temp,{recursive:true,force:true}); report.cleanup.privatePrefixRemoved=true; } catch(e) {errors.push(e.message);report.cleanup.privatePrefixRetained=true;}
  report.cleanup.errors=errors;
  if(errors.length) {report.passed=false;process.exitCode=1;}
  report.finished=new Date().toISOString();
  await writeFile(new URL('./65-private-engine-prefix-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,error:report.error,private:report.private ? {daemon:report.private.actualDaemonExecutableWithinPrefix,guest:report.private.guestShellProbe,shim:report.private.shimExecutableWithinPrefix,openPrefixPaths:report.private.openPrefixPaths} : null,cleanup:report.cleanup}));
}
