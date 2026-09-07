import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { OwnedSbxMachine, type SbxRecord } from '@blobot/core';
import type { DesktopMachines } from './machines.js';
import type { UiConfiguredMachine, UiMachineInventory, UiMachineInventoryEntry } from '../shared/machines.js';

interface EngineBox { readonly name: string; readonly id: string; }
type Reference = { readonly name: string; readonly id?: string; readonly kind: 'active' | 'retained' | 'pending' };
function references(record: SbxRecord): Reference[] {
  return [
    ...(record.active === undefined ? [] : [{ ...record.active, kind: 'active' as const }]),
    ...record.retained.map(box => ({ ...box, kind: 'retained' as const })),
    ...(record.pending === undefined ? [] : [{ ...record.pending, kind: 'pending' as const }]),
  ];
}
function exact(boxes: readonly EngineBox[], reference: Reference): boolean {
  const names = boxes.filter(box => box.name === reference.name), ids = boxes.filter(box => box.id === reference.id);
  return reference.id !== undefined && names.length === 1 && ids.length === 1 && names[0]?.id === reference.id && ids[0]?.name === reference.name;
}
function missing(boxes: readonly EngineBox[], reference: Reference): boolean {
  return reference.id !== undefined && !boxes.some(box => box.name === reference.name || box.id === reference.id);
}

