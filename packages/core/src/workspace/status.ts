import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { currentBranch } from './branches.js';
import { readChurn, type Churn } from './churn.js';
import { HOST_GIT_ENVIRONMENT, hostGitArguments } from './host-git.js';
import type { AgentWorkspace, WorkspaceInspection } from './workspace.js';

const run = promisify(execFile);

/**
 * What an AgentWorkspace is holding, and whether the forge knows about it.
 *
 * Two questions the app could not answer without a terminal: *is anything happening in this
 * agent's worktree*, and *has any of it become a pull request*. Both are read, never written to
 * by an agent and never shown to one — this is observation in the same sense the context gauge
 * is observation, and nothing here enters a session.
 *
 * **The forge half is the user's own `gh`, spawned.** blobot stores no token, proxies no
 * credential and speaks to no API itself; it runs the CLI the user already logged in with,
 * exactly as `detect/remedies.ts` runs `claude auth login` rather than reimplementing it. A
 * machine with no `gh`, a repository with no remote and a `gh` nobody has signed in to are all
 * ordinary and all silent.
 *
 * **A pull request is the user's action, never an agent's.** `git push` and `git remote` prompt
 * at every trust level including `trusting`, so nothing an agent does can reach GitHub; the
 * branch gets there because a person pushed it. `publish.ts` is the door for doing that from
 * inside blobot, and it is a person clicking too.
 */

export type PullRequestState = 'open' | 'draft' | 'merged' | 'closed';

export interface PullRequest {
  readonly number: number;
  readonly state: PullRequestState;
  readonly title: string;
  readonly url: string;
}

/**
 * Whether we got to ask, kept apart from what the answer was.
 *
 * *No pull request* and *we could not look* are different facts and the second one must not be
 * drawn as the first — the same distinction ticket 10's reconcile draws between a first run and
 * a branch that is gone. `asked: false` carries why, and the UI's answer to it is to say
 * nothing at all rather than to report an absence it did not verify.
 */
export type ForgeReading =
  | { readonly asked: false; readonly detail: string }
  | { readonly asked: true; readonly pr?: PullRequest };

export interface AgentWorkspaceStatus {
  readonly agentId: string;
  readonly agentName: string;
  readonly kind: WorkspaceInspection['kind'];
  /**
   * What the worktree is on now, which is the branch the provider named until somebody switches
   * it. Absent on a copied workspace, which has no branch: the copy is the work.
   */
  readonly branch?: string;
  /** The directory is where it was left. False is ticket 10's reconcile territory, not this. */
  readonly present: boolean;
  /** Paths with uncommitted changes. Undefined where there is no repository to ask. */
  readonly changed?: number;
  /**
   * The same uncommitted work measured in lines, which is the figure a person decides on. A
   * count of touched files says nothing about whether there is an afternoon in there.
   */
  readonly churn?: Churn;
  /** Commits on this branch that the base does not have. */
  readonly ahead?: number;
  /** `refs/remotes/origin/<branch>` resolves. Local, so it is what git last heard, not a fetch. */
  readonly pushed?: boolean;
  readonly forge: ForgeReading;
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Injected so every branch here is testable without a repository or a logged-in `gh`. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: { readonly cwd?: string; readonly timeoutMs?: number; readonly env?: Readonly<Record<string, string>> },
) => Promise<CommandResult>;

export const spawnCommand: CommandRunner = async (command, args, options = {}) => {
  try {
    const { stdout, stderr } = await run(command, command === 'git' ? hostGitArguments(args) : [...args], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(command === 'git'
        ? { env: { ...process.env, ...options.env, ...HOST_GIT_ENVIRONMENT } }
        : options.env === undefined ? {} : { env: { ...process.env, ...options.env } }),
      timeout: options.timeoutMs ?? 8_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === 'number' ? failure.code : 127,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? String(error),
    };
  }
};

export interface StatusOptions {
  readonly kind: WorkspaceInspection['kind'];
  readonly agentName: string;
  /**
   * What the branch is measured against: the Workspace repository's current branch.
   *
   * Not the branch the team was actually created from, which nothing records. An AgentWorkspace
   * is branched from `HEAD` at creation, so this is right until the user moves, and a count
   * against a branch the user is looking at is the count they can act on. Undefined where there
   * is no base to name, and then `ahead` is simply absent rather than guessed at.
   */
  readonly base?: string;
  /** Off for a read that must not touch the network, such as one on every snapshot. */
  readonly forge?: boolean;
  readonly run?: CommandRunner;
}

/**
 * One agent's workspace, read.
 *
 * Nothing here refuses. A directory that is gone, a git that fails, a `gh` that is not
 * installed: each narrows what can be said and none of them is an error, because this is drawn
 * beside a conversation and a red row about a folder is not what the user came for.
 */
