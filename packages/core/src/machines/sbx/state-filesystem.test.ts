import * as fs from 'node:fs';
import * as commands from 'node:child_process';
import * as crypto from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { createSbxFilesystemStateBackend } from './state-filesystem.js';
import { createSbxStateDescriptionCodec } from './state-description.js';
import { createSbxStateBundleReader, sbxStateBundleHeader } from './state-bundle.js';
import { createStateArchiveVerifier } from './state-archive.js';
import { createSbxArchiveIndex, selectSbxArchiveMembers } from './state-archive-index.js';

type Tree = 'rootfs' | 'home' | 'docker';
const trees: readonly Tree[] = ['rootfs', 'home', 'docker'];
const token = '00000000-0000-0000-0000-000000000000';
const root = '/run/blobot-state-' + token;
const digest = (bytes: Buffer) => ({ bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });

function fixture(role: 'source' | 'target', settings: { badRestore?: boolean } = {}) {
  const values = new Map<string, { bytes: Buffer; attributes: Buffer }>(trees.map((tree, at) => [root + '/' + tree, { bytes: Buffer.alloc(3072, role === 'source' ? at + 1 : 8), attributes: Buffer.alloc(70000, role === 'source' ? at + 1 : 8) }]));
  const operations: string[] = [];
  const held = vi.fn(), dispose = vi.fn(async () => { operations.push('dispose'); });
  const modules: Parameters<typeof createSbxFilesystemStateBackend>[1] = {
    prepare: vi.fn(async () => ({ views: { rootfs: root + '/rootfs', home: root + '/home', docker: root + '/docker' }, assertHeld: held, dispose })),
    description: createSbxStateDescriptionCodec, header: sbxStateBundleHeader, bundle: createSbxStateBundleReader,
    verify: createStateArchiveVerifier, index: createSbxArchiveIndex, select: selectSbxArchiveMembers,
    read: vi.fn(async (_builtins, _archives, options) => {
      const value = values.get(options.path)!;
      operations.push('read');
      await options.emit?.(value.bytes);
      return { digest: digest(value.bytes), members: new Map([['.', { path: Buffer.from('.'), type: 53, link: Buffer.alloc(0), sha256: digest(value.bytes).sha256 }]]) };
    }),
    receive: vi.fn(async (_builtins, _archives, options) => {
      await options.prepareAttributes(Buffer.from('./\0'));
      const chunks: Buffer[] = [];
      return {
        async write(chunk: Buffer) { operations.push('receive-data'); chunks.push(Buffer.from(chunk)); },
        async finish() {
          values.get(options.path)!.bytes = Buffer.concat(chunks);
          await options.finishAttributes();
        },
        async abort() { operations.push('abort'); },
      };
    }),
  };
  const attributeBackend: Parameters<typeof createSbxFilesystemStateBackend>[2] = {
    async inspect(path) {
      operations.push('attributes-read');
      const value = values.get(path)!;
      return value.attributes;
    },
    preflight: vi.fn(() => { operations.push('preflight'); }),
    plan(path, source) {
      return { changed: new Set(['.']),
        async prepare() { operations.push('attributes-prepare'); },
        async finish() {
          operations.push('attributes-finish');
          values.get(path)!.attributes = settings.badRestore ? Buffer.from('incomplete') : source.attributes;
        },
      };
    },
  };
  const create = runInNewContext(`(${createSbxFilesystemStateBackend.toString()})`, { Buffer }) as typeof createSbxFilesystemStateBackend;
  const backend = create({ fs, commands, crypto }, modules, attributeBackend, { role, token, maximumTreeBytes: 1024 ** 2 });
  return { backend, operations, modules, attributeBackend, values, dispose };
}

async function stream(source: ReturnType<typeof fixture>, tree: Tree) {
  const chunks: Buffer[] = [];
  await source.backend.archive(tree, async bytes => { expect(bytes.length).toBeLessThanOrEqual(65536); chunks.push(Buffer.from(bytes)); });
  return Buffer.concat(chunks);
}

it('composes all three metadata-first bundles and verifies actual restored state before receipts', async () => {
  const source = fixture('source'), target = fixture('target');
  await source.backend.prepare(); await target.backend.prepare();
  const receipts = await Promise.all(trees.map(tree => source.backend.digest(tree)));
  for (let at = 0; at < trees.length; at++) {
    const tree = trees[at]!, expected = receipts[at]!;
    const bytes = await stream(source, tree);
    expect(digest(bytes)).toEqual(expected);
    const receiver = await target.backend.receive(tree, expected);
    for (let start = 0; start < bytes.length; start += 997) await receiver.write(bytes.subarray(start, start + 997));
    await receiver.finish();
    expect(await target.backend.digest(tree)).toEqual(expected);
  }
  expect(target.operations.indexOf('attributes-prepare')).toBeLessThan(target.operations.indexOf('receive-data'));
  expect(target.operations.indexOf('receive-data')).toBeLessThan(target.operations.indexOf('attributes-finish'));
  await source.backend.dispose(); await target.backend.dispose();
  expect(source.dispose).toHaveBeenCalledOnce(); expect(target.dispose).toHaveBeenCalledOnce();
});

it('rejects correct archive bytes paired with incorrectly restored attributes', async () => {
  const source = fixture('source'), target = fixture('target', { badRestore: true });
  await source.backend.prepare(); await target.backend.prepare();
  const expected = await source.backend.digest('home'), bytes = await stream(source, 'home');
  const receiver = await target.backend.receive('home', expected);
  for (let at = 0; at < bytes.length; at += 65536) await receiver.write(bytes.subarray(at, at + 65536));
  await expect(receiver.finish()).rejects.toThrow('filesystem could not be verified');
  await expect(target.backend.digest('home')).rejects.toThrow();
  await receiver.abort(); await target.backend.dispose(); await source.backend.dispose();
});

it('refuses further operations after abort and disposes the held guest', async () => {
  const target = fixture('target'); await target.backend.prepare();
  const receiver = await target.backend.receive('docker', { bytes: 4096, sha256: 'a'.repeat(64) });
  await receiver.abort();
  await expect(receiver.write(Buffer.alloc(1))).rejects.toThrow();
  await expect(target.backend.digest('docker')).rejects.toThrow();
  await target.backend.dispose(); expect(target.dispose).toHaveBeenCalledOnce();
});

it('detects source attribute drift after a streamed archive even when PAX is unchanged', async () => {
  const source = fixture('source'); await source.backend.prepare();
  await source.backend.digest('rootfs');
  source.values.get(root + '/rootfs')!.attributes = Buffer.from('changed-after-preflight');
  await expect(stream(source, 'rootfs')).rejects.toThrow('filesystem could not be verified');
  await source.backend.dispose();
});

it('bounds metadata plus archive together and refuses unprepared access', async () => {
  const source = fixture('source');
  await expect(source.backend.digest('rootfs')).rejects.toThrow();
  await source.backend.prepare();
  source.values.get(root + '/rootfs')!.attributes = Buffer.alloc(1024 ** 2);
  await expect(source.backend.digest('rootfs')).rejects.toThrow('filesystem could not be verified');
  await source.backend.dispose();
});
