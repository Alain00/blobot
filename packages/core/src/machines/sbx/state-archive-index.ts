import type { createHash } from 'node:crypto';
import type { createStateArchiveVerifier } from './state-archive.js';

/** Kept inside the held guest. Names, link targets and digests must never be logged. */
export interface SbxArchiveMember {
  readonly path: Buffer;
  readonly type: number;
  readonly link: Buffer;
  /** Exact encoded PAX/header and payload. This does not cover omitted inode attributes. */
  readonly sha256: string;
}

/** Self-contained for the guest bootstrap; dependencies are supplied by that bootstrap. */
export function createSbxArchiveIndex(
  verify: typeof createStateArchiveVerifier, hash: typeof createHash,
): { write(chunk: Buffer): void; finish(): ReadonlyMap<string, SbxArchiveMember> } {
  const entries = new Map<string, SbxArchiveMember>();
  let current: { path: Buffer; type: number; link: Buffer; hash: ReturnType<typeof createHash> } | undefined;
  let done = false;
  const invalid = (): never => { throw new Error('Machine state inventory is invalid.'); };
  const verifier = verify({
    member(path, type, link, headers) {
      if (current !== undefined) invalid();
      current = { path, type, link, hash: hash('sha256').update(headers) };
    },
    data(chunk) { if (current === undefined) invalid(); current!.hash.update(chunk); },
    end() {
      if (current === undefined) invalid();
      const { path, type, link, hash: digest } = current!;
      entries.set(path.toString('latin1'), { path, type, link, sha256: digest.digest('hex') });
      current = undefined;
    },
  });
  return {
    write(chunk) { if (done) invalid(); verifier.write(chunk); },
    finish() {
      if (done) invalid();
      done = true;
      verifier.finish();
      if (current !== undefined) invalid();
      return entries;
    },
  };
}

/**
 * Content selection only, after both full archives passed guest validation. A backend still
 * must reconcile unencoded attributes and directory metadata before admitting extraction.
 * Returning null is essential: GNU tar interprets an empty -T file as extract everything.
 */
export function selectSbxArchiveMembers(
  source: ReadonlyMap<string, SbxArchiveMember>, target: ReadonlyMap<string, SbxArchiveMember>,
  changedAttributes: ReadonlySet<string> = new Set(),
): Buffer | null {
  // Equal PAX bytes can hide different Linux inode flags or overlay representation. Replay
  // those members too, including their hardlinks and ancestors, before restoring attributes.
  const selected = new Set(changedAttributes);
  for (const key of selected) if (!source.has(key)) throw new Error('Machine state attribute path is missing.');
  const dependents = new Map<string, string[]>();
  for (const [key, entry] of source) {
    if (entry.sha256 !== target.get(key)?.sha256) selected.add(key);
    if (entry.type === 49) {
      const link = entry.link.toString('latin1').replace(/\/$/, '');
      if (!source.has(link)) throw new Error('Machine state hardlink is missing.');
      const names = dependents.get(link) ?? [];
      names.push(key); dependents.set(link, names);
    }
  }
  // Replacing a file unlinks its old inode. Every source hardlink to it must be relinked,
  // even when that member's own encoded path/target/metadata did not change.
  const queue = [...selected];
  for (let at = 0; at < queue.length; at++) for (const key of dependents.get(queue[at]!) ?? []) {
    if (!selected.has(key)) { selected.add(key); queue.push(key); }
  }
  // Tar replaces an inode even for a content-only change. That changes parent mtimes;
  // restore ancestor directory metadata even if their own pre-copy archive bytes matched.
  for (const key of [...selected]) {
    let parent = key;
    while (parent !== '.') {
      parent = parent.slice(0, parent.lastIndexOf('/'));
      if (source.get(parent)?.type !== 53) throw new Error('Machine state parent is missing.');
      if (selected.has(parent)) break;
      selected.add(parent);
    }
  }
  if (selected.size === 0) return null;
  const names: Buffer[] = [];
  for (const [key, entry] of source) if (selected.has(key)) {
    names.push(entry.path, Buffer.from(entry.type === 53 ? '/\0' : '\0'));
  }
  return Buffer.concat(names);
}
