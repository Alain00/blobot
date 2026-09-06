import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PersonalDirectories } from '../personal/personal-directory.js';
import { PersonalSkills } from './personal-skills.js';
import * as remote from './git-source.js';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
it('checks package content rather than repository commits and never replaces local training', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-remote-skills-'))); roots.push(root);
  const repo = join(root, 'source');
  for (const name of ['custom-report', 'neighbor']) {
    await mkdir(join(repo, name), { recursive: true });
    await writeFile(join(repo, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Use this custom process.\nlicense: MIT\n---\nRead report.txt`);
    await writeFile(join(repo, name, 'report.txt'), 'Version one');
  }
  // The Git network boundary returns a fixed checkout. HTTP cloning itself has a live GitLab smoke.
  let commit = 'a'.repeat(40);
  vi.spyOn(remote, 'fetchSkillRepository').mockImplementation(async () => ({ path: repo, commit, dispose: async () => {} }));
  const service = new PersonalSkills(new PersonalDirectories(join(root, 'profiles')));
  const preview = await service.preview('ana', { kind: 'git', url: 'https://git.example.org/team/skills.git', ref: 'stable' });
  await service.install('ana', preview.id, ['custom-report']);
  commit = 'b'.repeat(40);
  await writeFile(join(repo, 'neighbor/report.txt'), 'Only the neighbor changed');
  expect((await service.check('ana', 'custom-report')).changed).toBe(false);
  await writeFile(join(repo, 'custom-report/report.txt'), 'Version two');
  const update = await service.check('ana', 'custom-report');
  expect(update.changed).toBe(true);
  expect((await service.list('ana')).skills[0]?.source).toMatchObject({ resolvedCommit: 'a'.repeat(40) });
  await service.replace('ana', 'custom-report', update.preview.id);
  expect((await service.list('ana')).skills[0]?.source).toMatchObject({ resolvedCommit: commit, skillPath: 'custom-report', requestedRef: 'stable' });
  await writeFile(join(await service.skillPath('ana', 'custom-report'), 'report.txt'), 'My trained workflow');
  await expect(service.replace('ana', 'custom-report', preview.id)).rejects.toThrow(/edited/i);
  await service.makePersonal('ana', 'custom-report');
  const own = (await service.list('ana')).skills[0]!;
  expect(own.source).toEqual({ kind: 'authored' });
  expect(own.origin).toMatchObject({ kind: 'git', resolvedCommit: commit });
  expect(own.license).toBe('MIT');
  await expect(service.check('ana', 'custom-report')).rejects.toThrow(/no remote updates/i);
});
