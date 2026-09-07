import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import {
  LocalMachine, MockAgentRuntime, PeerMessageServer, SqliteStore, SystemClock,
  openDatabase, scenario, machinePlacement, type AgentRecord, type Machine, type WorkspaceProvider,
} from '@blobot/core';
import { startTeam } from './start-team.js';
import type { RunningTeam } from './running-team.js';
import { runtimeFor } from './runtime-for.js';

vi.mock('./runtime-for.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./runtime-for.js')>(), runtimeFor: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

function fixture() {
  const database = openDatabase({ path: ':memory:', migrationsFolder:
    fileURLToPath(new URL('../../../../packages/core/migrations', import.meta.url)) });
  const store = new SqliteStore(database.db);
  const clock = new SystemClock();
  const team = { id: 'team', name: 'Team', workspacePath: '/fixture', workspaceKind: 'plain',
    turnBudget: 10, createdAt: 0 } as const;
  const placement = { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 4 * 1024 ** 3 } } as const;
  store.createTeam(team);
  for (const id of ['alice', 'bob']) store.createAgent({ id, teamId: team.id, name: id,
    role: 'Engineer', runtimeId: 'codex', workspacePath: `/stale/${id}`, createdAt: 0,
    executablePath: '/host/does-not-exist', ...(id === 'alice' ? { machine: placement } : {}) });
  store.startSession({ id: 'previous', agentId: 'alice', providerSessionId: 'retained-session',
    personaText: '', startedAt: 0 });
  const workspaces: WorkspaceProvider = {
    inspect: async () => ({ path: '/fixture', kind: 'plain', hasCommits: false, dirty: false, repos: [], looseFiles: true }),
    initialize: async () => {},
    provision: async (request) => ({ agentId: request.agentId, path: `/current/${request.agentId}` }),
    reconcile: async () => ({ state: 'absent' }),
    remove: async () => ({ work: 'discarded' }), purge: async () => ({ work: 'discarded' }),
    measure: async () => 0,
    workspaceFor: (request) => ({ agentId: request.agentId, path: `/current/${request.agentId}` }),
  };
  const providers = new Map<string, MockAgentRuntime[]>();
  vi.mocked(runtimeFor).mockImplementation((request) => {
    const runtime = new MockAgentRuntime({ agentId: request.agentId, clock, startupMs: 0,
      sessionId: request.resumeSessionId ?? `${request.agentId}-new`, script: scenario('empty').end() });
    providers.set(request.agentId, [...providers.get(request.agentId) ?? [], runtime]);
    return runtime;
  });
  vi.spyOn(PeerMessageServer.prototype, 'whenReady').mockResolvedValue(true);
  return { database, store, clock, team, workspaces, providers, placement };
}

it('keeps a failed member pending while peers work, then records its session only on successful retry', async () => {
  const { database, store, clock, team, workspaces, providers, placement } = fixture();
  let signedIn = false;
  const created: AgentRecord[] = [];
  const live = await startTeam({ team, store, db: database.db, clock, workspaces, onLog: () => {},
    createMachine: (record) => {
      created.push(record);
      const local = new LocalMachine({ agentId: record.id, workspacePath: record.workspacePath });
      const machine: Machine = {
        kind: machinePlacement(record.machine).kind, mailboxHostname: local.mailboxHostname,
        location: () => ({ ...local.location(), kind: machinePlacement(record.machine).kind }),
        readiness: () => local.readiness(), reconcile: () => local.reconcile(),
        start: (request) => local.start(request), spawn: (request) => local.spawn(request),
        stop: () => local.stop(), destroy: () => local.destroy(), measure: () => local.measure(),
      };
      return machine;
    },
    beforeRuntimeStart: async (machine) => {
      if (machine.location().agentId === 'alice' && !signedIn) throw new Error('Sign in to this Agent’s Machine.');
    },
  });
  try {
    expect(created[0]?.workspacePath).toBe('/current/alice');
    expect(created[0]?.machine).toEqual(placement);
    expect(live.agents[0]?.machine).toEqual(placement);
    expect(live.executions?.get('alice')?.lifecycle).toBe('dead');
    expect(live.executions?.get('bob')?.lifecycle).toBe('ready');
    expect(store.lastProviderSessionOf('alice')).toBe('retained-session');
    expect(store.lastProviderSessionOf('bob')).toBe('bob-new');
    await live.orchestrator.promptFromUser(['alice', 'bob'], 'Work after login');
    expect(live.orchestrator.mailbox('alice')).toHaveLength(1);
    expect(providers.get('alice')?.[0]?.prompts).toHaveLength(0);
    expect(providers.get('bob')?.[0]?.prompts).toHaveLength(1);
    signedIn = true;
    await live.orchestrator.retryAgent('alice');
    expect(live.orchestrator.mailbox('alice')).toHaveLength(0);
    expect(providers.get('alice')?.[1]?.sessionId).toBe('retained-session');
    expect(providers.get('alice')?.[1]?.prompts).toHaveLength(1);
    expect(providers.get('bob')).toHaveLength(1);
  } finally { await live.close(); database.close(); }
});

