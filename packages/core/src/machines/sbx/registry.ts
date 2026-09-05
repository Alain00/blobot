import { mkdir, open, readFile, rename, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { SbxReference } from './data-transfer.js';
import type { SbxBoundaryBaseline, SbxMailboxRule } from './observations.js';
import type { MachineLimits } from '../resources.js';
import { sbxNameFor, type SbxKitOptions } from './kit.js';

export interface OwnedSbx extends SbxReference {
  readonly baseline: SbxBoundaryBaseline;
  readonly limits: MachineLimits;
}
export interface SbxRecord {
  readonly version: 1;
  readonly agentId: string;
  readonly kit: SbxKitOptions;
  readonly active?: OwnedSbx;
  readonly retained: readonly OwnedSbx[];
  /** Written before engine creation. Unknown/partial work is preserved, never auto-adopted. */
  readonly pending?: { readonly name: string; readonly limits: MachineLimits; readonly id?: string };
  readonly mailbox?: SbxMailboxRule;
}

/**
 * One application process owns lifecycle operations. Disk records survive a failed cutover;
 * a pending record refuses further automatic work until explicitly reconciled. No payloads.
 */
export class SbxRegistry {
  readonly #locks = new Set<string>();
  constructor(readonly directory: string) {}
  async lease(agentId: string): Promise<() => Promise<void>> {
    const path = join(this.directory, `${sbxNameFor(agentId)}.owner`);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try { await mkdir(path, { mode: 0o700 }); }
    catch { throw new Error('This Machine is owned by another execution or needs recovery after a process loss.'); }
    let released = false;
    return async () => { if (!released) { await rmdir(path); released = true; } };
  }
  async locked<T>(agentId: string, work: () => Promise<T>): Promise<T> {
    const name = sbxNameFor(agentId);
    if (this.#locks.has(agentId)) throw new Error('This Machine already has a lifecycle operation in progress.');
    this.#locks.add(agentId);
    const path = join(this.directory, `${name}.lock`);
    let acquired = false;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      // A stale lock is an explicit recovery case, never guessed dead and stolen.
      await mkdir(path, { mode: 0o700 });
      acquired = true;
      return await work();
    } finally {
      if (acquired) await rmdir(path);
      this.#locks.delete(agentId);
    }
  }
  async read(agentId: string): Promise<SbxRecord | undefined> {
    const name = sbxNameFor(agentId);
    let text: string;
    try { text = await readFile(join(this.directory, `${name}.json`), 'utf8'); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw new Error('The Machine ownership record cannot be read.');
    }
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1 ||
        !('agentId' in value) || value.agentId !== agentId || !('kit' in value) || !('retained' in value) || !Array.isArray(value.retained)) {
      throw new Error('The Machine ownership record is invalid.');
    }
    // Deeper engine-specific observations are checked before every operation on a reference.
    return value as SbxRecord;
  }
  async save(record: SbxRecord): Promise<void> {
    const name = sbxNameFor(record.agentId);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = join(this.directory, `${name}.json`);
    const file = await open(`${target}.next`, 'w', 0o600);
    try { await file.writeFile(JSON.stringify(record)); await file.sync(); } finally { await file.close(); }
    await rename(`${target}.next`, target);
    const directory = await open(this.directory, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
}
