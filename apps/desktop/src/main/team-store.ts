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
   * Whose agent is the team's lead: the one the team pane addresses when the user names
   * nobody. A profile id, because that is what this screen is holding; it is resolved to the
   * membership instantiated from it. Leaving it out means the first agent on the roster, which
   * is what the flow shows marked before the team is created.
   */
  readonly leadProfileId?: string;
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

/** What an edit changed, and which teams it did or did not reach. Rendered, never inferred. */
export interface AgentEdit {
  readonly profileId: string;
  /** The teams whose copy of the definition was restated. They pick it up on their next start. */
  readonly restated: readonly string[];
  /** The teams that keep the old name, because the branch is under it. Empty on no rename. */
  readonly keepingName: readonly string[];
  /** The old name, when it changed. The sentence about those teams needs it. */
  readonly formerName?: string;
  /** True when the runtime changed, which only the next team it joins gets. */
  readonly runtimeChanged: boolean;
}

/**
 * Edit an agent's definition.
 *
 * The whole definition is restated rather than patched, and it lands in two places for two
 * different reasons. **The profile takes all of it**: it is the current definition of this
 * agent, and the next team formed out of it gets exactly what is on screen.
 *
 * **A team the agent is already on takes the half it is not built out of** — the role, the
 * standing instructions and the face — which reaches the running agent when its team next
 * starts, because that is when the persona is composed. The other half stays as it was:
 *
 * - **The name**, because the AgentWorkspace is `blobot/<team>/<agent>` and the branch is under
 *   the name the agent joined with. Renaming the row would leave the worktree unfindable by the
 *   only thing that knows how to find it, which is the same wall team rename is behind.
 * - **The runtime**, because a Session belongs to the provider that opened it. A membership
 *   cannot change providers without throwing away the conversation, and quietly throwing away
 *   the conversation is not what "change the runtime" means.
 *
 * See `docs/adr/0002-editing-an-agents-definition.md`. Nothing here restarts a team: the change
 * is the definition, and a running team is mid-conversation under the one it started with.
 */
