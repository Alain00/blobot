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
import { TeamCreationError, createTeam, hireAgent } from './team-store.js';

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

  async remove(): Promise<RemovalOutcome> {
    return { branch: 'deleted' };
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
    const team = await createTeam(spec, { store, clock, workspaces });

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
    const team = await createTeam(spec, { store, clock, workspaces });
    const reopened = new SqliteStore(opened.db);
    expect(reopened.listTeams().map((entry) => entry.id)).toEqual([team.id]);
    expect(reopened.agentsOfTeam(team.id)).toHaveLength(2);
  });

  it('refuses a Workspace that is not a git repository, so the flow can offer git init', async () => {
    workspaces.inspection = { ...workspaces.inspection, kind: 'plain' };
    await expect(createTeam(spec, { store, clock, workspaces })).rejects.toMatchObject({
      code: 'not_git',
    });
    expect(store.listTeams()).toHaveLength(0);
  });

  it('refuses a repository with no commits, because there is nothing to branch from', async () => {
    workspaces.inspection = { ...workspaces.inspection, hasCommits: false };
    await expect(createTeam(spec, { store, clock, workspaces })).rejects.toMatchObject({
      code: 'no_commits',
    });
  });

  it('allows a dirty tree — it is warned about, not refused', async () => {
    workspaces.inspection = { ...workspaces.inspection, dirty: true };
    await expect(createTeam(spec, { store, clock, workspaces })).resolves.toBeDefined();
  });

  it('refuses a second team of the same name, since the name is half of a branch', async () => {
    await createTeam(spec, { store, clock, workspaces });
    await expect(
      createTeam({ ...spec, workspacePath: '/elsewhere' }, { store, clock, workspaces }),
    ).rejects.toBeInstanceOf(TeamCreationError);
  });

  it('refuses two agents whose names slug to one branch', async () => {
    const colliding = teamOf({ name: 'Ada', role: 'frontend' }, { name: 'ada!', role: 'backend' });
    await expect(createTeam(colliding, { store, clock, workspaces })).rejects.toMatchObject({
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
    const team = await createTeam({ ...spec, profileIds: [solo.id] }, { store, clock, workspaces });
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
      { store, clock, workspaces },
    );
    const second = await createTeam(
      { name: 'storefront', workspacePath: '/other', turnBudget: 6, profileIds: [mara.id] },
      { store, clock, workspaces },
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

  it('copies name, role and instructions onto the Agent, so a later edit cannot rewrite them', async () => {
    const mara = hireAgent(
      { name: 'Mara', role: 'marketing', runtimeId: 'claude-code', instructions: 'Cite a source.' },
      { store, clock },
    );
    const team = await createTeam(
      { ...spec, profileIds: [mara.id] },
      { store, clock, workspaces },
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
      createTeam({ ...spec, profileIds: ['agent_gone'] }, { store, clock, workspaces }),
    ).rejects.toMatchObject({ code: 'unknown_agent' });
  });

  it('retiring an agent leaves the teams it is on alone', async () => {
    const mara = hireAgent({ name: 'Mara', role: 'marketing', runtimeId: 'claude-code' }, { store, clock });
    const team = await createTeam({ ...spec, profileIds: [mara.id] }, { store, clock, workspaces });
    store.tombstoneProfile(mara.id, 99);

    expect(store.listProfiles().map((profile) => profile.id)).not.toContain(mara.id);
    // The team is a real team; ending it is a separate decision from retiring the agent.
    expect(store.agentsOfTeam(team.id)).toHaveLength(1);
  });
});
