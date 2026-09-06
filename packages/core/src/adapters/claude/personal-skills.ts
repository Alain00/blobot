import { lstat, readlink, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { checkedDirectory, exists, ownDirectory } from '../../skills/catalogue-files.js';

/** Claude discovers .claude/skills; the alias stays wholly inside the personal mount. */
export async function prepareClaudePersonalSkills(root: string | undefined): Promise<void> {
  if (!root) return;
  await checkedDirectory(root);
  await ownDirectory(join(root, '.claude'));
  const alias = join(root, '.claude/skills');
  if (!await exists(alias)) {
    try { await symlink('../.agents/skills', alias); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
  }
  if (!(await lstat(alias)).isSymbolicLink() || await readlink(alias) !== '../.agents/skills') throw new Error('The personal .claude/skills path already contains other files. Move them into .agents/skills before connecting Claude. Existing files were kept.');
}
