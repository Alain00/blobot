import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnCommand, type CommandRunner } from './status.js';
import type { WorkspaceInspection } from './workspace.js';

/**
 * The files in an AgentWorkspace, one directory at a time, with what git says about them.
 *
 * The fourth reader of a worktree, beside `status.ts`, `churn.ts` and `branches.ts`, and it
 * obeys the same two rules they do: read, never written to by an agent, never shown to one.
 * Nothing here enters a prompt.
 *
 * **Three reads and nothing else**, priced against a real AgentWorkspace with 68,000 files on
 * disk (`.scratch/file-sidebar/issues/02`):
 *
 * 1. `git status --porcelain=v2 -unormal`, **once per refresh for the whole worktree** — 3 ms,
 *    and flat in what is on disk, because git does not descend into an ignored directory.
 *    `-unormal` collapses an untracked directory to a single `? dir/` row, which *is* the
 *    roll-up a lazy tree needs; `-uall` is linear and reaches 15 ms at 20,000 untracked files.
 * 2. `readdir`, **per directory as it is expanded** — 0.06 ms. There is **no walk anywhere**:
 *    walking the same folder is 535 ms and 123,021 entries, of which about 700 are the user's.
 * 3. `git check-ignore -n -v`, **one call per directory as it opens** — ~2 ms. It
 *    cannot be derived from `ls-files` and `status`: an ignored directory and an *empty
 *    untracked* one are both absent from both, so the derivation is wrong exactly where it
 *    would be silent.
 *
 * The roll-up is free at every level and nothing walks to get it: `? dir/` already says *there
 * is something new in here*, and for tracked files the changed set is a handful of rows and the
 * roll-up is a prefix match over them. A collapsed row carries a count without its subtree
 * having been opened.
 *
 * **Two facts, two channels, and the second one was found in use.** The tree first decorated from
 * `status` alone, and an agent that commits its work emptied it — which is the ordinary case,
 * because blobot has a commit control in the tray. So a fourth read joins the three: the branch's
 * own diff against the base, `git diff --name-only <base>...HEAD`, one tree comparison per
 * worktree. `touched` is *this file is part of what this agent did on this branch*, committed or
 * not, and it is what the row's weight draws; `mark` stays exactly what it was, *and it is not
 * committed yet*. No third letter was invented for it: the mark separates modified from
 * untracked, the weight separates work from everything else, and neither does the other's job.
 */

/** `M` is anything git calls changed; `?` is untracked. See `markOf`. */
export type TreeMark = 'M' | '?';

export interface TreeEntry {
  readonly name: string;
  readonly kind: 'file' | 'directory';
  /** Shown and dimmed, never hidden, and never descended into until asked. */
  readonly ignored?: boolean;
  /**
   * Part of what this agent did on this branch, committed or not. The row's weight, and the
   * only thing that survives the agent committing.
   */
  readonly touched?: boolean;
  /**
   * Uncommitted, and how. Absent on work that has already been committed.
   *
   * On a **directory** it is the fold of the marks underneath: `?` where everything uncommitted
   * in there is untracked, `M` the moment any of it is a change to a tracked file. The value in
   * the status column is still the count — this is what gives the count its hue, which is the
   * only way a folder can say *which kind* without a walk or a second letter.
   */
  readonly mark?: TreeMark;
  /**
   * Changed paths under a collapsed directory, from the prefix match. Absent where there are
   * none, and absent on a directory carrying its own `?`, which says the same thing better.
   */
  readonly changes?: number;
  /** A repository root inside a `nested` Workspace, which is where git starts again. */
  readonly repoRoot?: boolean;
}

export interface DirectoryReading {
  /** Relative to the AgentWorkspace. `''` is its root. */
  readonly path: string;
  readonly entries: readonly TreeEntry[];
  /**
   * More entries than the ceiling, so this listing is a floor. `churn.ts`'s honesty rather
   * than a silent truncation.
   */
  readonly partial?: boolean;
  /**
   * Whether git can answer for this directory at all. False on a `plain` copy and on the loose
   * files beside the repositories of a `nested` Workspace — where the status column must be
   * **absent rather than empty**, because an empty column reads as *nothing changed*.
   */
  readonly tracked: boolean;
}

export interface WorkspaceTree {
  /** The folder is where it was left. False is `folder not found`, and nothing else is read. */
  readonly present: boolean;
  readonly directories: readonly DirectoryReading[];
}

