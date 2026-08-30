import { randomBytes } from 'node:crypto';
import {
  inspectWorkspace as inspectPath,
  SqliteStore,
  workspaceProviderFor,
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
  /** The blobatar hue the user picked, 0 to 359. Absent means the name derives it. */
  readonly hue?: number;
}

/** Forming a team out of agents that already exist. */
export interface NewTeamSpec {
  readonly name: string;
  readonly workspacePath: string;
  readonly turnBudget: number;
  readonly profileIds: readonly string[];
  /**
   * Which repositories inside the Workspace are in scope, relative to it. Only a `nested`
   * Workspace has any; leaving it out means every repository found, which is what the picker
   * offers by default.
   */
  readonly repoPaths?: readonly string[];
}

export interface CreateTeamDeps {
  readonly store: SqliteStore;
  readonly clock: Clock;
  /**
   * Overrides the provider the inspection would have chosen. Injected by tests; in the app the
   * kind of Workspace decides it, which is the point of `workspaceProviderFor`.
   */
  readonly workspaces?: WorkspaceProvider;
  /**
   * Injected separately from the provider because inspection is what *chooses* the provider —
   * asking one of the three what a folder is would mean having already picked one.
   */
  readonly inspect?: (path: string) => Promise<WorkspaceInspection>;
}

/** Refusals the flows are expected to render, rather than crash on. */
export class TeamCreationError extends Error {
  readonly code:
    | 'not_git'
    | 'no_commits'
    | 'empty_workspace'
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
    ...(spec.hue === undefined ? {} : { hue: spec.hue }),
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
 * The Workspace decides the mechanism rather than gating the team. A repository gets
 * worktrees, a folder of repositories gets the mirrored tree of the ones the user put in
 * scope, and a plain folder gets a copy per agent — the amendment to ticket 10, which removed
 * "this is not a git repository" from the list of refusals entirely.
 *
 * What is still refused: a repository with no commits (`HEAD` does not resolve, so there is
 * nothing to branch from), and a folder of repositories with nothing at all in scope. What is
 * still only warned about: uncommitted work, which lives in no agent's workspace and is
 * therefore a version of the file the agents will not see.
 */
export async function createTeam(spec: NewTeamSpec, deps: CreateTeamDeps): Promise<Team> {
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

  // Which kind of Workspace this is decides the provider, and "not a git repository" is no
  // longer a refusal: the amendment to ticket 10 gives a plain folder copies and a folder of
  // repositories a mirrored tree.
  const inspection = await (deps.inspect ?? inspectPath)(spec.workspacePath);
  const workspaces = deps.workspaces ?? workspaceProviderFor(inspection.kind);

  if (inspection.kind === 'git' && !inspection.hasCommits) {
    throw new TeamCreationError(
      'no_commits',
      `${spec.workspacePath} has no commits yet, so there is nothing to branch from.`,
    );
  }
  const repoPaths =
    inspection.kind === 'nested'
      ? (spec.repoPaths ?? inspection.repos.map((repo) => repo.path))
      : [];
  if (inspection.kind === 'nested' && repoPaths.length === 0 && !inspection.looseFiles) {
    throw new TeamCreationError(
      'empty_workspace',
      `Nothing in ${spec.workspacePath} is in scope: no repositories chosen and no other files to copy.`,
    );
  }

  const now = deps.clock.now();
  const team: Team = {
    id: `team_${uuidv7(now)}`,
    name,
    workspacePath: spec.workspacePath,
    workspaceKind: inspection.kind,
    ...(repoPaths.length === 0 ? {} : { workspaceRepos: repoPaths }),
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
      ...(repoPaths.length === 0 ? {} : { repos: repoPaths }),
    });
    deps.store.createAgent({
      id,
      teamId: team.id,
      profileId: profile.id,
      name: profile.name,
      role: profile.role,
      runtimeId: profile.runtimeId,
      ...(profile.instructions === undefined ? {} : { instructions: profile.instructions }),
      ...(profile.hue === undefined ? {} : { hue: profile.hue }),
      ...(profile.executablePath === undefined ? {} : { executablePath: profile.executablePath }),
      ...(profile.model === undefined ? {} : { model: profile.model }),
      workspacePath: workspace.path,
      ...(workspace.branch === undefined ? {} : { branch: workspace.branch }),
      createdAt: deps.clock.now(),
    });
  }

  return team;
}

/** The creation flow's first screen: what is at the path the user picked. */
export async function inspectWorkspace(path: string): Promise<WorkspaceInspection> {
  return inspectPath(path);
}

/**
 * Offered, never silent — and now a genuine choice rather than a gate, since a plain folder
 * works without it. The `nested` provider refuses outright: a repository wrapping repositories
 * is the wrong action, not an unhelpful one.
 */
export async function initializeWorkspace(path: string): Promise<WorkspaceInspection> {
  const inspection = await inspectPath(path);
  await workspaceProviderFor(inspection.kind).initialize(path);
  return inspectPath(path);
}

export { WorkspaceError };
