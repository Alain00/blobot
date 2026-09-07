// Private inventories are serialized only into opaque relay data frames, never control replies.
const fs = require('node:fs'), cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { once } = require('node:events');
const config = JSON.parse(process.argv[1]), sources = JSON.parse(process.argv[2]);
const scanner = process.argv[3], seed = process.argv[4];
const functions = Object.fromEntries(Object.entries(sources).map(([k, source]) => [k, new Function('return (' + source + ')')()]));
const env = { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C', TZ: 'UTC' };
let held, stage = 'seed';
const write = async (stream, data) => { if (!stream.write(data)) await once(stream, 'drain'); };
const send = async (type, value) => {
  const data = type === 1 ? Buffer.from(JSON.stringify(value)) : value;
  assert(data.length <= (type === 1 ? 1024 ** 2 : 65536));
  const header = Buffer.alloc(5); header[0] = type; header.writeUInt32BE(data.length, 1);
  await write(process.stdout, header); await write(process.stdout, data);
};
async function* frames() {
  let pending = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= 5) {
      const type = pending[0], length = pending.readUInt32BE(1); assert([1, 2].includes(type)); assert(length <= (type === 1 ? 1024 ** 2 : 65536));
      if (pending.length < length + 5) break;
      const data = pending.subarray(5, 5 + length); pending = pending.subarray(5 + length); yield { type, data };
    }
  }
  assert.equal(pending.length, 0);
}
const input = frames();
async function command(expected) { const f = await input.next(); assert(!f.done && f.value.type === 1); const m = JSON.parse(f.value.data); assert.equal(m.op, expected); return m; }
const runPython = (script, args, maxBuffer = 128 * 1024 ** 2) => cp.execFileSync('/usr/bin/python3', ['-B', '-c', script, ...args], { env, encoding: 'utf8', timeout: 90_000, maxBuffer, stdio: ['pipe', 'pipe', 'pipe'] });
const decodeAttrs = entries => new Map(entries.map(([name, value]) => [Buffer.from(name, 'base64').toString('latin1'), value]));
const api = a => a === undefined ? null : { getflags: a.getflags ?? { missing: true }, fsgetxattr: a.fsgetxattr ?? { missing: true }, statx: a.statx };
const signature = a => JSON.stringify({ api: api(a), xattrs: a?.xattrs });
const unknown = a => a?.getflags?.errno === 25 && a?.fsgetxattr?.errno === 25;
const immutableObserved = a => a?.statx?.attributes !== undefined && (BigInt(a.statx.attributes) & BigInt(a.statx.mask) & 0x10n) !== 0n;
const kind = a => a === undefined ? 'missing' : unknown(a) ? immutableObserved(a) ? 'both-ENOTTY-statx-immutable' : 'both-ENOTTY' : a.getflags?.flags !== undefined ? 'getflags-queryable' : 'ioctl-not-opened';
const add = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
function compare(source, target, localScan) {
  const a = new Map(source.members.map(([path, type, link, sha256]) => {
    const bytes = Buffer.from(path, 'base64'); return [bytes.toString('latin1'), { path: bytes, type, link: Buffer.from(link, 'base64'), sha256 }];
  }));
  const b = target.members, x = decodeAttrs(source.attributes), y = decodeAttrs(localScan.entries);
  assert.equal(a.size, x.size); assert.equal(b.size, y.size);
  assert([...a.keys()].every(k => x.has(k)) && [...b.keys()].every(k => y.has(k)));
  const selection = functions.select(a, b);
  const selected = selection === null ? new Set() : new Set(selection.subarray(0, -1).toString('latin1').split('\0').map(k => k.replace(/\/$/, '')));
  assert(selection === null || selection.length > 0);
  const groups = new Map(), types = { source: {}, target: {}, selected: {}, targetOnly: {} };
  const counts = { shared: 0, sourceOnly: 0, targetOnly: 0, sourceBothENOTTY: 0, sourceBothENOTTYSelected: 0,
    sourceBothENOTTYUnselected: 0, sourceBothENOTTYSelectedWithSamePax: 0, samePaxDifferentAttributes: 0,
    samePaxDifferentAttributesSelected: 0, samePaxDifferentAttributesUnselected: 0, sharedApiDifferent: 0, sharedIdentityDifferent: 0 };
  const samePaxGroups = new Map();
  const typeIncrement = (map, type) => { map[type] = (map[type] ?? 0) + 1; };
  for (const [key, sx] of x) {
    const tx = y.get(key), chosen = selected.has(key), samePax = a.get(key).sha256 === b.get(key)?.sha256;
    typeIncrement(types.source, sx.type); if (chosen) typeIncrement(types.selected, sx.type);
    if (tx) {
      counts.shared++; if (JSON.stringify(api(sx)) !== JSON.stringify(api(tx))) counts.sharedApiDifferent++;
      if (sx.ino !== tx.ino || sx.dev !== tx.dev) counts.sharedIdentityDifferent++;
    } else counts.sourceOnly++;
    if (unknown(sx)) { counts.sourceBothENOTTY++; counts[chosen ? 'sourceBothENOTTYSelected' : 'sourceBothENOTTYUnselected']++;
      if (chosen && samePax) counts.sourceBothENOTTYSelectedWithSamePax++; }
    if (tx && samePax && signature(sx) !== signature(tx)) {
      counts.samePaxDifferentAttributes++; counts[chosen ? 'samePaxDifferentAttributesSelected' : 'samePaxDifferentAttributesUnselected']++;
      add(samePaxGroups, JSON.stringify({ type: sx.type, selected: chosen, source: kind(sx), target: kind(tx), sourceApi: api(sx), targetApi: api(tx) }));
    }
    add(groups, JSON.stringify({ type: sx.type, selected: chosen, samePax, source: kind(sx), target: kind(tx), sourceApi: api(sx), targetApi: api(tx) }));
  }
  for (const [key, tx] of y) { typeIncrement(types.target, tx.type); if (!a.has(key)) { counts.targetOnly++; typeIncrement(types.targetOnly, tx.type); } }
  const caseFor = key => ({ presentBoth: a.has(key) && b.has(key), samePax: a.get(key)?.sha256 === b.get(key)?.sha256,
    selected: selected.has(key), attributesDiffer: signature(x.get(key)) !== signature(y.get(key)), sourceClass: kind(x.get(key)), targetClass: kind(y.get(key)),
    sourceApi: api(x.get(key)), targetApi: api(y.get(key)) });
  const marker = './opt/blobot-compare56-' + config.uuid;
  const cases = { modifiedPublicFile: caseFor('./etc/issue'), copyUpWithoutContentChange: caseFor('./etc/debian_version'),
    deletedPublicFile: { sourceAbsent: !a.has('./etc/issue.net'), targetPresent: b.has('./etc/issue.net'), parentSelected: selected.has('./etc') }, flags: {} };
  for (const flag of ['immutable', 'nodump', 'append']) for (const type of ['file', 'dir']) cases.flags[flag + '-' + type] = caseFor(marker + '/' + flag + '-' + type);
  const special = {};
  for (const type of ['symlink', 'fifo', 'char', 'block']) {
    const values = [...x.values(), ...y.values()].filter(e => e.type === type);
    special[type] = { count: values.length, allStatxSucceeded: values.every(e => e.statx.attributes !== undefined), allIoctlsSkipped: values.every(e => e.getflags.skipped && e.fsgetxattr.skipped), xattrQueryErrors: values.filter(e => e.xattrs.errno !== undefined).length };
  }
  special.socket = { count: 2, allStatxSucceeded: [source.socketProbe, localScan.socketProbe].every(e => e.statx.attributes !== undefined),
    allIoctlsSkipped: [source.socketProbe, localScan.socketProbe].every(e => e.getflags.skipped && e.fsgetxattr.skipped),
    xattrQueryErrors: [source.socketProbe, localScan.socketProbe].filter(e => e.xattrs.errno !== undefined).length, outsideCapturedTrees: true };
  return { completed: true, sourceDigest: source.digest, targetDigest: target.digest, selectedMembers: selected.size,
    selectionIsNull: selection === null, counts, types, cases, special,
    groups: [...groups].map(([key, count]) => ({ ...JSON.parse(key), count })),
    samePaxDifferentAttributeGroups: [...samePaxGroups].map(([key, count]) => ({ ...JSON.parse(key), count })),
    ioctlDescriptorOpens: { source: source.descriptorOpens, target: localScan.descriptorOpens },
    ioctlCalls: { source: source.ioctlCalls, target: localScan.ioctlCalls }, privateInventoriesStayedInGuests: true, rootRestorationInvoked: false };
}
(async () => {
  runPython(seed, [config.uuid, config.role, 'seed'], 1024 ** 2);
  stage = 'prepare'; held = await functions.prepare(fs, cp, { token: config.token, role: config.role }); held.assertHeld();
  assert(!fs.existsSync(held.views.rootfs + config.worktree + '/marker'));
  stage = 'read-tree'; const tree = await functions.read({ commands: cp, crypto }, { verify: functions.verify, index: functions.index },
    { path: held.views.rootfs, maxBytes: 4 * 1024 ** 3, assertHeld: held.assertHeld });
  stage = 'attributes'; const scan = JSON.parse(runPython(scanner, [held.views.rootfs, config.token])); held.assertHeld();
  assert.equal(scan.entries.length, tree.members.size);
  await send(1, { event: 'ready', role: config.role, digest: tree.digest, members: tree.members.size, attributeEntries: scan.entries.length, hostMountExcluded: true });
  if (config.role === 'source') {
    await command('send'); stage = 'send-private-bundle';
    const data = Buffer.from(JSON.stringify({ digest: tree.digest, members: [...tree.members.values()].map(e => [e.path.toString('base64'), e.type, e.link.toString('base64'), e.sha256]),
      attributes: scan.entries, socketProbe: scan.socketProbe, descriptorOpens: scan.descriptorOpens, ioctlCalls: scan.ioctlCalls }));
    assert(data.length < 128 * 1024 ** 2); const hash = crypto.createHash('sha256').update(data).digest('hex');
    for (let at = 0; at < data.length; at += 65536) await send(2, data.subarray(at, at + 65536));
    await send(1, { event: 'bundle-end', bytes: data.length, sha256: hash });
  } else {
    stage = 'receive-private-bundle'; const chunks = []; let size = 0, end; const hash = crypto.createHash('sha256');
    while (true) {
      const next = await input.next(); assert(!next.done); const frame = next.value;
      if (frame.type === 1) { end = JSON.parse(frame.data); assert.equal(end.event, 'bundle-end'); break; }
      size += frame.data.length; assert(size < 128 * 1024 ** 2); chunks.push(Buffer.from(frame.data)); hash.update(frame.data);
    }
    assert(end && end.bytes === size && end.sha256 === hash.digest('hex'));
    stage = 'compare'; const result = compare(JSON.parse(Buffer.concat(chunks, size)), tree, scan); held.assertHeld();
    await send(1, { event: 'comparison', result });
  }
  stage = 'release'; await command('release');
})().catch(async () => { process.exitCode = 1; await send(1, { event: 'error', role: config.role, stage, message: 'Synthetic comparison failed; no private details emitted.' }); }).finally(async () => {
  const cleanup = {};
  try { runPython(seed, [config.uuid, config.role, 'clear'], 1024 ** 2); cleanup.ownedFlagsCleared = true; } catch { cleanup.ownedFlagsCleared = false; process.exitCode = 1; }
  try { if (held) { await held.dispose(); cleanup.viewsRemoved = Object.values(held.views).every(p => !fs.existsSync(p)); } } catch { cleanup.viewsRemoved = false; process.exitCode = 1; }
  await send(1, { event: 'finished', role: config.role, cleanup, remainsFrozenForOwnedVmStop: true }); process.stdin.destroy();
});
