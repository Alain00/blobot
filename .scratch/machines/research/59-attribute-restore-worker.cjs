// Synthetic owned volumes only. Payloads, paths and metadata remain guest-local.
const fs = require('node:fs'), cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const config = JSON.parse(process.argv[1]), definitions = JSON.parse(process.argv[3]);
const functionOf = source => new Function('return (' + source + ')')();
const prepare = functionOf(process.argv[2]);
const verify = functionOf(definitions.verify), index = functionOf(definitions.index), select = functionOf(definitions.select);
const read = functionOf(definitions.read), receive = functionOf(definitions.receive);
const codec = functionOf(definitions.attributeCodec)();
const attributes = functionOf(definitions.attributes)(cp, codec, definitions.attributeScript);
const report = { role: config.role, checks: {}, completed: false };
(async () => {
  const held = await prepare(fs, cp, { token: config.token, role: 'target' });
  const source = held.views.home, target = held.views.docker;
  // These volumes belong solely to this fresh UUID fixture. No user Machine is admitted.
  for (const tree of [source, target]) for (const name of fs.readdirSync(tree)) fs.rmSync(tree + '/' + name, { recursive: true });
  const cases = [['baseline', 0], ['immutable', 16], ['append', 32], ['nodump', 64], ['noatime', 128],
    ['sync', 8], ['dirsync', 0x10000], ['topdir', 0x20000], ['projinherit', 0x20000000], ['combined', 0x200300f8]];
  const seed = String.raw`
import sys,os,json,fcntl,struct,stat
a,b,cases=json.loads(sys.argv[1]);stamp=1700000000123456789
def flags(p,bits):
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:fcntl.ioctl(fd,0x40086602,struct.pack('<I',0x80000|bits))
 finally:os.close(fd)
for root in [a,b]:
 for name,bits in cases:
  p=root+'/'+name;os.mkdir(p)
  open(p+'/file','w').write('source' if root==a else 'target')
  os.setxattr(p,'user.shared',b'source' if root==a else b'target')
  if root==b:os.setxattr(p,'user.extra',b'remove-me')
  os.utime(p+'/file',ns=(stamp,stamp));os.utime(p,ns=(stamp,stamp))
 os.link(root+'/baseline/file',root+'/hardlink')
os.mkdir(a+'/acl');os.mkdir(b+'/acl')
def acl(uid):
 return struct.pack('<I',2)+b''.join(struct.pack('<HHI',tag,perm,ident) for tag,perm,ident in [(1,7,0xffffffff),(2,5,uid),(4,5,0xffffffff),(16,5,0xffffffff),(32,0,0xffffffff)])
for root,uid in [(a,1234),(b,2345)]:
 for kind in ['access','default']:os.setxattr(root+'/acl','system.posix_acl_'+kind,acl(uid))
open(a+'/acl/file','w').write('source-acl');open(b+'/acl/file','w').write('old-acl')
open(b+'/protected-extra','w').write('remove-me');flags(b+'/protected-extra',16)
for name,bits in cases:
 flags(a+'/'+name,bits)
 if bits in [8,16,32,64,128]:flags(a+'/'+name+'/file',bits)
 flags(b+'/'+name,16|32)
os.utime(a,ns=(stamp,stamp));os.utime(b,ns=(stamp,stamp))
`;
  cp.execFileSync('/usr/bin/python3', ['-I', '-B', '-c', seed, JSON.stringify([source, target, cases])], { stdio: ['ignore', 'pipe', 'pipe'] });
  held.assertHeld();
  const readTree = async (path, capture = false) => {
    const chunks = [];
    const result = await read({ commands: cp, crypto }, { verify, index }, {
      path, maxBytes: 1024 ** 2, assertHeld: held.assertHeld,
      ...(capture ? { async emit(chunk) { chunks.push(Buffer.from(chunk)); } } : {}),
    });
    const description = { members: result.members, attributes: await attributes.inspect(path, result.members, held.assertHeld) };
    attributes.preflight(description);
    return { ...result, description, bytes: capture ? Buffer.concat(chunks) : undefined };
  };
  const a = await readTree(source, true), b = await readTree(target);
  const plan = attributes.plan(target, a.description, b.description, held.assertHeld);
  assert(plan.changed.size > 0);
  const receiver = await receive({ fs, commands: cp, crypto }, { verify, index, select }, {
    path: target, privateDirectory: target.slice(0, -'/docker'.length), source: a.members, target: b.members,
    changedAttributes: plan.changed, assertHeld: held.assertHeld,
    prepareAttributes: selection => plan.prepare(selection), finishAttributes: () => plan.finish(),
  });
  for (let at = 0; at < a.bytes.length; at += 997) await receiver.write(a.bytes.subarray(at, at + 997));
  await receiver.finish();
  const restored = await readTree(target);
  assert.deepEqual(restored.digest, a.digest); assert(restored.description.attributes.equals(a.description.attributes));
  assert.equal(fs.existsSync(target + '/protected-extra'), false);
  assert.equal(fs.statSync(target + '/baseline/file').ino, fs.statSync(target + '/hardlink').ino);
  report.checks.paxAndAllAttributeRecordsEqual = true;
  report.checks.protectedExtraRemoved = true;
  report.checks.hardlinkRestored = true;
  report.checks.tenDirectoryPoliciesRestored = true;
  report.checks.surplusXattrsAndAclReconciled = true;
  report.counts = { members: a.members.size, attributeBytes: a.description.attributes.length, archiveBytes: a.bytes.length };
  // Add an unqueryable special object to source. Its replay must refuse before target mutation.
  fs.symlinkSync('/synthetic/dangling', source + '/unsupported-symlink');
  const unsupported = await readTree(source), before = await readTree(target);
  const refusal = attributes.plan(target, unsupported.description, before.description, held.assertHeld);
  await assert.rejects(refusal.prepare(select(unsupported.members, before.members, refusal.changed)), /attributes could not be verified/);
  const after = await readTree(target);
  assert.deepEqual(after.digest, before.digest); assert(after.description.attributes.equals(before.description.attributes));
  report.checks.unknownSpecialRefusedBeforeCandidateMutation = true;
  // No attempt is made to clear all fixture flags: these volumes die with their owned VM.
  await held.dispose(); report.checks.viewsDisposed = true; report.completed = true;
})().catch(error => { report.error = String(error.stack); process.exitCode = 1; })
  .finally(() => process.stdout.write(JSON.stringify(report)));