/**
 * Past this many entries a directory listing costs more than it is worth.
 *
 * Measured: outside the ignored tree no directory in this repository exceeds 55 entries, and
 * the 4,098-entry one is inside `node_modules`. A ceiling here never fires on an ordinary
 * directory and still caps the one an author deliberately opens.
 */
const ENTRY_CEILING = 500;

export interface TreeOptions {
  readonly kind: WorkspaceInspection['kind'];
  /**
   * What the branch is measured against: the Workspace repository's current branch, the same
   * base `status.ts` counts `ahead` from. Undefined leaves `touched` meaning exactly `mark`,
   * which is what a detached HEAD and a workspace with no base honestly know.
   */
  readonly base?: string;
  readonly run?: CommandRunner;
}

/**
 * Several directories of one AgentWorkspace, read together.
 *
 * Many rather than one because the status read is per *worktree* and the refresh re-reads every
 * directory the user has open: asking for them one at a time would run `git status` once per
 * open folder for the same answer.
 */
export async function readWorkspaceTree(
  workspacePath: string,
  paths: readonly string[],
  options: TreeOptions,
): Promise<WorkspaceTree> {
  if (!existsSync(workspacePath)) return { present: false, directories: [] };
  const exec = options.run ?? spawnCommand;

  // A copy has no git in it at all: no changed set, no ignore list, and no status column.
  if (options.kind === 'plain') {
    const directories = await Promise.all(
      paths.map(async (path) => listDirectory(workspacePath, path, undefined, exec)),
    );
    return { present: true, directories };
  }

  // Which repository governs each directory. One `rev-parse` each rather than a list of repos
  // passed in: a `nested` Workspace's seam is wherever git answers again, and asking the
  // directory is the only reading that cannot disagree with the folder in front of it.
  const roots = new Map<string, string | undefined>();
  await Promise.all(
    paths.map(async (path) => {
      roots.set(path, await repositoryRoot(workspacePath, path, exec));
    }),
  );

  // One status per distinct worktree, and a `nested` Workspace has several. Parallel, because
  // 22 repositories read serially is 231 ms and a visible pause where together they are 26.
  const distinct = [...new Set([...roots.values()].filter((root): root is string => root !== undefined))];
  const governing = new Map<string, Governing>();
  await Promise.all(
    distinct.map(async (root) => {
      governing.set(root, await readWork(root, options.base, exec));
    }),
  );

  const directories = await Promise.all(
    paths.map(async (path) => {
      const root = roots.get(path);
      const reading = await listDirectory(
        workspacePath,
        path,
        root === undefined ? undefined : governing.get(root),
        exec,
      );
      return root === undefined
        ? markRepositoryRoots(workspacePath, reading, options.base, exec)
        : reading;
    }),
  );
  return { present: true, directories };
}

/**
 * Where git starts again, given a count, in a listing git could not answer for.
 *
 * The seam in a `nested` Workspace: the ticked repositories are worktrees with a real changed
 * set and the loose files beside them are a copy, so one tree is part git-backed and part not.
 * Saying nothing reproduces the failure the whole surface refuses — a reader who has just seen
 * marks two rows above reads their absence as *clean*. A repository root is the only directory
 * whose row can carry a roll-up here, which makes the seam legible with no device invented for
 * it: in an untracked listing, the rows with counts are exactly the repositories.
 */
async function markRepositoryRoots(
  workspacePath: string,
  reading: DirectoryReading,
  base: string | undefined,
  exec: CommandRunner,
): Promise<DirectoryReading> {
  const roots = reading.entries.filter((entry) => entry.repoRoot === true);
  if (roots.length === 0) return reading;
  const at = reading.path === '' ? workspacePath : join(workspacePath, reading.path);
  // Parallel: 22 repositories read one after another is 231 ms and a visible pause.
  const counts = new Map(
    await Promise.all(
      roots.map(async (entry): Promise<[string, number]> => [
        entry.name,
        (await readWork(join(at, entry.name), base, exec)).work.size,
      ]),
    ),
  );
  return {
    ...reading,
    entries: reading.entries.map((entry) => {
      const count = counts.get(entry.name);
      return count === undefined || count === 0 ? entry : { ...entry, touched: true, changes: count };
    }),
  };
}

/**
 * Everything one worktree has to say about itself: what is uncommitted, and what this branch
 * changed. Two commands, run together, because they answer two halves of one question.
 */
async function readWork(
  root: string,
  base: string | undefined,
  exec: CommandRunner,
): Promise<Governing> {
  const [changed, committed] = await Promise.all([
    readChanged(root, exec),
    readCommitted(root, base, exec),
  ]);
  const work = new Set<string>([...changed.keys(), ...committed]);
  return { root, changed, committed, work };
}

