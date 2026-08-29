/**
 * Workspaces, in the domain's words rather than git's.
 *
 * A **Workspace** is the location a Team points at. An **AgentWorkspace** is one Agent's own
 * isolated copy of it. Ticket 10 is emphatic that a git worktree is the *mechanism*, not the
 * concept — blobot is not only for code, and a folder of documents is a valid Workspace — so
 * the vocabulary here promises neither git nor Docker, and `DockerAgentWorkspace` can slot in
 * later without renaming anything.
 */

/** What we found at the path a team points at, before anything is created. */
export interface WorkspaceInspection {
  readonly path: string;
  readonly kind: 'git' | 'plain';
  /** False on a freshly `git init`'d directory: `HEAD` does not resolve, so nothing to branch. */
  readonly hasCommits: boolean;
  /**
   * Uncommitted work is **allowed** and **warned about**: it lives in no agent's workspace, so
   * agents read a version of the file the user is not looking at (the ticket 06 trap).
   */
  readonly dirty: boolean;
  /** The branch a team is created from, or undefined on a detached HEAD. */
  readonly branch?: string;
}

export interface AgentWorkspace {
  readonly agentId: string;
  readonly path: string;
  readonly branch: string;
}

export interface ProvisionRequest {
  readonly workspacePath: string;
  readonly teamName: string;
  readonly agentId: string;
  readonly agentName: string;
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

/** What became of an agent's branch when the agent was deleted. */
export type RemovalOutcome =
  | { readonly branch: 'deleted' }
  | { readonly branch: 'kept'; readonly detail: string };

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
  readonly code: 'not_git' | 'no_commits' | 'git_failed';

  constructor(code: WorkspaceError['code'], message: string) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
  }
}
