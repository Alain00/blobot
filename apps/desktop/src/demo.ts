/**
 * Demo mode, headless: a two-agent team on mock runtimes, driven by the real orchestrator.
 * The mailbox, the wake policy, the envelope and the turn budget are all the shipping ones —
 * only the runtimes are fake.
 *
 *   pnpm demo
 */
import {
  demoScripts,
  DEFAULT_DEMO_SCRIPT,
  type DemoScriptName,
} from './main/demo-team.js';
import {
  MockAgentRuntime,
  Orchestrator,
  SqliteRecorder,
  SqliteStore,
  SystemClock,
  composePersona,
  openDatabase,
  scenario,
  scenarios,
  type Agent,
  type AgentEvent,
  type AgentRuntime,
  type AgentStatus,
  type Team,
} from '@blobot/core';

const team: Team = {
  id: 'team_demo',
  name: 'demo',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};

const alice: Agent = {
  id: 'alice',
  teamId: team.id,
  name: 'Alice',
  role: 'frontend',
  workspacePath: '/repo/.agents/alice',
};
const bob: Agent = {
  id: 'bob',
  teamId: team.id,
  name: 'Bob',
  role: 'reviewer',
  workspacePath: '/repo/.agents/bob',
};

/**
 * `--scenario=<name>` picks the same run the app's `--demo-scenario` picks, off the same table:
 * a headless read of the run you are about to look at is the faster loop, and the two front
 * ends disagreeing about what `forgotten-handoff` means would make it a useless one.
 */
const scriptName = ((): DemoScriptName => {
  const asked = process.argv
    .find((arg) => arg.startsWith('--scenario='))
    ?.slice('--scenario='.length);
  if (asked === undefined) return DEFAULT_DEMO_SCRIPT;
  if (asked in demoScripts) return asked as DemoScriptName;
  const listing = Object.entries(demoScripts)
    .map(([name, entry]) => `  ${name.padEnd(20)}${entry.summary}`)
    .join('\n');
  process.stderr.write(
    `${asked === '?' ? '' : `no demo scenario '${asked}'\n`}demo scenarios:\n${listing}\n`,
  );
  process.exit(asked === '?' ? 0 : 1);
})();
const script = demoScripts[scriptName];

const clock = new SystemClock();
const started = clock.now();
let orchestrator: Orchestrator;

// The real schema, in memory: the demo exercises the store rather than pretending it exists.
const { db, close } = openDatabase({ path: ':memory:' });
const store = new SqliteStore(db);
store.createTeam({ ...team, createdAt: clock.now() });

const runtimes = new Map<string, AgentRuntime>([
  [
    alice.id,
    new MockAgentRuntime({
      agentId: alice.id,
      clock,
      peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
      script: script.alice,
    }),
  ],
  [
    bob.id,
    new MockAgentRuntime({
      agentId: bob.id,
      clock,
      peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
      script: script.bob,
    }),
  ],
]);

for (const agent of [alice, bob]) {
  store.createAgent({
    ...agent,
    runtimeId: 'mock',
    branch: `blobot/${team.name}/${agent.name.toLowerCase()}`,
    createdAt: clock.now(),
  });
  store.startSession({
    id: `session_${agent.id}`,
    agentId: agent.id,
    // Stored because ticket 06's refusability is only auditable if what an agent was told
    // can be recovered later.
    personaText: composePersona(agent, team, [alice, bob]),
    startedAt: clock.now(),
  });
}

orchestrator = new Orchestrator({
  team,
  agents: [alice, bob],
  runtimes,
  store,
  clock,
  recorder: new SqliteRecorder(db, team.id),
});

const name = (agentId: string): string => (agentId === alice.id ? 'alice' : 'bob  ');

orchestrator.onEvent((event) => print(event));
orchestrator.onStatusChange((agentId, status: AgentStatus) => {
  write(clock.now(), name(agentId), `status    ${status}`);
});
orchestrator.onBudgetExhausted((exhausted) => {
  write(clock.now(), 'team ', `budget    ${exhausted.turnsUsed}/${exhausted.turnBudget} · continue?`);
});
// Silent on this script, because Alice does call the tool. It is listened for anyway: the run
// is what proves the observation stays quiet on a team that is working properly.
orchestrator.onSilentHandoff((observed) => {
  write(observed.at, name(observed.agentId), `handoff   named ${observed.named.join(', ')} · no message sent`);
});

function write(at: number, who: string, line: string): void {
  process.stdout.write(`${String(at - started).padStart(6, ' ')}ms ${who} ${line}\n`);
}

function print(event: AgentEvent): void {
  write(event.at, name(event.agentId), describe(event));
}

function describe(event: AgentEvent): string {
  switch (event.type) {
    case 'agent_thought_delta':
      return `thought   ${JSON.stringify(event.text)}`;
    case 'agent_message_delta':
      return `delta     ${JSON.stringify(event.text)}`;
    case 'agent_message_completed':
      return `message   ${JSON.stringify(event.text)}`;
    case 'tool_call_started':
      return `tool      ${event.title} (${event.kind}) started`;
    case 'tool_call_updated':
      return `tool      ${event.toolCallId} ${event.status}${event.exit === null ? ' exit=null' : ''}${event.error === undefined ? '' : ` error=${event.error}`}`;
    case 'agent_message_sent':
      return `peer      → ${event.to}: ${JSON.stringify(event.message)}`;
    case 'usage_updated':
      return `usage     ${event.used}/${event.size}`;
    case 'turn_ended':
      return `turn      ${event.turnId} ${event.stopReason}`;
    case 'error':
      return `error     ${event.message}`;
  }
}

process.stdout.write(`--- Bob's persona ---\n${composePersona(bob, team, [alice, bob])}\n---\n\n`);

await orchestrator.start();
await orchestrator.promptFromUser([alice.id], script.prompt);
await orchestrator.settled();

process.stdout.write(`\n${orchestrator.turnsThisPrompt} agent turns from one user prompt.\n`);

const counts = Object.entries(store.transcriptCounts())
  .map(([table, n]) => `${n} ${table}`)
  .join(', ');
process.stdout.write(`persisted: ${counts}\n`);
close();
