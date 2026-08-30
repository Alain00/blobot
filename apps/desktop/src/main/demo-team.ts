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
  type AgentRuntime,
  type OpenedDatabase,
  type Team,
} from '@blobot/core';
import type { RunningTeam } from './running-team.js';

/**
 * Demo mode: a real team, a real orchestrator, a real database — and mock runtimes.
 *
 * It ships (ticket 08) so the README's screenshot is something anyone can run in thirty
 * seconds without installing Claude Code or authenticating anything. It is deliberately not
 * the first-run default: defaulting to fake agents risks someone not noticing they are fake,
 * which is why the runtime label reads "Mock (demo)" everywhere it appears.
 *
 * Its database stays `:memory:` while a real team's is a file. A scripted replay is the one
 * transcript worth throwing away — persisting it would stack an identical conversation on
 * every launch, and the demo's whole claim is that you can run it and see the same thing.
 */

const team: Team = {
  id: 'team_demo',
  name: 'checkout',
  workspacePath: '~/code/storefront',
  workspaceKind: 'git',
  turnBudget: 10,
};

const alice: Agent = {
  id: 'alice',
  teamId: team.id,
  name: 'Alice',
  role: 'frontend',
  workspacePath: '~/.blobot/checkout/alice',
};

const bob: Agent = {
  id: 'bob',
  teamId: team.id,
  name: 'Bob',
  role: 'backend',
  workspacePath: '~/.blobot/checkout/bob',
};

export async function createDemoTeam(
  databasePath = ':memory:',
  migrationsFolder?: string,
): Promise<RunningTeam> {
  const clock = new SystemClock();
  const opened: OpenedDatabase = openDatabase({
    path: databasePath,
    ...(migrationsFolder === undefined ? {} : { migrationsFolder }),
  });
  const store = new SqliteStore(opened.db);
  store.createTeam({ ...team, createdAt: clock.now() });

  let orchestrator: Orchestrator;
  const runtimes = new Map<string, AgentRuntime>([
    [
      alice.id,
      new MockAgentRuntime({
        agentId: alice.id,
        clock,
        peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
        script: [
          scenarios['alice-asks-bob'],
          // The second turn is the one Bob's reply wakes, and it ends at a permission block:
          // ticket 14's `waiting` is the demo's last frame on purpose, because it is the one
          // state that needs a human and the one the scripted replay would otherwise never
          // reach.
          scenario('alice-follows-up')
            .think('Bob is right about the backoff.')
            .say('Good catch. I will add the backoff, but the stale build output is in the way.')
            .callTool('rm -rf dist', 'execute', { asks: true, durationMs: 700 })
            .say('Cleared. Pushing the backoff to my branch now.')
            .end(),
        ],
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

  const agents = [alice, bob];
  for (const agent of agents) {
    store.createAgent({
      ...agent,
      runtimeId: 'mock',
      branch: `blobot/${team.name}/${agent.name.toLowerCase()}`,
      createdAt: clock.now(),
    });
    store.startSession({
      id: `session_${agent.id}`,
      agentId: agent.id,
      personaText: composePersona(agent, team, agents),
      startedAt: clock.now(),
    });
  }

  orchestrator = new Orchestrator({
    team,
    agents,
    runtimes,
    store,
    clock,
    recorder: new SqliteRecorder(opened.db, team.id),
  });
  await orchestrator.start();

  return {
    team,
    agents,
    orchestrator,
    store,
    runtimeLabels: Object.fromEntries(agents.map((agent) => [agent.id, 'Mock (demo)'])),
    branches: Object.fromEntries(
      agents.map((agent) => [agent.id, `blobot/${team.name}/${agent.name.toLowerCase()}`]),
    ),
    demoMode: true,
    autoplayPrompt:
      'The checkout page double-charges on a double click. Fix the UI side and get the API side sorted too.',
    close: () => {
      orchestrator.dispose();
      opened.close();
    },
  };
}
