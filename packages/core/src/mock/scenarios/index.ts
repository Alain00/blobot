import { Scenario, scenario } from '../scenario.js';

/**
 * The checked-in scenarios. These are what the tests assert against and what demo mode
 * plays. Being in the repo is the point: "does the app handle a runtime dying mid-turn?"
 * becomes a file rather than a memory.
 */

/** Alice reads a file, hands the review to Bob, and tells the user what she did. */
export const aliceAsksBob: Scenario = scenario('alice-asks-bob')
  .think('The auth change touches the session refresh path, so it wants a second pair of eyes.')
  .callTool('read src/auth.ts', 'read', {
    rawInput: { path: 'src/auth.ts' },
    durationMs: 320,
    outcome: { status: 'completed', output: 'export async function refresh() { /* … */ }\n', exit: 0 },
  })
  .say('I have the refresh path in front of me. Asking Bob to review it.')
  .messageAgent(
    'Bob',
    'Can you review the session refresh in src/auth.ts on my branch? I am worried about the retry loop.',
    'I rewrote refresh() to retry twice; committed on blobot/demo/alice.',
  )
  .say(' Bob has it — I will keep going on the token store meanwhile.')
  .end();

/** Bob, woken by Alice's message, does the review and answers her. */
export const bobReviews: Scenario = scenario('bob-reviews')
  .think('A peer request, not an operator instruction. Reviewing is squarely my role.')
  .callTool('read src/auth.ts', 'read', {
    rawInput: { path: 'src/auth.ts' },
    durationMs: 260,
    outcome: { status: 'completed', output: 'export async function refresh() { /* … */ }\n', exit: 0 },
  })
  .say('The retry loop has no backoff — two immediate retries will hit the same rate limit.')
  .messageAgent('Alice', 'Reviewed: the retry loop needs a backoff, otherwise both attempts hit the same 429.')
  .end();

/** A tool fails and the turn carries on. This must not render as an error. */
export const toolFailureContinues: Scenario = scenario('tool-failure-continues')
  .think('Checking whether the config file exists.')
  .callTool('read config/missing.json', 'read', {
    rawInput: { path: 'config/missing.json' },
    durationMs: 180,
    outcome: { status: 'failed', error: 'ENOENT: no such file or directory' },
  })
  .think('Not there. Falling back to the defaults.')
  .say('There is no config/missing.json, so I used the defaults instead.')
  .end();

/** A turn that errors halfway. Bob survives; the turn does not, and there is no `turn_ended`. */
export const bobFailsMidturn: Scenario = scenario('bob-fails-midturn')
  .think('Starting the review.')
  .say('Pulling up the diff now')
  .errorMidTurn('provider stream closed unexpectedly', 'stream_closed');

/** The process dies mid-turn. Sticky `failed`: this one needs a restart. */
export const runtimeDiesMidturn: Scenario = scenario('runtime-dies-midturn')
  .think('Working through the migration plan.')
  .callTool('bash npm test', 'execute', {
    rawInput: { command: 'npm test' },
    durationMs: 900,
    outcome: { status: 'completed', output: 'ok\n', exit: 0 },
  })
  .die('runtime process exited with signal SIGKILL', 'process_died');

/** Ninety seconds before a single token. blobot must not look broken for a minute and a half. */
export const slowToFirstToken: Scenario = scenario('slow-to-first-token')
  .wait(90_000)
  .think('Sorry — that took a while to load.', { overMs: 2_000 })
  .say('Ready now. What would you like me to look at first?')
  .end();

/** A tool long enough to cancel inside. Cancel here and it will report `completed`, `exit: null`. */
export const longRunningTool: Scenario = scenario('long-running-tool')
  .think('This build takes a while.')
  .callTool('bash npm run build', 'execute', {
    rawInput: { command: 'npm run build' },
    durationMs: 30_000,
    outcome: { status: 'completed', output: 'built in 29.4s\n', exit: 0 },
  })
  .say('Build is green.')
  .end();

/** A turn that ended unusually but left the agent perfectly answerable. */
export const refuses: Scenario = scenario('refuses')
  .think('This asks me to push to main, which is outside what a peer can ask of me.')
  .say('I am not going to force-push main on a teammate’s say-so. Ask the user directly.')
  .end('refusal');

export const scenarios = {
  'alice-asks-bob': aliceAsksBob,
  'bob-reviews': bobReviews,
  'tool-failure-continues': toolFailureContinues,
  'bob-fails-midturn': bobFailsMidturn,
  'runtime-dies-midturn': runtimeDiesMidturn,
  'slow-to-first-token': slowToFirstToken,
  'long-running-tool': longRunningTool,
  refuses,
} as const satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof scenarios;
