import { lstat, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import type { SbxReference } from './data-transfer.js';
import type { SbxBoundaryBaseline, SbxMailboxRule, SbxNetworkRule } from './observations.js';
import { machineLimits, sameMachineLimits, type MachineLimits } from '../resources.js';
import { renderSbxKit, sbxNameFor, type SbxKitOptions } from './kit.js';
import type { SbxStateReceipt } from './state-transfer.js';

function admitted(value: unknown): value is OwnedSbx {
  if (typeof value !== 'object' || value === null || !('name' in value) || !('id' in value) ||
      typeof value.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(value.name) ||
      typeof value.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(value.id) ||
      !('limits' in value) || typeof value.limits !== 'object' || value.limits === null ||
      !('baseline' in value) || typeof value.baseline !== 'object' || value.baseline === null ||
      !('memoryKiB' in value.baseline) || !Number.isSafeInteger(value.baseline.memoryKiB) ||
      (value.baseline.memoryKiB as number) <= 0 || !('mounts' in value.baseline) || typeof value.baseline.mounts !== 'string') return false;
  try { machineLimits(value.limits as MachineLimits); return true; } catch { return false; }
}

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
  readonly pending?: {
    readonly name: string;
    readonly limits: MachineLimits;
    readonly id?: string;
    /** Absence is a legacy or unfinished creation, never evidence that copying completed. */
    readonly phase?: 'copying' | 'verifying';
    /** Baseline admitted before the first private byte is copied; retained even on failure. */
    readonly candidate?: OwnedSbx;
    readonly receipt?: SbxStateReceipt;
  };
  /** Legacy exact-host rule, revoked before adopting the accepted open network policy. */
  readonly mailbox?: SbxMailboxRule;
  readonly network?: SbxNetworkRule;
}

/**
 * One application process owns lifecycle operations. Disk records survive a failed cutover;
 * a pending record refuses further automatic work until explicitly reconciled. No payloads.
 */
