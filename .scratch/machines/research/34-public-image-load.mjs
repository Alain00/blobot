import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { link, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SbxImageStore } from '../../../packages/core/dist/machines/sbx/image-store.js';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';
assert.equal(process.env.BLOBOT_VERIFY_PUBLIC_LOAD, '1');
const [manifestPath, archive, resultPath] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const build = manifest.fx.find(build => build.arch === 'arm64');
const root = await mkdtemp('/private/tmp/blobot-public-image-load-');
const exec = promisify(execFile), env = sbxClientEnvironment();
const json = async args => JSON.parse((await exec('sbx', args, { env })).stdout);
const store = new SbxImageStore(root, undefined, () => { throw Error('Public archive must already be in verified cache'); });
const report = { startedAt: new Date().toISOString(), build,
  scope: 'Actual public fx arm64 bytes through current image-store validation, sbx load and readiness. No box or inference.', cleanup: {} };
let owned = false;
try {
  assert.deepEqual((await json(['ls', '--json'])).sandboxes, []);
  assert.equal((await store.readiness(build)).state, 'not_installed');
  await link(archive, join(root, `${build.sha256}.tar`));
  owned = true;
  const start = performance.now();
  await store.install(build);
  report.installMs = performance.now() - start;
  assert.deepEqual(await store.readiness(build), { state: 'ready' });
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.message; process.exitCode = 1; }
finally {
  if (owned && (await store.readiness(build)).state === 'ready') await exec('sbx', ['template', 'rm', build.reference], { env });
  report.cleanup.readiness = await store.readiness(build);
  report.cleanup.boxes = (await json(['ls', '--json'])).sandboxes;
  assert.equal(report.cleanup.readiness.state, 'not_installed');
  assert.deepEqual(report.cleanup.boxes, []);
  await rm(root, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
