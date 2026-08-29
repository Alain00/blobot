import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { inspectWorkspace } from './inspect.js';
import {
  branchNameFor,
  refSlug,
  WorkspaceError,
  type AgentWorkspace,
  type ProvisionRequest,
  type ReconcileOutcome,
  type RemovalOutcome,
  type WorkspaceInspection,
  type WorkspaceProvider,
} from './workspace.js';

const run = promisify(execFile);

/**
 * AgentWorkspaces as git worktrees, kept **outside the user's repository**.
 *
 * `~/.local/share/blobot/worktrees/<team>/<agent>/`, never `repo/.agents/<agent>/`. Inside the
 * project it would mean editing a `.gitignore` the user owns, permanent `git status` noise for
 * the life of the project, and nested working trees confusing every tool that walks upward
 * looking for `.git`. Outside, the user's repo is untouched — the only honest position for a
 * tool about to let four agents loose in it.
 *
 * The git CLI rather than a library: it is the one git implementation guaranteed to agree with
 * what the user sees in their own terminal, and `git worktree` is three commands.
 */
export class GitWorktreeWorkspaces implements WorkspaceProvider {
  readonly #root: string;

  constructor(root = defaultWorktreeRoot()) {
    this.#root = root;
  }

  get root(): string {
    return this.#root;
  }

  /** Delegated, so the three providers can never disagree about what a folder is. */
  async inspect(workspacePath: string): Promise<WorkspaceInspection> {
    return inspectWorkspace(workspacePath);
  }

  async initialize(workspacePath: string): Promise<void> {
    await this.#git(workspacePath, ['init']);
  }

  /**
   * Create the agent's branch from `HEAD` and check it out into its own directory.
   *
   * `HEAD`, not `main`: a team is created while sitting on the branch you care about, and
   * branching from `main` would silently discard that.
   */
  async provision(request: ProvisionRequest): Promise<AgentWorkspace> {
    await this.#requireUsableWorkspace(request.workspacePath);
    const workspace = this.workspaceFor(request);
    const branch = branchNameFor(request.teamName, request.agentName);
    if (existsSync(workspace.path)) {
      // Reuse rather than refuse: recreating an agent of the same name in the same team is an
      // ordinary thing to do, and its branch is where its work already is.
      return workspace;
    }

    await this.addWorktree(request.workspacePath, workspace.path, branch);
    return workspace;
  }

  /**
   * Ticket 10's launch reconcile: repair the lossless case, report the lossy one.
   *
   * The asymmetry is the point. A missing directory has one right answer, so asking would be
   * pestering. A missing branch means the work is already gone, and quietly creating a fresh
   * empty one would hide it — Alice returning healthy with three commits missing is the worst
   * outcome this ticket can produce.
   */
  async reconcile(request: ProvisionRequest): Promise<ReconcileOutcome> {
    const workspace = this.workspaceFor(request);
    const branch = branchNameFor(request.teamName, request.agentName);
    const outcome = await this.reconcileWorktree(request.workspacePath, workspace.path, branch);
    switch (outcome.state) {
      case 'absent':
        return { state: 'absent' };
      case 'ok':
        return { state: 'ok', workspace };
      case 'repaired':
        return { state: 'repaired', workspace, detail: outcome.detail };
      case 'lost':
        return { state: 'lost', detail: outcome.detail };
    }
  }

  /**
   * Remove the AgentWorkspace, then keep the branch only if it has unmerged commits.
   *
   * This is git's own `-d` versus `-D` distinction, which is also the least surprising: an
   * agent that did nothing leaves nothing behind, and an agent that produced commits leaves
   * them on a findable branch.
   */
  async remove(request: ProvisionRequest): Promise<RemovalOutcome> {
    const workspace = this.workspaceFor(request);
    const branch = branchNameFor(request.teamName, request.agentName);
    return this.removeWorktree(request.workspacePath, workspace.path, branch);
  }

