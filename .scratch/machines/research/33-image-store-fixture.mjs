// Real sbx install from a local cache: no box, network download, login or user data.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SbxImageStore } from '../../../packages/core/dist/machines/sbx/image-store.js';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';

assert.equal(process.env.BLOBOT_LIVE_SBX_IMAGE_STORE, '1');
const [receiptPath, archive] = process.argv.slice(2);
assert(receiptPath?.startsWith('/') && archive?.startsWith('/'));
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
const hash = createHash('sha256'); for await (const chunk of createReadStream(archive)) hash.update(chunk);
const build = { arch: receipt.arch, reference: receipt.reference, imageId: receipt.imageId,
  url: 'https://example.invalid/synthetic-release.tar', sha256: hash.digest('hex'), bytes: (await stat(archive)).size };
const root = await mkdtemp(join(tmpdir(), 'blobot-image-store-live-'));
const exec = promisify(execFile), env = sbxClientEnvironment();
const json = async args => JSON.parse((await exec('sbx', args, { env })).stdout);
const report = { date: new Date().toISOString(), build, scope: 'Local cache validation and real engine load, no release download', cleanup: {} };
const store = new SbxImageStore(root, undefined, () => { throw new Error('Cached archive must not require a network request'); });
let attempted = false;
try {
  assert.deepEqual((await json(['ls', '--json'])).sandboxes, []);
  assert.equal((await store.readiness(build)).state, 'not_installed');
  await link(archive, join(root, `${build.sha256}.tar`));
  attempted = true; const start = performance.now();
  await store.install(build); report.installMs = performance.now() - start;
  assert.deepEqual(await store.readiness(build), { state: 'ready' });
  report.passed = true;
} catch (e) { report.passed = false; report.error = e.stack; process.exitCode = 1; }
finally {
  if (attempted && (await store.readiness(build)).state === 'ready') {
    await exec('sbx', ['template', 'rm', build.reference], { env });
  }
  report.cleanup.readiness = await store.readiness(build);
  assert.equal(report.cleanup.readiness.state, 'not_installed');
  await rm(root, { recursive: true, force: true });
  await writeFile(new URL('./33-image-store-fixture-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
