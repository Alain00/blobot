import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const exec = promisify(execFile);
const inputs = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'blobot-release-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [];
  for (const [runtime, input] of Object.entries(inputs.runtimes)) for (const arch of ['arm64', 'amd64']) {
    // Aggregation only; OCI structure is tested separately by SbxImageStore.
    const bytes = Buffer.from(`synthetic archive ${runtime}/${arch}`), id = digest(`${runtime}/${arch}`);
    const asset = `blobot-machine-${runtime}-${arch}-${id}.tar`;
    const receipt = { runtime, arch, version: input.version, base: inputs.base, recipe: digest('recipe'),
      imageId: `sha256:${id}`, reference: `blobot-machine-${runtime}:${id}-${arch}`, asset,
      sha256: digest(bytes), bytes: bytes.length };
    await writeFile(join(root, asset), bytes);
    await writeFile(join(root, `${runtime}-${arch}.json`), JSON.stringify(receipt));
    await writeFile(join(root, `${runtime}-${arch}-smoke.json`), JSON.stringify({ results: [{ accepted: true, receipt }] }));
    files.push({ ...receipt, path: join(root, asset) });
  }
  return { root, files, run: () => exec(process.execPath, [new URL('./release-manifest.mjs', import.meta.url).pathname,
    '--assets', root, '--repository', 'fixture/repo', '--tag', 'machines-test']) };
}

test('assembles ten checked immutable download pins and their archive checksums', async t => {
  const f = await fixture(t); await f.run();
  const builds = JSON.parse(await readFile(join(f.root, 'runtime-builds.json'), 'utf8'));
  assert.equal(Object.values(builds).flat().length, 10);
  const file = f.files[0], build = builds[file.runtime].find(value => value.arch === file.arch);
  assert.equal(build.url, `https://github.com/fixture/repo/releases/download/machines-test/${file.asset}`);
  assert.equal(build.sha256, file.sha256);
  assert.match(await readFile(join(f.root, 'SHA256SUMS'), 'utf8'), new RegExp(file.sha256));
});

test('refuses changed bytes rather than emitting plausible release pins', async t => {
  const f = await fixture(t); await writeFile(f.files[0].path, 'corrupt');
  await assert.rejects(f.run, /Corrupt asset/);
  await assert.rejects(readFile(join(f.root, 'runtime-builds.json')));
});

test('refuses a missing architecture or failed native smoke check', async t => {
  const f = await fixture(t), path = join(f.root, 'cursor-amd64-smoke.json');
  const original = await readFile(path, 'utf8');
  await rm(path); await assert.rejects(f.run, /ENOENT/);
  const smoke = JSON.parse(original); smoke.results[0].accepted = false;
  await writeFile(path, JSON.stringify(smoke));
  await assert.rejects(f.run, /Incomplete or inconsistent acceptance for cursor\/amd64/);
});
