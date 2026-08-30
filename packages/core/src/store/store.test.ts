import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import { scenarios } from '../mock/scenarios/index.js';
import type { Agent, Team } from '../orchestrator/domain.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import type { AgentRuntime } from '../runtime.js';
import { openDatabase, type OpenedDatabase } from './database.js';
import { SqliteRecorder } from './recorder.js';
import { SqliteStore } from './sqlite-store.js';

const team: Team = {
  id: 'team_1',
  name: 'demo',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};
const alice: Agent = {
  id: 'agent_alice',
  teamId: team.id,
  name: 'Alice',
  role: 'frontend',
  workspacePath: '/agents/alice',
};
const bob: Agent = {
  id: 'agent_bob',
  teamId: team.id,
  name: 'Bob',
  role: 'reviewer',
  workspacePath: '/agents/bob',
};

let opened: OpenedDatabase;
let store: SqliteStore;

beforeEach(() => {
  opened = openDatabase({ path: ':memory:' });
  store = new SqliteStore(opened.db);
  store.createTeam({ ...team, createdAt: 0 });
  store.createAgent({ ...alice, runtimeId: 'opencode', branch: 'blobot/demo/alice', createdAt: 0 });
  store.createAgent({
    ...bob,
    runtimeId: 'claude-code',
    branch: 'blobot/demo/bob',
    executablePath: '/usr/local/bin/claude',
    createdAt: 0,
  });
});

afterEach(() => opened.close());

