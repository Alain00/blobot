import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * How much disk one directory is holding, in bytes.
 *
 * The apparent size of every file under it, summed, and a directory that is not there is 0
 * rather than a failure: the number exists to be shown next to a delete button, and a
 * workspace the user already removed by hand is a workspace that frees nothing.
 *
 * Two deliberate imprecisions, both in the same direction. Symlinks are counted as the link
 * and never followed, so nothing outside the tree is counted twice or at all. Hard links are
 * counted once per name, which can overstate a git worktree's checkout. blobot says *about*
 * this much, because a number rounded to a unit is what the user can act on and an exact
 * block count is not.
 */
export async function directorySize(path: string): Promise<number> {
  let total = 0;
  const stack = [path];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    const stats = await lstat(next).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (stats === undefined) continue;
    if (!stats.isDirectory()) {
      total += stats.size;
      continue;
    }
    const entries = await readdir(next).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) stack.push(join(next, entry));
  }
  return total;
}
