// Offline checks only. No sbx, archives, member names or inventories are loaded here.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
const r = await read('./54-archive-selection-results.json'), first = await read('./54-archive-selection-first-results.json');
const g = r.guest.probe.result, c = g.cases;
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
eq(r.passed, true); eq(g.completed, true); eq(g.allCasesPassed, true); eq(g.tarVersion, 'tar (GNU tar) 1.35');
eq(r.workerExit, { code: 0, stderr: '' });
eq(r.compiledFunctionHashes, first.compiledFunctionHashes); eq(r.compiledModuleHashes, first.compiledModuleHashes);
eq(createHash('sha256').update(await readFile(new URL('./54-archive-selection-worker.cjs', import.meta.url))).digest('hex'), r.scripts.workerSha256);
for (const [name, row] of Object.entries(c)) {
  eq(row.passed, true); eq(row.fullPaxEqual, true); eq(row.mismatchedMemberCount, 0);
  eq(row.sourceArchive, row.afterArchive); eq(row.sourceRepeatedIdentical, true); eq(row.sourceUnchanged, true); eq(row.sentinelUnchanged, true);
  if (name === 'identical') {
    eq(row.selection, { isNull: true, bytes: 0, members: 0, directChangedMembers: 0 });
    eq(row.restore.invoked, false); eq(row.noopMetadataExact, true);
  } else {
    eq(row.restore.invoked, true); eq(row.restore.exitCode, 0); eq(row.restore.stderrBytes, 0); eq(row.restore.listTransport, 'memfd');
    eq(row.selection.isNull, false); eq(row.selection.bytes > 0, true);
  }
}
eq(c['content-parent-equal'].initialDirectoryMembersEqual, true);
eq(c['content-parent-equal'].unchangedAncestorsSelected, true);
eq(c['content-parent-equal'].selection.directChangedMembers, 1); eq(c['content-parent-equal'].selection.members, 4);
eq(c['mutations'].sourceArchive.members, 29); eq(c['mutations'].beforeArchive.members, 31); eq(c['mutations'].selection.members, 27);
eq(c['hardlink-reference'].referencePayloadChanged, true); eq(c['hardlink-reference'].unchangedHardlinkMembers, 2);
eq(c['hardlink-reference'].unchangedHardlinkDependentsSelected, true);
eq(c['hardlink-reference'].selection.directChangedMembers, 1); eq(c['hardlink-reference'].selection.members, 5);
for (const name of ['hardlink-reference', 'hardlink-merge', 'hardlink-split']) eq(c[name].hardlinkGraphCorrect, true);
eq(c['hardlink-reference'].referenceInodeReplaced, true);
eq(c['hardlink-merge'].referenceInodeReplaced, false); eq(c['hardlink-split'].referenceInodeReplaced, false);
for (const run of [first, r]) {
  eq(run.cleanup, { errors: [], remainingOwnedBoxes: [], remainingOwnedImages: [], tempRemoved: true });
  eq(run.guest.probe.result.cleanup, { syntheticTreeRemoved: true });
  eq(run.guest.thaw.maintenanceRemoved, true); eq(run.guest.originalMountNamespaceUnchanged, true);
  eq(run.diskChecks.every(s => BigInt(s.availableBytes) >= 2n * 1024n ** 3n), true);
}
eq(first.passed, false); eq(first.guest.probe.result.cases.identical.passed, true);
for (const [name, row] of Object.entries(first.guest.probe.result.cases)) if (name !== 'identical') {
  eq(row.restore.exitCode, 2); eq(row.beforeArchive, row.afterArchive); eq(row.restore.stderrBytes, 104);
}
console.log(JSON.stringify({ checks, passed: true, liveCommands: 0 }));
