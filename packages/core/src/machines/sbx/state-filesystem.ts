import type * as fs from 'node:fs';
import type * as cp from 'node:child_process';
import type * as crypto from 'node:crypto';
import type { SbxStateWorkerBackend } from './state-worker.js';
import type { SbxTreeDigest } from './state-transfer.js';
import type { prepareSbxStateMaintenance, SbxStateMaintenance } from './state-maintenance.js';
import type { createStateArchiveVerifier } from './state-archive.js';
import type { createSbxArchiveIndex, selectSbxArchiveMembers } from './state-archive-index.js';
import type { readSbxStateTree } from './state-tree.js';
import type { receiveSbxStateArchive } from './state-restore.js';
import type { createSbxStateDescriptionCodec, SbxStateDescription } from './state-description.js';
import type { createSbxStateBundleReader, sbxStateBundleHeader } from './state-bundle.js';

/** Guest-private Linux metadata operations, supplied by the attribute helper. */
export interface SbxStateAttributeBackend {
  inspect(path: string, members: SbxStateDescription['members'], assertHeld: () => void): Promise<Buffer>;
  /** Validate complete coverage and whether this source can be represented before streaming. */
  preflight(description: SbxStateDescription): void;
  plan(path: string, source: SbxStateDescription, target: SbxStateDescription, assertHeld: () => void): {
    readonly changed: ReadonlySet<string>;
    prepare(selection: Buffer | null): Promise<void>;
    finish(): Promise<void>;
  };
}

/**
 * Compose held private views, full PAX, attribute preflight and bounded metadata-first bundles.
 * Only the guest sees paths or manifests. No unverified target becomes a source of receipts.
 * Self-contained for serialization; the lifecycle still owns VM stop and durable cutover.
 */
