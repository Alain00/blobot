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

  it.each(['unknown', 'local', 'box'])('refuses corrupted %s placement instead of falling back', (kind) => {
    store.createTeam(team); store.createAgent(agent);
    database.db.run(sql`UPDATE agents SET machine_kind = ${kind}, machine_cpus = 2 WHERE id = 'alice'`);
    expect(() => store.agentById(agent.id)).toThrow('Invalid Machine placement');
  });

  it.each([
    null, {}, { kind: 'ssh' }, { kind: 'local', limits: box.limits },
    { kind: 'box', limits: { maxCpus: 0, maxMemoryBytes: 1024 ** 3 } },
    { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 1024 ** 3, secret: 'no' } },
  ])('refuses invalid input before persistence: %j', (value) => {
    expect(() => machinePlacement(value)).toThrow();
  });
});