export function editAgentProfile(
  profileId: string,
  spec: NewAgentSpec,
  deps: CreateTeamDeps,
): AgentEdit {
  const profile = deps.store.profileById(profileId);
  if (profile === undefined) {
    throw new TeamCreationError('unknown_agent', 'That agent no longer exists.');
  }
  const name = spec.name.trim();
  if (name === '') throw new TeamCreationError('no_agents', 'An agent needs a name.');
  const clash = deps.store.profileByName(name);
  if (clash !== undefined && clash.id !== profileId) {
    throw new TeamCreationError('agent_name_taken', `You already have an agent called ${name}.`);
  }

  const role = spec.role.trim() === '' ? 'generalist' : spec.role.trim();
  const instructions = spec.instructions?.trim();
  deps.store.updateProfile(profileId, {
    name,
    role,
    runtimeId: spec.runtimeId,
    ...(spec.executablePath === undefined ? {} : { executablePath: spec.executablePath }),
    ...(profile.model === undefined ? {} : { model: profile.model }),
    ...(instructions === undefined || instructions === '' ? {} : { instructions }),
    ...(spec.hue === undefined ? {} : { hue: spec.hue }),
  });

  const memberships = deps.store.membershipsOf(profileId);
  const teamNames = new Map(deps.store.listTeams().map((team) => [team.id, team.name]));
  const on = memberships
    .map((member) => teamNames.get(member.teamId))
    .filter((teamName): teamName is string => teamName !== undefined);
  for (const member of memberships) {
    deps.store.restateAgent(member.id, {
      role,
      ...(instructions === undefined || instructions === '' ? {} : { instructions }),
      ...(spec.hue === undefined ? {} : { hue: spec.hue }),
    });
  }

  return {
    profileId,
    restated: on,
    keepingName: name === profile.name ? [] : on,
    ...(name === profile.name ? {} : { formerName: profile.name }),
    runtimeChanged: spec.runtimeId !== profile.runtimeId,
  };
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
  const lead = spec.leadProfileId ?? profiles[0]?.id;
  const team: Team = {
    id: `team_${uuidv7(now)}`,
    name,
    workspacePath: spec.workspacePath,
    workspaceKind: inspection.kind,
    ...(repoPaths.length === 0 ? {} : { workspaceRepos: repoPaths }),
    turnBudget: spec.turnBudget,
  };
  deps.store.createTeam({ ...team, createdAt: now });

  let leadAgentId: string | undefined;
  for (const profile of profiles) {
    const id = `${refSlug(profile.name)}_${randomBytes(3).toString('hex')}`;
    if (profile.id === lead) leadAgentId = id;
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

  // After the agents, because the lead is an agent id and the agent rows are what this loop
  // just made. A team is created with one rather than without: the flow shows which agent is
  // marked, so nobody is silently made the default recipient of everything typed at the team.
  deps.store.setTeamLead(team.id, leadAgentId);
  return { ...team, ...(leadAgentId === undefined ? {} : { leadAgentId }) };
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

// ------------------------------------------------------------------ deleting and editing

/**
 * What became of one agent's work. The wording is the provider's, because only it knows what
 * it did: a merged branch is deleted, a branch with commits on it is kept and named, and a
 * copy is always kept because there is nothing behind it to recover it from.
 */
export interface AgentRemoval {
  readonly agentName: string;
  readonly work: 'discarded' | 'kept' | 'unknown';
  /** Present whenever there is something the user has to know or do. */
  readonly detail?: string;
}

export interface TeamDeletion {
  readonly teamName: string;
  readonly removals: readonly AgentRemoval[];
}

/**
 * Delete a team.
 *
 * Two halves, and the order matters. The AgentWorkspaces go first, while the team still knows
 * its own name — every branch is `blobot/<team>/<agent>` and the name is what finds it. Then
 * the rows are tombstoned, which releases the name.
 *
 * **A workspace that cannot be reached is not a reason to refuse.** The ordinary reason to
 * delete a team is that the folder it points at has been moved or deleted, which is exactly the
 * case where `git worktree remove` cannot run: a team that could only be deleted while healthy
 * would be undeletable precisely when the user wants it gone. So each removal is attempted,
 * whatever it says is reported, and the rows go either way.
 */
export async function deleteTeam(teamId: string, deps: CreateTeamDeps): Promise<TeamDeletion> {
  const team = deps.store.teamById(teamId);
  if (team === undefined) throw new TeamCreationError('unknown_agent', 'That team is already gone.');
  const workspaces = deps.workspaces ?? workspaceProviderFor(team.workspaceKind);
  const records = deps.store.agentsOfTeam(team.id);

  const removals: AgentRemoval[] = [];
  for (const record of records) {
    removals.push(await removeWorkspaceOf(record, team, workspaces));
    deps.store.tombstoneAgent(record.id, deps.clock.now());
  }
  deps.store.tombstoneTeam(team.id, deps.clock.now());
  return { teamName: team.name, removals };
}

/**
 * Put agents that already exist on a team that already exists, and take others off it.
 *
 * The same instantiation as `createTeam` — a membership is an Agent row with its own workspace,
 * session, mailbox and status — so this is deliberately the same code path rather than a
 * cheaper one that skips provisioning.
 *
 * The refusals are the ones team creation already makes, for the same reasons: a team with
 * nobody on it, and two members whose names slug to one branch.
 */
export async function editTeamRoster(
  teamId: string,
  profileIds: readonly string[],
  deps: CreateTeamDeps,
  leadProfileId?: string,
): Promise<readonly AgentRemoval[]> {
  const team = deps.store.teamById(teamId);
  if (team === undefined) throw new TeamCreationError('unknown_agent', 'That team is already gone.');
  if (profileIds.length === 0) {
    throw new TeamCreationError('no_agents', 'A team needs at least one agent.');
  }

  const members = deps.store.agentsOfTeam(team.id);
  const wanted = new Set(profileIds);
  const leaving = members.filter(
    (member) => member.profileId === undefined || !wanted.has(member.profileId),
  );
  const staying = members.filter((member) => !leaving.includes(member));
  const joining = profileIds
    .filter((profileId) => !members.some((member) => member.profileId === profileId))
    .map((profileId) => {
      const profile = deps.store.profileById(profileId);
      if (profile === undefined) {
        throw new TeamCreationError('unknown_agent', 'One of the chosen agents no longer exists.');
      }
      return profile;
    });

  const slugs = [...staying.map((member) => refSlug(member.name)), ...joining.map((profile) => refSlug(profile.name))];
  if (new Set(slugs).size !== slugs.length) {
    throw new TeamCreationError('duplicate_agent', 'Two of those agents would share one branch name.');
  }

  // Provisioning first: an agent whose workspace cannot be made must not leave the team
  // half-edited, with somebody already removed for them.
  const workspaces = deps.workspaces ?? workspaceProviderFor(team.workspaceKind);
  for (const profile of joining) {
    const id = `${refSlug(profile.name)}_${randomBytes(3).toString('hex')}`;
    const workspace = await workspaces.provision({
      workspacePath: team.workspacePath,
      teamName: team.name,
      agentId: id,
      agentName: profile.name,
      ...(team.workspaceRepos === undefined ? {} : { repos: team.workspaceRepos }),
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

  // The lead, before anybody is tombstoned, because it is resolved against the roster this
  // edit produced. Three cases and only three: the user named one, the sitting lead stayed on
  // the roster, or the team has none. The last is not repaired by promoting whoever is left —
  // the default recipient is only ever somebody the user has seen chosen, so the team pane goes
  // back to asking for an `@`.
  const gone = new Set(leaving.map((member) => member.id));
  const roster = deps.store.agentsOfTeam(team.id).filter((member) => !gone.has(member.id));
  const named =
    leadProfileId === undefined
      ? undefined
      : roster.find((member) => member.profileId === leadProfileId);
  const sitting = roster.find((member) => member.id === team.leadAgentId);
  deps.store.setTeamLead(team.id, (named ?? sitting)?.id);

  const removals: AgentRemoval[] = [];
  for (const member of leaving) {
    removals.push(await removeWorkspaceOf(member, team, workspaces));
    // Tombstoned, never deleted: a peer message names two agents, and a cascade would tear a
    // hole in a transcript that has nothing to do with the agent who left.
    deps.store.tombstoneAgent(member.id, deps.clock.now());
  }
  return removals;
}

async function removeWorkspaceOf(
  record: { readonly id: string; readonly name: string },
  team: Team,
  workspaces: WorkspaceProvider,
): Promise<AgentRemoval> {
  try {
    const outcome = await workspaces.remove({
      workspacePath: team.workspacePath,
      teamName: team.name,
      agentId: record.id,
      agentName: record.name,
      ...(team.workspaceRepos === undefined ? {} : { repos: team.workspaceRepos }),
    });
    return {
      agentName: record.name,
      work: outcome.work,
      ...(outcome.work === 'kept' ? { detail: outcome.detail } : {}),
    };
  } catch (error) {
    // The folder is gone, or git will not answer for it. Saying so is the whole job: whatever
    // is left is somewhere the user can find it, and blobot is about to stop pointing at it.
    return {
      agentName: record.name,
      work: 'unknown',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
