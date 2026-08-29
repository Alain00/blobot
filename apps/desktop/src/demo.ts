/**
 * Demo mode, headless: a two-agent team on mock runtimes, driven by the real orchestrator.
 * The mailbox, the wake policy, the envelope and the turn budget are all the shipping ones —
 * only the runtimes are fake.
 *
 *   pnpm demo
 */
import {
  MockAgentRuntime,
  Orchestrator,
  SystemClock,
  composePersona,
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

const clock = new SystemClock();
const started = clock.now();
let orchestrator: Orchestrator;

const runtimes = new Map<string, AgentRuntime>([
  [
    alice.id,
    new MockAgentRuntime({
      agentId: alice.id,
      clock,
      peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
      script: [scenarios['alice-asks-bob'], scenario('after').say('Good catch — fixing.').end()],
    }),
  ],
  [
    bob.id,
    new MockAgentRuntime({
      agentId: bob.id,
      clock,
      peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
      script: scenarios['bob-reviews'],
    }),
  ],
]);

orchestrator = new Orchestrator({ team, agents: [alice, bob], runtimes, clock });

const name = (agentId: string): string => (agentId === alice.id ? 'alice' : 'bob  ');

orchestrator.onEvent((event) => print(event));
orchestrator.onStatusChange((agentId, status: AgentStatus) => {
  write(clock.now(), name(agentId), `status    ${status}`);
});
orchestrator.onBudgetExhausted((exhausted) => {
  write(clock.now(), 'team ', `budget    ${exhausted.turnsUsed}/${exhausted.turnBudget} — continue?`);
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
await orchestrator.promptFromUser(alice.id, 'Get the session refresh reviewed before we ship.');
await orchestrator.settled();

process.stdout.write(`\n${orchestrator.turnsThisPrompt} agent turns from one user prompt.\n`);
