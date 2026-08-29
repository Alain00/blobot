import { randomBytes } from 'node:crypto';
import {
  GitWorktreeWorkspaces,
  SqliteStore,
  WorkspaceError,
  refSlug,
  uuidv7,
  type Clock,
  type Team,
  type WorkspaceInspection,
  type WorkspaceProvider,
} from '@blobot/core';

/** What the creation flow sends back: a Workspace, a name, and a roster. */
export interface NewTeamSpec {
  readonly name: string;
  readonly workspacePath: string;
  readonly turnBudget: number;
  readonly agents: readonly {
    readonly name: string;
    readonly role: string;
    /** Chosen from detection. The renderer carries this back and never reads it. */
    readonly runtimeId: string;
    readonly executablePath?: string;
  }[];
}

export interface CreateTeamDeps {
  readonly store: SqliteStore;
  readonly clock: Clock;
  readonly workspaces?: WorkspaceProvider;
}

/** Refusals the creation flow is expected to render, rather than crash on. */
export class TeamCreationError extends Error {
  readonly code: 'not_git' | 'no_commits' | 'name_taken' | 'no_agents' | 'duplicate_agent';

  constructor(code: TeamCreationError['code'], message: string) {
    super(message);
    this.name = 'TeamCreationError';
    this.code = code;
  }
}

/**
 * Create a team: the rows, and each agent's own copy of the repository.
 *
 * Two refusals and one warning, all of them ticket 10's: a Workspace that is not a git
 * repository (the flow offers `git init` — never silent, because creating a `.git` in
 * someone's directory is a visible change), a repository with no commits (`HEAD` does not
 * resolve, so there is nothing to branch from), and uncommitted work, which is **allowed and
 * warned about** because it lives in no agent's workspace.
 *
 * Detection never appears here. The user is always allowed to try a runtime we reported as
 * "needs sign-in", because a positive probe is not proof it works and a negative is not proof
 * it will fail by the time they press the button.
 */
export async function createTeam(spec: NewTeamSpec, deps: CreateTeamDeps): Promise<Team> {
  const workspaces = deps.workspaces ?? new GitWorktreeWorkspaces();
  const name = spec.name.trim();

  if (spec.agents.length === 0) {
    throw new TeamCreationError('no_agents', 'A team needs at least one agent.');
  }
  const slugs = spec.agents.map((agent) => refSlug(agent.name));
  if (new Set(slugs).size !== slugs.length) {
    // The branch is `blobot/<team>/<agent>` with no id suffix, so two agents whose names slug
    // the same are one worktree wearing two hats.
    throw new TeamCreationError('duplicate_agent', 'Two agents would share one branch name.');
  }
  if (deps.store.teamByName(name) !== undefined) {
    throw new TeamCreationError('name_taken', `A team called ${name} already exists.`);
  }

  const inspection = await workspaces.inspect(spec.workspacePath);
  if (inspection.kind !== 'git') {
    throw new TeamCreationError('not_git', `${spec.workspacePath} is not a git repository.`);
  }
  if (!inspection.hasCommits) {
    throw new TeamCreationError(
      'no_commits',
      `${spec.workspacePath} has no commits yet, so there is nothing to branch from.`,
    );
  }

  const now = deps.clock.now();
  const team: Team = {
    id: `team_${uuidv7(now)}`,
    name,
    workspacePath: spec.workspacePath,
    workspaceKind: 'git',
    turnBudget: spec.turnBudget,
  };
  deps.store.createTeam({ ...team, createdAt: now });

  for (const member of spec.agents) {
    const id = `${refSlug(member.name)}_${randomBytes(3).toString('hex')}`;
    const workspace = await workspaces.provision({
      workspacePath: spec.workspacePath,
      teamName: team.name,
      agentId: id,
      agentName: member.name,
    });
    deps.store.createAgent({
      id,
      teamId: team.id,
      name: member.name.trim(),
      role: member.role.trim(),
      runtimeId: member.runtimeId,
      ...(member.executablePath === undefined ? {} : { executablePath: member.executablePath }),
      workspacePath: workspace.path,
      branch: workspace.branch,
      createdAt: deps.clock.now(),
    });
  }

  return team;
}

/** The creation flow's first screen: what is at the path the user picked. */
export async function inspectWorkspace(
  path: string,
  workspaces: WorkspaceProvider = new GitWorktreeWorkspaces(),
): Promise<WorkspaceInspection> {
  return workspaces.inspect(path);
}

/** Offered, never silent. `WorkspaceError` is what a directory that cannot be a repo throws. */
export async function initializeWorkspace(
  path: string,
  workspaces: WorkspaceProvider = new GitWorktreeWorkspaces(),
): Promise<WorkspaceInspection> {
  await workspaces.initialize(path);
  return workspaces.inspect(path);
}

export { WorkspaceError };
