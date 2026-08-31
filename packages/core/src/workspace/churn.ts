import type { CommandRunner } from './status.js';

/**
 * How much has changed in an AgentWorkspace since its last commit, in lines.
 *
 * The count a person reads before deciding whether to commit, and the one thing the old tray's
 * `3 changed` could not say: a file touched is not a measure of anything, and *+412 −7* and
 * *+4 −3* are two different afternoons wearing the same word.
 *
 * **Against `HEAD`, not against the base branch.** This is *what is uncommitted here*, which is
 * what the commit control acts on. How far ahead of the base the branch is stays a separate
 * number with a separate meaning, and the two are drawn apart for that reason.
 *
 * **Untracked files count as all additions**, because that is what committing them would add.
 * git will not diff them without being told they exist, and telling it means writing to the
 * index, so each one is diffed against nothing instead. That costs a subprocess per file, which
 * is why there is a ceiling on how many: past it the number stops being worth what it costs, and
 * `partial` says so rather than the tray quietly under-reporting.
 */

export interface Churn {
  readonly added: number;
  readonly removed: number;
  /** Files with something in them, tracked and untracked together. */
  readonly files: number;
  /** More untracked files than the ceiling, so the additions are a floor and not a total. */
  readonly partial?: boolean;
}

/** Past this many untracked files the count costs more than it is worth. */
const UNTRACKED_CEILING = 100;

export async function readChurn(cwd: string, exec: CommandRunner): Promise<Churn | undefined> {
  const tracked = await exec('git', ['diff', '--numstat', 'HEAD'], { cwd });
  if (tracked.code !== 0) return undefined;

  let added = 0;
  let removed = 0;
  let files = 0;
  for (const row of numstat(tracked.stdout)) {
    added += row.added;
    removed += row.removed;
    files += 1;
  }

  const listed = await exec('git', ['ls-files', '--others', '--exclude-standard'], { cwd });
  const others = listed.code === 0 ? lines(listed.stdout) : [];
  const counted = others.slice(0, UNTRACKED_CEILING);
  const sizes = await Promise.all(counted.map(async (path) => countFile(cwd, path, exec)));
  for (const size of sizes) {
    added += size;
    files += 1;
  }

  return {
    added,
    removed,
    files,
    ...(others.length > counted.length ? { partial: true } : {}),
  };
}

/**
 * One untracked file's lines, diffed against nothing.
 *
 * `git diff --no-index` exits 1 when the two differ, which is every time here, so the exit code
 * is not read: what matters is whether it printed a numstat row. A binary file prints `-` and
 * adds nothing, which is right — there are no lines in it to add.
 */
async function countFile(cwd: string, path: string, exec: CommandRunner): Promise<number> {
  const result = await exec('git', ['diff', '--no-index', '--numstat', '/dev/null', path], { cwd });
  const [row] = numstat(result.stdout);
  return row?.added ?? 0;
}

function numstat(stdout: string): { added: number; removed: number }[] {
  const rows: { added: number; removed: number }[] = [];
  for (const line of lines(stdout)) {
    const [left, right] = line.split('\t');
    // `-` in both columns is git's word for a binary file. It is a changed file with no lines,
    // so it counts once as a file and never as a line.
    const added = Number.parseInt(left ?? '', 10);
    const removed = Number.parseInt(right ?? '', 10);
    rows.push({
      added: Number.isFinite(added) ? added : 0,
      removed: Number.isFinite(removed) ? removed : 0,
    });
  }
  return rows;
}

function lines(stdout: string): string[] {
  return stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}
