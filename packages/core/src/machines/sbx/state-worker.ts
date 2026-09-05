import type { Readable, Writable } from 'node:stream';
import type { SbxStateReceipt, SbxTreeDigest } from './state-transfer.js';

type Tree = keyof SbxStateReceipt;

/** Private guest operations. Paths, archive diagnostics and metadata never enter replies. */
export interface SbxStateWorkerBackend {
  readonly role: 'source' | 'target';
  /** Establish held maintenance and isolated views before any tree can be read or changed. */
  prepare(): Promise<void>;
  /** Must preflight archive coverage and metadata fidelity, not merely hash a tar stream. */
  digest(tree: Tree): Promise<SbxTreeDigest>;
  archive(tree: Tree, emit: (chunk: Buffer) => Promise<void>): Promise<void>;
  receive(tree: Tree, expected: SbxTreeDigest): Promise<{
    write(chunk: Buffer): Promise<void>;
    /** Complete extraction and its guest-side validation. Wire digest was checked first. */
    finish(): Promise<void>;
    abort(): Promise<void>;
  }>;
  /** Close workers/views. Never thaw into unverified state; the lifecycle owner stops the VM. */
  dispose(): Promise<void>;
}

/**
 * Guest half of blobot-state-v1. Self-contained so its compiled function can be sent to the
 * guest without resolving a host module there. The backend owns filesystem/maintenance work;
 * this layer owns ordering, opaque bounded frames and independent wire digest verification.
 * A live backend still must close the full-state fidelity gates before replacement is enabled.
 */