export async function readAgentWorkspaceStatus(
  workspace: AgentWorkspace,
  options: StatusOptions,
): Promise<AgentWorkspaceStatus> {
  const exec = options.run ?? spawnCommand;
  const base = {
    agentId: workspace.agentId,
    agentName: options.agentName,
    kind: options.kind,
    ...(workspace.branch === undefined ? {} : { branch: workspace.branch }),
  };

  if (!existsSync(workspace.path)) {
    return { ...base, present: false, forge: { asked: false, detail: 'the workspace is not there' } };
  }

  // A copy has no branch, no diff against anything and no recovery. Ticket 10's amendment is
  // explicit about that, so this says it rather than running git against a plain directory.
  if (options.kind === 'plain') {
    return { ...base, present: true, forge: { asked: false, detail: 'a copy has no branch' } };
  }

  // What is checked out **now**, which is not always the branch the provider named. A person
  // can switch this worktree from the composer's tray, and after that the deterministic name is
  // a claim about history rather than about the folder in front of them.
  const branch = (await currentBranch(workspace.path, exec)) ?? workspace.branch;

  const [changed, churn, ahead, pushed] = await Promise.all([
    countChanged(workspace.path, exec),
    readChurn(workspace.path, exec),
    options.base === undefined || branch === undefined
      ? Promise.resolve(undefined)
      : countAhead(workspace.path, options.base, exec),
    hasRemoteBranch(workspace.path, branch, exec),
  ]);

  const forge =
    options.forge !== true || branch === undefined
      ? ({ asked: false, detail: 'not looked up' } as const)
      : await readPullRequest(workspace.path, branch, exec);

  return {
    ...base,
    ...(branch === undefined ? {} : { branch }),
    present: true,
    ...(changed === undefined ? {} : { changed }),
    ...(churn === undefined ? {} : { churn }),
    ...(ahead === undefined ? {} : { ahead }),
    ...(pushed === undefined ? {} : { pushed }),
    forge,
  };
}

/**
 * The open, merged or closed pull request whose head is this branch.
 *
 * `--state all` and the most recent one, because a merged pull request is the answer to "what
 * became of this agent's work" and hiding it would leave a branch looking untouched after it
 * had already landed.
 */
export async function readPullRequest(
  cwd: string,
  branch: string,
  exec: CommandRunner,
): Promise<ForgeReading> {
  const version = await exec('gh', ['--version'], { timeoutMs: 5_000 });
  if (version.code !== 0) return { asked: false, detail: 'gh is not installed' };

  const listed = await exec(
    'gh',
    [
      'pr',
      'list',
      '--head',
      branch,
      '--state',
      'all',
      '--limit',
      '1',
      '--json',
      'number,state,isDraft,title,url',
    ],
    { cwd },
  );
  if (listed.code !== 0) return { asked: false, detail: whyNot(listed.stderr) };

  const rows = parseRows(listed.stdout);
  if (rows === undefined) return { asked: false, detail: 'gh returned something unreadable' };
  const [first] = rows;
  if (first === undefined) return { asked: true };
  return { asked: true, pr: first };
}

/**
 * `gh`'s own words, shortened to the three that mean something different to the user.
 *
 * Anything else is passed through as the first line it printed rather than flattened into a
 * house phrase: this is drawn in a tooltip, and a message we did not anticipate is more use
 * verbatim than as "could not check".
 */
function whyNot(stderr: string): string {
  const said = stderr.trim();
  if (/no git remotes/i.test(said)) return 'this repository has no remote';
  if (/gh auth login|authentication|not logged/i.test(said)) return 'gh is not signed in';
  if (/could not resolve to a Repository|not found/i.test(said)) return 'the remote is not on GitHub';
  return said.split('\n')[0] ?? 'gh could not answer';
}

function parseRows(stdout: string): PullRequest[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const rows: PullRequest[] = [];
  for (const row of parsed) {
    const it = row as Record<string, unknown>;
    if (typeof it.number !== 'number' || typeof it.url !== 'string') continue;
    rows.push({
      number: it.number,
      state: stateOf(it.state, it.isDraft === true),
      title: typeof it.title === 'string' ? it.title : '',
      url: it.url,
    });
  }
  return rows;
}

/** A draft is drawn as its own word rather than as an open one, because it asks for nothing. */
function stateOf(state: unknown, draft: boolean): PullRequestState {
  const said = String(state).toUpperCase();
  if (said === 'MERGED') return 'merged';
  if (said === 'CLOSED') return 'closed';
  return draft ? 'draft' : 'open';
}

async function countChanged(cwd: string, exec: CommandRunner): Promise<number | undefined> {
  const result = await exec('git', ['status', '--porcelain'], { cwd });
  if (result.code !== 0) return undefined;
  const lines = result.stdout.split('\n').filter((line) => line.trim().length > 0);
  return lines.length;
}

async function countAhead(cwd: string, base: string, exec: CommandRunner): Promise<number | undefined> {
  const result = await exec('git', ['rev-list', '--count', `${base}..HEAD`], { cwd });
  if (result.code !== 0) return undefined;
  const count = Number.parseInt(result.stdout.trim(), 10);
  return Number.isFinite(count) ? count : undefined;
}

async function hasRemoteBranch(
  cwd: string,
  branch: string | undefined,
  exec: CommandRunner,
): Promise<boolean | undefined> {
  if (branch === undefined) return undefined;
  // The remote-tracking ref, not `ls-remote`: this runs on every read and must not reach the
  // network. It is what git last heard, which is the honest thing to draw without a fetch.
  const result = await exec('git', ['rev-parse', '--verify', `refs/remotes/origin/${branch}`], { cwd });
  return result.code === 0;
}
