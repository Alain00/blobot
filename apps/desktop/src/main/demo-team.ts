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
  uuidv7,
} from '@blobot/core';
import type { RunningTeam } from './running-team.js';
import { FileHandoffArchive } from './handoff-archive.js';

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
   * woken, so this run is one turn long and ends on a promise nobody kept.
   *
   * blobot no longer draws a line under it. The observation is still core's — it is what the
   * routing-turn exemption keys on — but the caption it used to put in the transcript said the
   * same thing on every one of these turns and was removed by the author, 2026-09-04.
   */
  'forgotten-handoff': {
    summary: 'Alice says she will ask Bob and never does',
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
   * The other half of running out of room: blobot chooses the moment before it happens.
   *
   * Alice fills up on an ordinary turn that ends the ordinary way, and blobot asks her for a
   * handoff and starts her again. There is no compaction command in this run and there is no
   * longer one anywhere: the author watched a real agent compact itself at 223k and come back
   * having lost too much, so a handoff and a fresh session is the whole of what blobot does.
   *
   * The gauge is the part to watch beside the transcript. 110,000 of the mock's 200,000 window
   * is a bar with room to spare on it, and it is past the working ceiling a 200,000 window
   * actually gets. Ticket 09's two denominators, on screen at the same time.
   */
  'fills-up': {
    summary: 'Alice fills up, writes herself a handoff, and starts again on a fresh session',
    prompt: 'Rename the cart item shape everywhere it is used, and tell me the call sites.',
    alice: [
      scenarios['fills-up-and-keeps-going'],
      scenario('writes-a-handoff')
        .say(
          'I am renaming CartItem to LineItem across the app. Done: the cart and the mini ' +
            'cart, committed on blobot/checkout/alice. Left: four call sites in checkout that ' +
            'still pass the old shape, and the fixtures under test/. The API side is Bob’s and ' +
            'he has not started. Do not touch src/legacy: it has its own shape on purpose.',
        )
        .end(),
      scenario('picks-it-up').say('Read it. Picking up at the checkout call sites.').end(),
    ],
    bob: scenarios['bob-reviews'],
  },
  /**
   * One turn, twenty-two calls, one answer. The shape a long piece of real work has, and the run
   * the transcript's fold is reviewed against: shut, this is a caption, one mono line and a
   * paragraph; flat, it was a bulleted list of intentions with the answer buried under it.
   *
   * **And the one run where two agents hold calls at the same time.** Alice mails Bob from the
   * middle of the list and carries on rather than waiting, so his three reads open while she is
   * still editing the scene — which is the only way to look at `.scratch/live-steps/`'s block
   * per agent doing the thing it was built for. Every other script wakes Bob on a turn Alice has
   * already finished.
   */
  'many-steps': {
    summary: 'Alice works through a list of edits, hands Bob a question, and answers at the end',
    prompt: 'Build the top-down desk scene and wire it into the page.',
    alice: scenarios['works-through-a-list'],
    bob: scenarios['bob-checks-the-id-shape'],
  },
  /**
   * An agent schedules itself, and the block that pays for it opens in the turn that did it.
   * The only run in which that block is on screen at all: no other script proposes a Routine,
   * so before this the only place to look at it was a real agent deciding to schedule itself.
   */
  'schedules-itself': {
    summary: 'Alice puts herself on a schedule, and the transcript says so where it happened',
    prompt: 'The overnight builds keep breaking. Can you keep an eye on the type check?',
    alice: scenarios['schedules-itself'],
    bob: scenarios['bob-reviews'],
  },
  /**
   * An agent is briefed and writes it down, and the block that pays for that opens in the turn
   * that did it. The same argument as the run above: no other script records anything, so the
   * only other place to look at this block is a real agent being briefed on somebody's real
   * repository.
   */
  'writes-it-down': {
    summary: 'Alice is told how the work goes here, and records it where you can see her do it',
    prompt:
      'Before you start: the client is Vlue, a two-person agency, they sign off on all copy, ' +
      'and nothing ships on a Friday.',
    alice: scenarios['writes-it-down'],
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
        // Issue 05's tool, wired the way the peer handler is. Without it a scripted proposal
        // came back `blobot_propose_routine failed`, which is the mock reporting an unattached
        // handler and not a refusal blobot ever makes.
        proposeRoutine: (call) => orchestrator.handleProposeRoutine(call),
        // Ticket 03's tool, wired for the same reason: without it a scripted write comes back
        // `blobot_record_entry failed`, which is the mock reporting an unattached handler.
        recordEntry: (call) => orchestrator.handleRecordEntry(call),
        // The demo's own store, so a scripted picture is measured and refused by exactly the
        // code a real runtime's goes through. A mock with a kinder path would be the thing
        // ticket 08 says a mock must never be.
        pictures: { keep: (picture) => store.keepPicture(picture) },
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
        // Issue 05's tool, wired the way the peer handler is. Without it a scripted proposal
        // came back `blobot_propose_routine failed`, which is the mock reporting an unattached
        // handler and not a refusal blobot ever makes.
        proposeRoutine: (call) => orchestrator.handleProposeRoutine(call),
        recordEntry: (call) => orchestrator.handleRecordEntry(call),
        pictures: { keep: (picture) => store.keepPicture(picture) },
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
    // No `contextCeilings`: the mock names no model, so it takes the conservative fallback
    // like nearly every real agent, which is the case worth demonstrating. The archive is the
    // real one, because a demo that writes its handoff nowhere is a demo of half the feature.
    handoffs: new FileHandoffArchive(),
    // The demo's Routines are rows in its own throwaway database, the way the handoff archive is
    // the real one: without this an agent that schedules itself got `blobot_propose_routine
    // failed` back, and the transcript block that is the *price* of letting it schedule itself
    // was the one block in the app no demo could show.
    routines: store,
    // And the Handbook, in the same throwaway database, so the block that is the *price* of
    // letting an agent write into its own persona is one a demo can show.
    handbooks: store,
  });
  await orchestrator.start();

  // Demo mode plays the whole path, including the session row a restart needs. Without it a
  // relaunched demo would resume a session the mock has already replaced.
  orchestrator.onCompaction((compacted) => {
    if (compacted.how === 'refused') return;
    const agent = agents.find((candidate) => candidate.id === compacted.agentId);
    if (agent === undefined) return;
    store.startSession({
      id: uuidv7(compacted.at),
      agentId: agent.id,
      ...(compacted.sessionId === '' ? {} : { providerSessionId: compacted.sessionId }),
      personaText: composePersona(agent, team, agents),
      startedAt: compacted.at,
    });
  });

  return {
    team,
    agents,
    orchestrator,
    store,
    runtimeLabels: Object.fromEntries(agents.map((agent) => [agent.id, 'Mock (demo)'])),
    // A mock runtime names no model, so every demo agent takes the conservative fallback and
    // the gauge says so. That is the right demo: it is what nearly every real agent gets too.
    contextCeilings: {},
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
