import * as crypto from 'node:crypto';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { SbxStateChannel } from './state-channel.js';
import { copySbxState } from './state-transfer.js';
import { serveSbxState, type SbxStateWorkerBackend } from './state-worker.js';

type Tree = 'rootfs' | 'home' | 'docker';
const digest = (value: Buffer) => ({ bytes: value.length, sha256: crypto.createHash('sha256').update(value).digest('hex') });
function frame(type: number, value: Buffer | object): Buffer {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(5); header[0] = type; header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
function fixture(role: 'source' | 'target', options: {
  serve?: typeof serveSbxState;
  failDigest?: Tree;
  corruptRestore?: boolean;
  write?: () => Promise<void>;
} = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const state = { rootfs: Buffer.alloc(180_000, role === 'source' ? 1 : 0), home: Buffer.alloc(9000, 2), docker: Buffer.alloc(85_000, 3) };
  const calls: string[] = [];
  const backend: SbxStateWorkerBackend = {
    role,
    async prepare() { calls.push('prepare'); },
    async digest(tree) {
      calls.push('digest:' + tree);
      if (options.failDigest === tree) throw new Error('/home/agent/private-credential');
      return digest(state[tree]);
    },
    async archive(tree, emit) {
      calls.push('archive:' + tree);
      for (let at = 0; at < state[tree].length; at += 65536) await emit(state[tree].subarray(at, at + 65536));
    },
    async receive(tree) {
      calls.push('receive:' + tree);
      const received: Buffer[] = [];
      return {
        async write(data) { await options.write?.(); calls.push('data:' + data.length); received.push(Buffer.from(data)); },
        async finish() {
          calls.push('finish:' + tree); state[tree] = Buffer.concat(received);
          if (options.corruptRestore) state[tree].writeUInt8(state[tree].readUInt8(0) ^ 1, 0);
        },
        async abort() { calls.push('abort:' + tree); },
      };
    },
    async dispose() { calls.push('dispose'); },
  };
  const done = (options.serve ?? serveSbxState)(input, output, backend, crypto);
  const channel = new SbxStateChannel(output, input);
  return { input, output, channel, done, calls, state };
}

describe('guest state worker protocol', () => {
  it('runs the host relay against both real protocol peers, including the serialized guest function', async () => {
    // The guest receives function source, with built-ins supplied by its own bootstrap.
    const standalone = new Function('return (' + serveSbxState.toString() + ')')() as typeof serveSbxState;
    const source = fixture('source', { serve: standalone });
    const target = fixture('target');
    const receipt = await copySbxState(source.channel, target.channel, { maxBytes: 1024 * 1024 });
    expect(target.state).toEqual(source.state);
    expect(receipt.rootfs).toEqual(digest(source.state.rootfs));
    expect(target.calls).toContain('data:65536');
    expect(target.calls).toContain('digest:docker');
    source.channel.close(); target.channel.close();
    await Promise.all([source.done, target.done]);
    expect(source.calls.at(-1)).toBe('dispose');
    expect(target.calls).not.toContain('abort:docker');
  });

  it('refuses a failed preflight before opening any target receiver and does not expose private errors', async () => {
    const source = fixture('source', { failDigest: 'docker' }); const target = fixture('target');
    await expect(copySbxState(source.channel, target.channel, { maxBytes: 1024 * 1024 }))
      .rejects.toThrow('Machine state transfer could not be verified.');
    await Promise.all([source.done, target.done]);
    expect(target.calls).toEqual(['prepare', 'dispose']);
  });

  it('refuses an incorrect wire hash before finishing the receiver', async () => {
    const target = fixture('target');
    await target.channel.initialize(); await target.channel.request('prepare');
    await target.channel.request('receive', { tree: 'home', ...digest(Buffer.alloc(1024, 5)) });
    await target.channel.sendData(Buffer.alloc(1024, 6));
    await expect(target.channel.request('finish', { tree: 'home' })).rejects.toThrow('could not verify');
    await target.done;
    expect(target.calls).not.toContain('finish:home');
    expect(target.calls.slice(-2)).toEqual(['abort:home', 'dispose']);
  });

  it('refuses a restore that differs even when all received bytes were correct', async () => {
    const source = fixture('source'); const target = fixture('target', { corruptRestore: true });
    await expect(copySbxState(source.channel, target.channel, { maxBytes: 1024 * 1024 })).rejects.toThrow('could not be verified');
    await Promise.all([source.done, target.done]);
    expect(target.calls).toContain('finish:rootfs');
    expect(target.calls).toContain('abort:rootfs');
    expect(target.calls).not.toContain('receive:home');
  });

  it.each(['digest before prepare', 'prepare twice', 'wrong role', 'wrong tree', 'wrong id', 'unexpected data', 'oversized frame', 'truncated frame'] as const)
  ('refuses %s and releases its backend', async failure => {
    const f = fixture('source');
    const replies: Buffer[] = []; f.output.on('data', data => replies.push(Buffer.from(data)));
    if (failure !== 'digest before prepare') f.input.write(frame(1, { id: 1, op: 'prepare' }));
    if (failure === 'digest before prepare') f.input.write(frame(1, { id: 1, op: 'digest', tree: 'rootfs' }));
    else if (failure === 'prepare twice') f.input.write(frame(1, { id: 2, op: 'prepare' }));
    else if (failure === 'wrong role') f.input.write(frame(1, { id: 2, op: 'receive', tree: 'home', ...digest(Buffer.alloc(1024)) }));
    else if (failure === 'wrong tree') f.input.write(frame(1, { id: 2, op: 'digest', tree: '/host/private' }));
    else if (failure === 'wrong id') f.input.write(frame(1, { id: 44, op: 'digest', tree: 'rootfs' }));
    else if (failure === 'unexpected data') f.input.write(frame(2, Buffer.from('private')));
    else if (failure === 'oversized frame') { const header = Buffer.alloc(5); header[0] = 2; header.writeUInt32BE(65537, 1); f.input.write(header); }
    else f.input.end(frame(1, { id: 2, op: 'digest', tree: 'home' }).subarray(0, 9));
    await f.done;
    const text = Buffer.concat(replies).toString();
    expect(text).toContain('State operation failed.');
    expect(text).not.toContain('private');
    expect(f.calls.at(-1)).toBe('dispose');
    expect(f.calls.some(call => call.startsWith('receive:') || call.startsWith('archive:'))).toBe(false);
  });

  it('waits for receiver writes and aborts an unfinished transfer on EOF', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const f = fixture('target', { write: () => held });
    await f.channel.initialize(); await f.channel.request('prepare');
    await f.channel.request('receive', { tree: 'home', ...digest(Buffer.alloc(1024)) });
    await f.channel.sendData(Buffer.alloc(1024));
    f.input.end();
    await new Promise(resolve => setImmediate(resolve));
    expect(f.calls).not.toContain('dispose');
    expect(f.calls).not.toContain('data:1024');
    release(); await f.done;
    expect(f.calls.slice(-3)).toEqual(['data:1024', 'abort:home', 'dispose']);
    expect(f.calls).not.toContain('finish:home');
  });

  it('accepts split headers and several complete control frames in one read', async () => {
    const f = fixture('source');
    f.output.resume();
    const bytes = Buffer.concat([
      frame(1, { id: 1, op: 'prepare' }),
      frame(1, { id: 2, op: 'digest', tree: 'rootfs' }),
      frame(1, { id: 3, op: 'digest', tree: 'home' }),
    ]);
    f.input.write(bytes.subarray(0, 2));
    await new Promise(resolve => setImmediate(resolve));
    expect(f.calls).toEqual([]);
    f.input.end(bytes.subarray(2));
    await f.done;
    expect(f.calls).toEqual(['prepare', 'digest:rootfs', 'digest:home', 'dispose']);
  });
});
