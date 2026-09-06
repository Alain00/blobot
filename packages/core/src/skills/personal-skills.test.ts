import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PersonalDirectories } from '../personal/personal-directory.js';
import { PersonalSkills } from './personal-skills.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-skills-')));
  temporary.push(root);
  const folders = new PersonalDirectories(join(root, 'profiles'));
  const skills = new PersonalSkills(folders);
  const source = join(root, 'custom');
  await mkdir(join(source, 'scripts'), { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '---\nname: customer-research\ndescription: >\n  Use when interviewing customers\n  and reviewing the findings.\nmetadata:\n  author: My team\n---\nRead references.md and run scripts/report.sh.\n');
  await writeFile(join(source, 'references.md'), 'Ask for concrete examples.');
  await writeFile(join(source, 'scripts/report.sh'), '#!/bin/sh\nprintf report\n', { mode: 0o755 });
  return { root, folders, skills, source };
}

describe('personal skills', () => {
  it('keeps an imported incomplete skill and all its resources as an editable draft', async () => {
    const f = await fixture();
    await writeFile(join(f.source, 'SKILL.md'), '---\nname: customer-research\ndescription: ""\n---\nKeep my incomplete process.');
    await expect(f.skills.preview('ana', { kind: 'folder', path: f.source })).rejects.toThrow(/description/);
    await f.skills.importDraft('ana', f.source);
    const catalogue = await f.skills.list('ana');
    expect(catalogue.skills).toEqual([]);
    const id = catalogue.drafts[0]!.id, path = await f.skills.draftPath('ana', id);
    expect(await readFile(join(path, 'references.md'), 'utf8')).toBe('Ask for concrete examples.');
    await f.skills.saveDraft('ana', id, { name: 'customer-research', description: 'Use in interviews', instructions: 'Keep my process.' });
    await f.skills.publishDraft('ana', id);
    expect((await f.skills.list('ana')).skills[0]?.origin?.kind).toBe('local-import');
  });
  it.each(['journal', 'previous-moved', 'new-published', 'manifest-written'])('recovers a replacement after a crash at %s without losing the old files', async (phase) => {
    const f = await fixture(), name = 'customer-research';
    const first = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    await f.skills.install('ana', first.id, [name]);
    await f.skills.acquire('ana'); // simulate the old app's execution, then its process exit
    await writeFile(join(f.source, 'references.md'), 'New version');
    const next = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    await f.skills.replace('ana', name, next.id);
    const root = f.folders.forProfile('ana').path, metadata = join(root, '.blobot/skills');
    const manifest = JSON.parse(await readFile(join(metadata, 'manifest.json'), 'utf8'));
    const operation = manifest.pending[0];
    await writeFile(join(metadata, 'transaction.json'), JSON.stringify(operation));
    if (phase !== 'journal') {
      await mkdir(join(metadata, 'previous', operation.id));
      await rename(join(root, '.agents/skills', name), join(metadata, 'previous', operation.id, name));
    }
    if (phase === 'new-published' || phase === 'manifest-written') await rename(join(metadata, 'staging', next.id, name), join(root, '.agents/skills', name));
    if (phase === 'manifest-written') {
      manifest.entries[name] = operation.entry; manifest.pending = [];
      await writeFile(join(metadata, 'manifest.json'), JSON.stringify(manifest));
    }
    const restarted = new PersonalSkills(f.folders), catalogue = await restarted.list('ana');
    expect(catalogue.pending).toEqual([]);
    expect(await readFile(join(await restarted.skillPath('ana', name), 'references.md'), 'utf8')).toBe('New version');
    expect(await readFile(join(metadata, 'previous', operation.id, name, 'references.md'), 'utf8')).toBe('Ask for concrete examples.');
    expect((await restarted.history('ana'))[0]?.name).toBe(name);
  });

  it('serializes simultaneous installations and does not mistake prototype properties for skills', async () => {
    const f = await fixture();
    await writeFile(join(f.source, 'SKILL.md'), '---\nname: constructor\ndescription: My custom skill\n---\nRead references.md');
    const preview = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    const outcomes = await Promise.allSettled([f.skills.install('ana', preview.id, ['constructor']), f.skills.install('ana', preview.id, ['constructor'])]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect((await f.skills.list('ana')).skills[0]?.name).toBe('constructor');
  });

  it('preserves complete binary and executable resources, dereferences internal links and refuses external ones', async () => {
    const f = await fixture();
    await writeFile(join(f.source, 'template.bin'), Buffer.from([0, 255, 20, 42]));
    await symlink('references.md', join(f.source, 'copy.md'));
    const preview = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    await f.skills.install('ana', preview.id, ['customer-research']);
    const path = await f.skills.skillPath('ana', 'customer-research');
    expect(await readFile(join(path, 'template.bin'))).toEqual(Buffer.from([0, 255, 20, 42]));
    expect(await readFile(join(path, 'copy.md'), 'utf8')).toBe('Ask for concrete examples.');
    await symlink(join(f.root, 'profiles/ana/files/.blobot-personal-id'), join(f.source, 'outside'));
    await expect(f.skills.preview('ana', { kind: 'folder', path: f.source })).rejects.toThrow(/outside|external/i);
  });
  it('imports a complete custom skill once, independently of its source and team', async () => {
    const f = await fixture();
    const preview = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    expect(preview.skills.map((skill) => skill.name)).toEqual(['customer-research']);
    expect(preview.skills[0]?.description).toContain('reviewing the findings');
    await f.skills.install('ana', preview.id, ['customer-research']);
    await rm(f.source, { recursive: true });
    const installed = await f.skills.list('ana');
    expect(installed.skills).toEqual([expect.objectContaining({ name: 'customer-research', source: { kind: 'local-import', originalPath: f.source }, modified: false })]);
    const path = await f.skills.skillPath('ana', 'customer-research');
    expect(await readFile(join(path, 'references.md'), 'utf8')).toBe('Ask for concrete examples.');
    expect(await readFile(join(path, 'scripts/report.sh'), 'utf8')).toContain('printf report');
    expect((await f.skills.list('bob')).skills).toEqual([]);
    expect((await new PersonalSkills(f.folders).list('ana')).skills[0]?.name).toBe('customer-research');
  });

  it('publishes queued changes only after every execution releases the profile, including after relaunch', async () => {
    const f = await fixture();
    const releaseBlue = await f.skills.acquire('ana');
    const releaseContab = await f.skills.acquire('ana');
    const preview = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    await f.skills.install('ana', preview.id, ['customer-research']);
    expect((await f.skills.list('ana')).skills).toHaveLength(0);
    expect((await f.skills.list('ana')).pending).toEqual([expect.objectContaining({ name: 'customer-research', action: 'install' })]);
    await releaseBlue();
    expect((await f.skills.list('ana')).skills).toHaveLength(0);
    await releaseContab();
    expect((await f.skills.list('ana')).skills[0]?.name).toBe('customer-research');
    expect((await f.skills.list('ana')).pending).toEqual([]);
    await releaseContab(); // a double release cannot close someone else's execution
  });

  it('preserves a manually authored skill and refuses a preview changed before publication', async () => {
    const f = await fixture();
    const preview = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    const personal = f.folders.forProfile('ana').path;
    await mkdir(join(personal, '.agents/skills/customer-research'));
    await writeFile(join(personal, '.agents/skills/customer-research/SKILL.md'), '---\nname: customer-research\ndescription: My own process\n---\nKeep this.');
    await expect(f.skills.install('ana', preview.id, ['customer-research'])).rejects.toThrow(/already|exists/i);
    expect(await readFile(join(personal, '.agents/skills/customer-research/SKILL.md'), 'utf8')).toContain('Keep this.');
    const other = await f.skills.preview('bob', { kind: 'folder', path: f.source });
    await writeFile(join(f.folders.forProfile('bob').path, '.blobot/skills/staging', other.id, 'customer-research/references.md'), 'Changed after preview');
    await expect(f.skills.install('bob', other.id, ['customer-research'])).rejects.toThrow(/changed|preview/i);
    expect((await f.skills.list('bob')).skills).toHaveLength(0);
  });

  it('refuses a managed path redirected outside the personal folder', async () => {
    const f = await fixture();
    const personal = await f.folders.forProfile('ana').prepare();
    const elsewhere = join(f.root, 'outside');
    await mkdir(elsewhere);
    await symlink(elsewhere, join(personal.path, '.agents'));
    await expect(f.skills.preview('ana', { kind: 'folder', path: f.source })).rejects.toThrow(/folder|link|directory/i);
    expect(await readFile(join(f.source, 'references.md'), 'utf8')).toBe('Ask for concrete examples.');
  });

  it('keeps custom drafts outside native discovery until they are completed and published', async () => {
    const f = await fixture();
    const draft = await f.skills.createDraft('ana', { name: 'my-process', description: '', instructions: 'Ask for evidence.' });
    expect((await f.skills.list('ana')).skills).toEqual([]);
    expect((await f.skills.list('ana')).drafts[0]?.name).toBe('my-process');
    await expect(f.skills.publishDraft('ana', draft.id)).rejects.toThrow(/description/i);
    await f.skills.saveDraft('ana', draft.id, { name: 'my-process', description: 'Use during research.', instructions: 'Ask for evidence.' });
    await f.skills.publishDraft('ana', draft.id);
    const catalogue = await f.skills.list('ana');
    expect(catalogue.skills[0]).toMatchObject({ name: 'my-process', source: { kind: 'authored' }, modified: false });
    expect(catalogue.drafts).toEqual([]);
    expect((await f.skills.read('ana', 'my-process')).text).toContain('Ask for evidence.');
  });

  it('reimports explicitly, preserves training, and removes to a recoverable folder', async () => {
    const f = await fixture();
    const preview = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    await f.skills.install('ana', preview.id, ['customer-research']);
    const path = await f.skills.skillPath('ana', 'customer-research');
    await writeFile(join(path, 'references.md'), 'Training worth keeping.');
    const replacement = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    await expect(f.skills.replace('ana', 'customer-research', replacement.id)).rejects.toThrow(/edit|modified/i);
    await expect(f.skills.remove('ana', 'customer-research')).rejects.toThrow(/edit|modified/i);
    await f.skills.makePersonal('ana', 'customer-research');
    expect((await f.skills.list('ana')).skills[0]).toMatchObject({ source: { kind: 'authored' }, origin: { kind: 'local-import' }, modified: false });
    await f.skills.remove('ana', 'customer-research');
    expect((await f.skills.list('ana')).skills).toEqual([]);
    const history = await f.skills.history('ana');
    expect(history).toHaveLength(1);
    await f.skills.restore('ana', history[0]!.id, 'customer-research');
    expect((await f.skills.list('ana')).skills[0]?.origin?.kind).toBe('local-import');
    expect(await readFile(join(path, 'references.md'), 'utf8')).toBe('Training worth keeping.');
  });

  it('keeps queued replacements blocked if the user edits before sessions close', async () => {
    const f = await fixture();
    const preview = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    await f.skills.install('ana', preview.id, ['customer-research']);
    const release = await f.skills.acquire('ana');
    await writeFile(join(f.source, 'references.md'), 'New upstream version.');
    const replacement = await f.skills.preview('ana', { kind: 'folder', path: f.source });
    await f.skills.replace('ana', 'customer-research', replacement.id);
    const path = await f.skills.skillPath('ana', 'customer-research');
    await writeFile(join(path, 'references.md'), 'Training during execution.');
    await release();
    expect((await f.skills.list('ana')).pending[0]?.error).toMatch(/changed|edit/i);
    expect(await readFile(join(path, 'references.md'), 'utf8')).toBe('Training during execution.');
    await f.skills.cancel('ana', (await f.skills.list('ana')).pending[0]!.id);
    expect((await f.skills.list('ana')).pending).toEqual([]);
  });

  it('treats metadata as untrusted and does not follow managed skill links outside the volume', async () => {
    const f = await fixture();
    await f.skills.list('ana');
    const personal = f.folders.forProfile('ana').path;
    await symlink(f.source, join(personal, '.agents/skills/customer-research'));
    expect((await f.skills.list('ana')).skills[0]?.error).toMatch(/link|outside/i);
    await expect(f.skills.skillPath('ana', 'customer-research')).rejects.toThrow(/link|outside/i);
    await writeFile(join(personal, '.blobot/skills/manifest.json'), JSON.stringify({ version: 1, entries: {}, pending: [{ id: '../../outside', name: 'customer-research', action: 'remove' }] }));
    await expect(f.skills.list('ana')).rejects.toThrow(/catalogue|operation/i);
    expect(await readFile(join(f.source, 'references.md'), 'utf8')).toBe('Ask for concrete examples.');
  });
});
