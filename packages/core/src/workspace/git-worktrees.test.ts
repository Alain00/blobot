import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitWorktreeWorkspaces } from './git-worktrees.js';
import { branchNameFor, refSlug, WorkspaceError, type ProvisionRequest } from './workspace.js';

/**
 * Against real repositories in temp directories, because every claim this file makes is a
 * claim about what `git` does — and a mocked `git` would only prove we agree with ourselves.
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
  // stderr piped, not inherited: git narrates branch switches and it is not this suite's news.
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** A repo with one commit, which is the minimum ticket 10 will work with. */
function repository(options: { commit?: boolean } = {}): string {
  const path = scratch('repo');
  git(path, 'init', '--initial-branch=main');
  git(path, 'config', 'user.email', 'test@blobot.local');
  git(path, 'config', 'user.name', 'blobot test');
  if (options.commit !== false) {
    writeFileSync(join(path, 'README.md'), '# storefront\n');
    git(path, 'add', '.');
    git(path, 'commit', '-m', 'first');
  }
  return path;
}

function provider(): GitWorktreeWorkspaces {
  return new GitWorktreeWorkspaces(scratch('worktrees'));
}

function request(workspacePath: string, agent = 'Alice'): ProvisionRequest {
  return {
    workspacePath,
    teamName: 'checkout',
    agentId: agent.toLowerCase(),
    agentName: agent,
  };
}

describe('inspecting a workspace', () => {
  it('reads a git repository, its branch, and whether it is dirty', async () => {
    const path = repository();
    const clean = await provider().inspect(path);
    expect(clean).toMatchObject({ kind: 'git', hasCommits: true, dirty: false, branch: 'main' });

    writeFileSync(join(path, 'README.md'), '# storefront\n\nedited but not committed\n');
    // Allowed, and warned about at team creation: this work is in no agent's workspace, so
    // agents read a version of the file the user is not looking at.
    expect((await provider().inspect(path)).dirty).toBe(true);
  });

  it('calls a plain folder plain, without touching it', async () => {
    const path = scratch('plain');
    expect(await provider().inspect(path)).toMatchObject({ kind: 'plain', hasCommits: false });
    expect(existsSync(join(path, '.git'))).toBe(false);
  });

  it('notices a repo with no commits', async () => {
    expect(await provider().inspect(repository({ commit: false }))).toMatchObject({
      kind: 'git',
      hasCommits: false,
    });
  });

  it('initializes a plain folder only when asked', async () => {
    const path = scratch('plain');
    const workspaces = provider();
    await workspaces.initialize(path);
    expect((await workspaces.inspect(path)).kind).toBe('git');
  });
});

