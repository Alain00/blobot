// Anonymous, sequential release verification. No engine calls, credentials or Agent state.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { downloadVerified } from '../../../packages/core/dist/speech/download.js';
import { verifyRuntimeImageArchive } from '../../../packages/core/dist/machines/sbx/image-store.js';

assert.equal(process.env.BLOBOT_VERIFY_PUBLIC_IMAGES, '1');
const [manifestPath, outputDirectory] = process.argv.slice(2);
assert(manifestPath && outputDirectory, 'Supply the reviewed manifest and a temporary output directory');
const root = resolve(outputDirectory);
await mkdir(root, { recursive: true });
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
const runtimes = ['fx', 'claude', 'codex', 'opencode', 'cursor'];
assert.deepEqual(Object.keys(manifest).sort(), [...runtimes].sort());
for (const runtime of runtimes) assert.deepEqual(manifest[runtime].map(build => build.arch).sort(), ['amd64', 'arm64']);
const first = manifest.fx.find(build => build.arch === 'arm64');
const releaseRoot = first.url.slice(0, first.url.lastIndexOf('/'));
assert.match(releaseRoot, /^https:\/\/github\.com\/guillermolg00\/blobot-machine-images\/releases\/download\/machines-[\w.-]+$/);
const publicManifest = await fetch(`${releaseRoot}/runtime-builds.json`);
assert.equal(publicManifest.status, 200);
assert.deepEqual(Buffer.from(await publicManifest.arrayBuffer()), manifestBytes);
const report = { startedAt: new Date().toISOString(), releaseRoot,
  manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  scope: 'Anonymous full-byte checks and archive contracts on all ten assets; actual core Range resume on fx arm64. No sbx load or runtime execution.',
  assets: [] };
const reportPath = new URL('./34-public-release-fixture-results.json', import.meta.url);
try {
  for (const runtime of runtimes) for (const build of manifest[runtime]) {
    assert.equal(new URL(build.url).origin, 'https://github.com');
    assert(build.url.startsWith(`${releaseRoot}/blobot-machine-${runtime}-${build.arch}-`));
    const disk = await statfs(root);
    assert(Number(disk.bavail) * Number(disk.bsize) > build.bytes + 2 * 1024 ** 3, 'Retain 2 GiB of free disk');
    const file = join(root, `${runtime}-${build.arch}.tar`);
    const entry = { runtime, build, requests: [], startedAt: new Date().toISOString() };
    report.assets.push(entry);
    const resumed = runtime === 'fx' && build.arch === 'arm64';
    if (resumed) {
      const prefix = await fetch(build.url, { headers: { Range: 'bytes=0-1048575' }, signal: AbortSignal.timeout(60_000) });
      assert.equal(prefix.status, 206);
      assert.equal(prefix.headers.get('content-range'), `bytes 0-1048575/${build.bytes}`);
      const bytes = Buffer.from(await prefix.arrayBuffer());
      assert.equal(bytes.length, 1048576);
      await writeFile(`${file}.part`, bytes);
      entry.prefixBytes = bytes.length;
    }
    let lastProgress;
    const result = await downloadVerified({ ...build, to: file, signal: AbortSignal.timeout(600_000),
      onProgress(received, total) { lastProgress = { received, total }; },
      async fetch(url, options) {
        const response = await fetch(url, options);
        entry.requests.push({ range: new Headers(options?.headers).get('range'), status: response.status,
          contentRange: response.headers.get('content-range') });
        return response;
      } });
    assert.deepEqual(result, { ok: true, bytes: build.bytes });
    assert.deepEqual(lastProgress, { received: build.bytes, total: build.bytes });
    if (resumed) assert.deepEqual(entry.requests, [{ range: 'bytes=1048576-', status: 206,
      contentRange: `bytes 1048576-${build.bytes - 1}/${build.bytes}` }]);
    await verifyRuntimeImageArchive(file, build);
    entry.passed = true;
    entry.finishedAt = new Date().toISOString();
    if (resumed) entry.retainedArchive = file;
    else await rm(file);
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ runtime, arch: build.arch, bytes: build.bytes, passed: true, resumed }));
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}