it('keeps malformed Machine placement scoped to one member and refuses retry without a new setting', async () => {
  const { database, store, clock, team, workspaces, providers } = fixture();
  const read = store.agentsOfTeam.bind(store);
  vi.spyOn(store, 'agentsOfTeam').mockImplementation((teamId) => read(teamId).map((record) => record.id === 'alice'
    ? { ...record, machine: { kind: 'invalid', detail: 'Invalid persisted Machine placement.' } } : record));
  const live = await startTeam({ team, store, db: database.db, clock, workspaces, onLog: () => {},
    createMachine: (record) => new LocalMachine({ agentId: record.id, workspacePath: record.workspacePath }),
  });
  try {
    expect(live.machines?.has('alice')).toBe(false);
    expect(live.executions?.has('alice')).toBe(false);
    expect(live.orchestrator.statusOf('alice')).toBe('failed');
    expect(live.orchestrator.failureOf('alice')).toBeDefined();
    expect(live.executions?.get('bob')?.lifecycle).toBe('ready');
    await live.orchestrator.promptFromUser(['alice', 'bob'], 'Keep this work');
    expect(live.orchestrator.mailbox('alice')).toHaveLength(1);
    expect(providers.get('bob')?.[0]?.prompts).toHaveLength(1);
    await expect(live.orchestrator.retryAgent('alice')).rejects.toThrow('Edit this agent');
  } finally { await live.close(); database.close(); }
});

it('keeps an adapter construction refusal scoped to one member and can retry after its correction', async () => {
  const { database, store, clock, team, workspaces, providers } = fixture();
  const records = store.agentsOfTeam.bind(store);
  vi.spyOn(store, 'agentsOfTeam').mockImplementation((teamId) => records(teamId).map((record) => ({ ...record, machine: { kind: 'local' } })));
  const createRuntime = vi.mocked(runtimeFor).getMockImplementation()!;
  let corrected = false;
  vi.mocked(runtimeFor).mockImplementation((request) => {
    if (request.agentId === 'alice' && !corrected) throw new Error('Invalid Agent Git identity.');
    return createRuntime(request);
  });
  const live = await startTeam({ team, store, db: database.db, clock, workspaces, onLog: () => {},
    createMachine: (record) => new LocalMachine({ agentId: record.id, workspacePath: record.workspacePath }),
  });
  try {
    expect(live.orchestrator.statusOf('alice')).toBe('failed');
    await live.orchestrator.promptFromUser(['alice', 'bob'], 'Keep this work');
    expect(live.orchestrator.mailbox('alice')).toHaveLength(1);
    expect(providers.get('bob')?.[0]?.prompts).toHaveLength(1);
    corrected = true;
    await live.orchestrator.retryAgent('alice');
    expect(live.orchestrator.mailbox('alice')).toHaveLength(0);
    expect(providers.get('alice')?.[0]?.prompts).toHaveLength(1);
  } finally { await live.close(); database.close(); }
});

it('exposes startup services soon enough to cancel a Machine before its Team becomes ready', async () => {
  const { database, store, clock, team, workspaces } = fixture();
  const records = store.agentsOfTeam.bind(store);
  vi.spyOn(store, 'agentsOfTeam').mockImplementation((teamId) => records(teamId).map((record) => ({ ...record, machine: { kind: 'local' } })));
  let announce!: (live: RunningTeam) => void;
  const pending = new Promise<RunningTeam>((resolve) => { announce = resolve; });
  const starting = startTeam({ team, store, db: database.db, clock, workspaces, onLog: () => {},
    onStarting: (live) => {
      vi.spyOn(live.machines!.get('alice')!, 'start').mockImplementationOnce(({ signal }) => new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
      }));
      announce(live);
    },
  });
  const live = await pending;
  try {
    await vi.waitFor(() => expect(live.executions?.get('alice')?.power).toBe('waking'));
    await live.executions!.get('alice')!.cancelStart();
    expect(await starting).toBe(live);
    expect(live.orchestrator.statusOf('alice')).toBe('failed');
    expect(live.orchestrator.failureOf('alice')).toContain('startup was cancelled');
    expect(live.executions?.get('bob')?.lifecycle).toBe('ready');
    await live.orchestrator.retryAgent('alice');
    expect(live.orchestrator.statusOf('alice')).toBe('idle');
  } finally { await live.close(); database.close(); }
});
