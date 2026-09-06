import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { inspectWorkspace, type Team } from '@blobot/core';
import { workspaceGitDirectories } from './workspace-git-directories.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function root() { const value = await realpath(await mkdtemp(join(tmpdir(), 'blobot-git-reach-'))); roots.push(value); return value; }
async function repository(path: string, committed = true) {
  await mkdir(path, { recursive: true });
  execFileSync('git', ['init', '-q', path]);
  if (committed) execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-qm', 'Fixture'], { cwd: path });
}
const team = (workspacePath: string, workspaceKind: Team['workspaceKind']): Team => ({
  id: 'team', name: 'Team', workspacePath, workspaceKind, turnBudget: 10,
});

it('grants only the common Git metadata of a selected linked source worktree', async () => {
  const path = await root();
  const source = join(path, 'source');
  const linked = join(path, 'linked');
  await repository(source);
  execFileSync('git', ['worktree', 'add', '-qb', 'linked', linked], { cwd: source });
  expect(await workspaceGitDirectories(team(linked, 'git'), await inspectWorkspace(linked)))
    .toEqual([join(source, '.git')]);
});

it('grants nested selected repositories only, skipping empty and excluded repositories', async () => {
  const path = await root();
  for (const name of ['one', 'two', 'excluded']) await repository(join(path, name));
  await repository(join(path, 'empty'), false);
  const selected = { ...team(path, 'nested'), workspaceRepos: ['one', 'two', 'empty'] };
  expect(await workspaceGitDirectories(selected, await inspectWorkspace(path)))
    .toEqual([join(path, 'one', '.git'), join(path, 'two', '.git')]);
});
