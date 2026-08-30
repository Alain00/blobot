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
  .say(' Bob has it. I will keep going on the token store meanwhile.')
  .end();

/** Bob, woken by Alice's message, does the review and answers her. */
export const bobReviews: Scenario = scenario('bob-reviews')
  .think('A peer request, not an operator instruction. Reviewing is squarely my role.')
  .callTool('read src/auth.ts', 'read', {
    rawInput: { path: 'src/auth.ts' },
    durationMs: 260,
    outcome: { status: 'completed', output: 'export async function refresh() { /* … */ }\n', exit: 0 },
  })
  .say('The retry loop has no backoff, so two immediate retries hit the same rate limit.')
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

/**
 * A turn that errors halfway: no `turn_ended`, because the RPC never replied. `error` is
 * fatal by definition in this vocabulary, so Bob ends up `failed` and needs a restart — what
 * `die` adds is that the process is gone too.
 */
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
  .think('Sorry, that took a while to load.', { overMs: 2_000 })
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

/**
 * A tool the runtime asks about first, which is ticket 14's posture reaching the transcript.
 *
 * `waiting` is entered rarely and genuinely here: the agent stops, the block appears where the
 * turn stopped, and nothing moves until a human answers. Demo mode plays it on purpose, because
 * a permission prompt is unreachable in a scripted replay that never asks for one, and the
 * first place we would otherwise meet it is somebody's real repository.
 */
export const asksBeforeDeleting: Scenario = scenario('asks-before-deleting')
  .think('The stale build output is what keeps failing the type check.')
  .say('The stale `dist` is what is failing the check. I will clear it and rebuild.')
  .callTool('rm -rf dist', 'execute', { asks: true, durationMs: 700 })
  .say('Cleared, and the build is green again.')
  .end();

/**
 * The commands a session advertises once it has held a turn. Short on purpose: research
 * measured 48 entries from a real personal setup, and what that list should be allowed to
 * contain is issue 03's question, not the mock's to prejudge.
 */
const FIRST_MENU = [
  { name: 'review', description: 'Review the changes on this branch' },
  { name: 'test', description: 'Run the test suite', hint: '[path]' },
] as const;

/**
 * A session that knows no commands until its first turn is under way, then advertises a menu
 * and immediately replaces it.
 *
 * Both halves are traps rather than decoration. The empty start is the OpenCode ordering,
 * where the list lands after `session/prompt` — a consumer that treats empty as "still
 * loading" is wrong about a real session. The replace is the bridge's own rule: a push is
 * authoritative, so a consumer that merges accumulates commands from directories the agent
 * has left. The identical third advertisement must wake nobody.
 */
export const advertisesCommands: Scenario = scenario('advertises-commands')
  .think('Reading what this workspace offers before I pick a route through it.')
  .advertises(FIRST_MENU)
  .say('I can see what this workspace offers now.')
  .advertises([
    { name: 'review', description: 'Review the changes on this branch' },
    { name: 'ship', description: 'Open a pull request for this branch' },
  ])
  .advertises([
    { name: 'review', description: 'Review the changes on this branch' },
    { name: 'ship', description: 'Open a pull request for this branch' },
  ])
  .say(' The menu moved under me halfway through, which is allowed.')
  .end();

/** The other direction: a session that had a menu and loses it entirely. */
export const losesCommands: Scenario = scenario('loses-commands')
  .say('That directory is gone, so the commands that lived in it are gone with it.')
  .advertises([])
  .end();

export const scenarios = {
  'alice-asks-bob': aliceAsksBob,
  'bob-reviews': bobReviews,
  'tool-failure-continues': toolFailureContinues,
  'bob-fails-midturn': bobFailsMidturn,
  'runtime-dies-midturn': runtimeDiesMidturn,
  'slow-to-first-token': slowToFirstToken,
  'long-running-tool': longRunningTool,
  'asks-before-deleting': asksBeforeDeleting,
  'advertises-commands': advertisesCommands,
  'loses-commands': losesCommands,
  refuses,
} as const satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof scenarios;
