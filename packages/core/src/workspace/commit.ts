import type { CommandRunner } from './status.js';

/**
 * Committing what is in an AgentWorkspace, at the user's click.
 *
 * The second write in this directory, after `git switch`, and it keeps the same rule: this is
 * the user's own git, run on their behalf, with the commands shown in full before they run.
 * `detect/remedies.ts` set that rule for `claude auth login` and `publish.ts` follows it for
 * `gh pr create`; a commit is the same kind of thing and gets the same treatment.
 *
 * **A selection is blobot's, and the index is git's.** The panel's ticks never write the index:
 * `git commit -- <paths>` is a partial commit that leaves it exactly as it was, which matters
 * because the index of an AgentWorkspace belongs to the agent working in it too. The one
 * exception git forces is a new file, which cannot be named in a pathspec until it is added; see
 * `CommitRequest.untracked`.
 *
 * **The message is the user's and is never generated.** blobot provides no inference, and asking
 * the agent that wrote the code to also name what it did is a different feature with a different
 * failure mode. An empty message is refused rather than filled in.
 *
 * **`git commit` is on no trust level's allowlist and stays off it.** An agent commits nothing;
 * a person does, from here, and no runtime is told it happened.
 */

export interface CommitRequest {
  readonly path: string;
  readonly message: string;
  /**
   * The paths to take, where the user picked some of them. Absent is *everything here*, which is
   * what the tray has always done and what an empty git panel selection can never mean.
   *
   * A rename contributes **both** of its paths, or the addition lands and the deletion stays
   * behind as work nobody chose to leave.
   */
  readonly paths?: readonly string[];
  /**
   * Those of `paths` git does not know about yet.
   *
   * `git commit -- <path>` is a partial commit and leaves the index alone, which is what lets
   * the panel's ticks be blobot's own selection rather than the shared git index. It refuses an
   * untracked path outright — *pathspec did not match any file known to git* — so a new file
   * needs an `add` first. That write is real, and it is bounded to exactly the files being
   * committed, consumed by the next command, and undone if the commit does not happen.
   */
  readonly untracked?: readonly string[];
}

export type CommitOutcome =
  | { readonly ok: true; readonly sha: string }
  | { readonly ok: false; readonly error: string };

/**
 * The commands, as the user would have typed them.
 *
 * Everything: `git add -A` and not `git add .`, because the agent's worktree is the unit and a
 * commit that depended on which directory blobot happened to run in would be a different commit
 * on a different day.
 *
 * A selection: the same two commands with pathspecs on them, and the `add` present only when
 * there is a new file among them. The message is shown quoted, and it is handed to `execFile` as
 * one argument with no shell in front of it, so a message with a quote in it is a message.
 */
export function commitPlan(request: CommitRequest): readonly string[] {
  const message = `-m ${JSON.stringify(request.message.trim())}`;
  if (request.paths === undefined) return ['git add -A', `git commit ${message}`];
  const untracked = request.untracked ?? [];
  return [
    ...(untracked.length === 0 ? [] : [`git add -- ${quoted(untracked)}`]),
    `git commit ${message} -- ${quoted(request.paths)}`,
  ];
}

/** What the user would have typed, so a path with a space in it is shown as one argument. */
function quoted(paths: readonly string[]): string {
  return paths.map((path) => (/^[\w./@-]+$/.test(path) ? path : JSON.stringify(path))).join(' ');
}

export async function commitWorktree(
  request: CommitRequest,
  exec: CommandRunner,
): Promise<CommitOutcome> {
  const message = request.message.trim();
  if (message === '') return { ok: false, error: 'a commit needs a message' };

  const paths = request.paths;
  if (paths !== undefined && paths.length === 0) return { ok: false, error: 'nothing is ticked' };

  const untracked = paths === undefined ? [] : (request.untracked ?? []);
  const add = paths === undefined ? ['add', '-A'] : ['add', '--', ...untracked];
  if (paths === undefined || untracked.length > 0) {
    const staged = await exec('git', add, { cwd: request.path, timeoutMs: 30_000 });
    if (staged.code !== 0) return { ok: false, error: firstLine(staged.stderr) };
  }

  const committed = await exec(
    'git',
    paths === undefined ? ['commit', '-m', message] : ['commit', '-m', message, '--', ...paths],
    { cwd: request.path, timeoutMs: 30_000 },
  );
  if (committed.code !== 0) {
    // The `add` above is the one thing here that outlives a failure, so it is taken back. A
    // refused commit must leave the worktree as it found it, or the next attempt starts from a
    // state the user never chose and cannot see.
    if (untracked.length > 0) {
      await exec('git', ['reset', '-q', '--', ...untracked], { cwd: request.path });
    }
    return { ok: false, error: firstLine(committed.stderr) || whyNothing(committed.stdout) };
  }

  const head = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: request.path });
  return { ok: true, sha: head.stdout.trim() };
}

/**
 * The one failure that arrives on stdout, said as itself.
 *
 * `git commit` with nothing staged exits 1 and prints a paragraph that *begins* with `On branch
 * try-it`, so the first line is the branch name and the sentence the user needs is three lines
 * down. Reported live against a real repository, where the tray said `On branch try-it` and
 * meant `nothing to commit`.
 */
function whyNothing(stdout: string): string {
  const said = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /nothing (added )?to commit|no changes added/i.test(line));
  return said ?? firstLine(stdout);
}

function firstLine(text: string): string {
  const said = text.trim().split('\n').find((line) => line.trim() !== '');
  return said?.replace(/^fatal:\s*/, '').trim() ?? '';
}
