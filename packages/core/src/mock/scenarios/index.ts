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

/**
 * Alice says she will get Bob involved, and never calls the tool.
 *
 * Ticket 08's thesis, applied to the one failure a kind mock would never produce: the turn is
 * *healthy*. It thinks, it reads a file, it ends `end_turn`, and the work it promised silently
 * never happens. Observed live in the ordinary two-agent case, where Alice ignored blobot's
 * tool, reached for Claude's own `ListAgents` and reported Bob unreachable — the failure
 * `SHADOWING_TOOLS` fixed for that one route and cannot fix as a class.
 *
 * Nothing in the event stream marks it, which is the point: the only way to see it is to know
 * what the user asked and count what was sent. See
 * `.scratch/team-addressing/issues/05-mock-a-coordinator-that-forgets-to-route.md`.
 */
export const promisesBobAndForgets: Scenario = scenario('promises-bob-and-forgets')
  .think('The retry loop is Bob’s side of the house, so he should look at it.')
  .callTool('read src/auth.ts', 'read', {
    rawInput: { path: 'src/auth.ts' },
    durationMs: 300,
    outcome: { status: 'completed', output: 'export async function refresh() { /* … */ }\n', exit: 0 },
  })
  .say('I will ask Bob to review the retry loop while I carry on with the token store.')
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
 * A turn that is a dozen steps and one answer.
 *
 * The shape every long piece of real work has and no other scenario here produced: a one-line
 * caption, a call, a caption, a call, for as long as it takes, and then the paragraph that was
 * the point of all of it. Drawn flat it reads as a bulleted list of intentions, because the
 * captions are sentences and the calls are one mono line each — so the narration wins the column
 * by weight while saying the least, and the answer at the bottom is buried under the work that
 * led to it.
 *
 * It is checked in for the same reason the ragged deltas are: the transcript's fold (`rowsOf`)
 * is built against this, and without it the first place we would meet a twelve-step turn is
 * somebody's real repository. Observed on a real Claude session, 2026-08-30.
 */
export const worksThroughAList: Scenario = scenario('works-through-a-list')
  .think('Fifteen files, and they only make sense in order.')
  .say('Now the selection store and the interaction wrapper.')
  .callTool('src/store/selection.ts', 'edit', {
    rawInput: { path: 'src/store/selection.ts' },
    durationMs: 240,
    diff: {
      oldText: 'export const selected = new Set<string>();\n',
      newText: 'export const selected = new Set<string>();\nexport const hovered = signal<string | null>(null);\nexport function clear(): void {\n  selected.clear();\n}\n',
    },
    outcome: { status: 'completed', output: 'ok\n', exit: 0 },
  })
  .say('That guard does not do what its comment claims. Fixing it with an id-matched clear.')
  .callTool('src/store/selection.ts', 'edit', {
    rawInput: { path: 'src/store/selection.ts' },
    durationMs: 210,
    diff: {
      oldText: '  if (id) selected.clear();\n',
      newText: '  if (selected.has(id)) selected.delete(id);\n',
    },
    outcome: { status: 'completed', output: 'ok\n', exit: 0 },
  })
  .say('Now the interaction wrapper that every desk object shares.')
  .callTool('src/scene/Interactive.tsx', 'edit', {
    rawInput: { path: 'src/scene/Interactive.tsx' },
    durationMs: 260,
    diff: {
      oldText: '',
      newText: 'export function Interactive({ id, children }: Props) {\n  const set = useSelection();\n  return (\n    <group onPointerOver={() => set.hover(id)} onPointerOut={() => set.hover(null)}>\n      {children}\n    </group>\n  );\n}\n',
    },
    outcome: { status: 'completed', output: 'ok\n', exit: 0 },
  })
  .say('Now the objects themselves. The camera is top-down, so I am shaping these to read by silhouette.')
  .callTool('src/scene/objects.tsx', 'edit', {
    rawInput: { path: 'src/scene/objects.tsx' },
    durationMs: 480,
    diff: {
      oldText: '  <boxGeometry args={[1, 1, 1]} />\n',
      newText: '  <boxGeometry args={[1.4, 0.06, 0.9]} />\n  <meshStandardMaterial color="#2b2b30" roughness={0.7} />\n  <Edges threshold={20} color="#3a3a42" />\n',
    },
    outcome: { status: 'completed', output: 'ok\n', exit: 0 },
  })
  .say('A stray character slipped into the laptop material. Fixing it.')
  .callTool('src/scene/objects.tsx', 'edit', {
    rawInput: { path: 'src/scene/objects.tsx' },
    durationMs: 150,
    diff: {
      oldText: '  roughness={0.7} />\n',
      newText: '  roughness={0.7} />\n',
    },
    outcome: { status: 'completed', output: 'ok\n', exit: 0 },
  })
  .say('Now wiring it into the page and building.')
  .callTool('npx astro check 2>&1 | tail -30', 'execute', {
    rawInput: { command: 'npx astro check 2>&1 | tail -30' },
    durationMs: 2_400,
    outcome: { status: 'completed', output: '0 errors\n', exit: 0 },
  })
  .say(
    'Zero errors, and the build is green. The desk reads by silhouette at the top-down camera, ' +
      'and the hover label lands on the object under the cursor rather than the last one hit. ' +
      'The one thing I left alone is the biography copy: I do not know enough about you to write ' +
      'it, so it is placeholders where the facts should go.',
  )
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

/**
 * The agent runs out of room mid-answer.
 *
 * A turn that stops for want of context is the one ending a user experiences as "the agent got
 * worse and I could not tell why": the answer simply stops, and on a runtime that reports
 * nothing else the pane would draw a finished turn. It stops mid-sentence on purpose, because
 * that is what it looks like, and the transcript's line is what tells the reader why.
 */
export const runsOutOfRoom: Scenario = scenario('runs-out-of-room')
  .think('The migration touches every call site, so I am reading all of them before I answer.')
  .callTool('read src/', 'read', {
    rawInput: { path: 'src/' },
    durationMs: 400,
    outcome: { status: 'completed', output: '… 84 files\n', exit: 0 },
  })
  .usage(196_000)
  .say('There are four call sites that pass the old shape. The first is in the checkout')
  .end('max_tokens');

export const scenarios = {
  'alice-asks-bob': aliceAsksBob,
  'bob-reviews': bobReviews,
  'promises-bob-and-forgets': promisesBobAndForgets,
  'tool-failure-continues': toolFailureContinues,
  'bob-fails-midturn': bobFailsMidturn,
  'runtime-dies-midturn': runtimeDiesMidturn,
  'slow-to-first-token': slowToFirstToken,
  'long-running-tool': longRunningTool,
  'works-through-a-list': worksThroughAList,
  'asks-before-deleting': asksBeforeDeleting,
  'advertises-commands': advertisesCommands,
  'loses-commands': losesCommands,
  'runs-out-of-room': runsOutOfRoom,
  refuses,
} as const satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof scenarios;
