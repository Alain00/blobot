import type { CommandRunner } from './status.js';

/**
 * Which files changed in an AgentWorkspace, one row each.
 *
 * `churn.ts` has computed exactly this since the tray learned to say `+412 −7`: a numstat
 * against `HEAD` and a line count per untracked file. It summed the rows and threw them away,
 * because a figure was all anything asked for. The git panel asks for the rows, so the reader
 * moved here and `readChurn` became the sum of it — **one read, so the panel's total and the
 * tray's figure cannot disagree**, which is the whole reason this is not a second reader.
 *
 * **Against `HEAD`**, like the churn: this is *what is uncommitted here*, which is what the
 * commit control acts on. How far ahead of the base the branch is stays a separate number with a
 * separate meaning.
 *
 * **Untracked files count as all additions**, because that is what committing them would add.
 * git will not diff a file it does not know about without being told it exists, and telling it
 * means writing the index, so each one is diffed against nothing instead. That is a subprocess
 * per file, which is why there is a ceiling: past it `partial` says the figure is a floor rather
 * than the panel quietly under-reporting.
 *
 * **`-z`, and the reason is renames.** `git diff --numstat` prints a rename as
 * `src/{old.ts => new.ts}`, which is a sentence about two paths and not a path: handing it to
 * `git commit --` fails. The NUL form prints the two paths as their own fields, so a renamed row
 * carries both and a commit that takes it takes the deletion with the addition. It also settles
 * every path with a space or a quote in it, which the line form escapes.
 */

export interface ChangedFile {
  /** Relative to the repository. The **new** path where git reports a rename. */
  readonly path: string;
  readonly added: number;
  readonly removed: number;
  /** git does not know this file yet, so committing it needs an `add` first. */
  readonly untracked?: true;
  /**
   * A rename's old path. Committing this row has to name both, or the addition lands and the
   * deletion stays behind as uncommitted work nobody chose to leave.
   */
  readonly from?: string;
}

export interface WorkspaceChanges {
  readonly rows: readonly ChangedFile[];
  readonly added: number;
  readonly removed: number;
  /** Files with something in them, tracked and untracked together. */
  readonly files: number;
  /** More untracked files than the ceiling, so this is a floor and not a total. */
  readonly partial?: boolean;
}

/** Past this many untracked files the count costs more than it is worth. */
export const UNTRACKED_CEILING = 100;

export async function readChanges(
  cwd: string,
  exec: CommandRunner,
): Promise<WorkspaceChanges | undefined> {
  const tracked = await exec('git', ['diff', '--numstat', '-z', 'HEAD'], { cwd });
  if (tracked.code !== 0) return undefined;

  const rows: ChangedFile[] = numstat(tracked.stdout);

  const listed = await exec('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd });
  const others = listed.code === 0 ? fields(listed.stdout) : [];
  const counted = others.slice(0, UNTRACKED_CEILING);
  const sizes = await Promise.all(counted.map(async (path) => countFile(cwd, path, exec)));
  counted.forEach((path, index) => {
    rows.push({ path, added: sizes[index] ?? 0, removed: 0, untracked: true });
  });

  let added = 0;
  let removed = 0;
  for (const row of rows) {
    added += row.added;
    removed += row.removed;
  }

  return {
    rows,
    added,
    removed,
    files: rows.length,
    ...(others.length > counted.length ? { partial: true } : {}),
  };
}

/**
 * One untracked file's lines, diffed against nothing.
 *
 * `git diff --no-index` exits 1 when the two differ, which is every time here, so the exit code
 * is not read: what matters is whether it printed a row. A binary file prints `-` and adds
 * nothing, which is right — there are no lines in it to add.
 */
async function countFile(cwd: string, path: string, exec: CommandRunner): Promise<number> {
  const result = await exec('git', ['diff', '--no-index', '--numstat', '/dev/null', path], { cwd });
  const [row] = numstat(result.stdout);
  return row?.added ?? 0;
}

/**
 * `added\tremoved\tpath\0`, and for a rename `added\tremoved\t\0old\0new\0`.
 *
 * The empty third column is the whole signal that two path fields follow, and it is why this
 * walks the fields with an index rather than mapping over them.
 */
function numstat(stdout: string): ChangedFile[] {
  const parts = fields(stdout);
  const rows: ChangedFile[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const columns = (parts[index] ?? '').split('\t');
    if (columns.length < 3) continue;
    // `-` in both columns is git's word for a binary file. It is a changed file with no lines,
    // so it counts once as a file and never as a line.
    const added = count(columns[0]);
    const removed = count(columns[1]);
    const inline = columns.slice(2).join('\t');
    if (inline !== '') {
      rows.push({ added, removed, path: inline });
      continue;
    }
    const from = parts[index + 1];
    const to = parts[index + 2];
    index += 2;
    if (from === undefined || to === undefined) continue;
    rows.push({ added, removed, path: to, from });
  }
  return rows;
}

function count(column: string | undefined): number {
  const value = Number.parseInt(column ?? '', 10);
  return Number.isFinite(value) ? value : 0;
}

/** NUL-separated, and never trimmed: a trailing space is part of a path git gave us verbatim. */
function fields(stdout: string): string[] {
  return stdout.split('\0').filter((field) => field !== '' && field !== '\n');
}