/**
 * What this branch changed against the base, committed and all.
 *
 * `<base>...HEAD` and not `<base>..HEAD`: the question is *what did this agent do*, which is the
 * diff since the branch diverged, not the diff against wherever the base has moved to since. The
 * same base `status.ts` measures `ahead` from. A base that does not resolve here — a detached
 * HEAD, a repository inside a `nested` Workspace whose branches are its own — says nothing rather
 * than failing the read, and the tree falls back to the uncommitted half it always had.
 */
async function readCommitted(
  root: string,
  base: string | undefined,
  exec: CommandRunner,
): Promise<Set<string>> {
  if (base === undefined) return new Set();
  const result = await exec('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root });
  if (result.code !== 0) return new Set();
  return new Set(result.stdout.split('\n').filter((line) => line !== ''));
}

/** Paths git has something to say about, relative to the repository root. */
type ChangedSet = Map<string, TreeMark>;

interface Governing {
  /** Absolute path of the repository this directory is in. */
  readonly root: string;
  readonly changed: ChangedSet;
  /** Paths the branch changed against its base, whether or not they are still uncommitted. */
  readonly committed: ReadonlySet<string>;
  /** Both of the above, for the roll-up, so a prefix match is one pass over one set. */
  readonly work: ReadonlySet<string>;
}

async function listDirectory(
  workspacePath: string,
  path: string,
  governing: Governing | undefined,
  exec: CommandRunner,
): Promise<DirectoryReading> {
  const absolute = path === '' ? workspacePath : join(workspacePath, path);
  const found = await readdir(absolute, { withFileTypes: true }).catch(() => undefined);
  if (found === undefined) {
    // The directory is gone from under an open folder. Empty and honest about the tracking,
    // rather than a reading that claims git said nothing about files it never saw.
    return { path, entries: [], tracked: governing !== undefined };
  }

  // `.git` is excluded by our own rule and not by asking git, which reports it as *not
  // ignored* — the one entry every tree hides and the ignore list cannot.
  const visible = found.filter((entry) => entry.name !== '.git');
  visible.sort(byKindThenName);
  const kept = visible.slice(0, ENTRY_CEILING);

  const ignored =
    governing === undefined
      ? new Set<string>()
      : await readIgnored(governing.root, kept.map((entry) => join(absolute, entry.name)), exec);

  const entries = kept.map((entry): TreeEntry => {
    const directory = entry.isDirectory();
    const absoluteChild = join(absolute, entry.name);
    const base = {
      name: entry.name,
      kind: directory ? ('directory' as const) : ('file' as const),
      ...(ignored.has(absoluteChild) ? { ignored: true } : {}),
      ...(directory && existsSync(join(absoluteChild, '.git')) ? { repoRoot: true } : {}),
    };
    if (governing === undefined) return base;
    const relative = relativeTo(governing.root, absoluteChild);
    if (!directory) {
      const mark = governing.changed.get(relative);
      // Weight and mark are two channels: the file is part of the work whether or not it is
      // still uncommitted, and only the second half of that goes in the status column.
      if (mark !== undefined) return { ...base, touched: true, mark };
      return governing.committed.has(relative) ? { ...base, touched: true } : base;
    }
    // An untracked directory is one `? dir/` row and every file under it is new, so the count
    // would be a walk to say what the mark already says.
    const whole = governing.changed.get(`${relative}/`);
    if (whole !== undefined) return { ...base, touched: true, mark: whole };
    const changes = countUnder(governing.work, relative);
    if (changes === 0) return base;
    // The count says how much; the fold says which kind. `M` wins a mixed folder because a
    // change to a tracked file is the stronger claim — a folder of new files is a folder
    // nothing has been taken out of. All committed folds to nothing, which is the same silence
    // a committed file's own status column keeps.
    const fold = markUnder(governing.changed, relative);
    return { ...base, touched: true, changes, ...(fold === undefined ? {} : { mark: fold }) };
  });

  return {
    path,
    entries,
    ...(visible.length > kept.length ? { partial: true } : {}),
    tracked: governing !== undefined,
  };
}

/** Directories first, then files, each alphabetically. What every file tree does. */
function byKindThenName(
  left: { name: string; isDirectory(): boolean },
  right: { name: string; isDirectory(): boolean },
): number {
  if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
  return left.name.localeCompare(right.name);
}

function relativeTo(root: string, absolute: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return absolute.startsWith(prefix) ? absolute.slice(prefix.length) : absolute;
}

/**
 * The one mark that stands for everything uncommitted under a directory.
 *
 * Zed's rule, in this tree's two-letter vocabulary: a folder of nothing but new files reads as
 * added, and one mixed kind of the folder reads as modified. There are only two letters here, so
 * the mixed case and the modified case are the same answer, which is why no third one is needed.
 */
function markUnder(changed: ChangedSet, relative: string): TreeMark | undefined {
  const prefix = `${relative}/`;
  let seen: TreeMark | undefined;
  for (const [path, mark] of changed) {
    if (!path.startsWith(prefix)) continue;
    if (mark === 'M') return 'M';
    seen = mark;
  }
  return seen;
}

function countUnder(work: ReadonlySet<string>, relative: string): number {
  const prefix = `${relative}/`;
  let count = 0;
  for (const path of work) if (path.startsWith(prefix)) count += 1;
  return count;
}

/**
 * The repository governing a directory, or nothing where there is none.
 *
 * Bounded to the AgentWorkspace on purpose: a worktree that happens to sit inside some other
 * repository must not have that repository's changed set drawn over it.
 */
async function repositoryRoot(
  workspacePath: string,
  path: string,
  exec: CommandRunner,
): Promise<string | undefined> {
  const absolute = path === '' ? workspacePath : join(workspacePath, path);
  if (!existsSync(absolute)) return undefined;
  const result = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: absolute });
  if (result.code !== 0) return undefined;
  const root = result.stdout.trim();
  if (root === '') return undefined;
  return root === workspacePath || root.startsWith(`${workspacePath}/`) ? root : undefined;
}

