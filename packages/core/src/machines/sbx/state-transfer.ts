import { createHash } from 'node:crypto';
import { SbxStateChannel } from './state-channel.js';

const TREES = ['rootfs', 'home', 'docker'] as const;
type StateTree = typeof TREES[number];
export interface SbxTreeDigest {
  readonly bytes: number;
  readonly sha256: string;
}
/** No filenames or private contents: suitable for the durable replacement journal. */
export type SbxStateReceipt = Readonly<Record<StateTree, SbxTreeDigest>>;

export interface SbxStateTransferOptions {
  /** Bound the complete encoded transfer, not its in-memory buffer or logical sparse size. */
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
}

function digest(value: unknown, maxBytes: number): SbxTreeDigest {
  if (typeof value !== 'object' || value === null || !('bytes' in value) || !('sha256' in value) ||
      !Number.isSafeInteger(value.bytes) || (value.bytes as number) < 1024 || (value.bytes as number) > maxBytes ||
      typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error('Machine state verification is invalid.');
  }
  return { bytes: value.bytes as number, sha256: value.sha256 };
}

function same(actual: SbxTreeDigest, expected: SbxTreeDigest): void {
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error('Machine state verification did not match.');
  }
}

function limit(options: SbxStateTransferOptions): void {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 3072) {
    throw new Error('Invalid Machine state transfer limit.');
  }
  options.signal?.throwIfAborted();
}

async function prepare(channel: SbxStateChannel, role: 'source' | 'target'): Promise<void> {
  const hello = await channel.initialize();
  if (typeof hello !== 'object' || hello === null || !('protocol' in hello) ||
      hello.protocol !== 'blobot-state-v1' || !('role' in hello) || hello.role !== role) {
    throw new Error('Machine state worker is incompatible.');
  }
  const prepared = await channel.request('prepare');
  if (typeof prepared !== 'object' || prepared === null || !('prepared' in prepared) || prepared.prepared !== true) {
    throw new Error('Machine state maintenance could not be established.');
  }
}

/**
 * Relay between two held, owned guest workers. The worker contract requires prepare to quiesce
 * Docker, freeze the entire application container and establish verified private mount views.
 * All source trees pass preflight before the receiver changes a persistent byte. Guest archive
 * warnings or unsupported metadata must fail digest, not produce a partial-success receipt.
 *
 * Neither worker is stopped or thawed here on success: the caller owns the lifecycle lock and
 * must stop/reopen and verify the candidate before committing the active reference. On failure
 * channels close; the caller must stop both owned guests, retaining the original and candidate.
 * This protocol alone does not enable resource replacement.
 */
export async function copySbxState(
  source: SbxStateChannel, target: SbxStateChannel, options: SbxStateTransferOptions,
): Promise<SbxStateReceipt> {
  const close = () => { source.close(); target.close(); };
  const aborted = () => { if (options.signal?.aborted) throw new Error('Machine state transfer was cancelled.'); };
  try {
    limit(options);
    if (source === target) throw new Error('Machine state transfer requires different workers.');
    options.signal?.addEventListener('abort', close, { once: true });
    aborted();
    await prepare(source, 'source');
    await prepare(target, 'target');
    const receipt = {} as Record<StateTree, SbxTreeDigest>;
    let total = 0;
    for (const tree of TREES) {
      aborted();
      receipt[tree] = digest(await source.request('digest', { tree }), options.maxBytes);
      total += receipt[tree].bytes;
      if (!Number.isSafeInteger(total) || total > options.maxBytes) throw new Error('Machine state exceeds the transfer limit.');
    }
    for (const tree of TREES) {
      aborted();
      const expected = receipt[tree];
      const ready = await target.request('receive', { tree, ...expected });
      if (typeof ready !== 'object' || ready === null || !('receiving' in ready) || ready.receiving !== tree) {
        throw new Error('Machine state receiver is not ready.');
      }
      const hash = createHash('sha256');
      let bytes = 0;
      const sent = await source.request('archive', { tree }, async (data) => {
        aborted();
        bytes += data.length;
        if (bytes > expected.bytes) throw new Error('Machine state changed during transfer.');
        hash.update(data);
        await target.sendData(data);
      });
      same({ bytes, sha256: hash.digest('hex') }, expected);
      same(digest(sent, options.maxBytes), expected);
      same(digest(await target.request('finish', { tree }), options.maxBytes), expected);
      same(digest(await target.request('digest', { tree }), options.maxBytes), expected);
    }
    aborted();
    return receipt;
  } catch {
    close();
    throw new Error(options.signal?.aborted ? 'Machine state transfer was cancelled.' : 'Machine state transfer could not be verified.');
  } finally { options.signal?.removeEventListener('abort', close); }
}

/**
 * Compare all three trees in a fresh, held maintenance session. This is a strict byte check,
 * not a general post-boot acceptance check: an ordinary sbx reopen starts Docker and can
 * legitimately change persistent files. The lifecycle must establish maintenance before
 * such writers run or separately verify their effects; this function never excludes paths.
 */
export async function verifySbxState(
  target: SbxStateChannel, receipt: SbxStateReceipt, options: SbxStateTransferOptions,
): Promise<void> {
  const close = () => target.close();
  try {
    limit(options);
    const expected = TREES.map(tree => [tree, digest(receipt[tree], options.maxBytes)] as const);
    const total = expected.reduce((sum, [, value]) => sum + value.bytes, 0);
    if (!Number.isSafeInteger(total) || total > options.maxBytes) throw new Error('Invalid Machine state receipt.');
    options.signal?.addEventListener('abort', close, { once: true });
    options.signal?.throwIfAborted();
    await prepare(target, 'target');
    for (const [tree, value] of expected) {
      options.signal?.throwIfAborted();
      same(digest(await target.request('digest', { tree }), options.maxBytes), value);
    }
    options.signal?.throwIfAborted();
  } catch {
    close();
    throw new Error(options.signal?.aborted ? 'Machine state verification was cancelled.' : 'Reopened Machine state could not be verified.');
  } finally { options.signal?.removeEventListener('abort', close); }
}
