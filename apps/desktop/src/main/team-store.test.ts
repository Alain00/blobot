import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SqliteStore,
  VirtualClock,
  openDatabase,
  type AgentWorkspace,
  type OpenedDatabase,
  type ProvisionRequest,
  type ReconcileOutcome,
  type RemovalOutcome,
  type WorkspaceInspection,
  type WorkspaceProvider,
} from '@blobot/core';
import {
  TeamCreationError,
  createTeam,
  deleteTeam,
  editAgentProfile,
  editTeamRoster,
  hireAgent,
} from './team-store.js';

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/core/migrations', import.meta.url),
);

/** A Workspace that answers whatever the test needs and records what it was asked to make. */
class FakeWorkspaces implements WorkspaceProvider {
  inspection: WorkspaceInspection = {
    path: '/repo',
    kind: 'git',
    hasCommits: true,
    dirty: false,
    branch: 'main',
    repos: [],
    looseFiles: false,
  };
  readonly provisioned: ProvisionRequest[] = [];
  initialized: string[] = [];

  async inspect(): Promise<WorkspaceInspection> {
    return this.inspection;
  }

  async initialize(workspacePath: string): Promise<void> {
    this.initialized.push(workspacePath);
  }

  async provision(request: ProvisionRequest): Promise<AgentWorkspace> {
    this.provisioned.push(request);
    return {
      agentId: request.agentId,
      path: `/worktrees/${request.agentId}`,
      branch: `blobot/${request.teamName}/${request.agentName.toLowerCase()}`,
    };
  }

  async reconcile(): Promise<ReconcileOutcome> {
    return { state: 'absent' };
  }

  /** What `remove` will say, and what it was asked to remove. Set per test. */
  removal: RemovalOutcome | Error = { work: 'discarded' };
  readonly removed: ProvisionRequest[] = [];

  async remove(request: ProvisionRequest): Promise<RemovalOutcome> {
    this.removed.push(request);
    if (this.removal instanceof Error) throw this.removal;
    return this.removal;
  }
}

let opened: OpenedDatabase;
let store: SqliteStore;
let workspaces: FakeWorkspaces;
const clock = new VirtualClock(1_000);

/** Hire the two of them and hand back a spec that forms a team out of them. */
function teamOf(...members: { name: string; role: string; instructions?: string }[]): {
  name: string;
  workspacePath: string;
  turnBudget: number;
  profileIds: string[];
} {
  const profileIds = members.map(
    (member) => hireAgent({ ...member, runtimeId: 'claude-code' }, { store, clock }).id,
  );
  return { name: 'checkout', workspacePath: '/repo', turnBudget: 6, profileIds };
}

let spec: ReturnType<typeof teamOf>;

beforeEach(() => {
  opened = openDatabase({ path: ':memory:', migrationsFolder });
  store = new SqliteStore(opened.db);
  workspaces = new FakeWorkspaces();
  spec = teamOf({ name: 'Alice', role: 'frontend' }, { name: 'Bob', role: 'backend' });
});

afterEach(() => opened.close());

