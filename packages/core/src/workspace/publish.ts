import type { CommandRunner } from './status.js';
import { spawnCommand } from './status.js';

/**
 * Pushing an agent's branch and opening a pull request for it.
 *
 * The one place blobot writes to a forge, and the shape of it is deliberate on three points.
 *
 * **It is a person's action.** Nothing an agent can do reaches this: `git push` and `git remote`
 * prompt at every trust level including `trusting`, and no agent is offered a tool that calls
 * it. The click is the user's, the credential is the user's, and the CLI doing the work is the
 * one the user already logged in with.
 *
 * **argv is ours.** The renderer sends a team, an agent and the words for the title and the
 * body; it never sends a command line. Everything below is assembled here and handed to
 * `execFile` as separate arguments with no shell in front of it, so a title containing `;` is a
 * title. This is `detect/remedies.ts`'s rule applied to the one command that is not a fixed
 * string.
 *
 * **It is shown before it runs.** `publishPlan` is the same two commands written the way a
 * person reads them, so the confirm shows what is about to happen rather than describing it.
 */

export interface PublishRequest {
  /** The AgentWorkspace. Both commands run here, which is what resolves the remote. */
  readonly path: string;
  readonly branch: string;
  /** What the pull request merges into: the Workspace repository's branch. */
  readonly base: string;
  /** Empty means `--fill`: gh writes the title and body from the branch's own commits. */
  readonly title?: string;
  readonly body?: string;
  readonly draft?: boolean;
}

export type PublishOutcome =
  | { readonly ok: true; readonly url: string }
  /**
   * Which command failed matters: a push that is rejected is the user's repository saying
   * something, and a create that fails after a successful push has left the branch on the
   * remote. Saying only "it did not work" would hide that.
   */
  | { readonly ok: false; readonly step: 'push' | 'create'; readonly error: string };

/** The two commands, as a person reads them. Shown in the confirm before anything runs. */
export function publishPlan(request: PublishRequest): readonly string[] {
  return [
    `git push -u origin ${request.branch}`,
    ['gh pr create', `--base ${request.base}`, `--head ${request.branch}`, ...(request.draft === true ? ['--draft'] : []), titleWord(request)].join(' '),
  ];
}

function titleWord(request: PublishRequest): string {
  const title = request.title?.trim() ?? '';
  return title === '' ? '--fill' : `--title "${title}"`;
}

/**
 * Push, then open. Two steps rather than `gh pr create --push`, because gh's own push is
 * silent about what it did and this is the moment the user most wants told.
 */
export async function publishBranch(
  request: PublishRequest,
  options: { readonly run?: CommandRunner } = {},
): Promise<PublishOutcome> {
  const exec = options.run ?? spawnCommand;

  const pushed = await exec('git', ['push', '-u', 'origin', request.branch], {
    cwd: request.path,
    // A push is the network, over ssh, possibly against a large branch. The eight seconds every
    // other command here gets would fail a first push of a real worktree.
    timeoutMs: 120_000,
  });
  if (pushed.code !== 0) return { ok: false, step: 'push', error: firstLine(pushed.stderr) };

  const title = request.title?.trim() ?? '';
  const body = request.body?.trim() ?? '';
  const created = await exec(
    'gh',
    [
      'pr',
      'create',
      '--base',
      request.base,
      '--head',
      request.branch,
      ...(request.draft === true ? ['--draft'] : []),
      ...(title === '' ? ['--fill'] : ['--title', title, '--body', body]),
    ],
    { cwd: request.path, timeoutMs: 60_000 },
  );
  if (created.code !== 0) return { ok: false, step: 'create', error: firstLine(created.stderr) };

  const url = findUrl(created.stdout);
  if (url === undefined) return { ok: false, step: 'create', error: 'gh did not say where the pull request is' };
  return { ok: true, url };
}

/** gh prints the pull request's URL on its own line, with progress lines around it. */
function findUrl(stdout: string): string | undefined {
  return stdout.split(/\s+/).find((word) => /^https?:\/\//.test(word));
}

function firstLine(stderr: string): string {
  const said = stderr.trim();
  return said === '' ? 'it failed and said nothing' : (said.split('\n')[0] as string);
}
