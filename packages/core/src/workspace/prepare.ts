import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { HOST_GIT_ENVIRONMENT, hostGitArguments } from './host-git.js';
import { inspectWorkspace } from './inspect.js';
import { WorkspaceError, refSlug, type WorkspaceInspection } from './workspace.js';

const run = promisify(execFile);

/**
 * Make a Workspace for a team that does not have one yet.
 *
 * The creation flow used to open with a folder picker, which is a hard first step for somebody
 * who has not decided what these agents are for: you cannot try blobot without first going and
 * finding a repository to point it at. This is the other door. The team is named, and a folder
 * of that name is made for it.
 *
 * **It is a git repository with one empty commit, not a plain folder**, and that is the whole
 * point of the function rather than an implementation detail. A `plain` Workspace gives each
 * agent a copy with no branch, no diff of what changed and no way to recover one that is
 * deleted; a repository with nothing committed is the one state the flow genuinely refuses,
 * because there is nothing to branch from. One empty commit costs a millisecond and turns the
 * free default into a Workspace with every guarantee the picked-it-yourself path has.
 *
 * A folder that is already there and has anything in it is **refused, never reused**. The
 * caller asked for a new folder; silently adopting somebody's existing `~/blobot/checkout`
 * would point autonomous processes at files they never chose.
 */
export async function prepareWorkspace(root: string, teamName: string): Promise<WorkspaceInspection> {
  const slug = refSlug(teamName);
  const path = join(root, slug);

  if (existsSync(path)) {
    const entries = await readdir(path).catch(() => [] as string[]);
    if (entries.length > 0) {
      throw new WorkspaceError(
        'already_there',
        `${path} already exists and is not empty. Choose it yourself if it is the one you mean.`,
      );
    }
  }

  await mkdir(path, { recursive: true });
  try {
    // `-b main` rather than whatever `init.defaultBranch` happens to be: the branch a team is
    // created from ends up in the disclosure and in every agent's `blobot/<team>/<agent>`, and
    // a folder blobot made itself is the one case where it may as well be predictable.
    await git(path, ['init', '-b', 'main']);
    await git(path, [...(await identity(path)), 'commit', '--allow-empty', '-m', 'blobot: new workspace']);
  } catch (cause) {
    throw new WorkspaceError('git_failed', `${path} was created, but git could not set it up: ${String(cause)}`);
  }
  return inspectWorkspace(path);
}

/**
 * A committer, when the machine has not got one.
 *
 * `git commit` refuses without `user.email`, and a fresh machine is exactly where somebody
 * reaches for "make one for me". Supplied per-invocation and only when there is nothing
 * configured, so a user who has set their own name keeps it: `-c` overrides rather than
 * defaults, and rewriting somebody's authorship for them would be a worse bug than failing.
 */
async function identity(path: string): Promise<string[]> {
  const email = await git(path, ['config', 'user.email']).catch(() => '');
  if (email.trim().length > 0) return [];
  return ['-c', 'user.name=blobot', '-c', 'user.email=blobot@localhost'];
}

async function git(path: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', path, ...hostGitArguments(args)], {
    env: { ...process.env, ...HOST_GIT_ENVIRONMENT },
  });
  return stdout;
}