export class SbxRegistry {
  readonly #locks = new Set<string>();
  constructor(readonly directory: string) {}
  /** Includes retained/deleted Agents and unreadable records; an unreadable record proves no ownership. */
  async inventory(): Promise<readonly { readonly agentId: string; readonly record?: SbxRecord; readonly detail?: string }[]> {
    const names = await readdir(this.directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw new Error('The Machine ownership inventory cannot be read.');
    });
    return Promise.all(names.filter(name => /^blobot-[a-z0-9][a-z0-9.-]*\.json$/.test(name)).sort().map(async name => {
      const agentId = name.slice('blobot-'.length, -'.json'.length).replaceAll('.', '_');
      try {
        const record = await this.read(agentId);
        return record === undefined ? { agentId, detail: 'The Machine ownership record is unavailable.' } : { agentId, record };
      } catch {
        return { agentId, detail: 'The Machine ownership record cannot be verified. Existing data was kept.' };
      }
    }));
  }
  /** Called under the lifecycle lock only after every owned engine object was removed. */
  async remove(agentId: string): Promise<void> {
    await unlink(join(this.directory, `${sbxNameFor(agentId)}.json`));
    const directory = await open(this.directory, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  async lease(agentId: string): Promise<() => Promise<void>> {
    try { return await this.#hold(agentId, 'owner'); }
    catch { throw new Error('This Machine is owned by another execution or its ownership needs recovery.'); }
  }
  async locked<T>(agentId: string, work: () => Promise<T>): Promise<T> {
    sbxNameFor(agentId);
    if (this.#locks.has(agentId)) throw new Error('This Machine already has a lifecycle operation in progress.');
    this.#locks.add(agentId);
    let release: (() => Promise<void>) | undefined;
    try {
      release = await this.#hold(agentId, 'lock');
      return await work();
    } finally {
      try { await release?.(); }
      finally { this.#locks.delete(agentId); }
    }
  }
  /**
   * SQLite's OS lock survives competing connections but ends when its process dies. No PID,
   * clock or stale timeout decides ownership. This separate empty database stores no payload
   * and never locks the application's message store. Never unlink it: other processes may
   * still have its inode open. Legacy directory locks remain explicit recovery cases.
   */
  async #hold(agentId: string, kind: 'owner' | 'lock'): Promise<() => Promise<void>> {
    const path = join(this.directory, `${sbxNameFor(agentId)}.${kind}`);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try { await lstat(path); throw new Error('Legacy Machine lock needs recovery.'); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    let connection: Database.Database | undefined;
    try {
      connection = new Database(`${path}.sqlite`, { timeout: 0 });
      // No schema or journal mutation is needed: BEGIN EXCLUSIVE acquires the file lock.
      connection.exec('BEGIN EXCLUSIVE');
    } catch {
      connection?.close();
      throw new Error('This Machine already has a lifecycle operation in progress.');
    }
    const held = connection;
    let released = false;
    return async () => { if (!released) { held.close(); released = true; } };
  }
  async read(agentId: string): Promise<SbxRecord | undefined> {
    const name = sbxNameFor(agentId);
    let text: string;
    try { text = await readFile(join(this.directory, `${name}.json`), 'utf8'); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw new Error('The Machine ownership record cannot be read.');
    }
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error('The Machine ownership record is invalid.'); }
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1 ||
        !('agentId' in value) || value.agentId !== agentId || !('kit' in value) || !('retained' in value) || !Array.isArray(value.retained)) {
      throw new Error('The Machine ownership record is invalid.');
    }
    // Deeper engine-specific observations are checked before every operation on a reference.
    const pending = 'pending' in value ? value.pending : undefined;
    if (pending !== undefined && (typeof pending !== 'object' || pending === null)) {
      throw new Error('The Machine replacement record is invalid.');
    }
    try {
      renderSbxKit(value.kit as SbxKitOptions);
      if (('active' in value && !admitted(value.active)) || !value.retained.every(admitted)) throw new Error();
      if (pending !== undefined) {
        if (!('name' in pending) || typeof pending.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(pending.name) ||
            ('id' in pending && (typeof pending.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(pending.id))) ||
            !('limits' in pending)) throw new Error();
        machineLimits(pending.limits as MachineLimits);
      }
      const references = [...('active' in value ? [value.active as OwnedSbx] : []), ...value.retained];
      const names = references.map(reference => reference.name), ids = references.map(reference => reference.id);
      if (pending !== undefined && 'name' in pending) names.push(String(pending.name));
      if (pending !== undefined && 'id' in pending) ids.push(String(pending.id));
      if (new Set(names).size !== names.length || new Set(ids).size !== ids.length) throw new Error();
    } catch { throw new Error(pending === undefined ? 'The Machine ownership record is invalid.' : 'The Machine replacement record is invalid.'); }
    if (pending !== undefined && 'phase' in pending) {
      if ((pending.phase !== 'copying' && pending.phase !== 'verifying') || !('candidate' in pending) ||
          !admitted(pending.candidate) || !('limits' in pending) ||
          typeof pending.limits !== 'object' || pending.limits === null ||
          !sameMachineLimits(pending.candidate.limits, pending.limits as MachineLimits) ||
          !('name' in pending) || !('id' in pending) ||
          pending.candidate.name !== pending.name || pending.candidate.id !== pending.id ||
          !('active' in value) || !admitted(value.active) ||
          value.active.name === pending.name || value.active.id === pending.id ||
          !value.retained.every(admitted)) {
        throw new Error('The Machine replacement record is invalid.');
      }
      const references = [value.active, pending.candidate, ...value.retained];
      if (new Set(references.map(ref => ref.name)).size !== references.length ||
          new Set(references.map(ref => ref.id)).size !== references.length) {
        throw new Error('The Machine replacement record is invalid.');
      }
    }
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
