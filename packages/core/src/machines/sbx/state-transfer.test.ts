import { createHash } from 'node:crypto';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { SbxStateChannel } from './state-channel.js';
import { copySbxState, verifySbxState, type SbxStateReceipt } from './state-transfer.js';

type Tree = keyof SbxStateReceipt;
const trees: Tree[] = ['rootfs', 'home', 'docker'];
const digest = (bytes: Buffer) => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
const content = (): Record<Tree, Buffer> => ({ rootfs: Buffer.alloc(150_000, 1), home: Buffer.alloc(12_000, 2), docker: Buffer.alloc(80_000, 3) });
const limit = { maxBytes: 1024 * 1024 };

function frame(type: number, bytes: Buffer): Buffer {
  const header = Buffer.alloc(5); header[0] = type; header.writeUInt32BE(bytes.length, 1);
  return Buffer.concat([header, bytes]);
}

/** Two actual framed streams; all received data belongs to this synthetic worker fixture. */
function worker(role: 'source' | 'target', data = content(), options: {
  history?: string[];
  failDigest?: Tree;
  corruptArchive?: boolean;
  corruptRestore?: boolean;
  onData?: () => void;
} = {}) {
  const input = new PassThrough();
  let receiving: Tree | undefined;
  let pending: Buffer[] = [];
  let maxFrame = 0;
  const ops: string[] = [];
  const reply = (id: number, result: unknown) => input.write(frame(1, Buffer.from(JSON.stringify({ id, result }))));
  const output = new Writable({ write(bytes: Buffer, _encoding, callback) {
    const type = bytes[0], value = bytes.subarray(5);
    if (type === 2) {
      maxFrame = Math.max(maxFrame, value.length);
      pending.push(Buffer.from(value));
      options.onData?.();
      setImmediate(callback); // Receiver pipe writes cannot be treated as fire-and-forget.
      return;
    }
    const request = JSON.parse(value.toString()) as { id: number; op: string; tree?: Tree };
    const { id, op, tree } = request;
    ops.push(op); options.history?.push(role + ':' + op + ':' + (tree ?? ''));
    if (op === 'prepare') reply(id, { prepared: true });
    else if (op === 'digest' && tree === options.failDigest) {
      input.write(frame(1, Buffer.from(JSON.stringify({ id, error: 'private filename could not be archived' }))));
    } else if (op === 'digest' && tree) reply(id, digest(data[tree]));
    else if (op === 'receive' && tree) { receiving = tree; pending = []; reply(id, { receiving: tree }); }
    else if (op === 'finish' && receiving) {
      data[receiving] = Buffer.concat(pending);
      reply(id, digest(data[receiving]));
      if (options.corruptRestore) data[receiving].writeUInt8(data[receiving].readUInt8(0) ^ 1, 0);
      receiving = undefined;
    } else if (op === 'archive' && tree) {
      const sent = Buffer.from(data[tree]);
      if (options.corruptArchive) sent.writeUInt8(sent.readUInt8(0) ^ 1, 0);
      for (let offset = 0; offset < sent.length; offset += 64 * 1024) {
        input.write(frame(2, sent.subarray(offset, offset + 64 * 1024)));
      }
      reply(id, digest(data[tree]));
    } else { callback(new Error('Unexpected synthetic worker operation')); return; }
    callback();
  } });
  const channel = new SbxStateChannel(input, output);
  reply(0, { protocol: 'blobot-state-v1', role });
  return { channel, data, input, output, ops, maxFrame: () => maxFrame };
}

describe('private Machine state relay', () => {
  it('preflights every tree, verifies all transferred/restored bytes and verifies a reopened candidate', async () => {
    const history: string[] = [];
    const source = worker('source', content(), { history });
    const target = worker('target', content(), { history });
    const receipt = await copySbxState(source.channel, target.channel, limit);
    expect(receipt).toEqual(Object.fromEntries(trees.map(tree => [tree, digest(source.data[tree])])));
    expect(target.data).toEqual(source.data);
    expect(history.indexOf('source:digest:docker')).toBeLessThan(history.indexOf('target:receive:rootfs'));
    expect(target.maxFrame()).toBe(64 * 1024);
    expect(source.input.destroyed).toBe(false); // Lifecycle owner must stop both guests next.
    source.channel.close(); target.channel.close();
    const reopened = worker('target', target.data);
    await expect(verifySbxState(reopened.channel, receipt, limit)).resolves.toBeUndefined();
    expect(reopened.ops).toEqual(['prepare', 'digest', 'digest', 'digest']);
    reopened.channel.close();
  });

  it('refuses an unsupported source tree before starting any restore, without disclosing its error', async () => {
    const source = worker('source', content(), { failDigest: 'docker' });
    const target = worker('target');
    await expect(copySbxState(source.channel, target.channel, limit)).rejects.toThrow('Machine state transfer could not be verified.');
    expect(target.ops).toEqual(['prepare']);
    expect(source.input.destroyed && target.input.destroyed).toBe(true);
  });

  it.each(['transport', 'restore'] as const)('refuses corrupted %s bytes without advancing to another tree', async failure => {
    const source = worker('source', content(), { corruptArchive: failure === 'transport' });
    const target = worker('target', content(), { corruptRestore: failure === 'restore' });
    await expect(copySbxState(source.channel, target.channel, limit)).rejects.toThrow('could not be verified');
    expect(target.ops.filter(op => op === 'receive')).toHaveLength(1);
    expect(source.input.destroyed && target.input.destroyed).toBe(true);
  });

  it('bounds the aggregate transfer before any receiver mutation', async () => {
    const source = worker('source'); const target = worker('target');
    await expect(copySbxState(source.channel, target.channel, { maxBytes: 200_000 })).rejects.toThrow('could not be verified');
    expect(target.ops).toEqual(['prepare']);
  });

  it('cancels in a blocked data write and closes both held channels', async () => {
    const controller = new AbortController();
    const source = worker('source');
    const target = worker('target', content(), { onData: () => controller.abort(new Error('private abort detail')) });
    await expect(copySbxState(source.channel, target.channel, { ...limit, signal: controller.signal })).rejects.toThrow('Machine state transfer was cancelled.');
    expect(source.input.destroyed && target.input.destroyed).toBe(true);
    expect(target.ops).not.toContain('finish');
  });

  it('refuses pre-cancelled work without starting maintenance', async () => {
    const source = worker('source'); const target = worker('target');
    await expect(copySbxState(source.channel, target.channel, { ...limit, signal: AbortSignal.abort() })).rejects.toThrow('cancelled');
    expect(source.ops).toEqual([]); expect(target.ops).toEqual([]);
  });

  it('refuses changed state after reopen', async () => {
    const source = worker('source'); const target = worker('target');
    const receipt = await copySbxState(source.channel, target.channel, limit);
    source.channel.close(); target.channel.close();
    target.data.home.writeUInt8(target.data.home.readUInt8(0) ^ 1, 0);
    const reopened = worker('target', target.data);
    await expect(verifySbxState(reopened.channel, receipt, limit)).rejects.toThrow('Reopened Machine state could not be verified.');
    expect(reopened.output.destroyed).toBe(true);
  });
});
