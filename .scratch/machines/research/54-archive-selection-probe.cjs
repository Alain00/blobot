// createStateArchiveVerifier, createSbxArchiveIndex, selectSbxArchiveMembers and seedPython
// are prefixed by the host using the imported compiled functions' .toString() values.
const fs = require('node:fs'), cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const [view, uuid] = process.argv.slice(1), base = view + '/opt/blobot-selection54-' + uuid;
const env = { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C', TZ: 'UTC' };
const attr = ['--numeric-owner', '--acls', '--xattrs', '--xattrs-include=*'];
const create = ['--incremental', '--sort=name', '--format=pax', '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime', ...attr, '--sparse', '--sparse-version=0.0', '--atime-preserve=system'];
const extract = ['--incremental', ...attr, '--delay-directory-restore', '--no-recursion', '--null', '--verbatim-files-from', '--no-wildcards', '--anchored', '--no-unquote'];
const cases = ['identical', 'content-parent-equal', 'mutations', 'hardlink-reference', 'hardlink-merge', 'hardlink-split'];
const report = { cases: {}, scope: 'synthetic aggregate results only', createOptions: create, extractOptions: extract };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function archive(root) {
  const p = cp.spawnSync('tar', [...create, '-C', root, '-cf', '-', '.'], { env, encoding: null, timeout: 15_000, maxBuffer: 2 * 1024 ** 2 });
  if (p.status !== 0 || p.stderr.length) throw new Error('Synthetic archive creation failed.');
  assert(p.stdout.length < 1024 ** 2); return p.stdout;
}
function index(bytes) {
  const idx = createSbxArchiveIndex(createStateArchiveVerifier, crypto.createHash), pieces = [1, 7, 511, 4096, 65536];
  for (let at = 0, n = 0; at < bytes.length; n++) { const size = Math.min(pieces[n % pieces.length], bytes.length - at); idx.write(bytes.subarray(at, at + size)); at += size; }
  return idx.finish();
}
function snapshot(root) {
  const entries = new Map();
  function visit(path, key) {
    const s = fs.lstatSync(path, { bigint: true });
    entries.set(key, [s.mode, s.uid, s.gid, s.size, s.nlink, s.ino, s.dev, s.mtimeNs, s.ctimeNs].map(String).join(':'));
    if (s.isDirectory()) for (const name of fs.readdirSync(path, { encoding: 'buffer' })) visit(Buffer.concat([Buffer.from(path), Buffer.from('/'), name]), key + '/' + name.toString('latin1'));
  }
  visit(root, '.'); return entries;
}
function equalSnapshots(a, b) { return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v); }
function selectedKeys(selection) {
  if (selection === null) return new Set();
  assert(Buffer.isBuffer(selection) && selection.length > 0 && selection.at(-1) === 0);
  return new Set(selection.subarray(0, -1).toString('latin1').split('\0').map(n => n.replace(/\/$/, '')));
}
async function restore(bytes, target, selection) {
  if (selection === null) return { invoked: false, exitCode: null, stderrBytes: 0 };
  assert(selection.length > 0);
  // Node's stdio:'pipe' cannot be reopened via /proc/self/fd/N. Reuse research52's memfd.
  const helper = String.raw`
import os,sys,json,struct,subprocess
raw=sys.stdin.buffer.read(2*1024**2+1);assert len(raw)<=2*1024**2
n=struct.unpack('>I',raw[:4])[0];assert 0<n<len(raw)-4
names,data=raw[4:4+n],raw[4+n:];assert names.endswith(b'\0')
fd=os.memfd_create('synthetic-selection54',0)
try:
 assert os.write(fd,names)==len(names);os.lseek(fd,0,os.SEEK_SET)
 p=subprocess.run(['tar',*json.loads(sys.argv[2]),'-C',sys.argv[1],'-xpf','-','-T','/proc/self/fd/'+str(fd)],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,pass_fds=(fd,),timeout=15)
 print(json.dumps({'invoked':True,'exitCode':p.returncode,'stderrBytes':len(p.stderr),'stdoutBytes':len(p.stdout),'listTransport':'memfd'}))
finally:os.close(fd)
`;
  const header = Buffer.alloc(4); header.writeUInt32BE(selection.length);
  return JSON.parse(cp.execFileSync('/usr/bin/python3', ['-B', '-c', helper, target, JSON.stringify(extract)], {
    env, input: Buffer.concat([header, selection, bytes]), encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 ** 2,
  }));
}
(async () => {
  report.tarVersion = cp.execFileSync('tar', ['--version'], { env, encoding: 'utf8' }).split('\n')[0];
  cp.execFileSync('/usr/bin/python3', ['-B', '-c', seedPython, base], { env, timeout: 10_000 });
  for (const name of cases) {
    const root = base + '/' + name, source = root + '/source', target = root + '/target';
    const r = {}; report.cases[name] = r;
    try {
      const sentinelBefore = snapshot(root + '/outside'), before = snapshot(target);
      const src = archive(source), dst = archive(target), a = index(src), b = index(dst);
      r.sourceArchive = { bytes: src.length, sha256: sha(src), members: a.size };
      r.beforeArchive = { bytes: dst.length, sha256: sha(dst), members: b.size };
      r.sourceRepeatedIdentical = archive(source).equals(src);
      const selection = selectSbxArchiveMembers(a, b), selected = selectedKeys(selection);
      r.selection = { isNull: selection === null, bytes: selection?.length ?? 0, members: selected.size,
        directChangedMembers: [...a].filter(([key, entry]) => entry.sha256 !== b.get(key)?.sha256).length };
      r.initialDirectoryMembersEqual = [...a].filter(([, e]) => e.type === 53).every(([k, e]) => e.sha256 === b.get(k)?.sha256);
      if (name === 'content-parent-equal') r.unchangedAncestorsSelected = ['.', './a', './a/b'].every(k => selected.has(k));
      if (name === 'hardlink-reference') {
        r.referencePayloadChanged = a.get('./links/a').sha256 !== b.get('./links/a').sha256;
        r.unchangedHardlinkMembers = ['./links/b', './links/c'].filter(k => a.get(k).type === 49 && a.get(k).sha256 === b.get(k)?.sha256).length;
        r.unchangedHardlinkDependentsSelected = ['./links/b', './links/c'].every(k => selected.has(k));
      }
      const referenceBefore = name.startsWith('hardlink-') ? fs.statSync(target + '/links/a', { bigint: true }).ino : undefined;
      r.restore = await restore(src, target, selection);
      const afterBytes = archive(target), after = index(afterBytes);
      r.afterArchive = { bytes: afterBytes.length, sha256: sha(afterBytes), members: after.size };
      r.fullPaxEqual = afterBytes.equals(src);
      r.mismatchedMemberCount = [...new Set([...a.keys(), ...after.keys()])].filter(k => a.get(k)?.sha256 !== after.get(k)?.sha256).length;
      r.sentinelUnchanged = equalSnapshots(sentinelBefore, snapshot(root + '/outside'));
      r.noopMetadataExact = selection === null ? equalSnapshots(before, snapshot(target)) : null;
      r.sourceUnchanged = archive(source).equals(src);
      if (name.startsWith('hardlink-')) {
        const ino = ['a', 'b', 'c'].map(n => fs.statSync(target + '/links/' + n, { bigint: true }).ino);
        r.hardlinkGraphCorrect = name === 'hardlink-split' ? new Set(ino).size === 3 : new Set(ino).size === 1;
        r.referenceInodeReplaced = referenceBefore !== ino[0];
      }
      r.passed = r.fullPaxEqual && r.mismatchedMemberCount === 0 && r.sourceRepeatedIdentical && r.sourceUnchanged && r.sentinelUnchanged && (r.restore.invoked ? r.restore.exitCode === 0 && r.restore.stderrBytes === 0 : r.noopMetadataExact);
    } catch (e) { r.passed = false; r.failure = { name: e.name, message: /^Machine state /.test(e.message) ? e.message : 'Synthetic probe failed before complete archive comparison.' }; }
  }
  report.completed = true; report.allCasesPassed = Object.values(report.cases).every(c => c.passed);
})().catch(e => { report.completed = false; report.failure = { name: e.name, message: 'Synthetic setup failed.' }; }).finally(() => {
  fs.rmSync(base, { recursive: true, force: true }); report.cleanup = { syntheticTreeRemoved: !fs.existsSync(base) };
  console.log(JSON.stringify(report));
});
