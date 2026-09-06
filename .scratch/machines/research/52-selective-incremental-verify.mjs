// Offline only: verify recorded outcomes and the exact measured guest sources.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const r = JSON.parse(await readFile(new URL('./52-selective-incremental-results.json', import.meta.url), 'utf8'));
const g = r.guest.probe.result, c = g.cases;
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
equal(r.passed, true); equal(r.workerExit, { code: 0, stderr: '' }); equal(g.completed, true);
equal(g.tarVersion, 'tar (GNU tar) 1.35'); equal(g.archive.repeatIdentical, true);
for (const [key, filename] of [['workerSha256', '52-selective-incremental-worker.cjs'], ['pythonSha256', '52-selective-incremental.py']]) {
  equal(createHash('sha256').update(await readFile(new URL(filename, import.meta.url))).digest('hex'), r.scripts[key]);
}
for (const name of ['files-only', 'needed-directories', 'all-directories', 'all-directories-no-overwrite-dir']) {
  equal(c[name].exitCode, 0); equal(c[name].stderr, '');
  for (const check of ['basicSelectedRestored', 'unselectedProtectedFilesExact', 'unselectedBranchFileExact', 'omittedChangedFileNotExtracted', 'outsideSentinelExact']) equal(c[name].checks[check], true);
}
for (const check of ['rootOnlyAbsent', 'branchOnlyAbsent', 'unselectedDirectoryExtraAbsent']) equal(c['files-only'].checks[check], false);
for (const check of ['rootOnlyAbsent', 'branchOnlyAbsent', 'allTypeSwapsRestored', 'selectedChangedDirectoryMetadataRestored', 'pristineDirectoryExact', 'keepDirectoryExact']) equal(c['needed-directories'].checks[check], true);
equal(c['needed-directories'].checks.unselectedDirectoryExtraAbsent, false);
for (const name of ['all-directories', 'all-directories-no-overwrite-dir']) {
  for (const check of ['rootOnlyAbsent', 'branchOnlyAbsent', 'unselectedDirectoryExtraAbsent', 'allTypeSwapsRestored']) equal(c[name].checks[check], true);
  equal(c[name].checks.keepDirectoryExact, false);
}
equal(c['all-directories'].checks.pristineDirectoryExact, false);
equal(c['all-directories'].checks.selectedChangedDirectoryMetadataRestored, true);
equal(c['all-directories-no-overwrite-dir'].checks.pristineDirectoryExact, true);
equal(c['all-directories-no-overwrite-dir'].checks.selectedChangedDirectoryMetadataRestored, false);
equal(c['empty-selection'].selection, []); equal(c['empty-selection'].exitCode, 2);
equal(c['empty-selection'].checks.emptySelectionLeavesEverythingExact, false);
equal(c['empty-selection'].checks.omittedChangedFileNotExtracted, false);
equal(c['empty-selection'].checks.unselectedBranchFileExact, false);
for (const check of ['basicSelectedRestored', 'rootOnlyAbsent', 'branchOnlyAbsent', 'unselectedDirectoryExtraAbsent', 'allTypeSwapsRestored', 'outsideSentinelExact']) equal(c['empty-selection'].checks[check], true);
equal(g.cleanup, { syntheticTreeRemoved: true });
equal(r.cleanup, { errors: [], remainingOwnedBoxes: [], remainingOwnedImages: [], tempRemoved: true });
equal(r.guest.thaw.maintenanceRemoved, true); equal(r.guest.originalMountNamespaceUnchanged, true);
equal(r.diskChecks.every(s => BigInt(s.availableBytes) >= 2n * 1024n ** 3n), true);
console.log(JSON.stringify({ checks, passed: true, liveCommands: 0 }));
