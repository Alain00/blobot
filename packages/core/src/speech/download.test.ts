import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CHECKSUM_MISMATCH, downloadVerified } from './download.js';

const BODY = Buffer.from('x'.repeat(50_000) + 'y'.repeat(50_000));
const SHA = createHash('sha256').update(BODY).digest('hex');

let server: Server;
let base = '';
/** Cut the connection after this many bytes, once, to simulate a drop. */
let cutAfter: number | undefined;
let cutConnection: (() => void) | undefined;
let ignoreRange = false;
const ranges: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    const range = request.headers['range'];
    ranges.push(range ?? '');
    let from = 0;
    if (range !== undefined && !ignoreRange) {
      from = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
      response.writeHead(206, {
        'content-range': `bytes ${from}-${BODY.length - 1}/${BODY.length}`,
        'content-length': String(BODY.length - from),
      });
    } else {
      response.writeHead(200, { 'content-length': String(BODY.length) });
    }
    const slice = BODY.subarray(from);
    if (cutAfter !== undefined) {
      // The client acknowledges disk progress before we cut; scheduler load cannot erase the
      // intended partial download before fetch has delivered its first chunk.
      response.write(slice.subarray(0, cutAfter));
      cutConnection = () => response.destroy();
      cutAfter = undefined;
      return;
    }
    response.end(slice);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : '';
});

afterAll(() => {
  server.close();
});

async function dir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'blobot-download-'));
}

describe('a verified download', () => {
  it('streams to a .part, hashes as it writes, and renames on a match', async () => {
    const to = join(await dir(), 'weights.bin');
    const seen: number[] = [];
    const outcome = await downloadVerified({ url: `${base}/w`, sha256: SHA, to, onProgress: (n) => seen.push(n) });
    expect(outcome).toEqual({ ok: true, bytes: BODY.length });
    expect((await readFile(to)).equals(BODY)).toBe(true);
    await expect(stat(`${to}.part`)).rejects.toThrow();
    expect(seen.at(-1)).toBe(BODY.length);
  });

  it('keeps the .part on a drop and resumes it with Range, ending with the whole hash', async () => {
    const to = join(await dir(), 'weights.bin');
    cutAfter = 30_000;
    const first = await downloadVerified({ url: `${base}/w`, sha256: SHA, to,
      onProgress: (received) => { if (received >= 30_000) cutConnection?.(); } });
    cutConnection = undefined;
    expect(first.ok).toBe(false);
    expect((await stat(`${to}.part`)).size).toBe(30_000);
    ranges.length = 0;
    const second = await downloadVerified({ url: `${base}/w`, sha256: SHA, to });
    expect(ranges).toEqual(['bytes=30000-']);
    expect(second).toEqual({ ok: true, bytes: BODY.length });
    expect((await readFile(to)).equals(BODY)).toBe(true);
  });

  it('starts over when the server ignores Range', async () => {
    const to = join(await dir(), 'weights.bin');
    await writeFile(`${to}.part`, BODY.subarray(0, 10_000));
    ignoreRange = true;
    try {
      const outcome = await downloadVerified({ url: `${base}/w`, sha256: SHA, to });
      expect(outcome).toEqual({ ok: true, bytes: BODY.length });
      expect((await readFile(to)).equals(BODY)).toBe(true);
    } finally {
      ignoreRange = false;
    }
  });

  it('deletes the .part and says so when the hash does not match', async () => {
    const to = join(await dir(), 'weights.bin');
    const outcome = await downloadVerified({ url: `${base}/w`, sha256: 'ab'.repeat(32), to });
    expect(outcome).toEqual({ ok: false, kind: 'checksum', error: CHECKSUM_MISMATCH });
    await expect(stat(`${to}.part`)).rejects.toThrow();
    await expect(stat(to)).rejects.toThrow();
  });

  it('deletes the .part on cancel', async () => {
    const to = join(await dir(), 'weights.bin');
    const controller = new AbortController();
    const outcome = await downloadVerified({
      url: `${base}/w`,
      sha256: SHA,
      to,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    expect(outcome).toEqual({ ok: false, kind: 'cancelled' });
    await expect(stat(`${to}.part`)).rejects.toThrow();
    await rm(to, { force: true });
  });

  it('makes a binary executable', async () => {
    const to = join(await dir(), 'whisper-cli');
    await downloadVerified({ url: `${base}/b`, sha256: SHA, to, executable: true });
    expect((await stat(to)).mode & 0o111).not.toBe(0);
  });

  it('returns a disk write failure without publishing an incomplete file, then permits retry', async () => {
    const to = join(await dir(), 'runtime.tar');
    const handle = await fs.open(`${to}.probe`, 'w');
    const writeSpy = vi.spyOn(Object.getPrototypeOf(handle), 'writeFile')
      .mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));
    try {
      const outcome = await downloadVerified({ url: `${base}/w`, sha256: SHA, to });
      expect(outcome).toMatchObject({ ok: false, error: 'ENOSPC: no space left on device', received: 0 });
      await expect(stat(to)).rejects.toThrow();
    } finally { writeSpy.mockRestore(); await handle.close(); }
    expect(await downloadVerified({ url: `${base}/w`, sha256: SHA, to })).toEqual({ ok: true, bytes: BODY.length });
  });

  it('refuses an incorrect pinned length even when the checksum matches', async () => {
    const to = join(await dir(), 'runtime.tar');
    expect(await downloadVerified({ url: `${base}/w`, sha256: SHA, bytes: BODY.length + 1, to }))
      .toEqual({ ok: false, kind: 'checksum', error: CHECKSUM_MISMATCH });
    await expect(stat(to)).rejects.toThrow();
  });

  it.each([0, 2])('cancels an oversized body before writing beyond its pin, with %i bytes already held', async (held) => {
    const to = join(await dir(), 'runtime.tar');
    if (held > 0) await writeFile(`${to}.part`, 'x'.repeat(held));
    let pulled = 0;
    const cancel = vi.fn();
    const seen: number[] = [];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled++ < 100) controller.enqueue(Buffer.from('xx'));
        else controller.close();
      },
      cancel,
    }, { highWaterMark: 0 });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: held > 0 ? 206 : 200 }));
    const outcome = await downloadVerified({ url: `${base}/oversized`, to, bytes: 4,
      sha256: createHash('sha256').update('xxxx').digest('hex'), fetch: fetcher,
      onProgress: (received) => seen.push(received) });
    expect(outcome).toEqual({ ok: false, kind: 'checksum', error: CHECKSUM_MISMATCH });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(held > 0 ? { Range: `bytes=${held}-` } : {});
    expect(seen).toEqual(held > 0 ? [4] : [2, 4]);
    expect(pulled).toBeLessThan(100);
    expect(cancel).toHaveBeenCalledOnce();
    await expect(stat(`${to}.part`)).rejects.toThrow();
    await expect(stat(to)).rejects.toThrow();
  });
});