describe('creating a team', () => {
  it('writes the team and gives every agent its own copy of the repository', async () => {
    const team = await createTeam(spec, { store, clock, workspaces, inspect: () => workspaces.inspect() });

    expect(store.teamByName('checkout')?.id).toBe(team.id);
    const agents = store.agentsOfTeam(team.id);
    expect(agents.map((agent) => agent.name)).toEqual(['Alice', 'Bob']);
    expect(agents.map((agent) => agent.branch)).toEqual([
      'blobot/checkout/alice',
      'blobot/checkout/bob',
    ]);
    expect(workspaces.provisioned).toHaveLength(2);
    // Ticket 13: `runtime_id` is stored, and nothing in the UI's snapshot ever carries it.
    expect(agents.every((agent) => agent.runtimeId === 'claude-code')).toBe(true);
  });

  it('survives being read back by a second store over the same database', async () => {
    const team = await createTeam(spec, { store, clock, workspaces, inspect: () => workspaces.inspect() });
    const reopened = new SqliteStore(opened.db);
    expect(reopened.listTeams().map((entry) => entry.id)).toEqual([team.id]);
    expect(reopened.agentsOfTeam(team.id)).toHaveLength(2);
  });

  // The amendment to ticket 10: not being a git repository stopped being a refusal. A plain
  // folder gets a copy per agent, and the team records which mechanism it was given so the
  // same one brings it back at launch.
  it('accepts a folder that is not a git repository, and records it as plain', async () => {
    workspaces.inspection = { ...workspaces.inspection, kind: 'plain', hasCommits: false };
    const team = await createTeam(spec, {
      store,
      clock,
      workspaces,
      inspect: () => workspaces.inspect(),
    });
    expect(team.workspaceKind).toBe('plain');
    expect(store.teamById(team.id)?.workspaceKind).toBe('plain');
  });

  it('puts every repository of a nested workspace in scope by default, and stores the list', async () => {
    workspaces.inspection = {
      ...workspaces.inspection,
      kind: 'nested',
      repos: [
        { path: 'storefront', hasCommits: true, dirty: false },
        { path: 'api', hasCommits: true, dirty: false },
      ],
      looseFiles: true,
    };
    const team = await createTeam(spec, {
      store,
      clock,
      workspaces,
      inspect: () => workspaces.inspect(),
    });
    expect(team.workspaceRepos).toEqual(['storefront', 'api']);
    expect(store.teamById(team.id)?.workspaceRepos).toEqual(['storefront', 'api']);
    // The scope reaches the provider, because a repository out of scope must be absent from
    // the agent's workspace rather than present and off limits.
    expect(workspaces.provisioned[0]?.repos).toEqual(['storefront', 'api']);
  });

  it('carries the user’s chosen subset through instead of every repository found', async () => {
    workspaces.inspection = {
      ...workspaces.inspection,
      kind: 'nested',
      repos: [
        { path: 'storefront', hasCommits: true, dirty: false },
        { path: 'api', hasCommits: true, dirty: false },
      ],
      looseFiles: false,
    };
    const team = await createTeam(
      { ...spec, repoPaths: ['api'] },
      { store, clock, workspaces, inspect: () => workspaces.inspect() },
    );
    expect(team.workspaceRepos).toEqual(['api']);
  });

  it('refuses a nested workspace with nothing at all in scope', async () => {
    workspaces.inspection = {
      ...workspaces.inspection,
      kind: 'nested',
      repos: [{ path: 'storefront', hasCommits: true, dirty: false }],
      looseFiles: false,
    };
    await expect(
      createTeam(
        { ...spec, repoPaths: [] },
        { store, clock, workspaces, inspect: () => workspaces.inspect() },
      ),
    ).rejects.toMatchObject({ code: 'empty_workspace' });
    expect(store.listTeams()).toHaveLength(0);
  });

  it('refuses a *repository* with no commits, because there is nothing to branch from', async () => {
    workspaces.inspection = { ...workspaces.inspection, kind: 'git', hasCommits: false };
    await expect(createTeam(spec, { store, clock, workspaces, inspect: () => workspaces.inspect() })).rejects.toMatchObject({
      code: 'no_commits',
    });
  });

  it('allows a dirty tree — it is warned about, not refused', async () => {
    workspaces.inspection = { ...workspaces.inspection, dirty: true };
    await expect(createTeam(spec, { store, clock, workspaces, inspect: () => workspaces.inspect() })).resolves.toBeDefined();
  });

  it('refuses a second team of the same name, since the name is half of a branch', async () => {
    await createTeam(spec, { store, clock, workspaces, inspect: () => workspaces.inspect() });
    await expect(
      createTeam({ ...spec, workspacePath: '/elsewhere' }, { store, clock, workspaces, inspect: () => workspaces.inspect() }),
    ).rejects.toBeInstanceOf(TeamCreationError);
  });

  it('refuses two agents whose names slug to one branch', async () => {
    const colliding = teamOf({ name: 'Ada', role: 'frontend' }, { name: 'ada!', role: 'backend' });
    await expect(createTeam(colliding, { store, clock, workspaces, inspect: () => workspaces.inspect() })).rejects.toMatchObject({
      code: 'duplicate_agent',
    });
  });

  it('never gates on detection: a runtime is stored as chosen, unprobed', async () => {
    // Ticket 11's rule. The user is always allowed to try — a negative probe now is not proof
    // they will not have signed in by the first turn.
    const solo = hireAgent(
      { name: 'Solo', role: 'anything', runtimeId: 'something-unproven' },
      { store, clock },
    );
    const team = await createTeam({ ...spec, profileIds: [solo.id] }, { store, clock, workspaces, inspect: () => workspaces.inspect() });
    expect(store.agentsOfTeam(team.id)[0]?.runtimeId).toBe('something-unproven');
  });
});