/**
 * What git says has changed in this worktree, by path.
 *
 * **`M` is everything that is not untracked**, which is the whole vocabulary the sidebar draws.
 * Renamed, deleted and conflicted have no mark of their own and none has been asked for: a
 * deleted file is not in the listing to mark anyway, so the only thing they change is a
 * collapsed directory's count, where *something in here moved* is the true and useful answer.
 */
async function readChanged(root: string, exec: CommandRunner): Promise<ChangedSet> {
  const changed: ChangedSet = new Map();
  const result = await exec('git', ['status', '--porcelain=v2', '-unormal'], { cwd: root });
  if (result.code !== 0) return changed;
  for (const line of result.stdout.split('\n')) {
    if (line === '') continue;
    const kind = line[0];
    if (kind === '?') {
      changed.set(line.slice(2), '?');
      continue;
    }
    if (kind === '1' || kind === 'u') {
      const path = line.split(' ').slice(kind === '1' ? 8 : 10).join(' ');
      if (path !== '') changed.set(path, 'M');
      continue;
    }
    if (kind === '2') {
      // A rename carries `<path>\t<origPath>`. The new path is the one on disk.
      const rest = line.split(' ').slice(9).join(' ');
      const path = rest.split('\t')[0] ?? '';
      if (path !== '') changed.set(path, 'M');
    }
  }
  return changed;
}

/**
 * Which of these paths git ignores, in one call.
 *
 * `-n` prints a line for every path rather than only the matches, so `::` is a real answer —
 * *git says nothing about this* — rather than a missing line to be inferred from.
 *
 * The paths go as arguments rather than on stdin, which keeps the injected `CommandRunner` the
 * same shape every other reader here uses. One directory is at most the entry ceiling, so the
 * command line is bounded by the same number the listing is.
 */
async function readIgnored(
  root: string,
  absolutePaths: readonly string[],
  exec: CommandRunner,
): Promise<Set<string>> {
  const ignored = new Set<string>();
  if (absolutePaths.length === 0) return ignored;
  const result = await exec('git', ['check-ignore', '-n', '-v', '--', ...absolutePaths], {
    cwd: root,
  });
  // Exit 1 means nothing matched, which is an answer and not a failure. Anything else and we
  // say nothing rather than dimming the whole listing on a guess.
  if (result.code !== 0 && result.code !== 1) return ignored;
  for (const line of result.stdout.split('\n')) {
    if (line === '') continue;
    const [source, path] = splitOnce(line, '\t');
    if (path === undefined || source === '::') continue;
    ignored.add(path);
  }
  return ignored;
}

function splitOnce(line: string, separator: string): [string, string | undefined] {
  const at = line.indexOf(separator);
  if (at === -1) return [line, undefined];
  return [line.slice(0, at), line.slice(at + separator.length)];
}
