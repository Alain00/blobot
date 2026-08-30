import { existsSync } from 'node:fs';

/**
 * Workspaces, in the domain's words rather than git's.
 *
 * A **Workspace** is the location a Team points at. An **AgentWorkspace** is one Agent's own
 * isolated copy of it. Ticket 10 is emphatic that a git worktree is the *mechanism*, not the
 * concept — blobot is not only for code, and a folder of documents is a valid Workspace — so
 * the vocabulary here promises neither git nor Docker, and `DockerAgentWorkspace` can slot in
 * later without renaming anything.
 */

/**
 * One git repository found *inside* a Workspace that is not itself a repository.
 *
 * `path` is relative to the Workspace, because that is what the mirrored tree is built from
 * and what survives the user moving the folder.
 */
export interface NestedRepo {
  readonly path: string;
  /** A repo with no commits is skipped with a reason, never a refusal for the whole team. */
  readonly hasCommits: boolean;
  readonly dirty: boolean;
  readonly branch?: string;
}

/** What we found at the path a team points at, before anything is created. */
export interface WorkspaceInspection {
  readonly path: string;
  /**
   * `git` — a repository. `nested` — not a repository, but it contains some. `plain` — no
   * repository anywhere. The amendment to ticket 10 gives each one its own provider, and the
   * kind is stored on the team because it decides which one brings the team back at launch.
   */
  readonly kind: 'git' | 'plain' | 'nested';
  /** False on a freshly `git init`'d directory: `HEAD` does not resolve, so nothing to branch. */
  readonly hasCommits: boolean;
  /**
   * Uncommitted work is **allowed** and **warned about**: it lives in no agent's workspace, so
   * agents read a version of the file the user is not looking at (the ticket 06 trap).
   */
  readonly dirty: boolean;
  /** The branch a team is created from, or undefined on a detached HEAD. */
  readonly branch?: string;
  /** Every repository inside a `nested` Workspace, for the picker to draw. Empty otherwise. */
  readonly repos: readonly NestedRepo[];
  /** Whether anything at the top of a `nested` tree belongs to no repository. */
  readonly looseFiles: boolean;
}

export interface AgentWorkspace {
  readonly agentId: string;
  readonly path: string;
  /**
   * Absent on a copied AgentWorkspace, which has no branch to name — the copy *is* the work.
   * A `nested` workspace has one branch name shared by all its repositories, so a single
   * string still says what to look for.
   */
  readonly branch?: string;
}

export interface ProvisionRequest {
  readonly workspacePath: string;
  readonly teamName: string;
  readonly agentId: string;
  readonly agentName: string;
  /**
   * The repositories the user ticked, relative to the Workspace. `nested` only: a repository
   * left out is absent from the agent's workspace rather than present and ignored.
   */
  readonly repos?: readonly string[];
}

/** Ticket 10's reconcile table, plus the state it does not cover: never provisioned at all. */
export type ReconcileOutcome =
  /** Everything is where it was left. */
  | { readonly state: 'ok'; readonly workspace: AgentWorkspace }
  /**
   * Neither branch nor directory. A first run, not a loss — and worth its own state, because
   * a caller that cannot tell "new agent" from "the work is gone" will eventually report one
   * as the other, which is the exact failure this ticket cares most about.
   */
  | { readonly state: 'absent' }
  /** Directory gone, branch intact: the work is safe and the directory is recreated. */
  | { readonly state: 'repaired'; readonly workspace: AgentWorkspace; readonly detail: string }
  /** Branch gone. Data loss has already happened; saying so is the whole job. */
  | { readonly state: 'lost'; readonly detail: string };

/**
 * What became of an agent's work when the agent was deleted.
 *
 * Named for the work rather than for the branch, because a copied AgentWorkspace has no
 * branch and still has to answer the question.
 */
export type RemovalOutcome =
  | { readonly work: 'discarded' }
  | { readonly work: 'kept'; readonly detail: string };

/**
 * The seam a non-git AgentWorkspace would implement. Runtime implementations sit behind
 * interfaces, and this one exists so "the workspace is a Docker volume" is a new class rather
 * than a rewrite.
 */
export interface WorkspaceProvider {
  inspect(workspacePath: string): Promise<WorkspaceInspection>;
  /** Offered, never silent: creating a `.git` in someone's directory is a visible change. */
  initialize(workspacePath: string): Promise<void>;
  provision(request: ProvisionRequest): Promise<AgentWorkspace>;
  reconcile(request: ProvisionRequest): Promise<ReconcileOutcome>;
  remove(request: ProvisionRequest): Promise<RemovalOutcome>;
}

/** The team half of `blobot/<team>/<agent>`, and the directory name under the worktree root. */
export function branchNameFor(teamName: string, agentName: string): string {
  return `blobot/${refSlug(teamName)}/${refSlug(agentName)}`;
}

/**
 * A git ref name is not a free-form string: no spaces, no `..`, no leading or trailing dots or
 * dashes, and a short list of forbidden characters. Names reach us from a directory basename
 * and from whatever the user typed, so they are slugged rather than trusted.
 */
export function refSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug.length === 0 ? 'unnamed' : slug;
}

export class WorkspaceError extends Error {
  readonly code:
    | 'missing'
    | 'not_git'
    | 'no_commits'
    | 'git_failed'
    | 'empty_workspace'
    | 'copy_failed';

  constructor(code: WorkspaceError['code'], message: string) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
  }
}

/**
 * The folder a team points at is not there any more.
 *
 * Its own failure, and every provider raises it before anything else, because `inspect` calls
 * a path that does not exist `plain` — a sane answer for the folder picker, where the user is
 * about to create the thing, and a lie everywhere else. Without this check the git provider
 * greets a deleted Workspace with "is not a git repository", which sends the user off to run
 * `git init` on a directory that no longer exists.
 */
export function requireWorkspaceExists(workspacePath: string): void {
  if (existsSync(workspacePath)) return;
  throw new WorkspaceError(
    'missing',
    `blobot cannot find ${workspacePath}. The folder this team points at has been moved, renamed or deleted.`,
  );
}
