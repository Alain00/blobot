import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { boxWorkspaceMounts, validateBoxWorkspaceMounts, verifyBoxMountPaths } from './box-mounts.js';
import { GitWorktreeWorkspaces } from './git-worktrees.js';
import { NestedRepoWorkspaces } from './nested-repos.js';
import { CopiedDirectoryWorkspaces } from './copied-directory.js';
import { spawnCommand } from './status.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-mounts-')));
  directories.push(root);
  return root;
}
async function repository(path: string) {
  await mkdir(path, { recursive: true });
  const git = async (args: string[]) => {
    const result = await spawnCommand('git', args, { cwd: path, env: {
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture', GIT_COMMITTER_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    } });
    expect(result.code, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  await git(['init']);
  await writeFile(join(path, 'README'), 'fixture');
  await git(['add', '.']);
  await git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']);
  return git;
}
const who = { teamName: 'Team', agentId: 'alice-id', agentName: 'Alice' };

it('mounts the linked worktree and actual Git metadata, leaving the source and sibling files out', async () => {
  const root = await fixture(), source = join(root, 'repo');
  await repository(source);
  const provider = new GitWorktreeWorkspaces(join(root, 'worktrees'));
  const request = { ...who, workspacePath: source };
  const workspace = await provider.provision(request);
  const plan = await boxWorkspaceMounts('git', request, workspace, 'none');
  expect(plan).toEqual({ path: workspace.path, commonGit: [join(source, '.git')] });
  await expect(verifyBoxMountPaths(plan)).resolves.toBeUndefined();
  await expect(boxWorkspaceMounts('git', request, { ...workspace, path: source }, 'none')).rejects.toThrow('linked worktree');
  const pointer = await readFile(join(workspace.path, '.git'), 'utf8');
  expect(pointer).toContain(join(source, '.git/worktrees'));
  await writeFile(join(source, '.git/objects/info/alternates'), '/unmounted/objects\n');
  await expect(boxWorkspaceMounts('git', request, workspace, 'none')).rejects.toThrow('external Git object store');
});

it('uses only selected nested repositories and preserves the plain-copy provider', async () => {
  const root = await fixture(), source = join(root, 'source');
  await repository(join(source, 'chosen'));
  await repository(join(source, 'excluded'));
  const provider = new NestedRepoWorkspaces(join(root, 'trees'));
  const request = { ...who, workspacePath: source, repos: ['chosen'] };
  const workspace = await provider.provision(request);
  expect(await boxWorkspaceMounts('nested', request, workspace, 'none')).toEqual({ path: workspace.path, commonGit: [join(source, 'chosen/.git')] });
  const plainSource = join(root, 'documents');
  await mkdir(plainSource);
  await writeFile(join(plainSource, 'notes'), 'original');
  const copies = new CopiedDirectoryWorkspaces(join(root, 'copies'));
  const plain = { ...who, workspacePath: plainSource };
  const copy = await copies.provision(plain);
  expect(await boxWorkspaceMounts('plain', plain, copy, 'none')).toEqual({ path: copy.path, commonGit: [] });
  expect((await copies.remove(plain)).work).toBe('kept');
  expect(await readFile(join(copy.path, 'notes'), 'utf8')).toBe('original');
});

it('refuses overlapping, ambiguous and reserved mounts, and a retargeted recorded directory', async () => {
  for (const plan of [
    { path: '/Users/a', commonGit: ['/Users'] }, { path: '/home/agent', commonGit: [] },
    { path: '/Users/a:ro', commonGit: [] }, { path: '/Users/a/../b', commonGit: [] },
  ]) expect(() => validateBoxWorkspaceMounts(plan)).toThrow();
  const root = await fixture(), path = join(root, 'work'), other = join(root, 'other');
  await mkdir(path); await mkdir(other);
  const plan = { path, commonGit: [] };
  await verifyBoxMountPaths(plan);
  await rm(path, { recursive: true }); await symlink(other, path);
  await expect(verifyBoxMountPaths(plan)).rejects.toThrow('no longer available');
});
