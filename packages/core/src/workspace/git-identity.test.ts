import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { agentGitEnvironment } from './git-identity.js';
import { commitWorktree } from './commit.js';
import { spawnCommand } from './status.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

it('authors runtime and button commits as separate Agents without signing or changing shared configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'blobot-identity-'));
  directories.push(dir);
  const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = (args: string[], extra = {}) => spawnCommand('git', args, { cwd: dir, env: { ...env, ...extra } });
  expect((await git(['init'])).code).toBe(0);
  for (const [key, value] of [['user.name', 'Host User'], ['user.email', 'host@example.invalid'], ['commit.gpgsign', 'true'], ['gpg.program', '/no-such-signer']]) {
    expect((await git(['config', key!, value!])).code).toBe(0);
  }
  const config = await readFile(join(dir, '.git/config'), 'utf8');
  await writeFile(join(dir, 'work'), 'runtime\n');
  await git(['add', '-A']);
  expect((await git(['commit', '-m', 'runtime'], agentGitEnvironment('Alice'))).code).toBe(0);
  await writeFile(join(dir, 'work'), 'button\n');
  const outcome = await commitWorktree({ path: dir, message: 'button', agentName: 'Bob' }, (cmd, args, options) =>
    spawnCommand(cmd, args, { ...options, env: { ...env, ...options?.env } }));
  expect(outcome.ok).toBe(true);
  // The new file panel selects paths independently of the Agent's existing staged work.
  // Both that selection and the unsigned Agent identity must survive the merge.
  await writeFile(join(dir, 'work'), 'selected edit\n');
  await writeFile(join(dir, 'selected-new'), 'selected addition\n');
  await writeFile(join(dir, 'not-selected'), 'the Agent staged this separately\n');
  expect((await git(['add', 'not-selected'])).code).toBe(0);
  const stagedBefore = await git(['diff', '--cached', '--binary']);
  const selected = await commitWorktree({
    path: dir, message: 'selected', agentName: 'Cara',
    paths: ['work', 'selected-new'], untracked: ['selected-new'],
  }, (cmd, args, options) => spawnCommand(cmd, args, { ...options, env: { ...env, ...options?.env } }));
  expect(selected.ok).toBe(true);
  expect((await git(['diff', '--cached', '--binary'])).stdout).toBe(stagedBefore.stdout);
  expect((await git(['show', '--format=', '--name-only', 'HEAD'])).stdout.trim().split('\n')).toEqual(['selected-new', 'work']);
  const log = await git(['log', '--format=%an|%ae|%cn|%ce|%G?']);
  expect(log.stdout.trim().split('\n')).toEqual([
    'Cara|cara@agents.blobot.invalid|Cara|cara@agents.blobot.invalid|N',
    'Bob|bob@agents.blobot.invalid|Bob|bob@agents.blobot.invalid|N',
    'Alice|alice@agents.blobot.invalid|Alice|alice@agents.blobot.invalid|N',
  ]);
  expect(await readFile(join(dir, '.git/config'), 'utf8')).toBe(config);
});

it('preserves inherited Git config pairs while overriding signing and ignores unrelated environment', () => {
  const result = agentGitEnvironment('Alice', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.quotepath', GIT_CONFIG_VALUE_0: 'false', SECRET: 'never' });
  expect(result['GIT_CONFIG_KEY_0']).toBe('core.quotepath');
  expect(result['GIT_CONFIG_COUNT']).toBe('2');
  expect(result['GIT_CONFIG_KEY_1']).toBe('commit.gpgsign');
  expect(result).not.toHaveProperty('SECRET');
});

it('includes its signing override in the configuration entry limit', () => {
  const inherited: Record<string, string> = { GIT_CONFIG_COUNT: '9999' };
  for (let index = 0; index < 9999; index++) {
    inherited[`GIT_CONFIG_KEY_${index}`] = 'core.quotepath';
    inherited[`GIT_CONFIG_VALUE_${index}`] = 'false';
  }
  expect(agentGitEnvironment('Alice', inherited)['GIT_CONFIG_COUNT']).toBe('10000');
  inherited['GIT_CONFIG_COUNT'] = '10000';
  expect(() => agentGitEnvironment('Alice', inherited)).toThrow('Invalid inherited Git configuration');
});
