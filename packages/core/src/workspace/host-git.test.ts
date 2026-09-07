import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { switchBranch } from './branches.js';
import { commitWorktree } from './commit.js';
import { GitWorktreeWorkspaces } from './git-worktrees.js';
import { spawnCommand } from './status.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'blobot-host-git-'));
  temporary.push(root);
  const repo = join(root, 'repo');
  await mkdir(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@blobot.invalid');
  await writeFile(join(repo, 'work'), 'first\n');
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '-m', 'first');
  const marker = join(root, 'executed');
  const program = join(root, 'untrusted-program');
  await writeFile(program, `#!/bin/sh\nprintf 'executed' > '${marker}'\n`);
  await chmod(program, 0o700);
  return { root, repo, git, marker, program };
}

it('does not run shared monitors or hooks during linked-worktree reads, creation, commit or switch', async () => {
  const { root, repo, git, marker, program } = await fixture();
  const hooks = join(root, 'hooks');
  await mkdir(hooks);
  for (const hook of ['post-checkout', 'pre-commit', 'post-commit']) {
    await writeFile(join(hooks, hook), await readFile(program));
    await chmod(join(hooks, hook), 0o700);
  }
  git('config', 'core.fsmonitor', program);
  git('config', 'core.hooksPath', hooks);
  const config = await readFile(join(repo, '.git/config'), 'utf8');
  const provider = new GitWorktreeWorkspaces(join(root, 'worktrees'));
  const workspace = await provider.provision({ workspacePath: repo, teamName: 'team', agentName: 'Alice', agentId: 'alice' });
  expect(await provider.inspect(workspace.path)).toMatchObject({ dirty: false });
  expect((await spawnCommand('git', ['status', '--porcelain'], { cwd: workspace.path })).code).toBe(0);
  await writeFile(join(workspace.path, 'work'), 'second\n');
  expect(await commitWorktree({ path: workspace.path, message: 'second', agentName: 'Alice' }, spawnCommand)).toMatchObject({ ok: true });
  expect(await switchBranch(workspace.path, 'another', { create: true }, spawnCommand)).toMatchObject({ ok: true });
  expect(existsSync(marker)).toBe(false);
  expect(await readFile(join(repo, '.git/config'), 'utf8')).toBe(config);
});

it('reads raw diffs without executing a configured external diff or text converter', async () => {
  const { repo, git, marker, program } = await fixture();
  git('config', 'diff.external', program);
  git('config', 'diff.fixture.textconv', program);
  await writeFile(join(repo, '.gitattributes'), 'work diff=fixture\n');
  await writeFile(join(repo, 'work'), 'second\n');
  const diff = await spawnCommand('git', ['diff', 'HEAD'], { cwd: repo });
  expect(diff.code).toBe(0);
  expect(diff.stdout).toContain('+second');
  expect(existsSync(marker)).toBe(false);
});

it('refuses an ext transport even when shared config explicitly permits it', async () => {
  const { repo, git, marker, program } = await fixture();
  git('config', 'protocol.ext.allow', 'always');
  git('remote', 'add', 'origin', `ext::${program}`);
  const result = await spawnCommand('git', ['ls-remote', 'origin'], { cwd: repo });
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('not allowed');
  expect(existsSync(marker)).toBe(false);
});

it('uses the host ssh executable rather than a shared core.sshCommand', async () => {
  const { root, repo, git, marker, program } = await fixture();
  git('config', 'core.sshCommand', program);
  git('remote', 'add', 'origin', 'ssh://fixture.invalid/repo');
  const hostBin = join(root, 'bin');
  await mkdir(hostBin);
  const invoked = join(root, 'host-ssh-invoked');
  await writeFile(join(hostBin, 'ssh'), `#!/bin/sh\nprintf 'invoked' > '${invoked}'\nexit 1\n`);
  await chmod(join(hostBin, 'ssh'), 0o700);
  await spawnCommand('git', ['ls-remote', 'origin'], {
    cwd: repo, env: { PATH: `${hostBin}:${process.env['PATH'] ?? ''}`, GIT_SSH_VARIANT: 'ssh' },
  });
  expect(existsSync(invoked)).toBe(true);
  expect(existsSync(marker)).toBe(false);
});

it('refuses custom protocol helpers even when repository and inherited policy allow them', async () => {
  const { root, repo, git, marker, program } = await fixture();
  const bin = join(root, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'git-remote-fixture'), await readFile(program));
  await chmod(join(bin, 'git-remote-fixture'), 0o700);
  git('config', 'protocol.fixture.allow', 'always');
  git('remote', 'add', 'origin', 'fixture::unused');
  const result = await spawnCommand('git', ['ls-remote', 'origin'], {
    cwd: repo, env: { PATH: `${bin}:${process.env['PATH'] ?? ''}`, GIT_ALLOW_PROTOCOL: 'fixture' },
  });
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('not allowed');
  expect(existsSync(marker)).toBe(false);
});