describe('the schema', () => {
  it('has nowhere to put a credential', () => {
    const columnsOf = (table: string): string[] =>
      opened.db
        .all<{ name: string }>(sql.raw(`SELECT name FROM pragma_table_info('${table}')`))
        .map((row) => row.name);

    // Runtime config is typed columns, and the TS schema is the allowlist.
    expect(columnsOf('agents').sort()).toEqual(
      [
        'branch',
        'created_at',
        'deleted_at',
        'executable_path',
        'hue',
        'id',
        'instructions',
        'model',
        'name',
        'profile_id',
        'role',
        'runtime_id',
        'team_id',
        'workspace_path',
      ].sort(),
    );
    // The same rule holds for an agent that exists before any team does.
    expect(columnsOf('agent_profiles').sort()).toEqual(
      [
        'created_at',
        'deleted_at',
        'executable_path',
        'hue',
        'id',
        'instructions',
        'model',
        'name',
        'role',
        'runtime_id',
      ].sort(),
    );
    for (const table of ['agents', 'agent_profiles']) {
      expect(columnsOf(table).join(' ')).not.toMatch(/key|token|secret|config|env/i);
    }
  });

  it('enforces the name uniqueness that branch names depend on', () => {
    expect(() =>
      store.createAgent({
        ...bob,
        id: 'another',
        runtimeId: 'opencode',
        createdAt: 0,
      }),
    ).toThrow(/UNIQUE/);
  });

  it('keeps foreign keys on, so the tombstone design is real', () => {
    expect(() =>
      store.startSession({
        id: 's1',
        agentId: 'nobody',
        personaText: 'x',
        startedAt: 0,
      }),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('reading teams back', () => {
  it('lists every team newest first, which is how a launch picks one to start', () => {
    store.createTeam({
      id: 'team_2',
      name: 'storefront',
      workspacePath: '/other',
      workspaceKind: 'git',
      turnBudget: 4,
      createdAt: 10,
    });
    expect(store.listTeams().map((entry) => entry.id)).toEqual(['team_2', 'team_1']);
  });

  it('finds a team by name, because a name collision is a branch collision', () => {
    expect(store.teamByName('demo')?.id).toBe('team_1');
    expect(store.teamByName('nothing')).toBeUndefined();
  });

  it('finds a team by id and returns the turn budget it was created with', () => {
    expect(store.teamById('team_1')?.turnBudget).toBe(10);
    expect(store.teamById('missing')).toBeUndefined();
  });
});

describe('resuming a session', () => {
  it('reads back the newest provider session id, so an agent comes back remembering', () => {
    store.startSession({
      id: 's1',
      agentId: 'agent_bob',
      providerSessionId: 'claude_yesterday',
      personaText: 'You are Bob.',
      startedAt: 100,
    });
    store.startSession({
      id: 's2',
      agentId: 'agent_bob',
      providerSessionId: 'claude_today',
      personaText: 'You are Bob.',
      startedAt: 200,
    });
    expect(store.lastProviderSessionOf('agent_bob')).toBe('claude_today');
  });

  it('says nothing for an agent that has never run, which is a first launch', () => {
    expect(store.lastProviderSessionOf('agent_alice')).toBeUndefined();
  });

  it('says nothing when the runtime named no session, rather than resuming a blank', () => {
    store.startSession({ id: 's3', agentId: 'agent_bob', personaText: 'x', startedAt: 300 });
    expect(store.lastProviderSessionOf('agent_bob')).toBeUndefined();
  });
});

describe('the mailbox', () => {
  const message = {
    id: 'm1',
    teamId: team.id,
    fromAgentId: alice.id,
    toAgentId: bob.id,
    body: 'review this',
    context: 'on my branch',
    idempotencyKey: 'k1',
    at: 10,
  };

  it('is a predicate, not a table', () => {
    store.commit(message);
    expect(store.undelivered(bob.id)).toHaveLength(1);

    store.markDelivered(['m1'], 20);
    expect(store.undelivered(bob.id)).toHaveLength(0);
    expect(store.byId('m1')?.deliveredAt).toBe(20);
  });

  it('collides a retried tool call with the row it already wrote', () => {
    store.commit(message);
    const retry = store.commit({ ...message, id: 'm2', body: 'review this (retry)' });
    expect(retry.id).toBe('m1');
    expect(store.forAgent(bob.id)).toHaveLength(1);
  });

  it('discriminates a user message from a peer message by one foreign key', () => {
    store.commit(message);
    store.commit({ id: 'm2', teamId: team.id, fromAgentId: null, toAgentId: bob.id, body: 'hi', at: 11 });

    const stream = store.forTeam(team.id);
    expect(stream.map((row) => row.fromAgentId)).toEqual([alice.id, null]);
  });
});

describe('tombstoning an agent', () => {
  it('keeps the transcript that mentions them', () => {
    store.commit({
      id: 'm1',
      teamId: team.id,
      fromAgentId: bob.id,
      toAgentId: alice.id,
      body: 'looks good',
      at: 10,
    });
    store.tombstoneAgent(bob.id, 99);

    // The row is still there, still attributable, so the team stream still renders it.
    expect(store.forAgent(alice.id)[0]?.fromAgentId).toBe(bob.id);
    expect(store.agentsOfTeam(team.id).map((agent) => agent.id)).toEqual([alice.id]);
    expect(store.agentsOfTeam(team.id, { includeDeleted: true })).toHaveLength(2);
  });
});

describe('what a turn leaves behind', () => {
  async function runDemoTurn(): Promise<void> {
    const clock = new VirtualClock();
    let orchestrator: Orchestrator;
    const runtimes = new Map<string, AgentRuntime>([
      [
        alice.id,
        new MockAgentRuntime({
          agentId: alice.id,
          clock,
          startupMs: 0,
          peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
          script: scenarios['alice-asks-bob'],
        }),
      ],
      [
        bob.id,
        new MockAgentRuntime({
          agentId: bob.id,
          clock,
          startupMs: 0,
          script: scenario('quiet').think('reading').say('ok').end(),
        }),
      ],
    ]);
    for (const agent of [alice, bob]) {
      store.startSession({
        id: `session_${agent.id}`,
        agentId: agent.id,
        personaText: `You are ${agent.name}.`,
        startedAt: 0,
      });
    }
    orchestrator = new Orchestrator({
      team,
      agents: [alice, bob],
      runtimes,
      store,
      clock,
      recorder: new SqliteRecorder(opened.db, team.id),
    });
    const starting = orchestrator.start();
    await clock.runAll();
    await starting;

    const done = orchestrator.promptFromUser(alice.id, 'get it reviewed');
    await clock.runAll();
    await orchestrator.settled();
    await done;
  }

  const rows = <T>(table: string): T[] =>
    opened.db.all<T>(sql.raw(`SELECT * FROM ${table} ORDER BY id`));

  it('persists the durable subset and not the deltas', async () => {
    await runDemoTurn();

    const messages = rows<{ kind: string; text: string }>('agent_messages');
    const answers = messages.filter((row) => row.kind === 'answer');
    const thoughts = messages.filter((row) => row.kind === 'thought');
    // Alice said two things and thought once. Ragged deltas produced dozens of events.
    expect(answers).toHaveLength(3);
    expect(thoughts).toHaveLength(2);
    // Ordered by id, which is time-ordered: Bob's short turn ends before Alice's long one.
    expect(answers.map((row) => row.text).join(' ')).toContain('I have the refresh path');
    expect(thoughts.map((row) => row.text).join(' ')).toContain('second pair of eyes');
  });

  it('reads the team\'s answers back for a pane rebuilt after a restart', async () => {
    await runDemoTurn();
    const answers = store.answersOfTeam(team.id);
    expect(answers).toHaveLength(3);
    // Time-ordered, and thinking is left where it is: no pane shows it while a turn is live,
    // so a restored pane must not start.
    expect(answers.map((answer) => answer.at)).toEqual([...answers.map((a) => a.at)].sort((l, r) => l - r));
    expect(answers.every((answer) => !answer.text.includes('second pair of eyes'))).toBe(true);
  });

  it('closes each turn with its stop reason', async () => {
    await runDemoTurn();
    const turns = rows<{ agent_id: string; stop_reason: string | null; ended_at: number | null }>(
      'turns',
    );
    expect(turns).toHaveLength(2);
    for (const turn of turns) {
      expect(turn.stop_reason).toBe('end_turn');
      expect(turn.ended_at).not.toBeNull();
    }
  });

  it('records tool calls with their terminal state', async () => {
    await runDemoTurn();
    const calls = rows<{ name: string; status: string; exit_code: number | null }>('tool_calls');
    expect(calls.map((call) => call.name)).toEqual(['read src/auth.ts', 'blobot_message_agent']);
    expect(calls.every((call) => call.status === 'completed')).toBe(true);
  });

  it('writes a peer message once, as a message row and not as an event', async () => {
    await runDemoTurn();
    const kinds = rows<{ kind: string }>('events').map((row) => row.kind);
    // agent_message_sent is transport; the messages row is the record.
    expect(kinds).not.toContain('agent_message_sent');
    expect(new Set(kinds)).toEqual(new Set(['usage_updated']));

    const peer = store.forTeam(team.id).filter((message) => message.fromAgentId !== null);
    expect(peer).toHaveLength(1);
    expect(peer[0]?.toAgentId).toBe(bob.id);
    expect(peer[0]?.context).toContain('committed on blobot/demo/alice');
  });

  it('links a turn back to the message that triggered it', async () => {
    await runDemoTurn();
    const turns = rows<{ agent_id: string; trigger_message_id: string | null }>('turns');
    const bobsTurn = turns.find((turn) => turn.agent_id === bob.id);
    expect(bobsTurn?.trigger_message_id).not.toBeNull();
    const trigger = store.byId(bobsTurn?.trigger_message_id ?? '');
    expect(trigger?.fromAgentId).toBe(alice.id);
  });
});

describe('deleting a team', () => {
  it('takes it out of the rail and leaves its transcript in the database', () => {
    store.commit({
      id: 'msg_1',
      teamId: team.id,
      fromAgentId: null,
      toAgentId: alice.id,
      body: 'go',
      at: 5,
    });

    store.tombstoneTeam(team.id, 10);

    expect(store.listTeams()).toHaveLength(0);
    expect(store.teamById(team.id)).toBeUndefined();
    expect(store.forTeam(team.id)).toHaveLength(1);
    expect(store.listTeams({ includeDeleted: true })).toHaveLength(1);
  });

  it('releases the name, so the same team can be made again', () => {
    store.tombstoneTeam(team.id, 10);
    expect(store.teamByName('demo')).toBeUndefined();

    store.createTeam({ ...team, id: 'team_2', createdAt: 11 });
    expect(store.teamByName('demo')?.id).toBe('team_2');
  });

  it('is idempotent, so a second confirm cannot rename the row twice', () => {
    store.tombstoneTeam(team.id, 10);
    store.tombstoneTeam(team.id, 20);
    const dead = store.listTeams({ includeDeleted: true })[0];
    expect(dead?.deletedAt).toBe(10);
    expect(dead?.name).toBe(`demo · deleted · ${team.id}`);
  });
});
