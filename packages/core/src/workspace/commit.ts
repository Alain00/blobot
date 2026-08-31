import type { CommandRunner } from './status.js';

/**
 * Committing what is in an AgentWorkspace, at the user's click.
 *
 * The second write in this directory, after `git switch`, and it keeps the same rule: this is
 * the user's own git, run on their behalf, with the commands shown in full before they run.
 * `detect/remedies.ts` set that rule for `claude auth login` and `publish.ts` follows it for
 * `gh pr create`; a commit is the same kind of thing and gets the same treatment.
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
}

export type CommitOutcome =
  | { readonly ok: true; readonly sha: string }
  | { readonly ok: false; readonly error: string };

/**
 * The two commands, as the user would have typed them.
 *
 * `git add -A` and not `git add .`: the agent's worktree is the unit, and a commit that depended
 * on which directory blobot happened to run in would be a different commit on a different day.
 * The message is shown quoted, and it is handed to `execFile` as one argument with no shell in
 * front of it, so a message with a quote in it is a message.
 */
export function commitPlan(request: CommitRequest): readonly string[] {
  return ['git add -A', `git commit -m ${JSON.stringify(request.message.trim())}`];
}

export async function commitWorktree(
  request: CommitRequest,
  exec: CommandRunner,
): Promise<CommitOutcome> {
  const message = request.message.trim();
  if (message === '') return { ok: false, error: 'a commit needs a message' };

  const staged = await exec('git', ['add', '-A'], { cwd: request.path, timeoutMs: 30_000 });
  if (staged.code !== 0) return { ok: false, error: firstLine(staged.stderr) };

  const committed = await exec('git', ['commit', '-m', message], {
    cwd: request.path,
    timeoutMs: 30_000,
  });
  if (committed.code !== 0) {
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