  /** Where an agent's workspace and branch live. Pure: no git, no filesystem. */
  workspaceFor(request: ProvisionRequest): AgentWorkspace {
    return {
      agentId: request.agentId,
      path: join(this.#root, refSlug(request.teamName), refSlug(request.agentName)),
      branch: branchNameFor(request.teamName, request.agentName),
    };
  }

  // ------------------------------------------------- worktrees, by explicit path

  /**
   * The three worktree operations, addressed by path rather than by agent.
   *
   * They are public because the `nested` provider does exactly this per repository inside a
   * mirrored tree, and the alternative — a second copy of `worktree add`, `prune` and the
   * `-d`-versus-`-D` rule — is how two providers start disagreeing about what git does.
   */
  async addWorktree(repoPath: string, targetPath: string, branch: string): Promise<void> {
    await this.#requireUsableWorkspace(repoPath);
    await mkdir(dirname(targetPath), { recursive: true });
    const exists = await this.#branchExists(repoPath, branch);
    await this.#git(repoPath, [
      'worktree',
      'add',
      ...(exists ? [targetPath, branch] : ['-b', branch, targetPath]),
    ]);
  }

  /**
   * Ticket 10's launch reconcile: repair the lossless case, report the lossy one.
   *
   * The asymmetry is the point. A missing directory has one right answer, so asking would be
   * pestering. A missing branch means the work is already gone, and quietly creating a fresh
   * empty one would hide it — Alice returning healthy with three commits missing is the worst
   * outcome this ticket can produce.
   */
  async reconcileWorktree(
    repoPath: string,
    targetPath: string,
    branch: string,
  ): Promise<
    | { state: 'ok' }
    | { state: 'absent' }
    | { state: 'repaired'; detail: string }
    | { state: 'lost'; detail: string }
  > {
    const branchExists = await this.#branchExists(repoPath, branch);
    if (!branchExists && !existsSync(targetPath)) return { state: 'absent' };
    if (!branchExists) {
      return {
        state: 'lost',
        detail: `the branch ${branch} no longer exists; any work on it is not recoverable by blobot`,
      };
    }
    if (existsSync(targetPath)) return { state: 'ok' };

    // `git worktree add` refuses a branch git still believes is checked out somewhere.
    await this.#git(repoPath, ['worktree', 'prune']);
    await mkdir(dirname(targetPath), { recursive: true });
    await this.#git(repoPath, ['worktree', 'add', targetPath, branch]);
    return { state: 'repaired', detail: `recreated ${targetPath} from ${branch}` };
  }

  /**
   * Remove the worktree, then keep the branch only if it has unmerged commits.
   *
   * This is git's own `git branch -d` versus `-D` distinction, which is also the least
   * surprising: an agent that did nothing leaves nothing behind, and an agent that produced
   * commits leaves them on a findable branch.
   */
  async removeWorktree(
    repoPath: string,
    targetPath: string,
    branch: string,
  ): Promise<RemovalOutcome> {
    if (existsSync(targetPath)) {
      await this.#git(repoPath, ['worktree', 'remove', '--force', targetPath]);
    }
    await this.#git(repoPath, ['worktree', 'prune']);
    await rm(targetPath, { recursive: true, force: true });

    const deleted = await this.#succeeds(repoPath, ['branch', '-d', branch]);
    if (deleted) return { work: 'discarded' };
    return {
      work: 'kept',
      detail: `${branch} has unmerged commits and was kept; delete it with 'git branch -D ${branch}'`,
    };
  }

  // ------------------------------------------------------------------ git

  /** Refuse narrowly: not a repo, or a repo with nothing to branch from. Everything else runs. */
  async #requireUsableWorkspace(workspacePath: string): Promise<void> {
    const inspection = await this.inspect(workspacePath);
    if (inspection.kind !== 'git') {
      throw new WorkspaceError(
        'not_git',
        `${workspacePath} is not a git repository. blobot needs version history to isolate agents.`,
      );
    }
    if (!inspection.hasCommits) {
      throw new WorkspaceError(
        'no_commits',
        `${workspacePath} has no commits yet, so there is nothing for an agent's branch to start from. Make one commit first.`,
      );
    }
  }

  async #isGitRepository(workspacePath: string): Promise<boolean> {
    if (!existsSync(workspacePath)) return false;
    const inside = await this.#git(workspacePath, ['rev-parse', '--is-inside-work-tree']).catch(
      () => '',
    );
    return inside.trim() === 'true';
  }

  async #branchExists(workspacePath: string, branch: string): Promise<boolean> {
    return this.#succeeds(workspacePath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  }

  async #succeeds(workspacePath: string, args: string[]): Promise<boolean> {
    try {
      await this.#git(workspacePath, args);
      return true;
    } catch {
      return false;
    }
  }

  async #git(workspacePath: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await run('git', ['-C', workspacePath, ...args], {
        maxBuffer: 8 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? '';
      throw new WorkspaceError(
        'git_failed',
        `git ${args.join(' ')} failed in ${workspacePath}: ${stderr.trim() || String(error)}`,
      );
    }
  }
}

/** `XDG_DATA_HOME` when set, `~/.local/share` otherwise. Outside the user's repository. */
export function defaultWorktreeRoot(): string {
  const xdg = process.env['XDG_DATA_HOME'];
  const base = xdg !== undefined && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'blobot', 'worktrees');
}