/** Flat application download folders only. Never follow a replaced folder or child symlink. */
async function cacheBytes(path: string): Promise<number | null> {
  try {
    let directory;
    try { directory = await lstat(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
    if (!directory.isDirectory() || directory.isSymbolicLink()) return null;
    let bytes = 0;
    for (const name of await readdir(path)) {
      const info = await lstat(join(path, name));
      if (!info.isFile() || info.isSymbolicLink()) return null;
      bytes += info.size;
      if (!Number.isSafeInteger(bytes)) return null;
    }
    return bytes;
  } catch { return null; }
}

/** Registry ownership and engine presence are separate facts. A prefix alone proves neither. */
export class MachineInventory {
  readonly #removing = new Set<string>();
  constructor(readonly machines: DesktopMachines, readonly configured: () => readonly UiConfiguredMachine[],
    readonly isConfigured: (agentId: string) => boolean = agentId => configured().some(agent => agent.agentId === agentId)) {}

  async #boxes(): Promise<EngineBox[]> {
    const run = this.machines.engine().run;
    // A screen does not start a stopped daemon just to inspect its inventory.
    const status = await run(['daemon', 'status', '--json']);
    if (status.missing || status.code !== 0 || JSON.parse(status.stdout)?.status !== 'running') throw new Error('Engine inventory unavailable.');
    const result = await run(['ls', '--json']);
    if (result.missing || result.code !== 0) throw new Error('Engine inventory unavailable.');
    const data: unknown = JSON.parse(result.stdout);
    if (typeof data !== 'object' || data === null || !('sandboxes' in data) || !Array.isArray(data.sandboxes)) throw new Error('Engine inventory unavailable.');
    const boxes: EngineBox[] = [];
    for (const value of data.sandboxes) {
      if (typeof value !== 'object' || value === null || typeof value.name !== 'string' || typeof value.id !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(value.name) || !/^[a-zA-Z0-9-]+$/.test(value.id)) throw new Error('Engine inventory unavailable.');
      boxes.push({ name: value.name, id: value.id });
    }
    if (new Set(boxes.map(box => box.name)).size !== boxes.length || new Set(boxes.map(box => box.id)).size !== boxes.length) {
      throw new Error('Engine inventory unavailable.');
    }
    return boxes;
  }

  async view(): Promise<UiMachineInventory> {
    const [records, engine, images, downloads] = await Promise.allSettled([
      this.machines.registry.inventory(), this.#boxes(), cacheBytes(join(this.machines.directory, 'images')), cacheBytes(join(this.machines.directory, 'downloads')),
    ]);
    const boxes = engine.status === 'fulfilled' ? engine.value : undefined;
    const configured = this.configured();
    const entries: UiMachineInventoryEntry[] = [];
    const represented = new Set<string>();
    if (records.status === 'fulfilled') for (const item of records.value) {
      const owner = configured.find(agent => agent.agentId === item.agentId);
      const hasMembership = this.isConfigured(item.agentId);
      const identity = { agentId: item.agentId, ...(owner === undefined ? {} : { agentName: owner.agentName, teamName: owner.teamName }) };
      if (item.record === undefined) {
        entries.push({ ...identity, id: `record:${item.agentId}`, name: owner?.agentName ?? item.agentId, kind: 'unverified', presence: 'unknown', canRemove: false,
          detail: item.detail ?? 'The ownership record could not be verified. Existing data was kept.' });
        continue;
      }
      const refs = references(item.record);
      const removable = !hasMembership && item.record.kit.workspace !== undefined && refs.length > 0 && boxes !== undefined &&
        refs.every(ref => ref.id !== undefined && (exact(boxes, ref) || missing(boxes, ref)));
      for (const reference of refs) {
        const found = boxes !== undefined && exact(boxes, reference), absent = boxes !== undefined && missing(boxes, reference);
        if (found) represented.add(reference.id!);
        const unverified = reference.id === undefined || (boxes !== undefined && !found && !absent);
        entries.push({ ...identity, id: `${item.agentId}:${reference.kind}:${reference.name}`, name: reference.name,
          kind: unverified ? 'unverified' : reference.kind, presence: found ? 'present' : absent ? 'missing' : 'unknown', canRemove: removable,
          detail: unverified ? 'Ownership could not be matched. Its data was kept. Restore its original ownership record before removing it here.'
            : boxes === undefined ? 'The engine inventory is unavailable. Existing data was kept.'
            : owner !== undefined ? `${reference.kind === 'retained' ? 'Retained copy for' : 'Recorded for'} ${owner.agentName} in ${owner.teamName}.`
            : hasMembership ? 'This agent is still configured. Remove it from its team before deleting private sandbox data.'
            : item.record.kit.workspace === undefined ? 'Legacy private workspace needs preservation before removal. Existing data was kept.'
            : absent ? 'The recorded sandbox is no longer present. Its ownership record can be cleared.'
            : 'This agent is no longer configured. Removing it deletes all of its recorded private sandbox data and sign-ins; workspace folders are kept.' });
      }
    }
    if (boxes !== undefined) for (const box of boxes) {
      if (!box.name.startsWith('blobot-') || represented.has(box.id)) continue;
      entries.push({ id: `unclaimed:${box.id}`, name: box.name, kind: 'unclaimed', presence: 'present', canRemove: false,
        detail: 'No verified ownership record matches this sandbox. Its name alone does not authorize deletion. Restore its original ownership record before removing it here.' });
    }
    const imageBytes = images.status === 'fulfilled' ? images.value : null, downloadBytes = downloads.status === 'fulfilled' ? downloads.value : null;
    const downloadCacheBytes = imageBytes === null || downloadBytes === null ? null : imageBytes + downloadBytes;
    const available = records.status === 'fulfilled' && boxes !== undefined;
    return { state: available ? 'ready' : 'unknown', entries, downloadCacheBytes,
      ...(available ? {} : { detail: 'Some sandbox ownership or engine inventory could not be read. Removal is disabled for unverified data.' }) };
  }

  /** Explicit disposal only. Every engine command rechecks membership before acting. */
  async remove(agentId: string): Promise<void> {
    const guard = () => {
      if (this.isConfigured(agentId)) throw new Error('This agent is still configured. Remove it from its team first.');
    };
    guard();
    if (this.#removing.has(agentId)) throw new Error('This sandbox removal is already in progress.');
    this.#removing.add(agentId);
    try {
      const record = await this.machines.registry.read(agentId);
      if (record === undefined) throw new Error('No verified Machine ownership record is available. Nothing was deleted.');
      const refs = references(record), boxes = await this.#boxes();
      if (record.kit.workspace === undefined || refs.length === 0 || refs.some(ref => ref.id === undefined || (!exact(boxes, ref) && !missing(boxes, ref)))) {
        throw new Error('Sandbox ownership or workspace preservation could not be verified. Nothing was deleted.');
      }
      const limits = record.active?.limits ?? record.pending?.limits ?? record.retained[0]?.limits;
      if (limits === undefined) throw new Error('Sandbox resource limits could not be verified. Nothing was deleted.');
      const run = this.machines.engine().run;
      const machine = new OwnedSbxMachine({ agentId, registry: this.machines.registry, kit: record.kit, limits,
        sbxExecutable: this.machines.executable, run: async (args, signal) => { guard(); return run(args, signal); },
        transport: { moduleRoot: '/', allowedEnvironment: [] } });
      guard();
      // Missing resources may be remnants of an interrupted explicit deletion. destroy()
      // validates every surviving identity and acknowledges proven absence without mutation.
      if (refs.every(ref => exact(boxes, ref))) await machine.stop();
      guard();
      await machine.destroy();
    } finally { this.#removing.delete(agentId); }
  }
}
