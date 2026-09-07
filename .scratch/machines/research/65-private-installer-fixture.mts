// Source-level installer admission, cache-only and no engine invocation.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, readdir, lstat, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SbxInstaller, validateSbxArchiveMembers } from '../../../packages/core/src/machines/sbx/installation.ts';

assert.equal(process.env.BLOBOT_INSTALLER_PREFIX65, '1');
const exec = promisify(execFile);
const source = new URL('../../../packages/core/src/machines/sbx/installation.ts', import.meta.url);
const sourceHash = async () => createHash('sha256').update(await readFile(source)).digest('hex');
const temp = await mkdtemp('/private/tmp/wayfinder-installer65-');
const archive = '/private/tmp/blobot-sbx-rc5-install.wsOUYz/DockerSandboxes-darwin.tar.gz';
const report: Record<string, unknown> = { started: new Date().toISOString(), source: 'packages/core/src/machines/sbx/installation.ts', sourceSha256Before: await sourceHash() };
let fetchCalls = 0;
try {
  const s = await statfs(temp, { bigint: true }); const free = s.bavail * s.bsize;
  assert(free >= 2n * 1024n ** 3n); report.initialFreeBytes = String(free);
  await mkdir(join(temp, 'downloads'), { mode: 0o700 });
  await copyFile(archive, join(temp, 'downloads', 'DockerSandboxes-darwin.tar.gz'));
  const [names, details] = await Promise.all([
    exec('/usr/bin/tar', ['-tzf', archive]), exec('/usr/bin/tar', ['-tvzf', archive]),
  ]);
  validateSbxArchiveMembers(names.stdout, details.stdout);
  report.validator = { passed: true, names: names.stdout.trim().split('\n').length, detailRows: details.stdout.trim().split('\n').length };
  const installer = new SbxInstaller(temp);
  const installed = await installer.install({ fetch: async () => { fetchCalls++; throw new Error('Fixture refuses network'); } });
  assert.equal(installed.kind, 'installed');
  if (installed.kind !== 'installed') throw new Error('Unexpected package result');
  assert.equal(installed.executable, join(temp, 'engine', 'v0.42.0-rc5', 'bin', 'sbx'));
  report.executableRelativePath = 'engine/v0.42.0-rc5/bin/sbx';
  report.cliSha256 = createHash('sha256').update(await readFile(installed.executable)).digest('hex');
  assert.equal(report.cliSha256, 'e0bc95e6d4b80cb9a6b84ae8b2f2f540d5289fec9347be40b01f7af5317f007a');
  assert.equal(fetchCalls, 0);
  assert.deepEqual(await readdir(join(temp, 'engine')), ['v0.42.0-rc5']);
  const rootfs = join(temp, 'engine', 'v0.42.0-rc5', 'libexec', 'nerdbox-rootfs-arm64.erofs');
  await exec('/usr/bin/codesign', ['--verify', '--strict', '-R', '=anchor apple generic and certificate leaf[subject.OU] = "9BNSXJN65R"', rootfs]);
  report.additionalRootfsDockerSignatureValid = true;
  report.stagingDirectoriesRemaining = 0;
  report.destinationType = (await lstat(join(temp, 'engine', 'v0.42.0-rc5'))).isDirectory() ? 'directory' : 'other';
  report.sourceSha256After = await sourceHash();
  assert.equal(report.sourceSha256Before, report.sourceSha256After);
  report.passed = true;
} catch (e) { report.passed = false; report.error = e instanceof Error ? e.message : 'Unknown failure'; process.exitCode = 1; }
finally {
  report.fetchCalls = fetchCalls;
  await rm(temp, { recursive: true, force: true });
  report.cleanup = { temporaryRootRemoved: true, engineCalls: 0 };
  report.finished = new Date().toISOString();
  await writeFile(new URL('./65-private-installer-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
