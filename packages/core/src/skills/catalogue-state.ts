import { join } from 'node:path';
import { rename, rm } from 'node:fs/promises';
import { checkedDirectory, exists, missing, operationId, ownDirectory, readRegular, syncDirectory, writeJson } from './catalogue-files.js';
import { readSkillPackage, skillName } from './skill-package.js';
import type { SkillSource } from './types.js';

export interface Installed { source: SkillSource; origin?: SkillSource; hash: string; installedAt: string; id: string; }
export interface Operation {
  id: string; name: string; action: 'install' | 'replace' | 'remove';
  previewId?: string; entry?: Installed; previous?: Installed; expectedHash?: string; draftId?: string; error?: string;
}
export interface Manifest { version: 1; entries: Record<string, Installed>; pending: Operation[]; }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid skill catalogue metadata. Existing files were kept.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid skill catalogue metadata. Existing files were kept.');
  return value;
}
function hash(value: unknown): string {
  const result = string(value);
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('Invalid skill catalogue hash.');
  return result;
}
export function source(value: unknown): SkillSource {
  const data = object(value);
  if (data.kind === 'authored') return { kind: 'authored' };
  if (data.kind === 'local-import') return { kind: 'local-import', ...(data.originalPath === undefined ? {} : { originalPath: string(data.originalPath) }) };
  if (data.kind !== 'git') throw new Error('Invalid skill catalogue source.');
  return { kind: 'git', url: string(data.url), skillPath: string(data.skillPath), resolvedCommit: string(data.resolvedCommit), ...(data.requestedRef === undefined ? {} : { requestedRef: string(data.requestedRef) }) };
}
function installed(value: unknown): Installed {
  const data = object(value);
  return { source: source(data.source), hash: hash(data.hash), installedAt: string(data.installedAt), id: operationId(string(data.id)), ...(data.origin === undefined ? {} : { origin: source(data.origin) }) };
}
export function operation(value: unknown): Operation {
  const data = object(value);
  if (!['install', 'replace', 'remove'].includes(string(data.action))) throw new Error('Invalid skill catalogue operation.');
  const result: Operation = { id: operationId(string(data.id)), name: skillName(string(data.name)), action: data.action as Operation['action'] };
  if (data.previewId !== undefined) result.previewId = operationId(string(data.previewId));
  if (data.draftId !== undefined) result.draftId = operationId(string(data.draftId));
  if (data.entry !== undefined) result.entry = installed(data.entry);
  if (data.previous !== undefined) result.previous = installed(data.previous);
  if (data.expectedHash !== undefined) result.expectedHash = hash(data.expectedHash);
  if (data.error !== undefined) result.error = string(data.error);
  if (result.action !== 'remove' && (!result.previewId || !result.entry) || result.action !== 'install' && !result.expectedHash) throw new Error('Invalid skill catalogue operation.');
  return result;
}
export async function readManifest(root: string): Promise<Manifest> {
  try {
    const data = object(JSON.parse(await readRegular(join(root, '.blobot/skills/manifest.json'))));
    if (data.version !== 1 || !Array.isArray(data.pending)) throw new Error('Unsupported skill catalogue version.');
    const entries: Record<string, Installed> = Object.create(null);
    for (const [name, entry] of Object.entries(object(data.entries))) entries[skillName(name)] = installed(entry);
    const pending = data.pending.map(operation);
    if (new Set(pending.map((item) => item.name)).size !== pending.length) throw new Error('Duplicate skill catalogue operation.');
    return { version: 1, entries, pending };
  } catch (error) { if (missing(error)) return { version: 1, entries: Object.create(null), pending: [] }; throw error; }
}
export async function saveManifest(root: string, manifest: Manifest): Promise<void> { await writeJson(join(root, '.blobot/skills/manifest.json'), manifest); }
export async function activeHash(root: string, name: string): Promise<string | undefined> {
  const path = join(root, '.agents/skills', name);
  if (!await exists(path)) return undefined;
  await checkedDirectory(path);
  return (await readSkillPackage(path)).hash;
}

/** A journal is durable before moving files. Recovery rolls forward only known bytes. */
export async function transact(root: string, manifest: Manifest, op: Operation, recovering = false): Promise<void> {
  const journal = join(root, '.blobot/skills/transaction.json');
  const active = join(root, '.agents/skills', op.name);
  const backupRoot = join(root, '.blobot/skills/previous', op.id), backup = join(backupRoot, op.name);
  const staged = op.previewId ? join(root, '.blobot/skills/staging', op.previewId, op.name) : undefined;
  const current = await activeHash(root, op.name);
  const alreadyPublished = recovering && op.action !== 'remove' && current === op.entry?.hash;
  if (!alreadyPublished) {
    if (op.action === 'install' ? current !== undefined : current !== op.expectedHash && !(recovering && current === undefined && await exists(backup))) throw new Error('Skill files changed or were edited. Existing files were kept; cancel and preview again.');
    if (staged) {
      await checkedDirectory(join(root, '.blobot/skills/staging', op.previewId!));
      await checkedDirectory(staged);
      if ((await readSkillPackage(staged)).hash !== op.entry?.hash) throw new Error('Skill files changed after preview. Preview again.');
    }
  }
  if (!recovering) await writeJson(journal, op);
  if (op.action !== 'install') {
    await ownDirectory(backupRoot);
    if (!await exists(backup)) {
      if (alreadyPublished) throw new Error('Skill recovery is missing its previous version. Existing files were kept.');
      await rename(active, backup);
      await syncDirectory(join(root, '.agents/skills'));
      await syncDirectory(backupRoot);
    }
    await checkedDirectory(backup);
    if ((await readSkillPackage(backup)).hash !== op.expectedHash) throw new Error('The recovery copy changed. Existing files were kept.');
    await writeJson(join(backupRoot, 'record.json'), { name: op.name, entry: op.previous });
  }
  if (staged && !alreadyPublished) {
    await rename(staged, active);
    await syncDirectory(join(root, '.agents/skills'));
  }
  if (op.entry) manifest.entries[op.name] = op.entry;
  else delete manifest.entries[op.name];
  manifest.pending = manifest.pending.filter((pending) => pending.id !== op.id);
  await saveManifest(root, manifest);
  await rm(journal);
  await syncDirectory(join(root, '.blobot/skills'));
  if (op.draftId) {
    const draft = join(root, '.blobot/skills/drafts', op.draftId);
    // A user may keep editing a draft while its publication is queued.
    try { await checkedDirectory(draft); if ((await readSkillPackage(draft)).hash === op.entry?.hash) await rm(draft, { recursive: true }); } catch { /* keep an edited/incomplete draft */ }
  }
}
export async function recover(root: string, manifest: Manifest): Promise<void> {
  const path = join(root, '.blobot/skills/transaction.json');
  if (await exists(path)) await transact(root, manifest, operation(JSON.parse(await readRegular(path))), true);
}
