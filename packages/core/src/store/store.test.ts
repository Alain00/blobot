import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import { scenarios } from '../mock/scenarios/index.js';
import type { Agent, Team } from '../orchestrator/domain.js';
import type { Routine, RoutineOutcome, Schedule } from '../routines/domain.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import type { AgentRuntime } from '../runtime.js';
import { PICTURE_LIMIT } from '../pictures.js';
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

    // Runtime config is typed columns, and the TS schema is the allowlist. `runtime_options`
    // is the one free-form column, and it is not a hole in this rule: every value in it was
    // read back out of the runtime's own advertised option list a moment before it was
    // written, so the set of things it can hold is the provider's menu, not the user's
    // keyboard. Adding a column here is a decision to be made on purpose, which is what this
    // test is for. `trust` is the second decision it caught: three words of blobot's own
    // vocabulary, NULL meaning `normal`, and no runtime has ever advertised it. `verbosity`
    // is the third, and is the same shape for the same reason.
    expect(columnsOf('agents').sort()).toEqual(
      [
        'branch',
        'compaction',
        'created_at',
        'deleted_at',
        'executable_path',
        'hue',
        'id',
        'instructions',
        'model',
        'machine_kind',
        'machine_cpus',
        'machine_memory_bytes',
        'name',
        'profile_id',
        'role',
        'runtime_id',
        'runtime_options',
        'shape',
        'team_id',
        'trust',
        'verbosity',
        'workspace_path',
      ].sort(),
    );
    // The same rule holds for an agent that exists before any team does.
    expect(columnsOf('agent_profiles').sort()).toEqual(
      [
        'compaction',
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
        'runtime_options',
        'shape',
        'trust',
        'verbosity',
      ].sort(),
    );
    for (const table of ['agents', 'agent_profiles']) {
      expect(columnsOf(table).join(' ')).not.toMatch(/key|token|secret|config|env/i);
    }
  });

  it('keeps the runtime options as one column, and an empty choice as no column at all', () => {
    store.createAgent({
      id: 'agent_options',
      teamId: team.id,
      name: 'Mara',
      role: 'marketing',
      runtimeId: 'claude-code',
      runtimeOptions: { model: 'sonnet', effort: 'high' },
      workspacePath: '/tmp/mara',
      createdAt: 0,
    });
    store.createAgent({
      id: 'agent_defaults',
      teamId: team.id,
      name: 'Nils',
      role: 'design',
      runtimeId: 'claude-code',
      runtimeOptions: {},
      workspacePath: '/tmp/nils',
      createdAt: 0,
    });

    const rows = store.agentsOfTeam(team.id);
    expect(rows.find((row) => row.id === 'agent_options')?.runtimeOptions).toEqual({
      model: 'sonnet',
      effort: 'high',
    });
    // "The user chose nothing" has one spelling in the database, not two.
    expect(rows.find((row) => row.id === 'agent_defaults')?.runtimeOptions).toBeUndefined();
  });

  it('reads a runtime option column it cannot understand as no options', () => {
    // The one column here holding a shape the *provider* decides. A row written by a later
    // version, or by hand, has to degrade to "no choices" rather than to a failed launch.
    opened.db.run(sql.raw("UPDATE agents SET runtime_options = 'not json' WHERE id = 'alice'"));
    expect(store.agentsOfTeam(team.id).find((row) => row.id === 'alice')?.runtimeOptions).toBeUndefined();

    opened.db.run(sql.raw(`UPDATE agents SET runtime_options = '{"model":7}' WHERE id = 'alice'`));
    expect(store.agentsOfTeam(team.id).find((row) => row.id === 'alice')?.runtimeOptions).toBeUndefined();
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

  it('keeps a team icon as the image itself, and lets it be taken off again', () => {
    const icon = 'data:image/png;base64,iVBORw0KGgo=';
    store.createTeam({
      id: 'team_3',
      name: 'portfolio',
      workspacePath: '/portfolio',
      workspaceKind: 'git',
      icon,
      turnBudget: 4,
      createdAt: 20,
    });

    // Inlined rather than a path: the folder an icon was found in is a thing the user can move,
    // and a team whose mark vanished with its folder would be a bug the rail has to report.
    expect(store.teamById('team_3')?.icon).toBe(icon);

    // Absent is the resting state, not a missing value: a team with no icon is drawn from its
    // members, which is what every team looked like before this column existed.
    store.setTeamIcon('team_3', undefined);
    expect(store.teamById('team_3')?.icon).toBeUndefined();
    expect(store.teamById('team_1')?.icon).toBeUndefined();
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

/**
 * Ticket 08's trap, carried across a restart.
 *
 * A cancelled call reports `completed` with an explicit `exit: null`; a call that simply has no
 * exit code to give reports none at all. Both land in `exit_code` as a SQL NULL, so without
 * `exit_reported` a restored transcript would have to either call every one of the second kind
 * cancelled or lose every one of the first. The transcript's fold counts its failures off this,
 * so losing the distinction is a header that quietly says the wrong number.
 */
describe('an exit code that was reported, and one that never was', () => {
  function record(toolCallId: string, at: number, terminal: { exit?: number | null }): void {
    const identity = { agentId: alice.id, teamId: team.id, sessionId: 's1' } as const;
    const recorder = new SqliteRecorder(opened.db, team.id);
    recorder.turnStarted(alice.id, at);
    recorder.record({
      type: 'tool_call_started',
      toolCallId,
      title: toolCallId,
      kind: 'execute',
      at,
      ...identity,
    });
    recorder.record({
      type: 'tool_call_updated',
      toolCallId,
      status: 'completed',
      at: at + 1,
      ...terminal,
      ...identity,
    });
  }

  it('keeps them apart, so a restored line can say `exit null` and only where it is true', () => {
    store.startSession({ id: 's1', agentId: alice.id, personaText: 'x', startedAt: 0 });
    // The cancelled call: `completed`, and an explicit null is the only thing that betrays it.
    record('cancelled', 10, { exit: null });
    // A call that finished and had no exit code to report.
    record('no-exit', 20, {});
    // And an ordinary success, so a zero is not mistaken for "nothing reported".
    record('clean', 30, { exit: 0 });

    const byId = new Map(store.logOfTeam(team.id).tools.map((tool) => [tool.toolCallId, tool]));
    expect(byId.get('cancelled')).toHaveProperty('exit', null);
    expect(byId.get('no-exit')).not.toHaveProperty('exit');
    expect(byId.get('clean')).toHaveProperty('exit', 0);
  });
});

describe('a tool call named before its arguments arrived', () => {
  it('keeps the refined name rather than the placeholder it was announced under', () => {
    store.startSession({ id: 's1', agentId: alice.id, personaText: 'x', startedAt: 0 });
    const recorder = new SqliteRecorder(opened.db, team.id);
    recorder.turnStarted(alice.id, 1);
    const identity = { agentId: alice.id, teamId: team.id, sessionId: 's1' } as const;
    // What the Claude bridge emits for a bash call whose input is still streaming.
    recorder.record({
      type: 'tool_call_started',
      toolCallId: 'call_1',
      title: 'Terminal',
      kind: 'execute',
      at: 2,
      ...identity,
    });
    recorder.record({
      type: 'tool_call_updated',
      toolCallId: 'call_1',
      status: 'in_progress',
      title: 'git log --oneline -5',
      at: 3,
      ...identity,
    });
    recorder.record({
      type: 'tool_call_updated',
      toolCallId: 'call_1',
      status: 'completed',
      at: 4,
      ...identity,
    });

    const log = store.logOfTeam(team.id);
    expect(log.tools.map((tool) => tool.title)).toEqual(['git log --oneline -5']);
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

    const done = orchestrator.promptFromUser([alice.id], 'get it reviewed');
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

  it('logs what the activity column showed, from the rows that recorded it', async () => {
    await runDemoTurn();
    const log = store.logOfTeam(team.id);
    expect(log.tools.map((tool) => `${tool.title} ${tool.status}`).sort()).toEqual([
      'blobot_message_agent completed',
      'read src/auth.ts completed',
    ]);
    expect(log.turns).toHaveLength(2);
    expect(log.turns.every((turn) => turn.stopReason === 'end_turn')).toBe(true);
  });

  it('windows both halves together, so a turn ending never outlives its tool calls', async () => {
    await runDemoTurn();
    const bounded = store.logOfTeam(team.id, 2);
    const kept = [...bounded.tools, ...bounded.turns].map((entry) => entry.at);
    const oldestKept = Math.min(...kept);
    const whole = store.logOfTeam(team.id);
    const dropped = [...whole.tools, ...whole.turns]
      .map((entry) => entry.at)
      .filter((at) => !kept.includes(at));
    // Everything left out is older than everything kept, on both halves. Taking the last N of
    // each independently would have paired a turn ending with tool calls from another hour.
    expect(dropped.every((at) => at <= oldestKept)).toBe(true);
  });

  it('closes a call the process died holding, and concludes nothing about it', async () => {
    await runDemoTurn();
    // What a hard close leaves behind: a row that started and never reported. `running` is
    // `ended_at IS NULL`, so without the reconcile every restore from here on draws this with
    // the in-flight dots under an agent the status fold calls idle.
    opened.db.run(
      sql.raw(
        `insert into tool_calls (id, turn_id, agent_id, provider_tool_call_id, name, kind, status, started_at)
         select 'orphan', turn_id, agent_id, 'orphan', 'python3 - <<EOF', 'execute', 'in_progress', started_at
         from tool_calls limit 1`,
      ),
    );
    expect(store.logOfTeam(team.id).running.map((tool) => tool.toolCallId)).toEqual(['orphan']);

    expect(store.closeOrphanedCalls()).toBe(1);

    const log = store.logOfTeam(team.id);
    expect(log.running).toEqual([]);
    // Not `failed` and not `completed`. The tool may have done its work perfectly and only the
    // answer was lost, so the row says the one thing that is actually known.
    expect(log.tools.find((tool) => tool.toolCallId === 'orphan')?.status).toBe('unfinished');
  });

  it('leaves a call that is genuinely in flight alone', async () => {
    await runDemoTurn();
    opened.db.run(
      sql.raw(
        `insert into tool_calls (id, turn_id, agent_id, provider_tool_call_id, name, kind, status, started_at, ended_at)
         select 'done', turn_id, agent_id, 'done', 'read x', 'read', 'completed', started_at, started_at
         from tool_calls limit 1`,
      ),
    );
    // Nothing dangling, so the reconcile is a no-op and no settled row is rewritten.
    expect(store.closeOrphanedCalls()).toBe(0);
    expect(store.logOfTeam(team.id).tools.find((tool) => tool.toolCallId === 'done')?.status).toBe(
      'completed',
    );
  });

  it('says nothing for a team that has never run', () => {
    store.createTeam({
      id: 'team_2',
      name: 'quiet',
      workspacePath: '/repo',
      workspaceKind: 'git',
      turnBudget: 10,
      createdAt: 0,
    });
    expect(store.logOfTeam('team_2')).toEqual({
      running: [],
      tools: [],
      turns: [],
      compactions: [],
      pictures: [],
    });
  });
});

describe('a session blobot replaced', () => {
  it('survives a team switch, because the line is drawn in the transcript', () => {
    store.startSession({ id: 's1', agentId: alice.id, personaText: 'x', startedAt: 0 });
    const recorder = new SqliteRecorder(opened.db, team.id);
    recorder.record({
      type: 'context_compacted',
      agentId: alice.id,
      sessionId: 's1',
      at: 40,
      how: 'handoff',
      used: 110_000,
      ceiling: 120_000,
      measured: false,
      personaRefreshed: true,
      handoff: 'Migrating the old call sites; four left, all in checkout.',
      handoffPath: '/handoffs/alice-40.md',
    });

    // Ticket 06's lesson, applied to a line that would otherwise be live-only: an agent that
    // stopped remembering last week, with nothing in the transcript to say why, is the exact
    // shape of a bug report nobody can act on.
    const [compaction] = store.logOfTeam(team.id).compactions;
    expect(compaction?.how).toBe('handoff');
    expect(compaction?.used).toBe(110_000);
    expect(compaction?.ceiling).toBe(120_000);
    expect(compaction?.measured).toBe(false);
    expect(compaction?.personaRefreshed).toBe(true);
    expect(compaction?.handoff).toContain('four left');
    expect(compaction?.handoffPath).toBe('/handoffs/alice-40.md');
  });

  it('is not windowed out by a busy hour of tool calls', () => {
    store.startSession({ id: 's1', agentId: alice.id, personaText: 'x', startedAt: 0 });
    const recorder = new SqliteRecorder(opened.db, team.id);
    recorder.record({
      type: 'context_compacted',
      agentId: alice.id,
      sessionId: 's1',
      at: 1,
      how: 'command',
      used: 110_000,
      ceiling: 120_000,
      measured: true,
    });
    // Everything after it is newer, and a shared window would push the one row a reader goes
    // looking for out behind a run of ordinary work.
    recorder.turnStarted(alice.id, 10);
    const identity = { agentId: alice.id, sessionId: 's1' } as const;
    for (const at of [10, 20, 30, 40]) {
      recorder.record({
        type: 'tool_call_started',
        toolCallId: `call_${at}`,
        title: 'ls',
        kind: 'execute',
        at,
        ...identity,
      });
      recorder.record({
        type: 'tool_call_updated',
        toolCallId: `call_${at}`,
        status: 'completed',
        at: at + 1,
        ...identity,
      });
    }

    expect(store.logOfTeam(team.id, 2).compactions).toHaveLength(1);
  });

  it('draws nothing for a row written under a word this version does not know', () => {
    store.startSession({ id: 's1', agentId: alice.id, personaText: 'x', startedAt: 0 });
    const recorder = new SqliteRecorder(opened.db, team.id);
    // A future blobot's third mechanism, or a hand-edited row. Half a claim about somebody's
    // session is worse than none, so it is skipped rather than defaulted to `command`.
    recorder.record({
      type: 'context_compacted',
      agentId: alice.id,
      sessionId: 's1',
      at: 40,
      how: 'rewritten' as never,
      used: 1,
      ceiling: 2,
      measured: false,
    });

    expect(store.logOfTeam(team.id).compactions).toEqual([]);
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

describe('the context gauge', () => {
  const record = (agentId: string, at: number, used: number, size = 200_000): void => {
    new SqliteRecorder(opened.db, team.id).record({
      type: 'usage_updated',
      agentId,
      sessionId: `session_${agentId}`,
      at,
      used,
      size,
    });
  };

  beforeEach(() => {
    for (const agent of [alice, bob]) {
      store.startSession({
        id: `session_${agent.id}`,
        agentId: agent.id,
        personaText: 'you are an agent',
        startedAt: 0,
      });
    }
  });

  it('answers with each agent\'s last reading, so a switch back does not blank the gauge', () => {
    record(alice.id, 10, 4_000);
    record(alice.id, 20, 37_000, 1_000_000);
    record(bob.id, 15, 148_000);
    expect(store.lastUsageOfTeam(team.id)).toEqual({
      [alice.id]: { used: 37_000, size: 1_000_000 },
      [bob.id]: { used: 148_000, size: 200_000 },
    });
  });

  it('leaves out an agent that has never reported, rather than calling it empty', () => {
    record(alice.id, 10, 4_000);
    expect(Object.keys(store.lastUsageOfTeam(team.id))).toEqual([alice.id]);
  });

  it('skips the zero a cancelled turn leaves behind, and keeps the reading before it', () => {
    record(alice.id, 10, 37_000);
    // Both runtimes report `used: 0` when a turn is cancelled. It is a gauge reset, not an
    // empty context, and it is persisted like any other reading.
    record(alice.id, 20, 0);
    expect(store.lastUsageOfTeam(team.id)[alice.id]).toEqual({ used: 37_000, size: 200_000 });
  });
});

describe('attachments', () => {
  const png = {
    id: 'att_1',
    kind: 'image' as const,
    mimeType: 'image/png',
    bytes: 4,
    data: new Uint8Array([1, 2, 3, 4]),
    at: 5,
  };

  it('stores the bytes once and hands back the record without them', () => {
    const record = store.putAttachment(png);
    expect(record).toEqual({ id: 'att_1', kind: 'image', mimeType: 'image/png', bytes: 4 });
    expect(store.attachment('att_1')?.data).toEqual(png.data);
    expect(store.attachment('nothing')).toBeUndefined();
  });

  it('carries one blob on every message of a fan-out', () => {
    const record = store.putAttachment(png);
    for (const [id, agent] of [
      ['msg_1', alice],
      ['msg_2', bob],
    ] as const) {
      store.commit({
        id,
        teamId: team.id,
        fromAgentId: null,
        toAgentId: agent.id,
        body: 'look at this',
        at: 1,
        attachments: [record],
      });
    }

    // Two rows, one blob. The metadata is on each; the bytes are stored once.
    expect(store.forAgent(alice.id)[0]?.attachments).toEqual([record]);
    expect(store.forAgent(bob.id)[0]?.attachments).toEqual([record]);
    expect(
      opened.db.all<{ n: number }>(sql.raw('SELECT COUNT(*) AS n FROM attachments'))[0]?.n,
    ).toBe(1);
  });

  it('never returns the bytes with a transcript', () => {
    const record = store.putAttachment(png);
    store.commit({
      id: 'msg_1',
      teamId: team.id,
      fromAgentId: null,
      toAgentId: alice.id,
      body: 'look',
      at: 1,
      attachments: [record],
    });
    // A snapshot of two hundred messages must not carry two hundred images.
    expect(store.forTeam(team.id)[0]?.attachments?.[0]).not.toHaveProperty('data');
  });

  it('outlives the team it was sent to, because the transcript does', () => {
    const record = store.putAttachment(png);
    store.commit({
      id: 'msg_1',
      teamId: team.id,
      fromAgentId: null,
      toAgentId: alice.id,
      body: 'look',
      at: 1,
      attachments: [record],
    });
    store.tombstoneTeam(team.id, 2);

    // Deleting a team tombstones it and keeps the transcript, so nothing removes these bytes.
    // Stated rather than discovered: see `.scratch/composer-attachments/04`.
    expect(store.attachment('att_1')).toBeDefined();
    expect(store.forTeam(team.id)[0]?.attachments).toHaveLength(1);
  });
});

describe('the transcript window', () => {
  /**
   * An interleaved conversation: the user asks at every even tick and an agent answers at every
   * odd one. That shape is the point of the test — the two halves live in different tables and
   * are merge-sorted by the pane, so a window that bounds them independently comes back with a
   * reply whose question fell off the top.
   */
  const seed = (turnCount: number): void => {
    opened.db.run(
      sql.raw(
        `INSERT INTO sessions (id, agent_id, persona_text, started_at) VALUES ('s1', '${alice.id}', 'p', 0)`,
      ),
    );
    opened.db.run(
      sql.raw(`INSERT INTO turns (id, agent_id, session_id, started_at) VALUES ('t1', '${alice.id}', 's1', 0)`),
    );
    for (let index = 0; index < turnCount; index += 1) {
      store.commit({
        id: `m${index}`,
        teamId: team.id,
        fromAgentId: null,
        toAgentId: alice.id,
        body: `question ${index}`,
        at: index * 2,
      });
      opened.db.run(
        sql.raw(
          `INSERT INTO agent_messages (id, turn_id, agent_id, kind, text, at)
           VALUES ('a${index}', 't1', '${alice.id}', 'answer', 'answer ${index}', ${index * 2 + 1})`,
        ),
      );
    }
  };

  it('cuts both halves at one time, so no answer arrives without its question', () => {
    seed(60);
    const window = store.transcriptOfTeam(team.id, { limit: 20 });

    // Every answer in the window has the question it answers, and every question its answer:
    // the two are one tick apart, so a ragged edge shows up as an unpaired index.
    const questions = new Set(window.messages.map((message) => message.at + 1));
    const answers = new Set(window.answers.map((answer) => answer.at));
    expect([...answers].filter((at) => !questions.has(at))).toEqual([]);
    expect([...questions].filter((at) => !answers.has(at))).toEqual([]);
    expect(window.more).toBe(true);
  });

  it('returns the recent end, ascending, and says there is more above it', () => {
    seed(60);
    const window = store.transcriptOfTeam(team.id, { limit: 20 });

    // Each half ascending, which is what the store promises. The two are *not* interleaved
    // here and must not be: they live in different tables and the pane merge-sorts them.
    const ascending = (times: number[]): boolean =>
      times.every((at, index) => index === 0 || at > (times[index - 1] as number));
    expect(ascending(window.messages.map((row) => row.at))).toBe(true);
    expect(ascending(window.answers.map((row) => row.at))).toBe(true);
    // The newest thing the team said is in it. A window that reached back from the *start*
    // would be a pane that opens on the beginning of a week-old conversation.
    const times = [...window.messages.map((row) => row.at), ...window.answers.map((row) => row.at)];
    expect(Math.max(...times)).toBe(59 * 2 + 1);
    expect(window.more).toBe(true);
  });

  it('pages upward without repeating or skipping a turn', () => {
    seed(60);
    const first = store.transcriptOfTeam(team.id, { limit: 20 });
    const before = Math.min(
      ...first.messages.map((row) => row.at),
      ...first.answers.map((row) => row.at),
    );
    const second = store.transcriptOfTeam(team.id, { limit: 20, before });

    const bodies = [...second.messages, ...first.messages].map((row) => row.body);
    expect(new Set(bodies).size).toBe(bodies.length);
    // Contiguous: the two pages together are an unbroken run of questions, so nothing between
    // them was dropped by the cutoff.
    const indexes = bodies.map((body) => Number(body.replace('question ', ''))).sort((l, r) => l - r);
    expect(indexes.at(-1)! - indexes[0]!).toBe(indexes.length - 1);
  });

  it('says there is nothing above a conversation it can hold whole', () => {
    seed(5);
    const window = store.transcriptOfTeam(team.id, { limit: 20 });
    expect(window.messages).toHaveLength(5);
    expect(window.answers).toHaveLength(5);
    expect(window.more).toBe(false);
  });

  it('is empty and settled for a team that has said nothing', () => {
    expect(store.transcriptOfTeam(team.id)).toEqual({ messages: [], answers: [], more: false });
  });
});

describe('Routines', () => {
  const daily: Schedule = { kind: 'daily', hour: 9, minute: 0 };
  const make = (over: Partial<Routine> = {}): Routine =>
    store.createRoutine({
      id: 'rt_1',
      agentId: alice.id,
      name: 'hacker news',
      prompt: 'summarise hacker news and send it back to me',
      schedule: daily,
      armed: false,
      createdAt: 1_000,
      ...over,
    });

  it('round-trips each of the three schedule shapes, and stores no expression', () => {
    make({ id: 'rt_h', schedule: { kind: 'hourly', minute: 5 } });
    make({ id: 'rt_d', schedule: daily });
    make({ id: 'rt_w', schedule: { kind: 'weekly', weekday: 1, hour: 18, minute: 30 } });

    expect(store.routineById('rt_h')?.schedule).toEqual({ kind: 'hourly', minute: 5 });
    expect(store.routineById('rt_d')?.schedule).toEqual(daily);
    expect(store.routineById('rt_w')?.schedule).toEqual({
      kind: 'weekly',
      weekday: 1,
      hour: 18,
      minute: 30,
    });
  });

  it('lands disarmed, because a person is the only thing that arms one', () => {
    make();
    expect(store.routineById('rt_1')?.armed).toBe(false);
    store.setRoutineArmed('rt_1', true);
    expect(store.routineById('rt_1')?.armed).toBe(true);
  });

  it('belongs to one agent on one team, and is found by that agent', () => {
    make();
    make({ id: 'rt_2', agentId: bob.id, name: 'standup' });
    expect(store.routinesOfAgent(alice.id).map((one) => one.id)).toEqual(['rt_1']);
    expect(store.allRoutines()).toHaveLength(2);
  });

  it('settles a moment so the same missed firing is never counted twice', () => {
    make();
    store.settleRoutine('rt_1', 9_000);
    expect(store.routineById('rt_1')?.lastSettledAt).toBe(9_000);
  });

  it('keeps a tombstoned Routine out of the scheduler’s reach', () => {
    make();
    store.tombstoneRoutine('rt_1', 5_000);
    expect(store.allRoutines()).toEqual([]);
    // The run history outlives it: the rows still point at a row that exists.
    expect(store.routineById('rt_1')).toBeDefined();
  });

  it('counts consecutive failures, and stops at the last run that worked', () => {
    make();
    const run = (id: string, firedAt: number, outcome: RoutineOutcome, reason?: string): void => {
      store.recordRoutineRun({ id, routineId: 'rt_1', firedAt, outcome, ...(reason === undefined ? {} : { reason }) });
    };
    run('a', 1, 'ran');
    run('b', 2, 'skipped', 'blobot was not open');
    run('c', 3, 'stopped', 'needed permission for git push');
    expect(store.consecutiveRoutineFailures('rt_1')).toBe(2);

    run('d', 4, 'ran');
    expect(store.consecutiveRoutineFailures('rt_1')).toBe(0);
  });

  it('reports a report nobody has read, and forgets it once the pane is opened', () => {
    make();
    store.recordRoutineRun({ id: 'a', routineId: 'rt_1', firedAt: 10, outcome: 'ran' });
    store.recordRoutineRun({ id: 'b', routineId: 'rt_1', firedAt: 20, outcome: 'skipped' });

    // A skipped firing started no turn, so there is nothing to have read.
    expect(store.unseenRoutineRuns([alice.id, bob.id])).toEqual([{ agentId: alice.id, firedAt: 10 }]);

    store.markRoutineRunsSeen(alice.id, 30);
    expect(store.unseenRoutineRuns([alice.id, bob.id])).toEqual([]);
  });

  it('records which firing delivered a message, and nothing on an ordinary one', () => {
    make();
    store.recordRoutineRun({ id: 'run_1', routineId: 'rt_1', firedAt: 10, outcome: 'ran' });
    store.commit({
      id: 'm1',
      teamId: team.id,
      fromAgentId: null,
      toAgentId: alice.id,
      body: 'summarise hacker news',
      at: 10,
      routineRunId: 'run_1',
    });
    store.commit({
      id: 'm2',
      teamId: team.id,
      fromAgentId: null,
      toAgentId: alice.id,
      body: 'hello',
      at: 20,
    });

    expect(store.byId('m1')?.routineRunId).toBe('run_1');
    expect(store.byId('m2')?.routineRunId).toBeUndefined();
  });
});

describe('a Handbook', () => {
  const entry = (id: string, text: string, at: number, source: 'told' | 'noticed' = 'told') => ({
    id,
    teamId: team.id,
    agentName: alice.name,
    text,
    source,
    createdAt: at,
  });

  it('is written as one act and read oldest first', () => {
    store.recordHandbookEntries([
      entry('e1', 'we deploy on Fridays', 10),
      entry('e2', 'the ICP is a two-person agency', 10, 'noticed'),
    ]);

    expect(store.handbookOf(team.id, alice.name).map((row) => [row.text, row.source])).toEqual([
      ['we deploy on Fridays', 'told'],
      ['the ICP is a two-person agency', 'noticed'],
    ]);
  });

  it('belongs to one agent on one team, and to no other', () => {
    store.recordHandbookEntries([entry('e1', 'ours', 10)]);

    expect(store.handbookOf(team.id, bob.name)).toEqual([]);
    expect(store.handbookOf('team_other', alice.name)).toEqual([]);
  });

  // The key is the name pair, so nothing here goes through `agents`. This is what lets a
  // Handbook come back when somebody removed from a roster is added again — `editTeamRoster`
  // mints a fresh id for every joiner and never revives a tombstone, so an id key would lose it.
  it('outlives the agent row it belongs to', () => {
    store.recordHandbookEntries([entry('e1', 'we deploy on Fridays', 10)]);
    store.tombstoneAgent(alice.id, 20);

    expect(store.handbookOf(team.id, alice.name)).toHaveLength(1);
  });

  // The number is what `replaces` names, so it must mean the same entry next week as it did
  // when the persona was composed. Counted over every entry the Handbook ever had, so a removal
  // leaves a gap rather than renumbering everything under it while an agent is reading.
  // One call writes its whole list in one millisecond, so nothing about time or id can order
  // them. A briefing that comes back in an order nobody wrote it in makes every number a lie.
  it('numbers a call in the order the agent wrote it', () => {
    store.recordHandbookEntries([
      entry('e3', 'the client is Vlue', 10),
      entry('e1', 'nothing ships on a Friday', 10),
      entry('e2', 'the tone in /marketing is the one', 10),
    ]);

    expect(store.handbookOf(team.id, alice.name).map((row) => [row.ordinal, row.text])).toEqual([
      [1, 'the client is Vlue'],
      [2, 'nothing ships on a Friday'],
      [3, 'the tone in /marketing is the one'],
    ]);
  });

  it('numbers entries so that a removal never renumbers the ones after it', () => {
    store.recordHandbookEntries([
      entry('e1', 'first', 10),
      entry('e2', 'second', 20),
      entry('e3', 'third', 30),
    ]);
    store.removeHandbookEntry('e2', 40);

    expect(store.handbookOf(team.id, alice.name).map((row) => [row.ordinal, row.text])).toEqual([
      [1, 'first'],
      [3, 'third'],
    ]);

    store.recordHandbookEntries([entry('e4', 'fourth', 50)]);
    expect(store.handbookOf(team.id, alice.name).map((row) => row.ordinal)).toEqual([1, 3, 4]);
  });

  it('keeps a removed entry as a row, and out of the Handbook', () => {
    store.recordHandbookEntries([entry('e1', 'wrong now', 10), entry('e2', 'right now', 20)]);
    store.removeHandbookEntry('e1', 30);

    expect(store.handbookOf(team.id, alice.name).map((row) => row.id)).toEqual(['e2']);
    // The transcript block that disclosed the write names it and is never rewritten, so the
    // row has to still be readable after the entry is gone.
    expect(store.handbookEntryById('e1')?.removedAt).toBe(30);
  });

  it('is not removed twice', () => {
    store.recordHandbookEntries([entry('e1', 'once', 10)]);
    store.removeHandbookEntry('e1', 30);
    store.removeHandbookEntry('e1', 40);

    expect(store.handbookEntryById('e1')?.removedAt).toBe(30);
  });

  // Both the rows and the events, and they answer different questions. The rows are the
  // Handbook; this is what happened in a turn, and it is the only record of the two things a
  // row cannot hold: that one call wrote these entries together, and that a call was refused
  // for a full Handbook, where nothing was written at all.
  it('keeps a write as an event, and reads what the entries say now', () => {
    store.recordHandbookEntries([entry('e1', 'wrong now', 10), entry('e2', 'right now', 10)]);
    store.recordHandbookWrite('w1', team.id, {
      kind: 'recorded',
      agentId: alice.id,
      at: 10,
      entryIds: ['e1', 'e2'],
      withdrewIds: [],
    });
    store.removeHandbookEntry('e1', 20);

    const writes = store.handbookWritesOfTeam(team.id, 0);
    expect(writes).toHaveLength(1);
    // Live rather than remembered: a block that offered to remove something already gone would
    // be two surfaces disagreeing about one row.
    expect(writes[0]?.entries.map((row) => [row.text, row.removedAt])).toEqual([
      ['wrong now', 20],
      ['right now', undefined],
    ]);
  });

  it('keeps a refusal, which is the only write with no rows behind it', () => {
    store.recordHandbookWrite('w2', team.id, { kind: 'full', agentId: alice.id, at: 30 });

    const writes = store.handbookWritesOfTeam(team.id, 0);
    expect(writes[0]?.kind).toBe('full');
    expect(writes[0]?.entries).toEqual([]);
  });

  it('does not carry a briefing from last month into this afternoon', () => {
    store.recordHandbookWrite('w3', team.id, { kind: 'full', agentId: alice.id, at: 10 });
    expect(store.handbookWritesOfTeam(team.id, 20)).toEqual([]);
  });

  // A Handbook is live context for a team, and dies with it. The transcript is a record of what
  // happened and is kept — the difference is deliberate and is ticket 07's.
  it('dies with the team, and the transcript does not', () => {
    store.recordHandbookEntries([entry('e1', 'we deploy on Fridays', 10)]);
    store.commit({
      id: 'm1',
      teamId: team.id,
      fromAgentId: null,
      toAgentId: alice.id,
      body: 'hello',
      at: 10,
    });

    store.tombstoneTeam(team.id, 50);

    expect(store.handbookOf(team.id, alice.name)).toEqual([]);
    expect(store.forTeam(team.id)).toHaveLength(1);
    // Tombstoned, never deleted: rows are never removed here, and a cascade would tear holes
    // in a transcript.
    expect(store.handbooksOfTeam(team.id)).toHaveLength(1);
  });
});

describe('dictation settings', () => {
  it('is the default until saved, and comes back whole', () => {
    const store = new SqliteStore(opened.db);
    expect(store.dictationSettings()).toEqual({
      enabled: false,
      transcriber: '',
      modelId: '',
      providerId: '',
      readiness: '',
      measuredModelId: '',
      at: 0,
    });
    store.saveDictationSettings({
      enabled: true,
      transcriber: 'local',
      modelId: 'turbo',
      providerId: '',
      readiness: 'fit',
      measuredRtf: 0.12,
      measuredModelId: 'turbo',
      at: 5,
    });
    expect(store.dictationSettings()).toEqual({
      enabled: true,
      transcriber: 'local',
      modelId: 'turbo',
      providerId: '',
      readiness: 'fit',
      measuredRtf: 0.12,
      measuredModelId: 'turbo',
      at: 5,
    });
    // One row: a second save replaces it rather than adding a second.
    store.saveDictationSettings({ ...store.dictationSettings(), enabled: false, at: 6 });
    expect(store.dictationSettings().enabled).toBe(false);
    expect(store.dictationSettings().measuredRtf).toBe(0.12);
  });
});

/**
 * A Picture's bytes, and the one place they are decided about.
 *
 * The measuring is the store's rather than an adapter's on purpose: what the bytes are has one
 * answer whatever runtime asked, so no two runtimes can disagree about what blobot will draw.
 */
describe('keeping a picture', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  it('measures the bytes and hands back an id, never the runtime word for what they are', () => {
    const kept = store.keepPicture({ agentId: alice.id, source: 'observed', data: PNG, at: 5 });
    expect(kept).toEqual({ pictureId: expect.any(String), width: 1, height: 1, bytes: PNG.byteLength });
    const back = 'pictureId' in kept ? store.picture(kept.pictureId) : undefined;
    expect(back?.mimeType).toBe('image/png');
    expect(Buffer.from(back?.data ?? new Uint8Array())).toEqual(PNG);
  });

  it('says its bytes did not arrive whole for a file that stopped early', () => {
    const kept = store.keepPicture({
      agentId: alice.id,
      source: 'observed',
      data: PNG.subarray(0, 12),
      at: 5,
    });
    expect(kept).toEqual({ notDrawn: 'unreadable', bytes: 12 });
  });

  it('refuses one past the ceiling without reading it', () => {
    const kept = store.keepPicture({
      agentId: alice.id,
      source: 'observed',
      data: new Uint8Array(PICTURE_LIMIT + 1),
      at: 5,
    });
    expect(kept).toEqual({ notDrawn: 'too_large', bytes: PICTURE_LIMIT + 1 });
  });

  it('has nothing to fetch for an id nothing wrote, which is the replay case', () => {
    expect(store.picture('pic_nothing')).toBeUndefined();
  });
});
