import { randomBytes } from 'node:crypto';
import {
  GitWorktreeWorkspaces,
  SqliteStore,
  WorkspaceError,
  refSlug,
  uuidv7,
  type AgentProfileRecord,
  type Clock,
  type Team,
  type WorkspaceInspection,
  type WorkspaceProvider,
} from '@blobot/core';

/** Hiring an agent. It exists after this, on no team. */
export interface NewAgentSpec {
  readonly name: string;
  readonly role: string;
  /** Chosen from detection. The renderer carries this back and never reads it. */
  readonly runtimeId: string;
  readonly instructions?: string;
  readonly executablePath?: string;
}

/** Forming a team out of agents that already exist. */
export interface NewTeamSpec {
  readonly name: string;
  readonly workspacePath: string;
  readonly turnBudget: number;
  readonly profileIds: readonly string[];
}

export interface CreateTeamDeps {
  readonly store: SqliteStore;
  readonly clock: Clock;
  readonly workspaces?: WorkspaceProvider;
}

/** Refusals the flows are expected to render, rather than crash on. */
export class TeamCreationError extends Error {
  readonly code:
    | 'not_git'
    | 'no_commits'
    | 'name_taken'
    | 'no_agents'
    | 'duplicate_agent'
    | 'unknown_agent'
    | 'agent_name_taken';

  constructor(code: TeamCreationError['code'], message: string) {
    super(message);
    this.name = 'TeamCreationError';
    this.code = code;
  }
}

/**
 * Hire an agent: an AgentProfile, belonging to no team.
 *
 * Detection never appears here either. The user is always allowed to hire an agent on a
 * runtime we reported as "needs sign-in", because a negative probe now is not proof they will
 * not have signed in by the first turn.
 */
export function hireAgent(spec: NewAgentSpec, deps: CreateTeamDeps): AgentProfileRecord {
  const name = spec.name.trim();
  if (name === '') throw new TeamCreationError('no_agents', 'An agent needs a name.');
  if (deps.store.profileByName(name) !== undefined) {
    // Unique across the app rather than per team: two agents called Alice on two teams are
    // two identities the user cannot tell apart in a rail, a mention or a transcript.
    throw new TeamCreationError('agent_name_taken', `You already have an agent called ${name}.`);
  }
  const now = deps.clock.now();
  return deps.store.createProfile({
    id: `agent_${uuidv7(now)}`,
    name,
    role: spec.role.trim() === '' ? 'generalist' : spec.role.trim(),
    runtimeId: spec.runtimeId,
    ...(spec.instructions === undefined || spec.instructions.trim() === ''
      ? {}
      : { instructions: spec.instructions.trim() }),
    ...(spec.executablePath === undefined ? {} : { executablePath: spec.executablePath }),
    createdAt: now,
  });
}

/**
 * Form a team out of agents that already exist, and give each of them its own copy of the
 * repository.
 *
 * The Agent rows are **instantiated from** the profiles rather than pointing at them: an agent
 * on two teams has two workspaces, two sessions, two mailboxes and two statuses, because all
 * four of those are things a Team gives an Agent. Name and role are copied at this moment so
 * that renaming an agent later does not rewrite what a transcript says it was called.
 *
 * Two refusals and one warning, all of them ticket 10's: a Workspace that is not a git
 * repository (the flow offers `git init` — never silent, because creating a `.git` in
 * someone's directory is a visible change), a repository with no commits (`HEAD` does not
 * resolve, so there is nothing to branch from), and uncommitted work, which is **allowed and
 * warned about** because it lives in no agent's workspace.
 */
export async function createTeam(spec: NewTeamSpec, deps: CreateTeamDeps): Promise<Team> {
  const workspaces = deps.workspaces ?? new GitWorktreeWorkspaces();
  const name = spec.name.trim();

  if (spec.profileIds.length === 0) {
    throw new TeamCreationError('no_agents', 'A team needs at least one agent.');
  }
  const profiles = spec.profileIds.map((profileId) => {
    const profile = deps.store.profileById(profileId);
    if (profile === undefined) {
      throw new TeamCreationError('unknown_agent', 'One of the chosen agents no longer exists.');
    }
    return profile;
  });
  const slugs = profiles.map((profile) => refSlug(profile.name));
  if (new Set(slugs).size !== slugs.length) {
    // The branch is `blobot/<team>/<agent>` with no id suffix, so two agents whose names slug
    // the same are one worktree wearing two hats.
    throw new TeamCreationError('duplicate_agent', 'Two of those agents would share one branch name.');
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

  for (const profile of profiles) {
    const id = `${refSlug(profile.name)}_${randomBytes(3).toString('hex')}`;
    const workspace = await workspaces.provision({
      workspacePath: spec.workspacePath,
      teamName: team.name,
      agentId: id,
      agentName: profile.name,
    });
    deps.store.createAgent({
      id,
      teamId: team.id,
      profileId: profile.id,
      name: profile.name,
      role: profile.role,
      runtimeId: profile.runtimeId,
      ...(profile.instructions === undefined ? {} : { instructions: profile.instructions }),
      ...(profile.executablePath === undefined ? {} : { executablePath: profile.executablePath }),
      ...(profile.model === undefined ? {} : { model: profile.model }),
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
