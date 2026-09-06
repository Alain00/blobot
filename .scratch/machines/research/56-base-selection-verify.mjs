// Offline aggregate checks. No sbx, private inventories or tar streams are opened.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const r = JSON.parse(await readFile(new URL('./56-base-selection-results.json', import.meta.url), 'utf8')), c = r.comparison;
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
eq(r.passed, true); eq(r.boxes.length, 2); eq(c.completed, true); eq(c.rootRestorationInvoked, false);
for (const [key, name] of [['worker', '56-base-selection-worker.cjs'], ['scanner', '56-base-selection-attributes.py'], ['seed', '56-base-selection-seed.py']]) eq(createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex'), r.scripts[key]);
eq(r.ready.map(x => x.members), [62742, 62743]);
eq(r.ready.every(x => x.members === x.attributeEntries && x.hostMountExcluded), true);
eq(c.counts.sourceBothENOTTY, 60946); eq(c.counts.sourceBothENOTTYSelected, 0); eq(c.counts.sourceBothENOTTYUnselected, 60946);
eq(c.selectedMembers, 45); eq(c.types.selected, { directory: 26, file: 16, symlink: 3 });
eq(c.counts.shared, 62742); eq(c.counts.sourceOnly, 0); eq(c.counts.targetOnly, 1);
eq(c.counts.samePaxDifferentAttributes, 7); eq(c.counts.samePaxDifferentAttributesSelected, 0); eq(c.counts.samePaxDifferentAttributesUnselected, 7);
for (const [type, count] of [['directory', 7550], ['file', 53396]]) {
  const groups = c.groups.filter(g => g.type === type && g.source === 'both-ENOTTY-statx-immutable');
  eq(groups.reduce((sum, g) => sum + g.count, 0), count);
  eq(groups.every(g => !g.selected && g.samePax && g.target === g.source), true);
  eq(groups.every(g => JSON.stringify(g.sourceApi) === JSON.stringify(g.targetApi)), true);
}
const changed = c.cases.modifiedPublicFile, copied = c.cases.copyUpWithoutContentChange;
eq(changed.samePax, false); eq(changed.selected, true); eq(changed.attributesDiffer, true);
eq(copied.samePax, true); eq(copied.selected, false); eq(copied.attributesDiffer, true);
for (const row of [changed, copied]) { eq(row.sourceClass, 'getflags-queryable'); eq(row.targetClass, 'both-ENOTTY-statx-immutable'); eq(row.sourceApi.getflags.flags, 0x80000); eq(row.targetApi.getflags.errno, 25); }
eq(c.cases.deletedPublicFile, { sourceAbsent: true, targetPresent: true, parentSelected: true });
for (const [name, row] of Object.entries(c.cases.flags)) {
  eq(row.presentBoth, true); eq(row.samePax, true); eq(row.selected, false); eq(row.attributesDiffer, true);
  const flag = name.split('-')[0], bit = { immutable: 0x10, nodump: 0x40, append: 0x20 }[flag], xbit = { immutable: 8, nodump: 128, append: 16 }[flag];
  eq(row.sourceApi.getflags.flags, 0x80000 | bit); eq(row.sourceApi.fsgetxattr.xflags, xbit);
  eq(row.targetApi.getflags.flags, 0x80000); eq(row.targetApi.fsgetxattr.xflags, 0);
  eq(row.sourceApi.statx.attributes, String(bit)); eq(row.targetApi.statx.attributes, '0');
}
for (const [type, row] of Object.entries(c.special)) {
  eq(row.allStatxSucceeded, true); eq(row.allIoctlsSkipped, true); eq(row.xattrQueryErrors, 0);
  eq(row.count, type === 'symlink' ? 3480 : 2);
}
eq(Object.keys(c.ioctlDescriptorOpens.source).sort(), ['directory', 'file']);
eq(Object.keys(c.ioctlDescriptorOpens.target).sort(), ['directory', 'file']);
eq(r.relay.bytes, 34548097); eq(r.relay.frames, 528); eq(r.relay.maxFrame, 65536); eq(r.relay.opaque, true); eq(r.relay.persisted, false);
eq(r.guestCleanup.every(g => g.cleanup.ownedFlagsCleared && g.cleanup.viewsRemoved && g.remainsFrozenForOwnedVmStop), true);
eq(r.guestExits.every(g => g.code === 0 && g.stderrBytes === 0), true);
eq(r.cleanup, { errors: [], remainingOwnedBoxes: [], remainingOwnedImages: [], tempRemoved: true });
eq(r.diskChecks.every(s => BigInt(s.availableBytes) >= 2n * 1024n ** 3n), true);
console.log(JSON.stringify({ checks, passed: true, liveCommands: 0 }));
