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
  type ScenarioScript,
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
  // Alice leads, so the demo shows the team pane addressing somebody rather than asking for an
  // `@`. Bob is still a mention away.
  leadAgentId: 'alice',
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

/**
 * One thing the demo can be a demonstration *of*: the scripts both agents play and the user
 * prompt that makes them mean something.
 *
 * The prompt travels with the scripts rather than beside them, because several of these are
 * only legible together — `forgotten-handoff` needs a prompt that names Bob, or the observation
 * it exists to show correctly stays silent and the run looks like the feature is broken.
 */
export interface DemoScript {
  /** What this run is a demonstration of. Printed by `--demo-scenario=?`. */
  readonly summary: string;
  readonly prompt: string;
  readonly alice: ScenarioScript;
  readonly bob: ScenarioScript;
}

/**
 * The second turn of the default run, which is the one Bob's reply wakes: it ends at a
 * permission block, because ticket 14's `waiting` is the demo's last frame on purpose. It is
 * the one state that needs a human and the one a scripted replay would otherwise never reach.
 */
const aliceFollowsUp = scenario('alice-follows-up')
  .think('Bob is right about the backoff.')
  .say('Good catch. I will add the backoff, but the stale build output is in the way.')
  .callTool('rm -rf dist', 'execute', { asks: true, durationMs: 700 })
  .say('Cleared. Pushing the backoff to my branch now.')
  .end();

export const demoScripts = {
  /** The shipping demo, and the README's screenshot. Two agents working, ending on a question. */
  handoff: {
    summary: 'Alice hands the review to Bob, Bob answers, Alice stops to ask you something',
    prompt:
      'The checkout page double-charges on a double click. Fix the UI side and get the API side sorted too.',
    alice: [scenarios['alice-asks-bob'], aliceFollowsUp],
    bob: scenarios['bob-reviews'],
  },
  /**
   * The same team, with the handoff that never happens. Bob is named by the user and never
   * woken, so this run is one turn long and ends on the system line rather than on a question.
   */
  'forgotten-handoff': {
    summary: 'Alice says she will ask Bob and never does, and blobot says so under the turn',
    prompt:
      'The checkout page double-charges on a double click. Fix the UI side and get Bob onto the API side.',
    alice: scenarios['promises-bob-and-forgets'],
    bob: scenarios['bob-reviews'],
  },
  /**
   * The ending a user reads as "the agent got worse and I could not tell why": Alice stops
   * mid-sentence because her context is full. The gauge in the activity column is high before
   * the turn ends, and the transcript says why it ended, which is the pair worth demonstrating.
   */
  'out-of-room': {
    summary: 'Alice runs out of context mid-answer, and the transcript says so',
    prompt: 'Rename the cart item shape everywhere it is used, and tell me the call sites.',
    alice: scenarios['runs-out-of-room'],
    bob: scenarios['bob-reviews'],
  },
  /**
   * One turn, twelve steps, one answer. The shape a long piece of real work has, and the run
   * the transcript's fold is reviewed against: shut, this is a caption, one mono line and a
   * paragraph; flat, it was a bulleted list of intentions with the answer buried under it.
   */
  'many-steps': {
    summary: 'Alice works through a list of edits and answers at the end',
    prompt: 'Build the top-down desk scene and wire it into the page.',
    alice: scenarios['works-through-a-list'],
    bob: scenarios['bob-reviews'],
  },
} as const satisfies Record<string, DemoScript>;

export type DemoScriptName = keyof typeof demoScripts;

export const DEFAULT_DEMO_SCRIPT: DemoScriptName = 'handoff';

export async function createDemoTeam(
  databasePath = ':memory:',
  migrationsFolder?: string,
  scriptName: DemoScriptName = DEFAULT_DEMO_SCRIPT,
): Promise<RunningTeam> {
  const script: DemoScript = demoScripts[scriptName];
  const clock = new SystemClock();
  const opened: OpenedDatabase = openDatabase({
    path: databasePath,
    ...(migrationsFolder === undefined ? {} : { migrationsFolder }),
  });
  const store = new SqliteStore(opened.db);
  store.createTeam({ ...team, createdAt: clock.now() });

  /**
   * What the demo team's sessions offer under `/`.
   *
   * Two shapes on purpose, because they are the two populations the palette has: a skill the
   * repository ships, and a built-in blobot vouches for. Alice and Bob differ, which is the
   * fact the composer has to get right — a command belongs to one teammate's session, not to
   * the team.
   */
  const aliceCommands = [
    { name: 'house-style', description: 'How this repository writes things' },
    { name: 'code-review', description: 'Review the changes on this branch' },
    { name: 'compact', description: 'Free up context by summarizing the conversation so far' },
  ];
  const bobCommands = [
    { name: 'code-review', description: 'Review the changes on this branch' },
    { name: 'security-review', description: 'Complete a security review of the pending changes' },
  ];

  let orchestrator: Orchestrator;
  const runtimes = new Map<string, AgentRuntime>([
    [
      alice.id,
      new MockAgentRuntime({
        agentId: alice.id,
        clock,
        commands: aliceCommands,
        peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
        script: script.alice,
      }),
    ],
    [
      bob.id,
      new MockAgentRuntime({
        agentId: bob.id,
        clock,
        commands: bobCommands,
        peerMessageHandler: (call) => orchestrator.handleMessageAgent(call),
        script: script.bob,
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
    autoplayPrompt: script.prompt,
    close: () => {
      orchestrator.dispose();
      opened.close();
    },
  };
}
