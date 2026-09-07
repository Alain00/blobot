import type { Readable, Writable } from 'node:stream';

const MAX_FRAME = 1024 * 1024;
const DATA_FRAME = 64 * 1024;
type DataConsumer = (data: Buffer) => Promise<void>;

async function write(output: Writable, bytes: Buffer): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      output.write(bytes, (error) => error ? reject(error) : resolve());
    });
  } catch { throw new Error('Machine state channel closed.'); }
}

async function* chunks(input: Readable): AsyncGenerator<Buffer> {
  try {
    for await (const value of input) yield Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
  } catch { throw new Error('Machine state input could not be read.'); }
}

async function* frames(input: Readable): AsyncGenerator<{ type: number; payload: Buffer }> {
  let pending: Buffer = Buffer.alloc(0);
  for await (const chunk of chunks(input)) {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    while (pending.length >= 5) {
      const type = pending[0];
      const length = pending.readUInt32BE(1);
      if ((type !== 1 && type !== 2) || length > MAX_FRAME || (type === 2 && length > DATA_FRAME)) {
        throw new Error('Invalid Machine state frame.');
      }
      if (pending.length < 5 + length) break;
      const payload = pending.subarray(5, 5 + length);
      pending = pending.subarray(5 + length);
      yield { type, payload };
    }
  }
  if (pending.length !== 0) throw new Error('Truncated Machine state frame.');
}

/**
 * A single maintained guest exec carries control replies and opaque archive frames. Every
 * write and data consumer is awaited so large private state never accumulates in host memory.
 * Guest errors and archive contents never become application error text.
 */
export class SbxStateChannel {
  readonly #frames: AsyncGenerator<{ type: number; payload: Buffer }>;
  #nextId = 1;
  #busy = false;
  #initialized = false;
  #closed = false;
  constructor(readonly input: Readable, readonly output: Writable) {
    this.#frames = frames(input);
    // write callbacks report errors to the operation; an EPIPE must not crash the host.
    output.on('error', () => {});
  }

  async initialize(): Promise<unknown> {
    if (this.#busy || this.#initialized || this.#closed) throw new Error('Machine state channel already initialized or closed.');
    this.#busy = true;
    try {
      const result = await this.#reply(0);
      this.#initialized = true;
      return result;
    } catch (error) { this.close(); throw error; }
    finally { this.#busy = false; }
  }

  async request(operation: string, fields: Readonly<Record<string, unknown>> = {}, onData?: DataConsumer): Promise<unknown> {
    if (!this.#initialized || this.#busy || this.#closed || !/^[a-z][A-Za-z]{0,31}$/.test(operation)) {
      throw new Error('Machine state operation cannot start.');
    }
    this.#busy = true;
    const id = this.#nextId++;
    try {
      await this.#send(1, Buffer.from(JSON.stringify({ ...fields, id, op: operation })));
      return await this.#reply(id, onData);
    } catch (error) { this.close(); throw error; }
    finally { this.#busy = false; }
  }

  async sendData(data: Buffer): Promise<void> {
    if (!this.#initialized || this.#busy || this.#closed || data.length > DATA_FRAME) throw new Error('Invalid Machine state data.');
    this.#busy = true;
    try { await this.#send(2, data); }
    catch (error) { this.close(); throw error; }
    finally { this.#busy = false; }
  }

  /** Closing also interrupts a pending read; the owning migration stops its guest worker. */
  close(): void {
    this.#closed = true;
    this.input.destroy();
    this.output.destroy();
  }

  async #send(type: number, payload: Buffer): Promise<void> {
    if (payload.length > MAX_FRAME) throw new Error('Machine state request is too large.');
    const header = Buffer.alloc(5);
    header[0] = type;
    header.writeUInt32BE(payload.length, 1);
    await write(this.output, Buffer.concat([header, payload]));
  }

  async #reply(id: number, onData?: DataConsumer): Promise<unknown> {
    for (;;) {
      const next = await this.#frames.next();
      if (next.done) throw new Error('Machine state worker ended before verification.');
      if (next.value.type === 2) {
        if (onData === undefined) throw new Error('Unexpected Machine state data.');
        try { await onData(next.value.payload); }
        catch { throw new Error('Machine state data could not be transferred.'); }
        continue;
      }
      let value: unknown;
      try { value = JSON.parse(next.value.payload.toString('utf8')); }
      catch { throw new Error('Invalid Machine state reply.'); }
      if (typeof value !== 'object' || value === null || !('id' in value) || value.id !== id) {
        throw new Error('Unexpected Machine state reply.');
      }
      if ('error' in value || !('result' in value)) throw new Error('Machine state worker could not verify the operation.');
      return value.result;
    }
  }
}
