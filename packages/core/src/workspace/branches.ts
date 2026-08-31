import type { CommandRunner } from './status.js';

/**
 * The branches an AgentWorkspace can be on, and moving it onto one.
 *
 * Everything else about a worktree in this directory is **observation** — read, never written,
 * never shown to an agent. This is the one exception and it is deliberate: it is the user's own
 * `git switch`, run from the one place in the app that already says which branch the worktree is
 * on. No agent is told it happened, nothing here is a tool, and no runtime has a path to it.
 * `git switch` is not on any trust level's allowlist and stays off it.
 *
 * **A branch another worktree is holding is drawn, not hidden.** git refuses to check the same
 * branch out twice and that refusal is the interesting fact, not an error: a teammate's branch
 * being unavailable *because the teammate has it open* is the answer to "why can I not go
 * there", and a menu that silently omitted those rows would leave the user looking for a branch
 * they know exists.
 */

export interface Branch {
  readonly name: string;
  /** This worktree is on it. Exactly one branch is, unless HEAD is detached and none is. */
  readonly current: boolean;
  /**
   * The directory of the other worktree that has it checked out, which is why git will refuse
   * it. Absent means it is free. The path rather than an agent's name, because this layer knows
   * about worktrees and the layer above knows which agent a path belongs to.
   */
  readonly heldBy?: string;
}

export interface BranchListing {
  /** Absent on a detached HEAD, which is a state a person can get a worktree into. */
  readonly current?: string;
  readonly branches: readonly Branch[];
}

export type SwitchOutcome =
  | { readonly ok: true; readonly branch: string }
  | { readonly ok: false; readonly error: string };

/**
 * Every local branch in the repository this worktree belongs to.
 *
 * Local only. A remote branch would have to be materialised as a tracking branch to be checked
 * out, which is a second decision with a second set of failures, and the list this menu exists
 * for — the base branch and the other agents' `blobot/<team>/<agent>` branches — is entirely
 * local. `git fetch` is the network and nothing here touches it.
 */
export async function listBranches(cwd: string, exec: CommandRunner): Promise<BranchListing> {
  const [listed, held, head] = await Promise.all([
    exec('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { cwd }),
    exec('git', ['worktree', 'list', '--porcelain'], { cwd }),
    currentBranch(cwd, exec),
  ]);
  if (listed.code !== 0) return { branches: [] };

  const holders = holdersOf(held.code === 0 ? held.stdout : '');
  const branches = listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((name) => name !== '')
    .map((name) => {
      const holder = holders.get(name);
      const current = name === head;
      return {
        name,
        current,
        // The worktree we are asking from holds its own branch, and saying so would draw the
        // current row as unavailable.
        ...(holder === undefined || current ? {} : { heldBy: holder }),
      };
    });
  return { ...(head === undefined ? {} : { current: head }), branches };
}

/**
 * Which worktree has each branch, from `git worktree list --porcelain`.
 *
 * The porcelain form rather than `%(worktreepath)` on the ref: one shape, documented as stable,
 * and it answers the same question without depending on how old the user's git is.
 */
function holdersOf(stdout: string): Map<string, string> {
  const held = new Map<string, string>();
  let path: string | undefined;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim();
    else if (line.startsWith('branch ') && path !== undefined) {
      held.set(line.slice('branch refs/heads/'.length).trim(), path);
    } else if (line.trim() === '') path = undefined;
  }
  return held;
}

/**
 * The branch this worktree is actually on, which is not always the one blobot named it.
 *
 * `blobot/<team>/<agent>` is what the provider *created*; this is what is checked out now, and
 * once a person can switch, the two come apart. Anything that reports or pushes a branch reads
 * it from here, because the alternative is an app that pushes a branch the user is not on.
 * Undefined on a detached HEAD and on any failure, and every caller falls back to the name it
 * already had rather than inventing one.
 */
export async function currentBranch(cwd: string, exec: CommandRunner): Promise<string | undefined> {
  const result = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  if (result.code !== 0) return undefined;
  const said = result.stdout.trim();
  // `HEAD` is git's own word for a detached one, and the empty string is a runner that had
  // nothing to say about this command.
  return said === '' || said === 'HEAD' ? undefined : said;
}

/**
 * Move this worktree onto a branch, or onto a new one cut from where it is standing.
 *
 * `git switch`, and its refusals are passed through as git's own first line rather than
 * flattened into a house phrase. The two that a user will actually meet — a branch another
 * worktree holds, and local changes that would be overwritten — are both cases where git says
 * something more useful than blobot could.
 *
 * Nothing is stashed, committed or discarded on the user's behalf. A switch that would lose
 * work is a switch that does not happen.
 */
export async function switchBranch(
  cwd: string,
  branch: string,
  options: { readonly create?: boolean },
  exec: CommandRunner,
): Promise<SwitchOutcome> {
  const name = branch.trim();
  if (name === '') return { ok: false, error: 'that is not a branch name' };
  const result = await exec(
    'git',
    ['switch', ...(options.create === true ? ['-c'] : []), name],
    { cwd, timeoutMs: 20_000 },
  );
  if (result.code !== 0) return { ok: false, error: firstLine(result.stderr) };
  return { ok: true, branch: name };
}

function firstLine(stderr: string): string {
  const said = stderr.trim().split('\n').find((line) => line.trim() !== '');
  return said?.replace(/^fatal:\s*/, '').trim() ?? 'git could not switch branch';
}
