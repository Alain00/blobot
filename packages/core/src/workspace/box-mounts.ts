import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { inspectWorkspace } from './inspect.js';
import { HOST_GIT_ENVIRONMENT, hostGitArguments } from './host-git.js';
import type { AgentWorkspace, ProvisionRequest, WorkspaceInspection } from './workspace.js';

const run = promisify(execFile);

export interface BoxWorkspaceMounts {
  readonly path: string;
  /** Only actual common Git directories, never their parent checkouts. */
  readonly commonGit: readonly string[];
  readonly sharedSkillsPath?: string;
}

function inside(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix === '' || (!suffix.startsWith(`..${sep}`) && suffix !== '..' && !isAbsolute(suffix));
}

/** Validate serialized plans too: they become sbx PATH arguments and an exact mount allowlist. */
export function validateBoxWorkspaceMounts(plan: BoxWorkspaceMounts): void {
  const paths = [plan.path, ...plan.commonGit, ...plan.sharedSkillsPath === undefined ? [] : [plan.sharedSkillsPath]];
  const reserved = ['/home/agent', '/workspace', '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/proc', '/sys', '/dev', '/run', '/root'];
  for (const path of paths) {
    if (!isAbsolute(path) || resolve(path) !== path || /[\x00-\x1f:]/.test(path) ||
        reserved.some((root) => inside(path, root) || inside(root, path))) {
      throw new Error('This workspace path cannot be mounted in a Machine.');
    }
  }
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      if (inside(paths[i]!, paths[j]!) || inside(paths[j]!, paths[i]!)) {
        throw new Error('Workspace and shared Git mounts must be separate directories.');
      }
    }
  }
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await run('git', hostGitArguments(args), { cwd, timeout: 8_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env['PATH'], GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', ...HOST_GIT_ENVIRONMENT } });
  return stdout.trim();
}

/**
 * Derived from the existing provider's work, on the host. No clone, origin edit or fetch.
 * Unsupported external object stores/submodules refuse before creating a box; they never
 * cause an enclosing checkout (or an arbitrary path from a .git file) to be mounted.
 */
export async function boxWorkspaceMounts(
  kind: WorkspaceInspection['kind'], request: ProvisionRequest, workspace: AgentWorkspace,
  skills: 'operator' | 'none' = 'operator',
): Promise<BoxWorkspaceMounts> {
  if (workspace.agentId !== request.agentId) throw new Error('Workspace belongs to another Agent.');
  const path = await realpath(workspace.path);
  if (!(await lstat(path)).isDirectory()) throw new Error('Agent workspace is unavailable.');
  const repositories = kind === 'plain' ? [] : kind === 'git' ? [''] :
    request.repos?.length ? request.repos : (await inspectWorkspace(request.workspacePath)).repos.map((repo) => repo.path);
  const commonGit = new Set<string>();
  for (const repo of repositories) {
    if (isAbsolute(repo) || !inside(path, resolve(path, repo))) throw new Error('Repository is outside the selected workspace.');
    const source = join(request.workspacePath, repo);
    const target = join(path, repo);
    // The nested provider skips empty repositories rather than inventing a branch.
    if (kind === 'nested' && !(await inspectWorkspace(source)).hasCommits) continue;
    const targetPath = await realpath(target);
    if (targetPath !== target || !inside(path, targetPath)) throw new Error('Workspace repository path has moved.');
    const common = await git(source, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const actualCommon = await realpath(common);
    if (actualCommon !== common || await git(target, ['rev-parse', '--path-format=absolute', '--git-common-dir']) !== common) {
      throw new Error('Agent worktree does not belong to the selected repository.');
    }
    const metadata = await git(target, ['rev-parse', '--absolute-git-dir']);
    if (!inside(join(common, 'worktrees'), metadata) || await realpath(metadata) !== metadata ||
        !(await lstat(join(target, '.git'))).isFile() ||
        await realpath((await readFile(join(metadata, 'gitdir'), 'utf8')).trim()) !== join(target, '.git')) {
      throw new Error('Agent workspace is not a registered linked worktree.');
    }
    for (const store of [join(common, 'objects/info/alternates'), join(common, 'objects/info/http-alternates')]) {
      const content = await readFile(store, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return ''; throw error; });
      if (content.trim() !== '') throw new Error('This repository uses an external Git object store that the Machine cannot access.');
    }
    if (/(?:^|\0)160000 /.test(await git(target, ['ls-files', '--stage', '-z']))) {
      throw new Error('Submodule workspaces need additional Machine mount support.');
    }
    commonGit.add(common);
  }
  const skillPath = join(homedir(), '.claude', 'skills');
  const skillsPresent = await realpath(skillPath).then(async (canonical) => canonical === skillPath && (await lstat(skillPath)).isDirectory()).catch(() => false);
  const plan = { path, commonGit: [...commonGit].sort(), ...(skills === 'operator' && skillsPresent ? { sharedSkillsPath: skillPath } : {}) };
  validateBoxWorkspaceMounts(plan);
  return Object.freeze({ ...plan, commonGit: Object.freeze(plan.commonGit) });
}

/** Do not silently retarget a saved mount when a path is replaced by a symlink. */
export async function verifyBoxMountPaths(plan: BoxWorkspaceMounts): Promise<void> {
  validateBoxWorkspaceMounts(plan);
  for (const path of [plan.path, ...plan.commonGit, ...plan.sharedSkillsPath === undefined ? [] : [plan.sharedSkillsPath]]) {
    const available = await realpath(path).then(async canonical => canonical === path && (await lstat(path)).isDirectory()).catch(() => false);
    if (!available) throw new Error(path === plan.sharedSkillsPath
      ? 'The shared skills folder recorded for this sandbox is unavailable or moved. Restore the original folder before starting. Its data was kept.'
      : 'A recorded workspace or shared Git folder is no longer available. Restore the original folder before starting. Its data was kept.');
  }
}
