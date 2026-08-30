import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { copyTree } from './copied-directory.js';
import { GitWorktreeWorkspaces } from './git-worktrees.js';
import { inspectWorkspace } from './inspect.js';
import {
  branchNameFor,
  refSlug,
  requireWorkspaceExists,
  WorkspaceError,
  type AgentWorkspace,
  type ProvisionRequest,
  type ReconcileOutcome,
  type RemovalOutcome,
  type WorkspaceInspection,
  type WorkspaceProvider,
} from './workspace.js';

/**
 * A Workspace that is not a repository but *contains* repositories — `~/code` with a dozen
 * projects in it, the shape the author actually keeps.
 *
 * The AgentWorkspace mirrors the tree: every repository the user ticked becomes a worktree on
 * the same `blobot/<team>/<agent>` branch at its own relative path, and files belonging to no
 * repository are copied. So an agent sees a `~/code` of its own, with the projects in it where
 * it expects them.
 *
 * Three decisions from the amendment that this file is the proof of:
 *
 * - **A repository the user did not tick is absent**, not present-and-ignored. Out of scope
 *   should mean out of sight; an agent that can see a project can edit it.
 * - **The loose files are a copy**, so they carry the copied provider's weakness inside an
 *   otherwise git-backed workspace: recreating a missing agent directory restores the
 *   repositories from their branches and re-copies the loose files from the Workspace,
 *   discarding whatever the agent had done to them. The reconcile says so rather than
 *   pretending the repair was total.
 * - **A repository with no commits is skipped with a reason**, never a refusal for the whole
 *   team. One empty project in a folder of twenty must not stop anybody working.
 */
export class NestedRepoWorkspaces implements WorkspaceProvider {
  readonly #root: string;
  readonly #git: GitWorktreeWorkspaces;

  constructor(root = defaultTreeRoot(), git = new GitWorktreeWorkspaces()) {
    this.#root = root;
    this.#git = git;
  }

  get root(): string {
    return this.#root;
  }

  async inspect(workspacePath: string): Promise<WorkspaceInspection> {
    return inspectWorkspace(workspacePath);
  }

  /**
   * Deliberately refused. `git init` on a folder that contains repositories creates a
   * repository wrapping repositories, which is the wrong action rather than an unhelpful one —
   * and it is the mistake this whole amendment exists to stop the flow from offering.
   */
  async initialize(workspacePath: string): Promise<void> {
    throw new WorkspaceError(
      'not_git',
      `${workspacePath} already contains git repositories. Initialising a repository here would wrap them in another one; blobot works with the repositories inside it instead.`,
    );
  }

  async provision(request: ProvisionRequest): Promise<AgentWorkspace> {
    requireWorkspaceExists(request.workspacePath);
    const workspace = this.workspaceFor(request);
    const branch = branchNameFor(request.teamName, request.agentName);
    const chosen = await this.#chosenRepos(request);

    if (existsSync(workspace.path)) return workspace;
    await mkdir(workspace.path, { recursive: true });

    // Loose files first: `git worktree add` wants to create its own directory, so copying over
    // the top of one it already made would be the wrong order.
    await this.#copyLooseFiles(request.workspacePath, workspace.path, chosen);

    const skipped: string[] = [];
    for (const repo of chosen) {
      const source = join(request.workspacePath, repo);
      const target = join(workspace.path, repo);
      const inspection = await inspectWorkspace(source);
      if (!inspection.hasCommits) {
        skipped.push(repo);
        continue;
      }
      await rm(target, { recursive: true, force: true });
      await this.#git.addWorktree(source, target, branch);
    }

    if (skipped.length === chosen.length && !(await hasAnyEntry(workspace.path))) {
      await rm(workspace.path, { recursive: true, force: true });
      throw new WorkspaceError(
        'empty_workspace',
        `none of the chosen repositories in ${request.workspacePath} have any commits yet, so there is nothing for an agent's branch to start from.`,
      );
    }
    return workspace;
  }

