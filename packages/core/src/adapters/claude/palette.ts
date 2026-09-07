import type { SkillDiscovery } from '../../skills/inventory.js';
import { boxPaletteNames, personalPaletteNames, type BoxPaletteScope } from '../acp/box-palette.js';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AvailableCommand } from '../../runtime.js';

/**
 * Which of a session's advertised commands blobot is willing to put in front of a user.
 *
 * This lives in the adapter and not in core because both halves of the rule are
 * Claude-shaped: the names below are Claude Code's, and `.claude/` is where Claude Code keeps
 * a project's own commands. Nothing outside an adapter may know which provider an agent is,
 * so nothing outside an adapter may hold a list of one provider's command names.
 *
 * The shape of the rule is **authored surface is offered; vendor and plugin surface is not**. A real `claude` was measured
 * advertising 223 commands, 97 KB, on 2026-08-29; `settingSources` without `user` takes that
 * to 48, all of them the provider's own built-ins. Filtering those 48 by hand is a denylist
 * against a vendor's release cadence, and a denylist **fails open**: the next release ships a
 * built-in that reaches the composer unreviewed, the way `/batch` — thirty agents in
 * parallel — would have. So the menu is an allowlist instead, and it fails closed.
 *
 * It has three sources, and the line between them is **who wrote it**:
 *
 * - the workspace's own `.claude/`, written for this repository and shared by every teammate;
 * - the operator's own `~/.claude/skills`, which they sat down and wrote;
 * - a short list of built-ins named below.
 *
 * A plugin's skills are in none of them. That is the distinction ADR-0003's amendment turns
 * on: of the 223 commands measured, 140 came from one installed plugin and only 37 were the
 * operator's own work. Enumerating `~/.claude/skills` from disk separates the two exactly,
 * because a plugin does not install into it.
 */

/**
 * The built-ins blobot vouches for, by name.
 *
 * Deliberately short, and deliberately not "everything harmless". Each of these is something
 * a teammate on a coding team actually does, and each one earns its place against the cost of
 * a second prefix in the one control the whole app funnels through. Anything not named here
 * still *works* when typed: this list decides what blobot offers, never what Claude accepts.
 */
export const VOUCHED_BUILT_INS: readonly string[] = [
  'code-review',
  'security-review',
  'verify',
  'simplify',
  // Kept because the context gauge is on screen: showing a user the problem and withholding
  // the obvious remedy is worse than the transcript divergence compaction causes, which a
  // resumed session can reach anyway.
  'compact',
];

/**
 * The command and skill names this workspace ships, read off disk.
 *
 * blobot knows every agent's workspace path, which is the only reason this is possible: the
 * wire carries `{name, description, input}` and no source field, so an advertisement cannot
 * say whether it came from the repository or from the provider.
 *
 * Reading the directory ourselves risks drifting from the CLI's own resolution. That is why
 * the result is only ever *intersected* with what the session actually advertised — drift
 * costs us a command we failed to offer, never a command we offered that does not exist.
 */
export function projectCommandNames(cwd: string): Set<string> {
  const names = new Set<string>();
  for (const name of skillNames(join(cwd, '.claude', 'skills'))) names.add(name);
  for (const name of commandNames(join(cwd, '.claude', 'commands'), '')) names.add(name);
  return names;
}

/**
 * The operator's own skills, from `~/.claude/skills` (or `CLAUDE_CONFIG_DIR`).
 *
 * Read off disk for the same reason the project's are, and for one more: it is the only way to
 * tell a skill the operator wrote from a skill a plugin installed. The wire cannot say, and the
 * settings scope that loads one loads the other.
 *
 * Personal *commands* are deliberately not read. A skill is a described capability; a personal
 * command is closer to a keyboard shortcut for a terminal session, which is the thing an agent
 * on a team is not in.
 */
export function personalSkillNames(): Set<string> {
  const root = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  return new Set(skillNames(join(root, 'skills')));
}

/** Everything blobot is willing to offer in this workspace, by name. */
export function offerableNames(cwd: string, box?: BoxPaletteScope, personalPath?: string): Set<string> {
  return new Set([...personalPaletteNames(personalPath), ...contextNames(cwd, box)]);
}

function contextNames(cwd: string, box?: BoxPaletteScope): Set<string> {
  if (box !== undefined) return new Set([...boxPaletteNames(cwd, [{ path: join(cwd, '.claude', 'skills'), kind: 'skills' }, { path: join(cwd, '.claude', 'commands'), kind: 'commands' }], box), ...VOUCHED_BUILT_INS]);
  const names = projectCommandNames(cwd);
  for (const name of personalSkillNames()) names.add(name);
  for (const name of VOUCHED_BUILT_INS) names.add(name);
  return names;
}

/**
 * A skill is a directory holding a `SKILL.md`, and takes its directory's name.
 *
 * Membership is decided by asking for the `SKILL.md` rather than by asking whether the entry
 * is a directory, because **a skill directory is very often a symlink**. Observed here: 36 of
 * the author's 37 personal skills are symlinks into a shared `~/.agents/skills`, and
 * `readdirSync` reports every one of them as a symlink and not as a directory. `statSync`
 * follows the link; `Dirent.isDirectory` does not.
 */
function skillNames(dir: string): string[] {
  return entries(dir)
    .map((entry) => entry.name)
    .filter((name) => isFile(join(dir, name, 'SKILL.md')));
}

/**
 * A command is a `.md` file, and a subdirectory namespaces it as `dir:name`.
 *
 * Depth-limited because following symlinks means a cycle is possible, and a menu is not worth
 * an unbounded walk of somebody's home directory.
 */
function commandNames(dir: string, prefix: string, depth = 0): string[] {
  if (depth > 3) return [];
  return entries(dir).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.name.endsWith('.md')) return isFile(path) ? [`${prefix}${entry.name.slice(0, -3)}`] : [];
    return isDirectory(path) ? commandNames(path, `${prefix}${entry.name}:`, depth + 1) : [];
  });
}

/** A workspace with no `.claude/` is the ordinary case, not an error. */
function entries(dir: string): { name: string }[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Both of these follow symlinks, which is the entire point. */
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

/**
 * The menu, out of everything the session advertised.
 *
 * Order follows the advertisement rather than the allowlist, so the list a user reads is
 * stable between turns for reasons the provider controls and we do not have to reproduce.
 */
export function paletteOf(
  advertised: readonly AvailableCommand[],
  allowed: ReadonlySet<string>,
): AvailableCommand[] {
  return advertised.filter((command) => allowed.has(command.name));
}
export const CLAUDE_SKILL_DISCOVERY: SkillDiscovery = {
  personal: true,
  locations: (cwd, box, shared) => [
    { path: join(cwd, '.claude/skills'), scope: 'project', ...(box ? { boundary: cwd } : {}) },
    ...(box ? (shared ? [{ path: shared, scope: 'computer' as const, boundary: shared }] : [])
      : [{ path: join(process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'), 'skills'), scope: 'computer' as const }]),
  ],
};
