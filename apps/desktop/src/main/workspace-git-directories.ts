import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnCommand, type Team, type WorkspaceInspection } from '@blobot/core';

/** Exact shared Git metadata for the repositories the user chose, never their parent trees. */
export async function workspaceGitDirectories(team: Team, inspection: WorkspaceInspection): Promise<readonly string[]> {
  const repositories = team.workspaceKind === 'plain' ? [] : team.workspaceKind === 'git' ? ['']
    : inspection.repos.filter((repo) => repo.hasCommits &&
      (team.workspaceRepos === undefined || team.workspaceRepos.length === 0 || team.workspaceRepos.includes(repo.path))).map((repo) => repo.path);
  const directories = await Promise.all(repositories.map(async (repo) => {
    const cwd = resolve(team.workspacePath, repo);
    const suffix = relative(team.workspacePath, cwd);
    if (isAbsolute(repo) || isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`)) {
      throw new Error('A selected repository is outside this workspace.');
    }
    const result = await spawnCommand('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
    const path = result.stdout.trim();
    if (result.code !== 0 || !isAbsolute(path) || /[\x00-\x1f]/.test(path)) {
      throw new Error('The selected repository’s Git directory is unavailable.');
    }
    return realpath(path);
  }));
  return [...new Set(directories)].sort();
}