  /**
   * Every repository reconciles on its own and the worst answer wins, because an agent whose
   * eight repositories are fine and whose ninth branch is gone has lost work — reporting `ok`
   * because most of it survived is the failure ticket 10 is built to avoid.
   */
  async reconcile(request: ProvisionRequest): Promise<ReconcileOutcome> {
    const workspace = this.workspaceFor(request);
    const branch = branchNameFor(request.teamName, request.agentName);
    const chosen = await this.#chosenRepos(request);

    const details: string[] = [];
    let anyPresent = false;
    let anyRepaired = false;
    const lost: string[] = [];
    const absent: string[] = [];

    for (const repo of chosen) {
      const source = join(request.workspacePath, repo);
      const target = join(workspace.path, repo);
      if (!existsSync(source)) {
        lost.push(`${repo} is no longer in ${request.workspacePath}`);
        continue;
      }
      const outcome = await this.#git.reconcileWorktree(source, target, branch);
      switch (outcome.state) {
        case 'ok':
          anyPresent = true;
          break;
        case 'absent':
          absent.push(repo);
          break;
        case 'repaired':
          anyPresent = true;
          anyRepaired = true;
          details.push(outcome.detail);
          break;
        case 'lost':
          lost.push(`${repo}: ${outcome.detail}`);
          break;
      }
    }

    // A repository with neither branch nor directory is `absent` on its own — a first run.
    // Among siblings that *are* provisioned it cannot be: the tree was built, so that
    // repository's branch and worktree were built with it and both are now gone. Reading it as
    // "new" here is precisely the confusion the `absent` state was introduced to prevent.
    const provisioned = anyPresent || lost.length > 0 || existsSync(workspace.path);
    if (provisioned && absent.length > 0) {
      lost.push(
        `${absent.join(', ')}: neither the branch blobot/... nor the directory is there, and the rest of this workspace is; any work in ${absent.length === 1 ? 'it' : 'them'} is not recoverable by blobot`,
      );
    }
    if (lost.length > 0) return { state: 'lost', detail: lost.join('; ') };
    if (!provisioned) return { state: 'absent' };

    // The loose files have no branch behind them, so a directory that had to be rebuilt gets
    // them back from the Workspace — and is told that the agent's edits to them are gone.
    if (anyRepaired) {
      await this.#copyLooseFiles(request.workspacePath, workspace.path, chosen);
      details.push(
        'loose files were re-copied from the workspace; any changes the agent made to files outside a repository are gone',
      );
    }
    if (anyRepaired) return { state: 'repaired', workspace, detail: details.join('; ') };
    return { state: 'ok', workspace };
  }

  /** Each repository answers `-d` versus `-D` for itself; the tree is kept if any branch was. */
  async remove(request: ProvisionRequest): Promise<RemovalOutcome> {
    const workspace = this.workspaceFor(request);
    const branch = branchNameFor(request.teamName, request.agentName);
    const kept: string[] = [];

    for (const repo of await this.#chosenRepos(request)) {
      const source = join(request.workspacePath, repo);
      if (!existsSync(source)) continue;
      const outcome = await this.#git.removeWorktree(source, join(workspace.path, repo), branch);
      if (outcome.work === 'kept') kept.push(`${repo} (${outcome.detail})`);
    }

    if (kept.length === 0) {
      await rm(workspace.path, { recursive: true, force: true });
      return { work: 'discarded' };
    }
    return { work: 'kept', detail: kept.join('; ') };
  }

  workspaceFor(request: ProvisionRequest): AgentWorkspace {
    return {
      agentId: request.agentId,
      path: join(this.#root, refSlug(request.teamName), refSlug(request.agentName)),
      // One branch name across every repository in the tree: the same agent, the same team.
      branch: branchNameFor(request.teamName, request.agentName),
    };
  }

  /**
   * The ticked repositories, or every repository found when the caller named none — a team
   * created before the picker existed must still come back at launch.
   */
  async #chosenRepos(request: ProvisionRequest): Promise<readonly string[]> {
    if (request.repos !== undefined && request.repos.length > 0) return request.repos;
    const inspection = await inspectWorkspace(request.workspacePath);
    return inspection.repos.map((repo) => repo.path);
  }

  /** Everything that is not inside a chosen repository, copied into the mirrored tree. */
  async #copyLooseFiles(
    from: string,
    to: string,
    chosen: readonly string[],
  ): Promise<void> {
    const inspection = await inspectWorkspace(from);
    // Every repository is excluded, not only the chosen ones: an unticked repository is absent
    // from the agent's workspace, and copying it here would smuggle it back in.
    const repos = new Set(inspection.repos.map((repo) => repo.path));
    for (const repo of chosen) repos.add(repo);

    const entries = await readdir(from, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (repos.has(entry.name)) continue;
      if (entry.isDirectory() && [...repos].some((repo) => repo.startsWith(`${entry.name}/`))) {
        // A directory holding repositories deeper down: descend so the loose files beside them
        // are copied and the repositories themselves are not.
        await mkdir(join(to, entry.name), { recursive: true });
        await this.#copyLooseFilesDeeper(join(from, entry.name), join(to, entry.name), repos, entry.name);
        continue;
      }
      if (existsSync(join(to, entry.name))) continue;
      await copyTree(join(from, entry.name), join(to, entry.name));
    }
  }

  async #copyLooseFilesDeeper(
    from: string,
    to: string,
    repos: ReadonlySet<string>,
    prefix: string,
  ): Promise<void> {
    const entries = await readdir(from, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (repos.has(`${prefix}/${entry.name}`)) continue;
      if (existsSync(join(to, entry.name))) continue;
      await copyTree(join(from, entry.name), join(to, entry.name));
    }
  }
}

async function hasAnyEntry(path: string): Promise<boolean> {
  const entries = await readdir(path).catch(() => []);
  return entries.length > 0;
}

/** Beside `worktrees/` and `copies/`, outside the user's folder for the same reasons. */
export function defaultTreeRoot(): string {
  const xdg = process.env['XDG_DATA_HOME'];
  const base = xdg !== undefined && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'blobot', 'trees');
}
