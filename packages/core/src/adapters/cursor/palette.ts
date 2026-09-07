import { boxPaletteNames, type BoxPaletteScope } from '../acp/box-palette.js';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Which of a Cursor session's advertised commands blobot will put in front of a user.
 *
 * ADR-0003 on the fifth runtime, with the starkest numbers yet: a live session advertised
 * **130 commands**, including `worktree`, `apply-worktree`, `autopilot` and `shell` — nothing
 * there blobot should hand a team member, and several that would hand the team member somebody
 * else's version of things blobot owns. So the vouched built-in list is **empty**, and the
 * offer is authored ∩ advertised alone: the directories a person writes into, intersected with
 * what the session advertises. On a machine with no authored commands the menu is empty, which
 * is honest — guessing a built-in name nobody has audited is how `/batch` would have landed on
 * Claude.
 *
 * `--plugin-dir` is a spawn flag this adapter never passes, for the same reason: a plugin's
 * surface is a vendor's release cadence and fails open.
 *
 * Personal skills are read from the operator's real `~/.cursor` and `~/.agents`, not from
 * `CURSOR_CONFIG_DIR`. That directory is blobot's, empty of anything a person authored — and
 * ticket 01 measured that the operator's skills load into the session from user level
 * regardless, which is ADR-0003's user scope working as designed (ticket 07).
 *
 * This file survives from PR #1, which reached the zero-built-ins answer before the
 * measurement confirmed the reason for it.
 */

const PROJECT_DIRS = ['commands', 'command', 'skills', 'skill'];

export function offerableNames(cwd: string, box?: BoxPaletteScope): Set<string> {
  if (box !== undefined) return boxPaletteNames(cwd, PROJECT_DIRS.map((dir) => ({ path: join(cwd, '.cursor', dir), kind: 'mixed' })), box);
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
  }
  return names;
}

function personalRoots(): string[] {
  return [join(homedir(), '.cursor'), join(homedir(), '.agents')];
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
