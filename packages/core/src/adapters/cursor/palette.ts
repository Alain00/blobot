import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Which of a Cursor session's advertised commands blobot will put in front of a user.
 *
 * ADR-0003: authored surface is offered, vendor and plugin surface is not, decided by reading
 * the directories a person writes into and intersecting with the advertisement. Cursor's
 * built-ins have not been measured on a live session, so there is no vouched list — guessing
 * a name nobody has observed is how `/batch` would have landed on Claude. On a machine with
 * no authored commands the menu is empty, which is honest.
 *
 * `--plugin-dir` is a spawn flag this adapter never passes, for the same reason: a plugin's
 * surface is a vendor's release cadence and fails open.
 *
 * Personal skills are read from the operator's real `~/.cursor` and `~/.agents`, not from
 * `CURSOR_CONFIG_DIR`. That directory is blobot's, empty of anything a person authored.
 */

const PROJECT_DIRS = ['commands', 'command', 'skills', 'skill'];

export function offerableNames(cwd: string): Set<string> {
  const names = new Set<string>();
  for (const dir of PROJECT_DIRS) {
    for (const name of entriesUnder(join(cwd, '.cursor', dir))) names.add(name);
  }
  for (const name of personalCommandNames()) names.add(name);
  return names;
}

export function personalCommandNames(): Set<string> {
  const names = new Set<string>();
  for (const root of personalRoots()) {
    for (const dir of PROJECT_DIRS) {
      for (const name of entriesUnder(join(root, dir))) names.add(name);
    }
    for (const name of skillDirs(root)) names.add(name);
  }
  return names;
}

function personalRoots(): string[] {
  return [join(homedir(), '.cursor'), join(homedir(), '.agents')];
}

function skillDirs(root: string): string[] {
  return entriesUnder(join(root, 'skills')).concat(entriesUnder(join(root, 'skill')));
}

function entriesUnder(dir: string, prefix = '', depth = 0): string[] {
  if (depth > 3) return [];
  return listing(dir).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    if (entry.name.endsWith('.md')) {
      return isFile(path) ? [`${prefix}${entry.name.slice(0, -3)}`] : [];
    }
    if (isFile(join(path, 'SKILL.md'))) return [`${prefix}${entry.name}`];
    return isDirectory(path) ? entriesUnder(path, `${prefix}${entry.name}:`, depth + 1) : [];
  });
}

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
