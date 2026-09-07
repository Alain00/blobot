import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersonalDirectories } from '../../../../packages/core/src/personal/personal-directory.js';
import { PersonalSkills } from '../../../../packages/core/src/skills/personal-skills.js';

const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-gitlab-preview-')));
const manager = new PersonalSkills(new PersonalDirectories(join(root, 'profiles')));
const url = 'https://gitlab.com/gitlab-org/ai/skills.git';
const result: Record<string, unknown> = { url, root, primarySource: 'https://gitlab.com/gitlab-org/ai/skills/-/tree/main' };
try {
  const preview = await manager.preview('ana', { kind: 'git', url });
  result.skillCount = preview.skills.length;
  result.skills = preview.skills.map(skill => ({ name: skill.name, fileCount: skill.files.length, source: skill.source }));
  result.commits = [...new Set(preview.skills.flatMap(skill => skill.source.kind === 'git' ? [skill.source.resolvedCommit] : []))];
  result.catalogueRemainsUninstalled = (await manager.list('ana')).skills.length === 0;
  result.passed = preview.skills.some(skill => skill.name === 'commit-messages') && result.catalogueRemainsUninstalled;
} catch (error) { result.error = String(error); result.passed = false; }
await writeFile(join(import.meta.dirname, 'gitlab-preview-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ url, passed: result.passed, skillCount: result.skillCount, commits: result.commits,
  catalogueRemainsUninstalled: result.catalogueRemainsUninstalled, error: result.error }));
