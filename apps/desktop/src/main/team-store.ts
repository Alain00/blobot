import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CompactionSetting, TrustLevel } from '@blobot/core';
import {
  commitPlan,
  commitWorktree,
  currentBranch,
  inspectWorkspace as inspectPath,
  listBranches,
  spawnCommand,
  switchBranch,
  prepareWorkspace as preparePath,
  publishBranch,
  publishPlan,
  readAgentWorkspaceStatus,
  SqliteStore,
  workspaceProviderFor,
  WorkspaceError,
  refSlug,
  uuidv7,
  type CommitOutcome,
  type SwitchOutcome,
  type AgentProfileRecord,
  type AgentWorkspaceStatus,
  type Clock,
  type PublishOutcome,
  type Team,
  type VerbosityLevel,
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
  /**
   * What the user chose among the options the runtime advertises, keyed by the provider's own
   * group id. Absent keys are the runtime's defaults, and nothing here reads either.
   */
  readonly runtimeOptions?: Readonly<Record<string, string>>;
  /**
   * How much of this agent's own work blobot vouches for. Absent is `normal`, which is what
   * every agent hired before the selector existed is.
   */
  readonly trust?: TrustLevel;
  /**
   * Whether blobot may replace this agent's session when its window fills up. Absent is `auto`,
   * which is on, and is what every agent hired before the selector existed is.
   */
  readonly compaction?: CompactionSetting;
  /**
   * How much this agent says when it answers. Absent is `normal`, which is what every agent
   * hired before the selector existed is. Read by nothing here: it reaches `composePersona`.
   */
  readonly verbosity?: VerbosityLevel;
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
  /**
   * The team's icon as a `data:` URL, when the user accepted the one found in the Workspace or
   * chose a file. Leaving it out is the ordinary case and means the team is drawn from its
   * members alone.
   */
  readonly icon?: string;
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
    ...(spec.runtimeOptions === undefined ? {} : { runtimeOptions: spec.runtimeOptions }),
    ...(spec.trust === undefined ? {} : { trust: spec.trust }),
    ...(spec.compaction === undefined ? {} : { compaction: spec.compaction }),
    ...(spec.verbosity === undefined ? {} : { verbosity: spec.verbosity }),
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
    // Restated like the role, not carried over like the name: an edit says what the agent is
    // now, and clearing the picker back to the runtime's defaults has to be sayable.
    ...(spec.runtimeOptions === undefined ? {} : { runtimeOptions: spec.runtimeOptions }),
    ...(spec.trust === undefined ? {} : { trust: spec.trust }),
    ...(spec.compaction === undefined ? {} : { compaction: spec.compaction }),
    ...(spec.verbosity === undefined ? {} : { verbosity: spec.verbosity }),
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
      ...(spec.runtimeOptions === undefined ? {} : { runtimeOptions: spec.runtimeOptions }),
      ...(spec.trust === undefined ? {} : { trust: spec.trust }),
      ...(spec.compaction === undefined ? {} : { compaction: spec.compaction }),
      ...(spec.verbosity === undefined ? {} : { verbosity: spec.verbosity }),
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
    ...(spec.icon === undefined ? {} : { icon: spec.icon }),
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
      ...(profile.runtimeOptions === undefined ? {} : { runtimeOptions: profile.runtimeOptions }),
      ...(profile.trust === undefined ? {} : { trust: profile.trust }),
      ...(profile.compaction === undefined ? {} : { compaction: profile.compaction }),
      ...(profile.verbosity === undefined ? {} : { verbosity: profile.verbosity }),
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

/**
 * Make this team a folder of its own, under `~/blobot`.
 *
 * The other door out of the flow's first step, for the user who has not got a repository in
 * mind. The root is fixed and in the home directory rather than under `userData`: this is a
 * folder the user is meant to work in, open in an editor and find again, not application state
 * they will never look at.
 */
export async function prepareWorkspace(name: string): Promise<WorkspaceInspection> {
  return preparePath(join(homedir(), 'blobot'), name);
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
  /** What the full clean actually recovered, in bytes. Absent when none was asked for. */
  readonly freedBytes?: number;
}

/**
 * What a full clean would recover, measured before it is offered.
 *
 * Per agent as well as in total, because "3.1 GB" on its own is a number the user has to trust
 * and "Alice 2.9 GB, Bob 180 MB" is one they can recognise. Measured on demand rather than
 * stored: a workspace is a directory the agent and the user are both writing to, so any figure
 * blobot kept would be a stale one.
 */
export interface TeamDiskUsage {
  readonly bytes: number;
  readonly agents: readonly { readonly agentName: string; readonly bytes: number }[];
}

/** How much disk this team's AgentWorkspaces are holding right now. */
export async function measureTeam(teamId: string, deps: CreateTeamDeps): Promise<TeamDiskUsage> {
  const team = deps.store.teamById(teamId);
  if (team === undefined) throw new TeamCreationError('unknown_agent', 'That team is already gone.');
  const workspaces = deps.workspaces ?? workspaceProviderFor(team.workspaceKind);

  const agents: { agentName: string; bytes: number }[] = [];
  for (const record of deps.store.agentsOfTeam(team.id)) {
    // Never a refusal, at any level: this number is drawn beside a button, and a team whose
    // folder has been deleted is the ordinary team to be deleting.
    const bytes = await workspaces
      .measure({
        workspacePath: team.workspacePath,
        teamName: team.name,
        agentId: record.id,
        agentName: record.name,
        ...(team.workspaceRepos === undefined ? {} : { repos: team.workspaceRepos }),
      })
      .catch(() => 0);
    agents.push({ agentName: record.name, bytes });
  }
  return { bytes: agents.reduce((total, agent) => total + agent.bytes, 0), agents };
}

/**
 * Every agent's workspace on one team, read together.
 *
 * The base each branch is measured against is the Workspace repository's *current* branch, read
 * once here rather than per agent: it is one answer about one repository and asking it N times
 * would be N subprocesses saying the same thing.
 *
 * `forge` is off by default and the caller turns it on, because it is the network. A read that
 * runs on a snapshot must not reach GitHub; the one behind the user's refresh may.
 */
export async function readTeamWorkspaces(
  teamId: string,
  deps: CreateTeamDeps,
  options: { readonly forge?: boolean } = {},
): Promise<readonly AgentWorkspaceStatus[]> {
  const team = deps.store.teamById(teamId);
  if (team === undefined) return [];
  const workspaces = deps.workspaces ?? workspaceProviderFor(team.workspaceKind);
  const base = await baseBranchOf(team, deps);

  const statuses: AgentWorkspaceStatus[] = [];
  for (const record of deps.store.agentsOfTeam(team.id)) {
    const workspace = workspaces.workspaceFor(requestFor(team, record.id, record.name));
    statuses.push(
      await readAgentWorkspaceStatus(workspace, {
        kind: team.workspaceKind,
        agentName: record.name,
        ...(base === undefined ? {} : { base }),
        ...(options.forge === true ? { forge: true } : {}),
      }).catch(() => ({
        agentId: record.id,
        agentName: record.name,
        kind: team.workspaceKind,
        present: false,
        forge: { asked: false as const, detail: 'the workspace could not be read' },
      })),
    );
  }
  return statuses;
}

/**
 * One agent's own branch, the holder of every other one, in blobot's terms rather than git's.
 *
 * A path is what git answers with and an agent is what the user is looking at, so the mapping
 * happens here: this is the layer that knows both which directory belongs to which agent and
 * which one is the user's own project folder. The renderer is handed names and never paths to
 * interpret.
 */
export interface AgentBranch {
  readonly name: string;
  readonly current: boolean;
  /** Absent when the branch is free. Present means git will refuse it, and this says who has it. */
  readonly heldBy?: {
    readonly path: string;
    /** The teammate whose worktree it is, where it is one. */
    readonly agentName?: string;
    /**
     * That teammate's own hue, carried so the menu can draw their face rather than describe
     * them. Without it `Blob` derives a colour from the name, which would put a *second* face
     * on one agent: a hue is an identity in this app, not a decoration.
     */
    readonly agentHue?: number;
    /** The Workspace itself: the repository the user opened, not any agent's copy of it. */
    readonly isWorkspace?: boolean;
  };
}

export interface AgentBranches {
  readonly current?: string;
  readonly branches: readonly AgentBranch[];
  /** Why there is nothing to choose from. A copy has no branches and never grows any. */
  readonly unavailable?: string;
}

/** Every branch this agent's worktree could be on, and who is standing on the ones it cannot. */
export async function readAgentBranches(
  teamId: string,
  agentId: string,
  deps: CreateTeamDeps,
): Promise<AgentBranches> {
  const found = branchTarget(teamId, agentId, deps);
  if ('error' in found) return { branches: [], unavailable: found.error };

  const listing = await listBranches(found.path, spawnCommand);
  return {
    ...(listing.current === undefined ? {} : { current: listing.current }),
    branches: listing.branches.map((branch) => {
      const holder = branch.heldBy === undefined ? undefined : found.holders.get(branch.heldBy);
      return {
        name: branch.name,
        current: branch.current,
        ...(branch.heldBy === undefined
          ? {}
          : { heldBy: { path: branch.heldBy, ...(holder ?? {}) } }),
      };
    }),
  };
}

/**
 * Move this agent's worktree onto a branch, at the user's own click.
 *
 * The one write among the workspace reads, and it stays the user's: no runtime is told, nothing
 * enters a session, and `git switch` is on no trust level's allowlist, so an agent cannot do
 * this for itself. It is not a restart either. The session's cwd does not move, because the
 * worktree is still the same directory; what changed is what is in it, which is the same thing
 * that happens when a person switches branch in a terminal an agent is working in.
 */
export async function switchAgentBranch(
  teamId: string,
  agentId: string,
  branch: string,
  options: { readonly create?: boolean },
  deps: CreateTeamDeps,
): Promise<SwitchOutcome> {
  const found = branchTarget(teamId, agentId, deps);
  if ('error' in found) return { ok: false, error: found.error };
  return switchBranch(found.path, branch, options, spawnCommand);
}

/** The directory to run git in, plus what every other worktree path in it means. */
function branchTarget(
  teamId: string,
  agentId: string,
  deps: CreateTeamDeps,
):
  | { path: string; holders: Map<string, { agentName?: string; agentHue?: number; isWorkspace?: boolean }> }
  | { error: string } {
  const team = deps.store.teamById(teamId);
  if (team === undefined) return { error: 'That team is already gone.' };
  const record = deps.store.agentsOfTeam(team.id).find((agent) => agent.id === agentId);
  if (record === undefined) return { error: 'That agent is not on this team.' };
  if (team.workspaceKind !== 'git') {
    // A copy has no branches and a nested tree has a set of them per repository. Neither is one
    // menu, and offering an empty one would read as a repository with no branches in it.
    return { error: 'this workspace is not a single git repository' };
  }
  const workspaces = deps.workspaces ?? workspaceProviderFor(team.workspaceKind);
  const holders = new Map<string, { agentName?: string; agentHue?: number; isWorkspace?: boolean }>();
  holders.set(team.workspacePath, { isWorkspace: true });
  for (const member of deps.store.agentsOfTeam(team.id)) {
    holders.set(workspaces.workspaceFor(requestFor(team, member.id, member.name)).path, {
      agentName: member.name,
      ...(member.hue === undefined || member.hue === null ? {} : { agentHue: member.hue }),
    });
  }
  return { path: workspaces.workspaceFor(requestFor(team, record.id, record.name)).path, holders };
}

/** The two commands a commit would run, for the confirm to show before it runs them. */
export function commitPlanFor(
  teamId: string,
  agentId: string,
  message: string,
  deps: CreateTeamDeps,
): readonly string[] {
  const found = branchTarget(teamId, agentId, deps);
  if ('error' in found) return [];
  return commitPlan({ path: found.path, message });
}

/**
 * Commit what is in this agent's workspace, at the user's click.
 *
 * The user's own git, on the user's own say-so, with the commands shown first. No runtime is
 * told, nothing enters a session, and `git commit` is on no trust level's allowlist, so an agent
 * cannot do this for itself. The message is the user's and is never generated: blobot provides
 * no inference, and asking the agent that wrote the code to name what it did is a different
 * feature with a different way of being wrong.
 */
export async function commitAgentWork(
  teamId: string,
  agentId: string,
  message: string,
  deps: CreateTeamDeps,
): Promise<CommitOutcome> {
  const found = branchTarget(teamId, agentId, deps);
  if ('error' in found) return { ok: false, error: found.error };
  return commitWorktree({ path: found.path, message }, spawnCommand);
}

/** What a pull request from this agent would merge into, and what `ahead` counts against. */
async function baseBranchOf(team: Team, deps: CreateTeamDeps): Promise<string | undefined> {
  if (team.workspaceKind !== 'git') return undefined;
  const inspect = deps.inspect ?? inspectPath;
  const seen = await inspect(team.workspacePath).catch(() => undefined);
  return seen?.branch;
}

/** The one shape every provider is addressed by, built from a team row and an agent row. */
function requestFor(team: Team, agentId: string, agentName: string) {
  return {
    workspacePath: team.workspacePath,
    teamName: team.name,
    agentId,
    agentName,
    ...(team.workspaceRepos === undefined ? {} : { repos: team.workspaceRepos }),
  };
}

/** What `publishAgentBranch` is about to run, for the confirm to show before the user agrees. */
export async function publishPlanFor(
  teamId: string,
  agentId: string,
  deps: CreateTeamDeps,
  options: { readonly title?: string; readonly draft?: boolean } = {},
): Promise<readonly string[]> {
  const found = await publishTarget(teamId, agentId, deps);
  if ('error' in found) return [];
  return publishPlan({ ...found.request, ...options });
}

/**
 * Push this agent's branch and open a pull request for it.
 *
 * The user's action end to end: their click, their `gh`, their credential, and a branch that
 * only ever reached the remote because they asked. No agent has a path to this, and nothing it
 * returns goes back into a session.
 */
export async function publishAgentBranch(
  teamId: string,
  agentId: string,
  deps: CreateTeamDeps,
  options: { readonly title?: string; readonly body?: string; readonly draft?: boolean } = {},
): Promise<PublishOutcome> {
  const found = await publishTarget(teamId, agentId, deps);
  if ('error' in found) return { ok: false, step: 'create', error: found.error };
  return publishBranch({ ...found.request, ...options });
}

/** The three things that have to be true before a branch can become a pull request. */
async function publishTarget(
  teamId: string,
  agentId: string,
  deps: CreateTeamDeps,
): Promise<{ request: { path: string; branch: string; base: string } } | { error: string }> {
  const team = deps.store.teamById(teamId);
  if (team === undefined) return { error: 'That team is already gone.' };
  const record = deps.store.agentsOfTeam(team.id).find((agent) => agent.id === agentId);
  if (record === undefined) return { error: 'That agent is not on this team.' };
  if (team.workspaceKind !== 'git') {
    // A copy has no branch and a nested tree has several. Neither is one pull request.
    return { error: 'This team\'s workspace is not a single git repository.' };
  }
  const workspaces = deps.workspaces ?? workspaceProviderFor(team.workspaceKind);
  const workspace = workspaces.workspaceFor(requestFor(team, record.id, record.name));
  // What is checked out, falling back to the name the provider gave it. A worktree the user has
  // switched must push the branch they are looking at: pushing `blobot/<team>/<agent>` because
  // that is what it was called at creation would publish work the user is not standing on.
  const branch = (await currentBranch(workspace.path, spawnCommand)) ?? workspace.branch;
  if (branch === undefined) return { error: 'This agent has no branch to push.' };
  const base = await baseBranchOf(team, deps);
  if (base === undefined) return { error: 'blobot cannot tell what this branch would merge into.' };
  return { request: { path: workspace.path, branch, base } };
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
export async function deleteTeam(
  teamId: string,
  deps: CreateTeamDeps,
  /**
   * A **full clean**: every AgentWorkspace deleted whatever it holds, unmerged branches and
   * copies included. Off unless the user asked for it on the dialog, having been shown the
   * size, because it is the one action in blobot that destroys work git cannot give back.
   */
  options: { readonly clean?: boolean } = {},
): Promise<TeamDeletion> {
  const team = deps.store.teamById(teamId);
  if (team === undefined) throw new TeamCreationError('unknown_agent', 'That team is already gone.');
  const workspaces = deps.workspaces ?? workspaceProviderFor(team.workspaceKind);
  const records = deps.store.agentsOfTeam(team.id);
  const clean = options.clean === true;

  const removals: AgentRemoval[] = [];
  let freedBytes = 0;
  for (const record of records) {
    // Measured first, while it is still there. The whole point of the option is the number, and
    // a number reported after the fact would have to be the estimate rather than the result.
    if (clean) freedBytes += await measureWorkspaceOf(record, team, workspaces);
    removals.push(await removeWorkspaceOf(record, team, workspaces, clean));
    // The one case where a Routine's record is not kept. Everywhere else a Routine that cannot
    // run is disarmed and left saying who it belonged to; here it would be a pointer to nothing.
    for (const routine of deps.store.routinesOfAgent(record.id)) {
      deps.store.tombstoneRoutine(routine.id, deps.clock.now());
    }
    deps.store.tombstoneAgent(record.id, deps.clock.now());
  }
  deps.store.tombstoneTeam(team.id, deps.clock.now());
  return { teamName: team.name, removals, ...(clean ? { freedBytes } : {}) };
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
      ...(profile.runtimeOptions === undefined ? {} : { runtimeOptions: profile.runtimeOptions }),
      ...(profile.trust === undefined ? {} : { trust: profile.trust }),
      ...(profile.compaction === undefined ? {} : { compaction: profile.compaction }),
      ...(profile.verbosity === undefined ? {} : { verbosity: profile.verbosity }),
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
    // The agent's Routines are **disarmed and kept**, not tombstoned: unlike a deleted team,
    // this is a roster the user is still looking at, and a Routine that says who it belonged to
    // is how they find out their nightly typecheck stopped. Never reassigned to whoever is
    // left, because blobot does not decide who a message is for.
    for (const routine of deps.store.routinesOfAgent(member.id)) {
      deps.store.setRoutineArmed(routine.id, false);
    }
    // Tombstoned, never deleted: a peer message names two agents, and a cascade would tear a
    // hole in a transcript that has nothing to do with the agent who left.
    deps.store.tombstoneAgent(member.id, deps.clock.now());
  }
  return removals;
}

async function measureWorkspaceOf(
  record: { readonly id: string; readonly name: string },
  team: Team,
  workspaces: WorkspaceProvider,
): Promise<number> {
  return workspaces
    .measure({
      workspacePath: team.workspacePath,
      teamName: team.name,
      agentId: record.id,
      agentName: record.name,
      ...(team.workspaceRepos === undefined ? {} : { repos: team.workspaceRepos }),
    })
    .catch(() => 0);
}

async function removeWorkspaceOf(
  record: { readonly id: string; readonly name: string },
  team: Team,
  workspaces: WorkspaceProvider,
  clean = false,
): Promise<AgentRemoval> {
  const request = {
    workspacePath: team.workspacePath,
    teamName: team.name,
    agentId: record.id,
    agentName: record.name,
    ...(team.workspaceRepos === undefined ? {} : { repos: team.workspaceRepos }),
  };
  try {
    const outcome = clean
      ? await workspaces.purge(request)
      : await workspaces.remove(request);
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
