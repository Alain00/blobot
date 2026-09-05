import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import type { RuntimeImageBuild } from '../runtime-image.js';
import { SbxImageStore, verifyRuntimeImageArchive } from './image-store.js';

const exec = promisify(execFile), roots: string[] = [];
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(arch = 'arm64') {
  const root = await mkdtemp(join(tmpdir(), 'blobot-image-test-')); roots.push(root);
  const reference = 'blobot-machine-fixture:verified-arm64';
  const config = JSON.stringify({ architecture: arch, os: 'linux', config: { User: 'agent', Labels: { 'com.docker.sandboxes.start-docker': 'false' } } });
  const configId = hash(config);
  const manifest = JSON.stringify({ schemaVersion: 2, config: { digest: `sha256:${configId}` }, layers: [] });
  const imageId = hash(manifest);
  const source = join(root, 'source'); await mkdir(join(source, 'blobs/sha256'), { recursive: true });
  await writeFile(join(source, 'blobs/sha256', configId), config);
  await writeFile(join(source, 'blobs/sha256', imageId), manifest);
  await writeFile(join(source, 'index.json'), JSON.stringify({ schemaVersion: 2, manifests: [{ digest: `sha256:${imageId}`,
    annotations: { 'io.containerd.image.name': `docker.io/library/${reference}` } }] }));
  await writeFile(join(source, 'manifest.json'), JSON.stringify([{ Config: `blobs/sha256/${configId}`, RepoTags: [reference], Layers: [] }]));
  const archive = join(root, 'image.tar');
  await exec('tar', ['-cf', archive, '-C', source, 'index.json', 'manifest.json', 'blobs']);
  const bytes = await readFile(archive);
  const build: RuntimeImageBuild = { arch: 'arm64', reference, imageId: `sha256:${imageId}`, url: 'https://example.invalid/runtime.tar',
    sha256: hash(bytes), bytes: bytes.length };
  let rows: unknown[] = [];
  const run = vi.fn(async (args: readonly string[]) => {
    if (args[1] === 'load') rows = [{ repository: 'docker.io/library/blobot-machine-fixture', tag: 'verified-arm64', id: imageId.slice(0, 12) }];
    return { code: 0, stdout: JSON.stringify({ images: rows }) };
  });
  const fetcher = vi.fn<typeof fetch>(async () => new Response(bytes));
  return { root, bytes, build, archive, run, fetcher, setRows: (value: unknown[]) => { rows = value; } };
}

it('refuses an unpublished build before network or engine access', async () => {
  const f = await fixture(), store = new SbxImageStore(join(f.root, 'cache'), f.run, f.fetcher);
  expect((await store.readiness(undefined)).state).toBe('not_installed');
  await expect(store.install(undefined)).rejects.toThrow('No verified');
  expect(f.run).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
});

it('resumes a verified release download and loads only after archive validation', async () => {
  const f = await fixture(), cache = join(f.root, 'cache'); await mkdir(cache);
  const offset = 100;
  await writeFile(join(cache, `${f.build.sha256}.tar.part`), f.bytes.subarray(0, offset));
  f.fetcher.mockImplementationOnce(async (_url, request) => {
    expect(request?.headers).toEqual({ Range: 'bytes=100-' });
    return new Response(f.bytes.subarray(offset), { status: 206, headers: { 'content-range': `bytes 100-${f.bytes.length - 1}/${f.bytes.length}` } });
  });
  const store = new SbxImageStore(cache, f.run, f.fetcher), onProgress = vi.fn();
  await store.install(f.build, { onProgress });
  expect(f.run.mock.calls.filter(([args]) => args[1] === 'load')).toHaveLength(1);
  expect(onProgress).toHaveBeenLastCalledWith(f.bytes.length, f.bytes.length);
  expect(await store.readiness(f.build)).toEqual({ state: 'ready' });
  await store.install(f.build);
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});

it('never loads bytes with a wrong checksum', async () => {
  const f = await fixture(); f.fetcher.mockResolvedValueOnce(new Response('wrong archive'));
  const store = new SbxImageStore(join(f.root, 'cache'), f.run, f.fetcher);
  await expect(store.install(f.build)).rejects.toThrow('checksum');
  expect(f.run.mock.calls.some(([args]) => args[1] === 'load')).toBe(false);
});

it('rejects a checksum-valid archive for the wrong guest architecture', async () => {
  const f = await fixture('amd64');
  await expect(verifyRuntimeImageArchive(f.archive, f.build)).rejects.toThrow('architecture');
  const store = new SbxImageStore(join(f.root, 'cache'), f.run, f.fetcher);
  await expect(store.install(f.build)).rejects.toThrow('architecture');
  expect(f.run.mock.calls.some(([args]) => args[1] === 'load')).toBe(false);
});

it('refuses an occupied tag with a different image instead of overwriting it', async () => {
  const f = await fixture();
  f.setRows([{ repository: 'docker.io/library/blobot-machine-fixture', tag: 'verified-arm64', id: 'f'.repeat(12) }]);
  const store = new SbxImageStore(join(f.root, 'cache'), f.run, f.fetcher);
  expect((await store.readiness(f.build)).state).toBe('unknown');
  await expect(store.install(f.build)).rejects.toThrow('different runtime');
  expect(f.fetcher).not.toHaveBeenCalled();
});

it('coalesces concurrent installs and respects cancellation before any operation', async () => {
  const f = await fixture(), store = new SbxImageStore(join(f.root, 'cache'), f.run, f.fetcher);
  await expect(store.install(f.build, { signal: AbortSignal.abort() })).rejects.toThrow();
  expect(f.run).not.toHaveBeenCalled();
  const first = store.install(f.build);
  await expect(store.install({ ...f.build, sha256: 'a'.repeat(64) })).rejects.toThrow('different runtime pins');
  await expect(store.install(f.build, { signal: AbortSignal.abort() })).rejects.toThrow();
  await Promise.all([first, store.install(f.build)]);
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(f.run.mock.calls.filter(([args]) => args[1] === 'load')).toHaveLength(1);
});