export function createSbxFilesystemStateBackend(
  builtins: { readonly fs: typeof fs; readonly commands: typeof cp; readonly crypto: typeof crypto },
  modules: {
    readonly prepare: typeof prepareSbxStateMaintenance;
    readonly verify: typeof createStateArchiveVerifier;
    readonly index: typeof createSbxArchiveIndex;
    readonly select: typeof selectSbxArchiveMembers;
    readonly read: typeof readSbxStateTree;
    readonly receive: typeof receiveSbxStateArchive;
    readonly description: typeof createSbxStateDescriptionCodec;
    readonly header: typeof sbxStateBundleHeader;
    readonly bundle: typeof createSbxStateBundleReader;
  },
  attributes: SbxStateAttributeBackend,
  options: {
    readonly role: 'source' | 'target';
    readonly token: string;
    readonly maximumTreeBytes: number;
  },
): SbxStateWorkerBackend {
  type Tree = 'rootfs' | 'home' | 'docker';
  interface Snapshot {
    readonly description: SbxStateDescription;
    readonly metadata: Buffer;
    readonly header: Buffer;
    readonly archiveDigest: SbxTreeDigest;
    readonly digest: SbxTreeDigest;
  }
  const fail = (): never => { throw new Error('Machine state filesystem could not be verified.'); };
  if ((options.role !== 'source' && options.role !== 'target') ||
      !Number.isSafeInteger(options.maximumTreeBytes) || options.maximumTreeBytes < 1024) fail();
  const codec = modules.description();
  const snapshots = new Map<Tree, Snapshot>();
  let maintenance: SbxStateMaintenance | undefined;
  let receiver: Awaited<ReturnType<typeof receiveSbxStateArchive>> | undefined;
  let receiving = false, disposed = false, prepared = false;
  const held = (): SbxStateMaintenance => {
    if (disposed || !prepared || maintenance === undefined) return fail();
    maintenance.assertHeld();
    return maintenance;
  };
  const equal = (a: SbxTreeDigest, b: SbxTreeDigest): void => {
    if (a.bytes !== b.bytes || a.sha256 !== b.sha256) fail();
  };
  const read = async (tree: Tree, emit?: (chunk: Buffer) => Promise<void>) => {
    const current = held();
    return modules.read(builtins, modules, {
      path: current.views[tree], maxBytes: options.maximumTreeBytes,
      assertHeld: current.assertHeld, ...(emit === undefined ? {} : { emit }),
    });
  };
  const inspect = async (tree: Tree): Promise<Snapshot> => {
    const current = held();
    const first = await read(tree);
    const description: SbxStateDescription = {
      members: first.members,
      attributes: await attributes.inspect(current.views[tree], first.members, current.assertHeld),
    };
    attributes.preflight(description);
    const metadata = codec.encode(description), header = modules.header(metadata);
    const hash = builtins.crypto.createHash('sha256').update(header).update(metadata);
    const second = await read(tree, async chunk => { hash.update(chunk); });
    equal(first.digest, second.digest);
    const bytes = header.length + metadata.length + second.digest.bytes;
    if (!Number.isSafeInteger(bytes) || bytes > options.maximumTreeBytes) fail();
    const result = { description, metadata, header, archiveDigest: second.digest,
      digest: { bytes, sha256: hash.digest('hex') } };
    snapshots.set(tree, result);
    return result;
  };
  const snapshot = async (tree: Tree): Promise<Snapshot> => {
    held();
    // The original writers remain frozen, and this worker admits one operation at a time.
    // A receive invalidates its tree before mutation; restoration creates a fresh snapshot.
    return snapshots.get(tree) ?? inspect(tree);
  };
  return {
    role: options.role,
    async prepare() {
      if (prepared || disposed) fail();
      maintenance = await modules.prepare(builtins.fs, builtins.commands, options);
      prepared = true;
    },
    async digest(tree) {
      if (receiving) fail();
      return (await snapshot(tree)).digest;
    },
    async archive(tree, emit) {
      if (options.role !== 'source' || receiving) fail();
      const source = await snapshot(tree);
      for (const bytes of [source.header, source.metadata]) {
        for (let at = 0; at < bytes.length; at += 65536) await emit(bytes.subarray(at, at + 65536));
      }
      const streamed = await read(tree, emit);
      equal(streamed.digest, source.archiveDigest);
      const current = held();
      const after = await attributes.inspect(current.views[tree], streamed.members, current.assertHeld);
      if (!after.equals(source.description.attributes)) fail();
    },
    async receive(tree, expected) {
      if (options.role !== 'target' || receiving || expected.bytes > options.maximumTreeBytes) fail();
      const current = held();
      // This target inventory is private preparation, not a restoration receipt.
      const before = await read(tree);
      const target: SbxStateDescription = { members: before.members,
        attributes: await attributes.inspect(current.views[tree], before.members, current.assertHeld) };
      snapshots.delete(tree);
      receiving = true;
      let ended = false;
      const consumer = modules.bundle({
        async metadata(bytes) {
          const source = codec.decode(bytes);
          attributes.preflight(source);
          const plan = attributes.plan(current.views[tree], source, target, current.assertHeld);
          receiver = await modules.receive(builtins, modules, {
            path: current.views[tree], privateDirectory: '/run/blobot-state-' + options.token,
            source: source.members, target: target.members, changedAttributes: plan.changed,
            assertHeld: current.assertHeld,
            prepareAttributes: selection => plan.prepare(selection), finishAttributes: () => plan.finish(),
          });
        },
        async archive(chunk) {
          if (receiver === undefined) fail();
          await receiver!.write(chunk);
        },
      });
      return {
        async write(chunk) {
          if (ended || disposed) fail();
          await consumer.write(chunk);
        },
        async finish() {
          if (ended || disposed || receiver === undefined) fail();
          consumer.finish();
          await receiver!.finish();
          receiver = undefined;
          // Compare the actual restored archive AND attribute manifest, not the incoming wire.
          equal((await inspect(tree)).digest, expected);
          receiving = false;
          ended = true;
        },
        async abort() {
          ended = true;
          await receiver?.abort();
          receiver = undefined;
          snapshots.delete(tree);
          // An aborted candidate cannot yield receipts or accept another operation.
          disposed = true;
        },
      };
    },
    async dispose() {
      disposed = true;
      snapshots.clear();
      try { await receiver?.abort(); }
      finally { receiver = undefined; await maintenance?.dispose(); }
    },
  };
}
