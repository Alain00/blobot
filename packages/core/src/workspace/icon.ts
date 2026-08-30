import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

/** An image found in a Workspace that could stand for the team working in it. */
export interface WorkspaceIcon {
  readonly path: string;
  /** Where it was found, relative to the Workspace, so the flow can say so. */
  readonly relative: string;
}

/**
 * Look through a Workspace for something that already identifies the project.
 *
 * A team's mark is its members' faces, which answer *who is on it*. An icon answers a different
 * question — *which project is this* — and most repositories have already answered it, in a
 * favicon or a logo somebody committed. So the creation flow offers what it found rather than
 * making the user go and find it.
 *
 * Two rules this obeys, and both matter more than the search itself.
 *
 * **It is a suggestion, never a silent choice.** The caller shows what was found and where it
 * came from, and the user can turn it down. An icon that appeared out of nowhere and is subtly
 * wrong is worse than no icon, because there is nothing on screen that explains it.
 *
 * **Raster only.** These are files out of a repository blobot did not write, rendered in the
 * app's own window. Restricting the search to formats Electron's `nativeImage` decodes keeps
 * the whole class of markup-that-is-also-a-document out of the renderer, and costs almost
 * nothing: a project with an SVG logo and no raster one simply has no suggestion.
 *
 * It is **one walk of the tree, four levels deep**, ranking every candidate it passes rather
 * than probing a list of paths it hopes exist. Two rewrites got it here. Probing the top level
 * alone missed a real repository of the author's entirely, where the icon lives at
 * `apps/contapp-web/public/favicon.png`; probing one level into `apps/` found that and would
 * still have missed `apps/web/frontend/public/favicon.png`, which is the same shape with one
 * more floor. There is no list of paths that ends, so the search stopped being a list.
 */
export async function findWorkspaceIcon(workspacePath: string): Promise<WorkspaceIcon | undefined> {
  const own = basename(workspacePath).toLowerCase();
  const found: { relative: string; score: number }[] = [];

  const walk = async (relative: string, depth: number): Promise<void> => {
    const entries = await readdir(relative === '' ? workspacePath : join(workspacePath, relative), {
      withFileTypes: true,
    }).catch(() => []);
    const deeper: Promise<void>[] = [];

    for (const entry of entries) {
      const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (depth + 1 > MAX_DEPTH || skipped(entry.name)) continue;
        deeper.push(walk(child, depth + 1));
        continue;
      }
      // A symlink counts: `stat` below follows it, and a project that keeps its mark in one
      // place and links to it from another has still said what its mark is.
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      const file = rankOf(entry.name);
      if (file === undefined) continue;
      found.push({ relative: child, score: scoreOf({ relative, depth, own, file }) });
    }
    // Every branch at once. Sequentially, a monorepo four levels deep spends the folder picker's
    // whole budget waiting on directories that have nothing to do with each other — the same
    // reason `inspect.ts` describes its repositories in parallel.
    await Promise.all(deeper);
  };

  await walk('', 0);
  found.sort((left, right) => left.score - right.score);

  for (const candidate of found) {
    const path = join(workspacePath, candidate.relative);
    const size = await stat(path)
      .then((file) => file.size)
      .catch(() => 0);
    // A zero-byte placeholder is not an icon, and something enormous is not one either: an icon
    // is decoded and downscaled in the main process, and the ceiling is what stops a folder
    // picker from stalling on a 40MB PNG somebody checked in by accident. A file that fails
    // either test is skipped rather than ending the search, because the next candidate down is
    // very often the right answer. Sized at the end rather than during the walk, so the cost is
    // one `stat` per plausible file instead of one per file in the tree.
    if (size > 0 && size <= MAX_BYTES) return { path, relative: candidate.relative };
  }
  return undefined;
}

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * How far down to look.
 *
 * Four, because `apps/web/frontend/public/favicon.png` is a shape people ship and its
 * directory is four levels below the Workspace. Not unbounded, for the reason `inspect.ts`
 * gives about its own limit: a folder picker that walks a home directory to the leaves takes
 * long enough to look broken. An icon deeper than this is invisible to blobot, which is a limit
 * worth stating rather than a bug to discover.
 */
const MAX_DEPTH = 4;

/**
 * Which directories are worth descending into.
 *
 * `node_modules` and the build outputs are the ones that make a walk expensive, and they are
 * also full of *other people's* icons — a favicon out of a dependency's fixture directory is
 * exactly the wrong suggestion. Test trees are skipped for the second reason rather than the
 * first. Dotted directories are skipped except `.github`, which is somewhere a project really
 * does keep its mark.
 */
function skipped(name: string): boolean {
  if (SKIP.has(name)) return true;
  return name.startsWith('.') && name !== '.github';
}

const SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'coverage',
  'tmp',
  'test',
  'tests',
  '__tests__',
  'fixtures',
  '__fixtures__',
  'e2e',
]);

/**
 * How good a candidate is, lowest first, as one number out of four ordered questions.
 *
 * The order is the whole design, and each place is worth ten of the one after it.
 *
 * **Which directory it is in** dominates everything: an icon in a `public/` anywhere beats one
 * in a `docs/` at the top, because a project with both has already said which is the front of
 * the house.
 *
 * **Then how deep**, so an icon the Workspace itself owns beats one belonging to an application
 * inside it. A repository with a `public/favicon.png` at its root has answered this question
 * about itself.
 *
 * **Then whether a folder on the way matches the repository's own name.** In `contapp-web`
 * holding `apps/contapp-web` and `apps/contapp-pos`, one of those two is the front of the house
 * and the repository has said which; alphabetical order would have picked the other.
 *
 * **Then the file's own name**, `apple-touch-icon` down to `favicon` — the first being the one
 * required to be large and square, the last being the one most likely to be a framework default
 * nobody replaced.
 */
function scoreOf(candidate: {
  relative: string;
  depth: number;
  own: string;
  file: number;
}): number {
  const segments = candidate.relative === '' ? [] : candidate.relative.split('/');
  const dir = DIRS.indexOf((segments.at(-1) ?? '').toLowerCase());
  const named = segments.some((segment) => segment.toLowerCase() === candidate.own) ? 0 : 1;
  return (
    (dir === -1 ? DIRS.length : dir) * 10000 + candidate.depth * 1000 + named * 100 + candidate.file
  );
}

/**
 * Where the answer would be, if this file is one at all. Lower is better; `undefined` is not.
 *
 * The names are matched **exactly**, extension aside. A repository full of `logo-white.png`,
 * `logo-dark-text.png` and `logo-mini.png` has not said which one is the mark, and a rule that
 * guessed would be wrong often enough to make every suggestion suspect.
 */
function rankOf(fileName: string): number | undefined {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const ext = EXTS.indexOf(lower.slice(dot + 1));
  if (ext === -1) return undefined;
  const name = NAMES.indexOf(lower.slice(0, dot));
  if (name === -1) return undefined;
  // Name dominates extension: a `favicon.png` and a `favicon.ico` beside each other are the same
  // decision, and `icon.ico` against `favicon.png` is not.
  return name * EXTS.length + ext;
}

const DIRS = ['public', 'static', 'app', 'assets', 'resources', 'www', 'docs', '.github'];
const NAMES = ['apple-touch-icon', 'icon', 'logo', 'favicon'];
const EXTS = ['png', 'webp', 'jpg', 'jpeg', 'ico'];