describe('agents that exist on their own', () => {
  it('hires an agent that belongs to no team', () => {
    const agent = hireAgent(
      { name: 'Mara', role: 'marketing', runtimeId: 'claude-code', instructions: 'Never ship copy without a source.' },
      { store, clock },
    );
    expect(store.listProfiles().map((profile) => profile.name)).toContain('Mara');
    expect(store.membershipsOf(agent.id)).toEqual([]);
  });

  it('puts one agent on two teams at once, with a workspace and a row for each', async () => {
    const mara = hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    const first = await createTeam(
      { name: 'checkout', workspacePath: '/repo', turnBudget: 6, profileIds: [mara.id] },
      { store, clock, workspaces, inspect: () => workspaces.inspect() },
    );
    const second = await createTeam(
      { name: 'storefront', workspacePath: '/other', turnBudget: 6, profileIds: [mara.id] },
      { store, clock, workspaces, inspect: () => workspaces.inspect() },
    );

    const memberships = store.membershipsOf(mara.id);
    expect(memberships.map((agent) => agent.teamId).sort()).toEqual([first.id, second.id].sort());
    // Two Agents, two branches, two workspaces: what a team gives an agent cannot be shared.
    expect(new Set(memberships.map((agent) => agent.id)).size).toBe(2);
    expect(new Set(memberships.map((agent) => agent.workspacePath)).size).toBe(2);
    expect(memberships.map((agent) => agent.branch).sort()).toEqual([
      'blobot/checkout/mara',
      'blobot/storefront/mara',
    ]);
    expect(memberships.every((agent) => agent.profileId === mara.id)).toBe(true);
  });

  it('copies name, role and instructions onto the Agent as they were when it joined', async () => {
    const mara = hireAgent(
      { name: 'Mara', role: 'marketing', runtimeId: 'claude-code', instructions: 'Cite a source.' },
      { store, clock },
    );
    const team = await createTeam(
      { ...spec, profileIds: [mara.id] },
      { store, clock, workspaces, inspect: () => workspaces.inspect() },
    );
    expect(store.agentsOfTeam(team.id)[0]).toMatchObject({
      name: 'Mara',
      role: 'marketing',
      instructions: 'Cite a source.',
    });
  });

  it('refuses a second agent of the same name', () => {
    hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    expect(() =>
      hireAgent({ name: 'Mara', role: 'sales', runtimeId: 'claude-code' }, { store, clock }),
    ).toThrow(TeamCreationError);
  });

  it('refuses a team formed out of an agent that no longer exists', async () => {
    await expect(
      createTeam({ ...spec, profileIds: ['agent_gone'] }, { store, clock, workspaces, inspect: () => workspaces.inspect() }),
    ).rejects.toMatchObject({ code: 'unknown_agent' });
  });

  it('retiring an agent leaves the teams it is on alone', async () => {
    const mara = hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    const team = await createTeam({ ...spec, profileIds: [mara.id] }, { store, clock, workspaces, inspect: () => workspaces.inspect() });
    store.tombstoneProfile(mara.id, 99);

    expect(store.listProfiles().map((profile) => profile.id)).not.toContain(mara.id);
    // The team is a real team; ending it is a separate decision from retiring the agent.
    expect(store.agentsOfTeam(team.id)).toHaveLength(1);
  });
});

/**
 * ADR-0002. An edit restates the definition, and it does not land uniformly on the teams the
 * agent is already on: the role, the standing instructions and the face are restated there, and
 * the name and the runtime are not, because a branch is under the old name and a session belongs
 * to the runtime that opened it.
 */
