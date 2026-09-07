import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { SbxStateChannel } from './state-channel.js';

function frame(type: number, value: Buffer | object): Buffer {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(5); header[0] = type; header.writeUInt32BE(body.length, 1);
  return Buffer.concat([header, body]);
}
function fixture() {
  const input = new PassThrough();
  const sent: Buffer[] = [];
  const output = new Writable({ write(chunk, _encoding, callback) { sent.push(Buffer.from(chunk)); callback(); } });
  const channel = new SbxStateChannel(input, output);
  input.write(frame(1, { id: 0, result: { protocol: 1 } }));
  return { input, output, sent, channel };
}

describe('maintained state channel', () => {
  it('reassembles split frames and waits for each opaque data consumer', async () => {
    const f = fixture(); await expect(f.channel.initialize()).resolves.toEqual({ protocol: 1 });
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const consumed: string[] = [];
    const request = f.channel.request('archive', {}, async data => { consumed.push(data.toString()); await paused; });
    const bytes = Buffer.concat([frame(2, Buffer.from('opaque')), frame(1, { id: 1, result: { bytes: 6 } })]);
    f.input.write(bytes.subarray(0, 3)); f.input.write(bytes.subarray(3));
    await new Promise(resolve => setImmediate(resolve));
    expect(consumed).toEqual(['opaque']);
    await expect(f.channel.request('digest')).rejects.toThrow('cannot start');
    release();
    await expect(request).resolves.toEqual({ bytes: 6 });
    expect(JSON.parse(f.sent[0]!.subarray(5).toString())).toEqual({ id: 1, op: 'archive' });
    f.input.end();
  });

  it('awaits pipe writes and rejects broken pipes without surfacing payloads', async () => {
    const input = new PassThrough(); let finish!: (error?: Error | null) => void;
    const output = new Writable({ write(_chunk, _encoding, callback) { finish = callback; } });
    const channel = new SbxStateChannel(input, output);
    input.write(frame(1, { id: 0, result: null })); await channel.initialize();
    let settled = false;
    const write = channel.sendData(Buffer.from('private state')).finally(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve)); expect(settled).toBe(false);
    await expect(channel.sendData(Buffer.from('next'))).rejects.toThrow('Invalid Machine state data.');
    await expect(channel.request('restoreEnd')).rejects.toThrow('cannot start');
    finish(new Error('sensitive guest detail'));
    await expect(write).rejects.toThrow('Machine state channel closed.');
    await expect(channel.request('restoreEnd')).rejects.toThrow('cannot start');
    input.end();
  });

  it.each(['oversized', 'truncated', 'wrong id', 'unexpected data', 'guest error'] as const)('refuses %s responses', async failure => {
    const f = fixture(); await f.channel.initialize();
    const reply = f.channel.request('digest');
    if (failure === 'oversized') { const header = Buffer.alloc(5); header[0] = 1; header.writeUInt32BE(1024 * 1024 + 1, 1); f.input.end(header); }
    else if (failure === 'truncated') f.input.end(frame(1, { id: 1, result: null }).subarray(0, 7));
    else if (failure === 'wrong id') f.input.end(frame(1, { id: 2, result: null }));
    else if (failure === 'unexpected data') f.input.end(frame(2, Buffer.from('private')));
    else f.input.end(frame(1, { id: 1, error: 'private filename or credential' }));
    await expect(reply).rejects.toThrow(/^((Invalid|Truncated|Unexpected) Machine state|Machine state worker)/);
    await expect(reply).rejects.not.toThrow('private');
    await expect(f.channel.request('digest')).rejects.toThrow('cannot start');
    expect(f.input.destroyed).toBe(true);
    expect(f.output.destroyed).toBe(true);
  });

  it.each(['input', 'consumer'] as const)('does not disclose private %s errors', async failure => {
    const f = fixture(); await f.channel.initialize();
    const reply = f.channel.request('archive', {}, async () => { throw new Error('private filename'); });
    if (failure === 'input') f.input.destroy(new Error('private filename'));
    else f.input.write(frame(2, Buffer.from('private bytes')));
    await expect(reply).rejects.toThrow(failure === 'input'
      ? 'Machine state input could not be read.' : 'Machine state data could not be transferred.');
    expect(f.input.destroyed).toBe(true);
    expect(f.output.destroyed).toBe(true);
  });

  it('interrupts a pending reply when the owner closes the channel', async () => {
    const f = fixture(); await f.channel.initialize();
    const reply = f.channel.request('digest');
    await new Promise(resolve => setImmediate(resolve));
    f.channel.close();
    await expect(reply).rejects.toThrow('Machine state input could not be read.');
    await expect(f.channel.sendData(Buffer.from('private'))).rejects.toThrow('Invalid Machine state data.');
  });
});
