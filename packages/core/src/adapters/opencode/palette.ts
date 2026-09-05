import { boxPaletteNames, type BoxPaletteScope } from '../acp/box-palette.js';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Which of a session's advertised commands blobot is willing to put in front of a user, on
 * OpenCode.
 *
 * The rule is ADR-0003's and it is the same on both runtimes: **authored surface is offered,
 * vendor and plugin surface is not**, decided by reading the directories a person writes into
 * and intersecting with what the session actually advertised. The directories differ, which
 * is why this file is here and not in `core` — a list of one provider's config paths is a
 * fact about that provider.
 *
 * What is *not* here is a vouched built-in list. Claude's five were chosen against a
 * measurement of what a real session advertises; OpenCode's built-in commands have not been
 * measured, and vouching for a name nobody has observed is guessing. The consequence is
 * honest and worth stating: on a machine with no authored commands, an OpenCode agent's
 * composer menu is empty. `live.test.ts` prints what a real session advertises, which is the
 * measurement that would let this change.
 *
 * Reading the directories ourselves risks drifting from OpenCode's own resolution. The result
 * is only ever *intersected* with the advertisement, so drift costs a command we failed to
 * offer, never one we offered that does not exist.
 */

/** Where OpenCode keeps a project's own commands and skills, relative to the workspace. */
const PROJECT_DIRS = ['command', 'commands', 'skill', 'skills'];

/** Everything blobot is willing to offer in this workspace, by name. */
export function offerableNames(cwd: string, box?: BoxPaletteScope): Set<string> {
  if (box !== undefined) return boxPaletteNames(cwd, PROJECT_DIRS.map((dir) => ({ path: join(cwd, '.opencode', dir), kind: 'mixed' })), box);
  const names = new Set<string>();
  for (const dir of PROJECT_DIRS) {
    for (const name of entriesUnder(join(cwd, '.opencode', dir))) names.add(name);
  }
  for (const name of personalCommandNames()) names.add(name);
  return names;
}

/**
 * The operator's own commands and skills, from `~/.config/opencode` (or `XDG_CONFIG_HOME`,
 * or `OPENCODE_CONFIG`'s directory).
 *
 * Read off disk for the reason ADR-0003's amendment turns on: it is the only way to tell what
 * a person wrote from what a plugin installed. The wire says `{name, description}` and
 * carries no source field.
 */
export function personalCommandNames(): Set<string> {
  const names = new Set<string>();
  for (const root of configRoots()) {
    for (const dir of PROJECT_DIRS) {
      for (const name of entriesUnder(join(root, dir))) names.add(name);
    }
  }
  return names;
}

function configRoots(): string[] {
  const roots: string[] = [];
  const explicit = process.env.OPENCODE_CONFIG;
  if (explicit !== undefined && explicit.length > 0) {
    roots.push(explicit.replace(/\/[^/]*$/, ''));
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  roots.push(join(xdg !== undefined && xdg.length > 0 ? xdg : join(homedir(), '.config'), 'opencode'));
  return roots;
}

/**
 * A command is a `.md` file and a skill is a directory holding a `SKILL.md`; a subdirectory
 * of commands namespaces its contents.
 *
 * `statSync` rather than `Dirent.isDirectory`, because a skill directory is very often a
 * symlink into a shared skills tree and `readdir` reports those as symlinks, not directories.
 */
function entriesUnder(dir: string, prefix = '', depth = 0): string[] {
  if (depth > 3) return [];
  return listing(dir).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.name.endsWith('.md')) {
      return isFile(path) ? [`${prefix}${entry.name.slice(0, -3)}`] : [];
    }
    if (isFile(join(path, 'SKILL.md'))) return [`${prefix}${entry.name}`];
    return isDirectory(path) ? entriesUnder(path, `${prefix}${entry.name}:`, depth + 1) : [];
  });
}

/** A workspace with no `.opencode/` is the ordinary case, not an error. */
function listing(dir: string): { name: string }[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