describe('editing an agent', () => {
  const deps = () => ({ store, clock, workspaces, inspect: () => workspaces.inspect() });

  it('restates the whole definition on the profile', () => {
    const mara = hireAgent(
      { name: 'Mara', role: 'marketing', runtimeId: 'claude-code', instructions: 'Cite a source.', hue: 42 },
      { store, clock },
    );

    editAgentProfile(
      mara.id,
      { name: 'Marisol', role: 'growth', runtimeId: 'opencode', instructions: 'Cite two.', hue: 215 },
      deps(),
    );

    expect(store.profileById(mara.id)).toMatchObject({
      name: 'Marisol',
      role: 'growth',
      runtimeId: 'opencode',
      instructions: 'Cite two.',
      hue: 215,
    });
  });

  it('restates role, instructions and face on a team the agent is on, and not the name', async () => {
    const mara = hireAgent(
      { name: 'Mara', role: 'marketing', runtimeId: 'claude-code', instructions: 'Cite a source.', hue: 42 },
      { store, clock },
    );
    const team = await createTeam({ ...spec, profileIds: [mara.id] }, deps());

    editAgentProfile(
      mara.id,
      { name: 'Marisol', role: 'growth', runtimeId: 'opencode', instructions: 'Cite two.', hue: 215 },
      deps(),
    );

    const member = store.agentsOfTeam(team.id)[0];
    expect(member).toMatchObject({ role: 'growth', instructions: 'Cite two.', hue: 215 });
    // The two the membership is built out of. The branch is under the old name, and the open
    // session belongs to the runtime that opened it.
    expect(member?.name).toBe('Mara');
    expect(member?.branch).toBe('blobot/checkout/mara');
    expect(member?.runtimeId).toBe('claude-code');
  });

  it('says which teams keep the former name, and that the runtime is for the next one', async () => {
    const mara = hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    await createTeam({ ...spec, profileIds: [mara.id] }, deps());

    const edit = editAgentProfile(
      mara.id,
      { name: 'Marisol', role: 'marketing', runtimeId: 'opencode' },
      deps(),
    );

    expect(edit).toMatchObject({
      restated: ['checkout'],
      keepingName: ['checkout'],
      formerName: 'Mara',
      runtimeChanged: true,
    });
  });

  it('has nothing to report about an edit that changed no name and no runtime', async () => {
    const mara = hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    await createTeam({ ...spec, profileIds: [mara.id] }, deps());

    const edit = editAgentProfile(
      mara.id,
      { name: 'Mara', role: 'growth', runtimeId: 'claude-code' },
      deps(),
    );

    expect(edit).toMatchObject({ restated: ['checkout'], keepingName: [], runtimeChanged: false });
    expect(edit.formerName).toBeUndefined();
  });

  it('clears standing instructions that were emptied, on the profile and on every team', async () => {
    const mara = hireAgent(
      { name: 'Mara', role: 'marketing', runtimeId: 'claude-code', instructions: 'Cite a source.' },
      { store, clock },
    );
    const team = await createTeam({ ...spec, profileIds: [mara.id] }, deps());

    // Restated, not patched: an empty field is an answer, and it is "nothing standing".
    editAgentProfile(mara.id, { name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, deps());

    expect(store.profileById(mara.id)?.instructions).toBeUndefined();
    expect(store.agentsOfTeam(team.id)[0]?.instructions).toBeUndefined();
  });

  it('refuses a name another agent already has, and allows an agent to keep its own', () => {
    const mara = hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    hireAgent({ name: 'Nils', role: 'design', runtimeId: 'claude-code' }, { store, clock });

    expect(() =>
      editAgentProfile(mara.id, { name: 'Nils', role: 'marketing', runtimeId: 'claude-code' }, deps()),
    ).toThrow(TeamCreationError);
    expect(() =>
      editAgentProfile(mara.id, { name: 'Mara', role: 'growth', runtimeId: 'claude-code' }, deps()),
    ).not.toThrow();
  });

  it('refuses an agent that is gone, and an agent with no name', () => {
    const mara = hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    expect(() =>
      editAgentProfile('agent_gone', { name: 'Mara', role: 'x', runtimeId: 'claude-code' }, deps()),
    ).toThrow(TeamCreationError);
    expect(() =>
      editAgentProfile(mara.id, { name: '  ', role: 'x', runtimeId: 'claude-code' }, deps()),
    ).toThrow(TeamCreationError);
  });

  it('reaches every team the agent is on at once', async () => {
    const mara = hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    const first = await createTeam(
      { name: 'checkout', workspacePath: '/repo', turnBudget: 6, profileIds: [mara.id] },
      deps(),
    );
    const second = await createTeam(
      { name: 'storefront', workspacePath: '/other', turnBudget: 6, profileIds: [mara.id] },
      deps(),
    );

    const edit = editAgentProfile(
      mara.id,
      { name: 'Mara', role: 'growth', runtimeId: 'claude-code' },
      deps(),
    );

    expect([...edit.restated].sort()).toEqual(['checkout', 'storefront']);
    expect(store.agentsOfTeam(first.id)[0]?.role).toBe('growth');
    expect(store.agentsOfTeam(second.id)[0]?.role).toBe('growth');
  });
});

describe('deleting a team', () => {
  const deps = () => ({ store, clock, workspaces, inspect: () => workspaces.inspect() });

  it('removes every agent workspace and takes the team out of the rail', async () => {
    const team = await createTeam(spec, deps());
    const deletion = await deleteTeam(team.id, deps());

    expect(deletion.teamName).toBe('checkout');
    expect(workspaces.removed.map((request) => request.agentName)).toEqual(['Alice', 'Bob']);
    // The name it was removed under is the one the branch was made under.
    expect(workspaces.removed.every((request) => request.teamName === 'checkout')).toBe(true);
    expect(store.listTeams()).toHaveLength(0);
    expect(store.agentsOfTeam(team.id)).toHaveLength(0);
    expect(store.agentsOfTeam(team.id, { includeDeleted: true })).toHaveLength(2);
  });

  it('names the work that was kept, so unmerged commits are not silently abandoned', async () => {
    const team = await createTeam(spec, deps());
    workspaces.removal = { work: 'kept', detail: 'blobot/checkout/alice has unmerged commits' };

    const deletion = await deleteTeam(team.id, deps());

    expect(deletion.removals.map((removal) => removal.work)).toEqual(['kept', 'kept']);
    expect(deletion.removals[0]?.detail).toContain('unmerged commits');
  });

  /**
   * The case the author actually hit: a team pointed at a directory that has been cleaned up.
   * It could never open again and could never be removed, so it sat in the rail failing.
   */
  it('deletes a team whose workspace is gone, and says what it could not clean up', async () => {
    const team = await createTeam(spec, deps());
    workspaces.removal = new Error('blobot cannot find /repo. The folder has been deleted.');

    const deletion = await deleteTeam(team.id, deps());

    expect(deletion.removals.map((removal) => removal.work)).toEqual(['unknown', 'unknown']);
    expect(deletion.removals[0]?.detail).toContain('cannot find /repo');
    expect(store.listTeams()).toHaveLength(0);
  });

  it('frees the name, so a team can be made again for the folder it was moved to', async () => {
    const team = await createTeam(spec, deps());
    await deleteTeam(team.id, deps());

    const again = await createTeam(
      teamOf({ name: 'Carol', role: 'frontend' }),
      deps(),
    );
    expect(store.teamByName('checkout')?.id).toBe(again.id);
  });
});

describe('editing a team', () => {
  const deps = () => ({ store, clock, workspaces, inspect: () => workspaces.inspect() });

  it('gives an agent who joins its own workspace, without touching the others', async () => {
    const team = await createTeam(spec, deps());
    const carol = hireAgent({ name: 'Carol', role: 'infra', runtimeId: 'claude-code' }, { store, clock });
    workspaces.provisioned.length = 0;

    await editTeamRoster(team.id, [...spec.profileIds, carol.id], deps());

    expect(workspaces.provisioned.map((request) => request.agentName)).toEqual(['Carol']);
    expect(store.agentsOfTeam(team.id).map((agent) => agent.name)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('removes the workspace of an agent who leaves and reports what became of it', async () => {
    const team = await createTeam(spec, deps());
    workspaces.removal = { work: 'kept', detail: 'blobot/checkout/bob has unmerged commits' };

    const removals = await editTeamRoster(team.id, [spec.profileIds[0] as string], deps());

    expect(removals).toHaveLength(1);
    expect(removals[0]?.agentName).toBe('Bob');
    expect(removals[0]?.detail).toContain('unmerged commits');
    expect(store.agentsOfTeam(team.id).map((agent) => agent.name)).toEqual(['Alice']);
  });

  it('refuses to empty a team, because a team is the agents on it', async () => {
    const team = await createTeam(spec, deps());
    await expect(editTeamRoster(team.id, [], deps())).rejects.toThrow(TeamCreationError);
    expect(store.agentsOfTeam(team.id)).toHaveLength(2);
  });

  it('refuses two members whose names would share one branch', async () => {
    const team = await createTeam(spec, deps());
    // Two agents the user can tell apart and git cannot: both slug to `alice`.
    const twin = hireAgent({ name: 'alice.', role: 'infra', runtimeId: 'claude-code' }, { store, clock });
    await expect(editTeamRoster(team.id, [...spec.profileIds, twin.id], deps())).rejects.toThrow(
      /one branch name/,
    );
    expect(store.agentsOfTeam(team.id)).toHaveLength(2);
  });

  it('changes nothing when the roster it is given is the roster it has', async () => {
    const team = await createTeam(spec, deps());
    workspaces.provisioned.length = 0;

    const removals = await editTeamRoster(team.id, spec.profileIds, deps());

    expect(removals).toHaveLength(0);
    expect(workspaces.provisioned).toHaveLength(0);
    expect(store.agentsOfTeam(team.id)).toHaveLength(2);
  });
});
