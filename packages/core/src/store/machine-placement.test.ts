import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { machinePlacement } from '../machines/placement.js';
import { openDatabase, type OpenedDatabase } from './database.js';
import { SqliteStore } from './sqlite-store.js';

let database: OpenedDatabase;
let store: SqliteStore;
const box = { kind: 'box', limits: { maxCpus: 3, maxMemoryBytes: 6 * 1024 ** 3 } } as const;
const team = { id: 'team', name: 'Team', workspacePath: '/repo', workspaceKind: 'git', turnBudget: 10, createdAt: 0 } as const;
const agent = { id: 'alice', teamId: 'team', name: 'Alice', role: 'Developer', runtimeId: 'codex', workspacePath: '/repo/alice', createdAt: 0 };
beforeEach(() => { database = openDatabase({ path: ':memory:' }); store = new SqliteStore(database.db); });
afterEach(() => database.close());

describe('persisted Machine placement', () => {
  it('keeps legacy teams and agents local without inventing resource limits', () => {
    store.createTeam(team); store.createAgent(agent);
    expect(store.teamById(team.id)?.defaultMachine).toBeUndefined();
    expect(store.agentById(agent.id)?.machine).toBeUndefined();
    expect(machinePlacement(store.agentById(agent.id)?.machine)).toEqual({ kind: 'local' });
  });

  it('stores the creation default and each member independently through definition edits', () => {
    store.createTeam({ ...team, defaultMachine: box });
    store.createAgent({ ...agent, machine: box });
    store.createAgent({ ...agent, id: 'bob', name: 'Bob', machine: { kind: 'local' } });
    store.restateAgent(agent.id, { role: 'Reviewer', instructions: 'Review carefully' });
    expect(store.teamById(team.id)?.defaultMachine).toEqual(box);
    expect(store.agentById(agent.id)?.machine).toEqual(box);
    expect(store.agentById('bob')?.machine).toBeUndefined();
  });

  it.each(['unknown', 'local', 'box'])('keeps corrupted %s placement visible and refuses execution instead of falling back', (kind) => {
    store.createTeam(team); store.createAgent(agent);
    database.db.run(sql`UPDATE agents SET machine_kind = ${kind}, machine_cpus = 2 WHERE id = 'alice'`);
    const record = store.agentById(agent.id);
    expect(record?.machine).toMatchObject({ kind: 'invalid', detail: expect.any(String) });
    expect(() => machinePlacement(record?.machine)).toThrow('Invalid Machine placement');
  });

  it('isolates a corrupt member across lookups and retains definition edits and deletion', () => {
    store.createTeam(team);
    const profile = { id: 'profile', name: 'Alice', role: 'Developer', runtimeId: 'codex', createdAt: 0 };
    store.createProfile(profile);
    store.createAgent({ ...agent, profileId: profile.id });
    store.createAgent({ ...agent, id: 'bob', name: 'Bob', profileId: profile.id, machine: box });
    database.db.run(sql`UPDATE agents SET machine_kind = 'box', machine_cpus = -1, machine_memory_bytes = 1024 WHERE id = 'alice'`);

    expect(store.agentsOfTeam(team.id).map((record) => record.machine?.kind)).toEqual(['invalid', 'box']);
    expect(store.membershipsOf(profile.id)).toHaveLength(2);
    expect(store.agentById('bob')?.machine).toEqual(box);
    store.restateAgent(agent.id, { role: 'Reviewer' });
    expect(store.agentById(agent.id)).toMatchObject({ role: 'Reviewer', machine: { kind: 'invalid' } });
    store.tombstoneAgent(agent.id, 1);
    expect(store.agentsOfTeam(team.id).map((record) => record.id)).toEqual(['bob']);
    expect(store.agentsOfTeam(team.id, { includeDeleted: true })).toHaveLength(2);
    expect(store.membershipsOf(profile.id).map((record) => record.id)).toEqual(['bob']);
  });

  it('isolates a corrupt Team default without breaking healthy Teams or accepting that default for new members', () => {
    store.createTeam(team);
    store.createTeam({ ...team, id: 'healthy', name: 'Healthy', defaultMachine: box });
    database.db.run(sql`UPDATE teams SET machine_kind = 'missing', machine_cpus = 2 WHERE id = 'team'`);
    expect(store.listTeams()).toHaveLength(2);
    expect(store.teamById('healthy')?.defaultMachine).toEqual(box);
    const broken = store.teamById(team.id);
    const invalid = broken?.defaultMachine;
    expect(invalid).toMatchObject({ kind: 'invalid' });
    if (invalid === undefined) throw new Error('Fixture did not retain invalid placement.');
    expect(() => machinePlacement(invalid)).toThrow('Invalid Machine placement');
    expect(() => store.createAgent({ ...agent, machine: invalid })).toThrow('Invalid Machine placement');
    store.tombstoneTeam(team.id, 1);
    expect(store.listTeams().map((record) => record.id)).toEqual(['healthy']);
    expect(store.listTeams({ includeDeleted: true })).toHaveLength(2);
  });

  it.each([
    null, {}, { kind: 'ssh' }, { kind: 'local', limits: box.limits },
    { kind: 'box', limits: { maxCpus: 0, maxMemoryBytes: 1024 ** 3 } },
    { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 1024 ** 3, secret: 'no' } },
  ])('refuses invalid input before persistence: %j', (value) => {
    expect(() => machinePlacement(value)).toThrow();
  });
});
