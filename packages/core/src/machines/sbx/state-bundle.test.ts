import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createSbxStateBundleReader, sbxStateBundleHeader } from './state-bundle.js';

const metadata = Buffer.from('{"synthetic":"private manifest"}');
const archive = Buffer.alloc(145000, 7);
const bundle = () => Buffer.concat([sbxStateBundleHeader(metadata), metadata, archive]);

describe('guest state bundle', () => {
  it.each([1, 7, 65536])('reads fragmented metadata before streaming archive bytes, chunk size %s', async step => {
    const create = runInNewContext(`(${createSbxStateBundleReader.toString()})`, { Buffer }) as typeof createSbxStateBundleReader;
    let seen = false;
    const received: Buffer[] = [];
    const reader = create({
      async metadata(value) { expect(value).toEqual(metadata); seen = true; },
      async archive(value) { expect(seen).toBe(true); received.push(Buffer.from(value)); },
    });
    const input = bundle();
    for (let at = 0; at < input.length; at += step) await reader.write(input.subarray(at, at + step));
    reader.finish();
    expect(Buffer.concat(received)).toEqual(archive);
    expect(() => reader.finish()).toThrow('bundle is invalid');
  });

  it('waits for metadata preflight before sending bytes from the same input frame', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let data = false;
    const reader = createSbxStateBundleReader({
      async metadata() { await held; },
      async archive() { data = true; },
    });
    const write = reader.write(bundle().subarray(0, 4096));
    await new Promise(resolve => setImmediate(resolve));
    expect(data).toBe(false);
    release(); await write;
    expect(data).toBe(true);
    reader.finish();
  });

  it.each(['magic', 'zero', 'huge', 'truncated', 'no archive', 'preflight', 'sink'] as const)('refuses %s with an opaque error', async kind => {
    let calls = 0;
    const reader = createSbxStateBundleReader({
      async metadata() { if (kind === 'preflight') throw new Error('/private/name'); },
      async archive() { calls++; if (kind === 'sink') throw new Error('/private/name'); },
    });
    let input = bundle().subarray(0, 4096);
    if (kind === 'magic') input[0] = 0;
    if (kind === 'zero') input.writeUInt32BE(0, 8);
    if (kind === 'huge') input.writeUInt32BE(64 * 1024 * 1024 + 1, 8);
    if (kind === 'truncated') input = input.subarray(0, 14);
    if (kind === 'no archive') input = input.subarray(0, 12 + metadata.length);
    if (kind === 'truncated' || kind === 'no archive') {
      await reader.write(input); expect(() => reader.finish()).toThrow('Machine state bundle is invalid.');
    } else await expect(reader.write(input)).rejects.toThrow('Machine state bundle is invalid.');
    if (kind !== 'sink') expect(calls).toBe(0);
  });

  it('does not start extraction after a concurrent write has invalidated metadata preflight', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let data = false;
    const reader = createSbxStateBundleReader({ async metadata() { await held; }, async archive() { data = true; } });
    const first = reader.write(bundle().subarray(0, 4096));
    const rejected = expect(first).rejects.toThrow('bundle is invalid');
    await expect(reader.write(Buffer.from('second'))).rejects.toThrow('bundle is invalid');
    release(); await rejected;
    expect(data).toBe(false);
  });
});