export async function serveSbxState(
  input: Readable, output: Writable, backend: SbxStateWorkerBackend,
  crypto: Pick<typeof import('node:crypto'), 'createHash'>,
): Promise<void> {
  const { createHash } = crypto;
  const maxControl = 1024 * 1024;
  const maxData = 64 * 1024;
  let prepared = false;
  let lastId = 0;
  let receiving: {
    tree: Tree;
    expected: SbxTreeDigest;
    bytes: number;
    hash: ReturnType<typeof createHash>;
    receiver: Awaited<ReturnType<SbxStateWorkerBackend['receive']>>;
  } | undefined;
  const fail = (): never => { throw new Error('Machine state operation could not be verified.'); };
  const treeOf = (value: unknown): Tree => {
    if (value !== 'rootfs' && value !== 'home' && value !== 'docker') return fail();
    return value;
  };
  const digestOf = (value: unknown): SbxTreeDigest => {
    if (typeof value !== 'object' || value === null || !('bytes' in value) || !('sha256' in value) ||
        !Number.isSafeInteger(value.bytes) || (value.bytes as number) < 1024 ||
        typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) return fail();
    return { bytes: value.bytes as number, sha256: value.sha256 };
  };
  const equal = (left: SbxTreeDigest, right: SbxTreeDigest): void => {
    if (left.bytes !== right.bytes || left.sha256 !== right.sha256) fail();
  };
  const send = async (type: number, payload: Buffer): Promise<void> => {
    if (payload.length > (type === 2 ? maxData : maxControl)) fail();
    const header = Buffer.alloc(5);
    header[0] = type; header.writeUInt32BE(payload.length, 1);
    await new Promise<void>((resolve, reject) => {
      output.write(Buffer.concat([header, payload]), error => error ? reject(error) : resolve());
    });
  };
  const reply = (result: unknown): Promise<void> => send(1, Buffer.from(JSON.stringify({ id: lastId, result })));
  const outputError = (): void => {};
  output.on('error', outputError);
  async function handle(type: number, payload: Buffer): Promise<void> {
    if (type === 2) {
      if (receiving === undefined || payload.length === 0) return fail();
      receiving.bytes += payload.length;
      if (receiving.bytes > receiving.expected.bytes) return fail();
      receiving.hash.update(payload);
      await receiving.receiver.write(payload);
      return;
    }
    const value: unknown = JSON.parse(payload.toString('utf8'));
    if (typeof value !== 'object' || value === null || !('id' in value) || !('op' in value) ||
        !Number.isSafeInteger(value.id) || value.id !== lastId + 1 || typeof value.op !== 'string') return fail();
    lastId = value.id as number;
    const request = value as { id: number; op: string; tree?: unknown };
    if (receiving !== undefined && request.op !== 'finish') return fail();
    if (request.op === 'prepare') {
      if (prepared) return fail();
      await backend.prepare();
      prepared = true;
      await reply({ prepared: true });
      return;
    }
    if (!prepared) return fail();
    const tree = treeOf(request.tree);
    if (request.op === 'digest') {
      await reply(digestOf(await backend.digest(tree)));
    } else if (request.op === 'archive') {
      if (backend.role !== 'source') return fail();
      // Preflight again so a source that changed after the host's receipt cannot silently stream.
      const expected = digestOf(await backend.digest(tree));
      const hash = createHash('sha256');
      let bytes = 0;
      await backend.archive(tree, async chunk => {
        if (!Buffer.isBuffer(chunk) || chunk.length === 0 || chunk.length > maxData) return fail();
        bytes += chunk.length;
        if (bytes > expected.bytes) return fail();
        hash.update(chunk);
        await send(2, chunk);
      });
      const actual = { bytes, sha256: hash.digest('hex') };
      equal(actual, expected);
      await reply(actual);
    } else if (request.op === 'receive') {
      if (backend.role !== 'target') return fail();
      const expected = digestOf(value);
      const receiver = await backend.receive(tree, expected);
      receiving = { tree, expected, receiver, bytes: 0, hash: createHash('sha256') };
      await reply({ receiving: tree });
    } else if (request.op === 'finish') {
      if (receiving === undefined || receiving.tree !== tree) return fail();
      const actual = { bytes: receiving.bytes, sha256: receiving.hash.digest('hex') };
      equal(actual, receiving.expected);
      await receiving.receiver.finish();
      // The backend re-reads restored state; a correct wire SHA does not prove correct extraction.
      equal(digestOf(await backend.digest(tree)), receiving.expected);
      receiving = undefined;
      await reply(actual);
    } else fail();
  }
  try {
    if (backend.role !== 'source' && backend.role !== 'target') fail();
    await reply({ protocol: 'blobot-state-v1', role: backend.role });
    // Retain at most one bounded frame, even if a pipe delivers many frames in one read.
    let pending = Buffer.alloc(0);
    let wanted = 5;
    for await (const value of input) {
      const chunk: Buffer = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      let at = 0;
      while (at < chunk.length) {
        const end = Math.min(chunk.length, at + wanted - pending.length);
        pending = Buffer.concat([pending, chunk.subarray(at, end)]);
        at = end;
        if (pending.length < wanted) continue;
        if (wanted === 5) {
          const type = pending[0];
          const length = pending.readUInt32BE(1);
          if ((type !== 1 && type !== 2) || length === 0 || length > (type === 2 ? maxData : maxControl)) fail();
          wanted = 5 + length;
          continue;
        }
        await handle(pending[0]!, pending.subarray(5));
        pending = Buffer.alloc(0); wanted = 5;
      }
    }
    if (pending.length !== 0 || receiving !== undefined) fail();
  } catch {
    // No archive warnings, paths, credentials or backend exception text cross this boundary.
    try { await send(1, Buffer.from(JSON.stringify({ id: lastId, error: 'State operation failed.' }))); }
    catch { /* The lifecycle owner also sees the closed channel. */ }
  } finally {
    try { await receiving?.receiver.abort(); } catch { /* Retain the unverified candidate. */ }
    try { await backend.dispose(); } catch { /* The lifecycle owner must stop this guest. */ }
    input.destroy(); output.end();
    // Keep the error listener until the last buffered write has settled.
  }
}
