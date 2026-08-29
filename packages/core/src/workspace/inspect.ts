import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { NestedRepo, WorkspaceInspection } from './workspace.js';

const run = promisify(execFile);

/**
 * One pass over the path a team points at, answering which of ticket 10's three kinds of
 * Workspace it is.
 *
 * It lives on its own rather than on a provider because the answer is what *chooses* the
 * provider: the app inspects first and then knows whether it is handing the team to worktrees,
 * to copies, or to the mirrored tree. Every provider's `inspect` delegates here so the three
 * can never disagree about what a folder is.
 */
export async function inspectWorkspace(workspacePath: string): Promise<WorkspaceInspection> {
  if (!existsSync(workspacePath)) {
    return { path: workspacePath, kind: 'plain', hasCommits: false, dirty: false, repos: [], looseFiles: false };
  }

  if (await isRepository(workspacePath)) {
    const [hasCommits, dirty, branch] = await Promise.all([
      succeeds(workspacePath, ['rev-parse', '--verify', 'HEAD']),
      isDirty(workspacePath),
      currentBranch(workspacePath),
    ]);
    return {
      path: workspacePath,
      kind: 'git',
      hasCommits,
      dirty,
      // Empty on a detached HEAD, which is allowed: `git worktree add` is fine with it.
      ...(branch === undefined ? {} : { branch }),
      repos: [],
      looseFiles: false,
    };
  }

  const { repos, looseFiles } = await findNestedRepos(workspacePath);
  if (repos.length === 0) {
    return { path: workspacePath, kind: 'plain', hasCommits: false, dirty: false, repos: [], looseFiles };
  }
  return {
    path: workspacePath,
    kind: 'nested',
    // The tree as a whole has no HEAD and no branch; each repository answers for itself.
    hasCommits: repos.some((repo) => repo.hasCommits),
    dirty: repos.some((repo) => repo.dirty),
    repos,
    looseFiles,
  };
}

/**
 * How deep to look for repositories.
 *
 * Two levels, not unbounded: `~/code/storefront` and `~/code/acme/storefront` are both shapes
 * people actually keep, and walking a home directory to the leaves to answer a folder-picker
 * would take long enough to feel broken. A repository nested deeper is invisible to blobot,
 * which is a limit worth having said out loud rather than a bug to discover.
 */
const MAX_DEPTH = 2;

/** Directories never worth descending into looking for a project. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.cache']);

async function findNestedRepos(
  root: string,
): Promise<{ repos: NestedRepo[]; looseFiles: boolean }> {
  const repos: NestedRepo[] = [];
  let looseFiles = false;

  const walk = async (relative: string, depth: number): Promise<void> => {
    const absolute = relative === '' ? root : join(root, relative);
    const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile() || entry.isSymbolicLink()) {
        // A file at any level that is not inside a repository is a loose file, and the
        // mirrored tree has to copy it.
        looseFiles = true;
        continue;
      }
      if (!entry.isDirectory() || SKIP.has(entry.name) || entry.name.startsWith('.')) continue;

      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (existsSync(join(root, childRelative, '.git'))) {
        repos.push(await describeRepo(root, childRelative));
        continue;
      }
      if (depth + 1 < MAX_DEPTH) await walk(childRelative, depth + 1);
      else looseFiles = true;
    }
  };

  await walk('', 0);
  repos.sort((left, right) => left.path.localeCompare(right.path));
  return { repos, looseFiles };
}

async function describeRepo(root: string, relative: string): Promise<NestedRepo> {
  const absolute = join(root, relative);
  const [hasCommits, dirty, branch] = await Promise.all([
    succeeds(absolute, ['rev-parse', '--verify', 'HEAD']),
    isDirty(absolute),
    currentBranch(absolute),
  ]);
  return { path: relative, hasCommits, dirty, ...(branch === undefined ? {} : { branch }) };
}

export async function isRepository(path: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  const inside = await git(path, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
  return inside.trim() === 'true';
}

async function isDirty(path: string): Promise<boolean> {
  const status = await git(path, ['status', '--porcelain']).catch(() => '');
  return status.trim().length > 0;
}

async function currentBranch(path: string): Promise<string | undefined> {
  const branch = (await git(path, ['branch', '--show-current']).catch(() => '')).trim();
  return branch.length === 0 ? undefined : branch;
}

async function succeeds(path: string, args: string[]): Promise<boolean> {
  try {
    await git(path, args);
    return true;
  } catch {
    return false;
  }
}

async function git(path: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', path, ...args], { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}
