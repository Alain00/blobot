import { randomUUID } from 'node:crypto';
import { readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import type { PersonalDirectories } from '../personal/personal-directory.js';
import { discoverSkills, readSkillContents, readSkillPackage, skillName, writeSkillPackage } from './skill-package.js';
import type { PersonalSkill, SkillCatalogue, SkillDetail, SkillDraft, SkillDraftInput, SkillInput, SkillPreview, SkillPreviewItem, SkillSource } from './types.js';
import { checkedDirectory, exists, operationId, ownDirectory, prepareCatalogue, readRegular, writeJson, writeText } from './catalogue-files.js';
import { activeHash, readManifest, recover, saveManifest, source, transact, type Installed, type Manifest, type Operation } from './catalogue-state.js';
import { fetchSkillRepository, resolveSkillRepository } from './git-source.js';

/** The single owner of managed personal skill mutations; runtimes only borrow its files. */
export class PersonalSkills {
  readonly #locks = new Map<string, Promise<void>>();
  readonly #executions = new Map<string, number>();
  constructor(readonly directories: PersonalDirectories) {}

  #locked<T>(profileId: string, work: () => Promise<T>): Promise<T> {
    const result = (this.#locks.get(profileId) ?? Promise.resolve()).then(work);
    const settled = result.then(() => {}, () => {});
    this.#locks.set(profileId, settled);
    void settled.then(() => { if (this.#locks.get(profileId) === settled) this.#locks.delete(profileId); });
    return result;
  }

  /** Start/load/wake and publication share this gate. Release only after process shutdown. */
  acquire(profileId: string): Promise<() => Promise<void>> {
    return this.#locked(profileId, async () => {
      const root = await this.#root(profileId);
      await this.#apply(profileId, root, await readManifest(root));
      this.#executions.set(profileId, (this.#executions.get(profileId) ?? 0) + 1);
      let released = false;
      return () => this.#locked(profileId, async () => {
        if (released) return;
        released = true;
        this.#executions.set(profileId, Math.max(0, (this.#executions.get(profileId) ?? 1) - 1));
        const path = await this.#root(profileId);
        await this.#apply(profileId, path, await readManifest(path));
      });
    });
  }

  async #root(profileId: string): Promise<string> {
    const { path } = await this.directories.forProfile(profileId).prepare();
    await prepareCatalogue(path);
    return path;
  }

  async #apply(profileId: string, root: string, manifest: Manifest): Promise<void> {
    if ((this.#executions.get(profileId) ?? 0) > 0) return;
    await recover(root, manifest);
    for (const op of [...manifest.pending]) {
      try { await transact(root, manifest, op); }
      catch (error) {
        // Once a journal exists, recovery must finish before any new execution.
        if (await exists(join(root, '.blobot/skills/transaction.json'))) throw error;
        op.error = error instanceof Error ? error.message : String(error);
        await saveManifest(root, manifest);
      }
    }
    await this.#prune(root, manifest);
  }

  async #prune(root: string, manifest: Manifest): Promise<void> {
    for (const area of ['previous', 'staging'] as const) {
      const directory = join(root, '.blobot/skills', area);
      const entries = await Promise.all((await readdir(directory)).map(async (id) => {
        const path = await checkedDirectory(join(directory, operationId(id)));
        return { id, path, time: (await stat(path)).mtimeMs };
      }));
      entries.sort((a, b) => b.time - a.time);
      for (const [index, entry] of entries.entries()) {
        const expired = area === 'previous' ? index >= 20 : Date.now() - entry.time > 24 * 60 * 60 * 1000;
        if (expired && !manifest.pending.some((op) => op.previewId === entry.id || op.id === entry.id)) await rm(entry.path, { recursive: true });
      }
    }
  }

  async preview(profileId: string, input: SkillInput): Promise<SkillPreview> {
    if (input.kind === 'folder') return this.#locked(profileId, async () => this.#previewFolder(await this.#root(profileId), input.path, (path) => ({ kind: 'local-import', originalPath: path })));
    const repository = resolveSkillRepository(input), checkout = await fetchSkillRepository(repository);
    try {
      return await this.#locked(profileId, async () => this.#previewFolder(await this.#root(profileId), checkout.path, (path) => ({ kind: 'git', url: repository.url, skillPath: relative(checkout.path, path), resolvedCommit: checkout.commit, ...(repository.ref ? { requestedRef: repository.ref } : {}) }), repository.skill));
    } finally { await checkout.dispose(); }
  }

  async #previewFolder(root: string, path: string, origin: (path: string) => SkillSource, selectedName?: string, provenance?: SkillSource): Promise<SkillPreview> {
    const id = randomUUID(), staging = join(root, '.blobot/skills/staging', id);
    await ownDirectory(staging);
    const skills: SkillPreviewItem[] = [];
    let bytes = 0;
    try {
      for (const folder of await discoverSkills(path)) {
        const content = await readSkillPackage(folder);
        if (selectedName && content.metadata.name !== selectedName) continue;
        bytes += content.files.reduce((sum, file) => sum + file.bytes.length, 0);
        if (bytes > 128 * 1024 * 1024) throw new Error('Choose a collection smaller than 128 MB.');
        if (skills.some((entry) => entry.name === content.metadata.name)) throw new Error('This collection contains duplicate skill names.');
        if (skills.length >= 100) throw new Error('Choose a collection with at most 100 skills.');
        await writeSkillPackage(join(staging, content.metadata.name), content);
        if ((await readSkillPackage(folder)).hash !== content.hash) throw new Error('Skill files changed during preview. Preview the folder again.');
        skills.push({ ...content.metadata, text: content.files.find((file) => file.path === 'SKILL.md')!.bytes.toString('utf8'), files: content.files.map((file) => file.path), hash: content.hash, source: origin(folder), ...(provenance ? { origin: provenance } : {}) });
      }
      if (skills.length === 0) throw new Error('The requested skill was not found in this repository.');
      const preview = { id, skills };
      await writeJson(join(staging, 'preview.json'), preview);
      return preview;
    } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  }

  async #selected(root: string, previewId: string, name: string): Promise<SkillPreviewItem> {
    const staging = await checkedDirectory(join(root, '.blobot/skills/staging', operationId(previewId)));
    const data: unknown = JSON.parse(await readRegular(join(staging, 'preview.json')));
    if (!data || typeof data !== 'object' || !('skills' in data) || !Array.isArray(data.skills)) throw new Error('Invalid skill preview.');
    const candidate: unknown = data.skills.find((item: unknown) => item && typeof item === 'object' && 'name' in item && item.name === name);
    if (!candidate || typeof candidate !== 'object' || !('hash' in candidate) || !('source' in candidate)) throw new Error('This skill is unavailable in the preview.');
    const folder = await checkedDirectory(join(staging, skillName(name))), content = await readSkillPackage(folder);
    if (candidate.hash !== content.hash || content.metadata.name !== name) throw new Error('Skill files changed after preview. Preview the skill again.');
    return { ...content.metadata, text: content.files.find((file) => file.path === 'SKILL.md')!.bytes.toString('utf8'), hash: content.hash, source: source(candidate.source), ...('origin' in candidate ? { origin: source(candidate.origin) } : {}), files: content.files.map((file) => file.path) };
  }

  #entry(skill: SkillPreviewItem, origin = skill.origin): Installed {
    return { id: randomUUID(), installedAt: new Date().toISOString(), source: skill.source, hash: skill.hash, ...(origin ? { origin } : {}) };
  }

  #notPending(manifest: Manifest, name: string): void {
    if (manifest.pending.some((item) => item.name === name)) throw new Error('This skill already has a pending change. Cancel it first.');
  }

  async install(profileId: string, previewId: string, names: readonly string[]): Promise<void> {
    return this.#locked(profileId, async () => {
      if (names.length === 0 || new Set(names).size !== names.length) throw new Error('Select each skill once.');
      const root = await this.#root(profileId), manifest = await readManifest(root);
      await this.#apply(profileId, root, manifest);
      const operations: Operation[] = [];
      for (const name of names) {
        this.#notPending(manifest, name);
        if (await exists(join(root, '.agents/skills', skillName(name)))) throw new Error('A skill with this name already exists.');
        const skill = await this.#selected(root, previewId, name);
        operations.push({ id: randomUUID(), action: 'install', name, previewId, entry: this.#entry(skill) });
      }
      manifest.pending.push(...operations);
      await saveManifest(root, manifest);
      await this.#apply(profileId, root, manifest);
    });
  }

  async #current(root: string, manifest: Manifest, name: string, allowEdits = false): Promise<Installed> {
    skillName(name);
    const hash = await activeHash(root, name);
    if (!hash) throw new Error('This skill is no longer present.');
    const entry = manifest.entries[name];
    if (entry && entry.hash !== hash && !allowEdits) throw new Error('This skill was edited locally. Make it a personal copy to keep those edits before replacing or removing it.');
    return { id: entry?.id ?? randomUUID(), installedAt: entry?.installedAt ?? new Date().toISOString(), source: entry?.source ?? { kind: 'authored' }, hash, ...(entry?.origin ? { origin: entry.origin } : {}) };
  }

  async replace(profileId: string, name: string, previewId: string): Promise<void> {
    await this.#locked(profileId, async () => {
      const root = await this.#root(profileId), manifest = await readManifest(root);
      await this.#apply(profileId, root, manifest);
      this.#notPending(manifest, name);
      const previous = await this.#current(root, manifest, name), skill = await this.#selected(root, previewId, name);
      if (previous.hash === skill.hash) return;
      manifest.pending.push({ id: randomUUID(), name, action: 'replace', previewId, entry: this.#entry(skill), previous, expectedHash: previous.hash });
      await saveManifest(root, manifest);
      await this.#apply(profileId, root, manifest);
    });
  }

  async check(profileId: string, name: string): Promise<{ changed: boolean; preview: SkillPreview }> {
    const current = await this.#locked(profileId, async () => {
      const root = await this.#root(profileId);
      return this.#current(root, await readManifest(root), name);
    });
    if (current.source.kind !== 'git') throw new Error('This skill has no remote updates. Reimport a folder explicitly or edit your personal copy.');
    const upstream = current.source;
    const preview = await this.preview(profileId, { kind: 'git', url: upstream.url, ...(upstream.requestedRef ? { ref: upstream.requestedRef } : {}) });
    const skill = preview.skills.find((item) => item.name === name && item.source.kind === 'git' && item.source.skillPath === upstream.skillPath);
    if (!skill) throw new Error('The skill moved or was renamed upstream. Import the new location explicitly.');
    return { changed: current.hash !== skill.hash, preview: { ...preview, skills: [skill] } };
  }

  async remove(profileId: string, name: string): Promise<void> {
    await this.#locked(profileId, async () => {
      const root = await this.#root(profileId), manifest = await readManifest(root);
      await this.#apply(profileId, root, manifest);
      this.#notPending(manifest, name);
      const previous = await this.#current(root, manifest, name);
      manifest.pending.push({ id: randomUUID(), action: 'remove', name, previous, expectedHash: previous.hash });
      await saveManifest(root, manifest);
      await this.#apply(profileId, root, manifest);
    });
  }

  async makePersonal(profileId: string, name: string): Promise<void> {
    await this.#locked(profileId, async () => {
      const root = await this.#root(profileId), manifest = await readManifest(root);
      await this.#apply(profileId, root, manifest);
      this.#notPending(manifest, name);
      const entry = await this.#current(root, manifest, name, true);
      manifest.entries[name] = { ...entry, source: { kind: 'authored' }, origin: entry.origin ?? entry.source };
      await saveManifest(root, manifest);
    });
  }

  async cancel(profileId: string, id: string): Promise<void> {
    await this.#locked(profileId, async () => {
      const root = await this.#root(profileId), manifest = await readManifest(root);
      await recover(root, manifest);
      manifest.pending = manifest.pending.filter((item) => item.id !== operationId(id));
      await saveManifest(root, manifest);
    });
  }

  async list(profileId: string): Promise<SkillCatalogue> {
    return this.#locked(profileId, async () => {
      const root = await this.#root(profileId), manifest = await readManifest(root);
      await this.#apply(profileId, root, manifest);
      const skills: PersonalSkill[] = [];
      for (const name of (await readdir(join(root, '.agents/skills'))).sort()) {
        const entry = manifest.entries[name];
        try {
          const path = await checkedDirectory(join(root, '.agents/skills', skillName(name))), content = await readSkillPackage(path);
          if (content.metadata.name !== name) throw new Error('The folder name must match the name in SKILL.md. Rename the folder to make this skill manageable.');
          skills.push({ ...content.metadata, source: entry?.source ?? { kind: 'authored' }, ...(entry?.origin ? { origin: entry.origin } : {}), modified: entry !== undefined && entry.hash !== content.hash });
        } catch (error) { skills.push({ name, description: '', source: entry?.source ?? { kind: 'authored' }, modified: true, error: error instanceof Error ? error.message : String(error) }); }
      }
      const drafts: SkillDraft[] = [];
      for (const id of await readdir(join(root, '.blobot/skills/drafts'))) {
        await checkedDirectory(join(root, '.blobot/skills/drafts', operationId(id)));
        const text = await readRegular(join(root, '.blobot/skills/drafts', id, 'SKILL.md'));
        const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
        let name: unknown;
        try { name = match ? parseDocument(match[1]!).get('name') : undefined; } catch { /* malformed drafts remain editable */ }
        drafts.push({ id, name: typeof name === 'string' ? name : 'Untitled skill' });
      }
      return { skills, drafts, pending: manifest.pending, executions: this.#executions.get(profileId) ?? 0 };
    });
  }

  async skillPath(profileId: string, name: string): Promise<string> {
    const root = await this.#root(profileId);
    return checkedDirectory(join(root, '.agents/skills', skillName(name)));
  }

  async draftPath(profileId: string, id: string): Promise<string> {
    return checkedDirectory(join(await this.#root(profileId), '.blobot/skills/drafts', operationId(id)));
  }

  async createDraft(profileId: string, input: SkillDraftInput): Promise<SkillDraft> {
    const id = randomUUID();
    await this.saveDraft(profileId, id, input);
    return { id, name: input.name };
  }

  async importDraft(profileId: string, path: string): Promise<void> {
    await this.#locked(profileId, async () => {
      const root = await this.#root(profileId), content = await readSkillContents(path), id = randomUUID();
      await writeSkillPackage(join(root, '.blobot/skills/drafts', id), content);
      await writeJson(join(root, '.blobot/skills/draft-origins', `${id}.json`), { kind: 'local-import', originalPath: path });
    });
  }

  async saveDraft(profileId: string, id: string, input: SkillDraftInput): Promise<void> {
    await this.#locked(profileId, async () => {
      const root = await this.#root(profileId), path = join(root, '.blobot/skills/drafts', operationId(id));
      skillName(input.name);
      if (typeof input.description !== 'string' || typeof input.instructions !== 'string' || input.description.length > 1024 || input.instructions.length > 1024 * 1024) throw new Error('The skill draft is too large.');
      await ownDirectory(path);
      await writeText(join(path, 'SKILL.md'), `---\n${stringify({ name: input.name, description: input.description })}---\n${input.instructions}\n`);
    });
  }

  async publishDraft(profileId: string, id: string): Promise<void> {
    await this.#locked(profileId, async () => {
      const root = await this.#root(profileId), path = await checkedDirectory(join(root, '.blobot/skills/drafts', operationId(id)));
      const originPath = join(root, '.blobot/skills/draft-origins', `${id}.json`);
      const origin = await exists(originPath) ? source(JSON.parse(await readRegular(originPath))) : undefined;
      const preview = await this.#previewFolder(root, path, () => ({ kind: 'authored' }), undefined, origin);
      const manifest = await readManifest(root), skill = preview.skills[0]!;
      this.#notPending(manifest, skill.name);
      if (await exists(join(root, '.agents/skills', skill.name))) throw new Error('A skill with this name already exists.');
      manifest.pending.push({ id: randomUUID(), action: 'install', name: skill.name, previewId: preview.id, entry: this.#entry(skill), draftId: id });
      await saveManifest(root, manifest);
      await this.#apply(profileId, root, manifest);
    });
  }

  async read(profileId: string, name: string): Promise<SkillDetail> {
    const path = await this.skillPath(profileId, name), content = await readSkillPackage(path);
    return { path, text: content.files.find((file) => file.path === 'SKILL.md')!.bytes.toString('utf8'), files: content.files.map((file) => file.path) };
  }

  async history(profileId: string): Promise<readonly { id: string; name: string }[]> {
    const root = await this.#root(profileId), results: { id: string; name: string; time: number }[] = [];
    for (const id of await readdir(join(root, '.blobot/skills/previous'))) {
      const directory = await checkedDirectory(join(root, '.blobot/skills/previous', operationId(id)));
      const data: unknown = JSON.parse(await readRegular(join(directory, 'record.json')));
      if (!data || typeof data !== 'object' || !('name' in data) || typeof data.name !== 'string') throw new Error('Invalid skill recovery record.');
      results.push({ id, name: skillName(data.name), time: (await stat(directory)).mtimeMs });
    }
    return results.sort((a, b) => b.time - a.time).map(({ id, name }) => ({ id, name }));
  }

  async restore(profileId: string, id: string, name: string): Promise<void> {
    const root = await this.#root(profileId), directory = await checkedDirectory(join(root, '.blobot/skills/previous', operationId(id)));
    const record: unknown = JSON.parse(await readRegular(join(directory, 'record.json')));
    if (!record || typeof record !== 'object' || !('entry' in record) || !record.entry || typeof record.entry !== 'object' || !('source' in record.entry)) throw new Error('Invalid skill recovery record.');
    const restoredSource = source(record.entry.source);
    const origin = 'origin' in record.entry ? source(record.entry.origin) : undefined;
    const preview = await this.#locked(profileId, () => this.#previewFolder(root, join(directory, skillName(name)), () => restoredSource, undefined, origin));
    await this.install(profileId, preview.id, [name]);
  }
}
