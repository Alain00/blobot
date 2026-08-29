import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CopiedDirectoryWorkspaces } from './copied-directory.js';
import { GitWorktreeWorkspaces } from './git-worktrees.js';
import { inspectWorkspace } from './inspect.js';
import { NestedRepoWorkspaces } from './nested-repos.js';
import { WorkspaceError, type ProvisionRequest } from './workspace.js';

/**
 * The amendment to ticket 10: a Workspace need not be a git repository.
 *
 * Against real directories and real repositories in temp folders, for the same reason the git
 * suite is — every claim here is a claim about what the filesystem and `git` actually do.
 */

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function scratch(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), `blobot-${prefix}-`));
  temporary.push(path);
  return path;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** A repository at `path`, with one commit unless told otherwise. */
function repositoryAt(path: string, options: { commit?: boolean } = {}): string {
  mkdirSync(path, { recursive: true });
  git(path, 'init', '--initial-branch=main');
  git(path, 'config', 'user.email', 'test@blobot.local');
  git(path, 'config', 'user.name', 'blobot test');
  if (options.commit !== false) {
    writeFileSync(join(path, 'README.md'), '# project\n');
    git(path, 'add', '.');
    git(path, 'commit', '-m', 'first');
  }
  return path;
}

function request(workspacePath: string, extra: Partial<ProvisionRequest> = {}): ProvisionRequest {
  return {
    workspacePath,
    teamName: 'checkout',
    agentId: 'alice',
    agentName: 'Alice',
    ...extra,
  };
}

describe('classifying a workspace', () => {
  it('calls a folder with no repository anywhere plain', async () => {
    const folder = scratch('notes');
    writeFileSync(join(folder, 'plan.md'), '# plan\n');

    const inspection = await inspectWorkspace(folder);
    expect(inspection).toMatchObject({ kind: 'plain', repos: [], looseFiles: true });
  });

  it('calls a repository git, and does not look inside it for more', async () => {
    const repo = repositoryAt(join(scratch('ws'), 'storefront'));
    // A repository can perfectly well contain a vendored repository; the outer one is the
    // Workspace and the inner one is its business, not ours.
    repositoryAt(join(repo, 'vendor', 'lib'));

    const inspection = await inspectWorkspace(repo);
    expect(inspection.kind).toBe('git');
    expect(inspection.repos).toEqual([]);
  });

  it('calls a folder of repositories nested, and lists them', async () => {
    const folder = scratch('code');
    repositoryAt(join(folder, 'storefront'));
    repositoryAt(join(folder, 'api'));
    writeFileSync(join(folder, 'README.md'), 'my projects\n');

    const inspection = await inspectWorkspace(folder);
    expect(inspection.kind).toBe('nested');
    expect(inspection.repos.map((repo) => repo.path)).toEqual(['api', 'storefront']);
    expect(inspection.looseFiles).toBe(true);
  });

  it('finds a repository one level deeper, because ~/code/acme/thing is a real shape', async () => {
    const folder = scratch('code');
    repositoryAt(join(folder, 'acme', 'storefront'));

    const inspection = await inspectWorkspace(folder);
    expect(inspection.repos.map((repo) => repo.path)).toEqual(['acme/storefront']);
  });

  it('reports a repository with no commits rather than hiding it', async () => {
    const folder = scratch('code');
    repositoryAt(join(folder, 'fresh'), { commit: false });

    const inspection = await inspectWorkspace(folder);
    expect(inspection.repos).toEqual([
      expect.objectContaining({ path: 'fresh', hasCommits: false }),
    ]);
  });
});

describe('a plain folder: a copy per agent', () => {
  const provider = (): CopiedDirectoryWorkspaces =>
    new CopiedDirectoryWorkspaces(scratch('copies'));

  it('gives the agent its own copy, and does not touch the original', async () => {
    const folder = scratch('notes');
    writeFileSync(join(folder, 'plan.md'), 'original\n');
    const workspaces = provider();

    const workspace = await workspaces.provision(request(folder));
    expect(readFileSync(join(workspace.path, 'plan.md'), 'utf8')).toBe('original\n');

    writeFileSync(join(workspace.path, 'plan.md'), 'the agent edited this\n');
    expect(readFileSync(join(folder, 'plan.md'), 'utf8')).toBe('original\n');
  });

  it('has no branch, because there is nothing to name', async () => {
    const folder = scratch('notes');
    const workspace = await provider().provision(request(folder));
    expect(workspace.branch).toBeUndefined();
  });

  it('reuses an existing copy rather than overwriting the agent’s work', async () => {
    const folder = scratch('notes');
    writeFileSync(join(folder, 'plan.md'), 'original\n');
    const workspaces = provider();

    const first = await workspaces.provision(request(folder));
    writeFileSync(join(first.path, 'plan.md'), 'work in progress\n');
    const second = await workspaces.provision(request(folder));

    expect(second.path).toBe(first.path);
    expect(readFileSync(join(second.path, 'plan.md'), 'utf8')).toBe('work in progress\n');
  });

  it('tells a first run from a destroyed workspace, which is what the marker is for', async () => {
    const folder = scratch('notes');
    const workspaces = provider();

    expect(await workspaces.reconcile(request(folder))).toEqual({ state: 'absent' });

    const workspace = await workspaces.provision(request(folder));
    expect(await workspaces.reconcile(request(folder))).toMatchObject({ state: 'ok' });

    await rm(workspace.path, { recursive: true, force: true });
    const outcome = await workspaces.reconcile(request(folder));
    // Never `repaired`: the copy *is* the work, so there is no second place holding it.
    expect(outcome.state).toBe('lost');
    expect(outcome).toMatchObject({ detail: expect.stringContaining('not recoverable') });
  });

  it('keeps the copy when the agent is deleted, and says where it is', async () => {
    const folder = scratch('notes');
    const workspaces = provider();
    const workspace = await workspaces.provision(request(folder));

    const outcome = await workspaces.remove(request(folder));
    expect(outcome.work).toBe('kept');
    expect(outcome).toMatchObject({ detail: expect.stringContaining(workspace.path) });
    expect(existsSync(workspace.path)).toBe(true);
  });
});