describe('provisioning an AgentWorkspace', () => {
  it('creates a worktree outside the repository, on blobot/<team>/<agent>', async () => {
    const repo = repository();
    const workspaces = provider();

    const workspace = await workspaces.provision(request(repo));

    expect(workspace.branch).toBe('blobot/checkout/alice');
    expect(workspace.path.startsWith(workspaces.root)).toBe(true);
    // The user's repository is untouched: no `.agents/`, no `.gitignore` edit, no status noise.
    expect(workspace.path.startsWith(repo)).toBe(false);
    expect(git(repo, 'status', '--porcelain').trim()).toBe('');
    expect(existsSync(join(workspace.path, 'README.md'))).toBe(true);
    expect(git(workspace.path, 'branch', '--show-current').trim()).toBe('blobot/checkout/alice');
  });

  it('branches from HEAD, not from main', async () => {
    const repo = repository();
    git(repo, 'checkout', '-b', 'spike');
    writeFileSync(join(repo, 'spike.txt'), 'the branch you care about\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'spike');

    const workspace = await provider().provision(request(repo));
    // A team is created while sitting on the branch you care about.
    expect(existsSync(join(workspace.path, 'spike.txt'))).toBe(true);
  });

  it('gives each agent its own directory and branch', async () => {
    const repo = repository();
    const workspaces = provider();
    const alice = await workspaces.provision(request(repo, 'Alice'));
    const bob = await workspaces.provision(request(repo, 'Bob'));

    expect(alice.path).not.toBe(bob.path);
    expect(bob.branch).toBe('blobot/checkout/bob');

    // Isolation is the whole point: Alice's uncommitted edit is invisible to Bob.
    writeFileSync(join(alice.path, 'README.md'), '# alice was here\n');
    expect(git(bob.path, 'status', '--porcelain').trim()).toBe('');
  });

  it('reuses an existing AgentWorkspace rather than failing', async () => {
    const repo = repository();
    const workspaces = provider();
    const first = await workspaces.provision(request(repo));
    writeFileSync(join(first.path, 'work.txt'), 'in progress\n');

    const second = await workspaces.provision(request(repo));
    expect(second.path).toBe(first.path);
    expect(existsSync(join(second.path, 'work.txt'))).toBe(true);
  });

  it('reattaches to a branch that outlived its directory', async () => {
    const repo = repository();
    const workspaces = provider();
    const first = await workspaces.provision(request(repo));
    git(first.path, 'commit', '--allow-empty', '-m', 'alice worked');
    await rm(first.path, { recursive: true, force: true });
    git(repo, 'worktree', 'prune');

    const again = await workspaces.provision(request(repo));
    expect(git(again.path, 'log', '-1', '--pretty=%s').trim()).toBe('alice worked');
  });
});

describe('refusing narrowly', () => {
  it('refuses a folder that is not a repository, and says why', async () => {
    const plain = scratch('plain');
    await expect(provider().provision(request(plain))).rejects.toMatchObject({
      code: 'not_git',
      message: expect.stringContaining('needs version history'),
    });
  });

  it('refuses a repository with no commits, because there is nothing to branch from', async () => {
    await expect(provider().provision(request(repository({ commit: false })))).rejects.toMatchObject(
      { code: 'no_commits' },
    );
  });

  it('allows a dirty tree and a detached HEAD', async () => {
    const repo = repository();
    writeFileSync(join(repo, 'README.md'), '# uncommitted\n');
    git(repo, 'checkout', '--detach');

    await expect(provider().provision(request(repo))).resolves.toMatchObject({
      branch: 'blobot/checkout/alice',
    });
  });
});

describe('reconciling at launch', () => {
  it('reports everything intact', async () => {
    const repo = repository();
    const workspaces = provider();
    await workspaces.provision(request(repo));
    expect(await workspaces.reconcile(request(repo))).toMatchObject({ state: 'ok' });
  });

  it('repairs a missing directory silently, because the branch holds the work', async () => {
    const repo = repository();
    const workspaces = provider();
    const workspace = await workspaces.provision(request(repo));
    git(workspace.path, 'commit', '--allow-empty', '-m', 'alice worked');
    await rm(workspace.path, { recursive: true, force: true });

    const outcome = await workspaces.reconcile(request(repo));
    expect(outcome.state).toBe('repaired');
    expect(existsSync(workspace.path)).toBe(true);
    expect(git(workspace.path, 'log', '-1', '--pretty=%s').trim()).toBe('alice worked');
  });

  it('calls an agent that was never provisioned absent, not lost', async () => {
    const repo = repository();
    // The distinction the reconcile table leaves implicit: a first run is not data loss.
    expect(await provider().reconcile(request(repo))).toEqual({ state: 'absent' });
  });

  it('reports a missing branch as lost instead of quietly making a new one', async () => {
    const repo = repository();
    const workspaces = provider();
    const workspace = await workspaces.provision(request(repo));
    // `git branch -D` refuses a branch that is checked out somewhere, so this is the shape the
    // loss actually takes in the wild: the ref goes while the stale directory stays.
    git(repo, 'update-ref', '-d', `refs/heads/${workspace.branch}`);

    const outcome = await workspaces.reconcile(request(repo));
    // Alice returning healthy with three commits missing is the worst outcome on this ticket.
    expect(outcome.state).toBe('lost');
    expect(outcome).toMatchObject({ detail: expect.stringContaining('blobot/checkout/alice') });
  });
});

describe('deleting an agent', () => {
  it('deletes an untouched branch: an agent that did nothing leaves nothing', async () => {
    const repo = repository();
    const workspaces = provider();
    const workspace = await workspaces.provision(request(repo));

    expect(await workspaces.remove(request(repo))).toEqual({ branch: 'deleted' });
    expect(existsSync(workspace.path)).toBe(false);
    expect(git(repo, 'branch', '--list', workspace.branch).trim()).toBe('');
  });

  it('keeps a branch with unmerged commits, and says where it is', async () => {
    const repo = repository();
    const workspaces = provider();
    const workspace = await workspaces.provision(request(repo));
    git(workspace.path, 'commit', '--allow-empty', '-m', 'work worth keeping');

    const outcome = await workspaces.remove(request(repo));
    expect(outcome.branch).toBe('kept');
    expect(existsSync(workspace.path)).toBe(false);
    expect(git(repo, 'branch', '--list', workspace.branch).trim()).toContain('blobot/checkout/alice');
  });
});

describe('names that are not git refs', () => {
  it('slugs a team or agent name into something git will accept', () => {
    expect(branchNameFor('My Storefront!', 'Alice B.')).toBe('blobot/my-storefront/alice-b');
    expect(refSlug('...')).toBe('unnamed');
    expect(refSlug('feature/thing')).toBe('feature-thing');
  });

  it('provisions a team whose name came from a directory basename', async () => {
    const repo = repository();
    const workspace = await provider().provision({
      workspacePath: repo,
      teamName: 'My Storefront!',
      agentId: 'alice',
      agentName: 'Alice',
    });
    expect(workspace.branch).toBe('blobot/my-storefront/alice');
  });
});

describe('the error type', () => {
  it('carries a code the UI can branch on', () => {
    expect(new WorkspaceError('not_git', 'x')).toMatchObject({ code: 'not_git', name: 'WorkspaceError' });
  });
});
