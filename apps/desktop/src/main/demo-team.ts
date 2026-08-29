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

/**
 * Demo mode: a real team, a real orchestrator, a real database — and mock runtimes.
 *
 * It ships (ticket 08) so the README's screenshot is something anyone can run in thirty
 * seconds without installing Claude Code or authenticating anything. It is deliberately not
 * the first-run default: defaulting to fake agents risks someone not noticing they are fake,
 * which is why the runtime label reads "Mock (demo)" everywhere it appears.
 */
export interface DemoTeam {
  readonly team: Team;
  readonly agents: readonly Agent[];
  readonly orchestrator: Orchestrator;
  readonly store: SqliteStore;
  readonly runtimeLabels: Record<string, string>;
  close(): void;
}

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
): Promise<DemoTeam> {
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
          scenario('alice-follows-up')
            .think('Bob is right about the backoff.')
            .say('Good catch — I will add the backoff and push it to my branch.')
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
    close: () => {
      orchestrator.dispose();
      opened.close();
    },
  };
}

export const demoBranchOf = (agent: Agent): string =>
  `blobot/${team.name}/${agent.name.toLowerCase()}`;