describe('a folder of repositories: the mirrored tree', () => {
  const provider = (): NestedRepoWorkspaces =>
    new NestedRepoWorkspaces(scratch('trees'), new GitWorktreeWorkspaces(scratch('unused')));

  function codeFolder(): string {
    const folder = scratch('code');
    repositoryAt(join(folder, 'storefront'));
    repositoryAt(join(folder, 'api'));
    writeFileSync(join(folder, 'README.md'), 'my projects\n');
    return folder;
  }

  it('worktrees each chosen repository at its own relative path', async () => {
    const folder = codeFolder();
    const workspace = await provider().provision(
      request(folder, { repos: ['storefront', 'api'] }),
    );

    for (const repo of ['storefront', 'api']) {
      expect(existsSync(join(workspace.path, repo, 'README.md'))).toBe(true);
      expect(git(join(workspace.path, repo), 'branch', '--show-current').trim()).toBe(
        'blobot/checkout/alice',
      );
    }
  });

  it('copies files that belong to no repository', async () => {
    const folder = codeFolder();
    const workspace = await provider().provision(request(folder, { repos: ['storefront'] }));
    expect(readFileSync(join(workspace.path, 'README.md'), 'utf8')).toBe('my projects\n');
  });

  it('leaves out a repository the user did not choose', async () => {
    const folder = codeFolder();
    const workspace = await provider().provision(request(folder, { repos: ['storefront'] }));

    // Absent, not present-and-ignored: an agent that can see a project can edit it.
    expect(existsSync(join(workspace.path, 'api'))).toBe(false);
    expect(git(join(folder, 'api'), 'branch', '--list', 'blobot/checkout/alice').trim()).toBe('');
  });

  it('skips a repository with no commits instead of refusing the whole team', async () => {
    const folder = codeFolder();
    repositoryAt(join(folder, 'fresh'), { commit: false });

    const workspace = await provider().provision(
      request(folder, { repos: ['storefront', 'fresh'] }),
    );
    expect(existsSync(join(workspace.path, 'storefront'))).toBe(true);
    expect(existsSync(join(workspace.path, 'fresh', 'README.md'))).toBe(false);
  });

  it('refuses only when nothing at all could be provisioned', async () => {
    const folder = scratch('code');
    repositoryAt(join(folder, 'fresh'), { commit: false });

    await expect(
      provider().provision(request(folder, { repos: ['fresh'] })),
    ).rejects.toMatchObject({ code: 'empty_workspace' });
  });

  it('repairs a missing tree from the branches, and says the loose files were re-copied', async () => {
    const folder = codeFolder();
    const workspaces = provider();
    const workspace = await workspaces.provision(request(folder, { repos: ['storefront'] }));
    git(join(workspace.path, 'storefront'), 'commit', '--allow-empty', '-m', 'agent work');
    await rm(workspace.path, { recursive: true, force: true });

    const outcome = await workspaces.reconcile(request(folder, { repos: ['storefront'] }));
    expect(outcome.state).toBe('repaired');
    expect(outcome).toMatchObject({ detail: expect.stringContaining('loose files') });
    // The commit survived, because the branch held it.
    expect(git(join(workspace.path, 'storefront'), 'log', '--oneline')).toContain('agent work');
  });

  it('reports loss when one repository of many has lost its branch', async () => {
    const folder = codeFolder();
    const workspaces = provider();
    const workspace = await workspaces.provision(request(folder, { repos: ['storefront', 'api'] }));
    await rm(join(workspace.path, 'api'), { recursive: true, force: true });
    git(join(folder, 'api'), 'worktree', 'prune');
    git(join(folder, 'api'), 'update-ref', '-d', 'refs/heads/blobot/checkout/alice');

    // Eight repositories fine and the ninth gone is still lost work; reporting `ok` because
    // most of it survived is the failure ticket 10 exists to avoid.
    expect(await workspaces.reconcile(request(folder, { repos: ['storefront', 'api'] }))).toMatchObject(
      { state: 'lost' },
    );
  });

  it('refuses to git init a folder that already contains repositories', async () => {
    const folder = codeFolder();
    await expect(provider().initialize(folder)).rejects.toBeInstanceOf(WorkspaceError);
    expect(existsSync(join(folder, '.git'))).toBe(false);
  });

  it('applies the -d versus -D rule per repository when an agent is deleted', async () => {
    const folder = codeFolder();
    const workspaces = provider();
    const workspace = await workspaces.provision(request(folder, { repos: ['storefront', 'api'] }));
    git(join(workspace.path, 'api'), 'commit', '--allow-empty', '-m', 'work worth keeping');

    const outcome = await workspaces.remove(request(folder, { repos: ['storefront', 'api'] }));
    expect(outcome.work).toBe('kept');
    expect(outcome).toMatchObject({ detail: expect.stringContaining('api') });
    expect(git(join(folder, 'storefront'), 'branch', '--list', 'blobot/checkout/alice').trim()).toBe('');
    expect(git(join(folder, 'api'), 'branch', '--list', 'blobot/checkout/alice').trim()).toContain(
      'blobot/checkout/alice',
    );
  });
});
