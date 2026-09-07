import type { SkillDiscovery } from '../../skills/inventory.js';
import { boxPaletteNames, personalPaletteNames, type BoxPaletteScope } from '../acp/box-palette.js';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Which of a Codex session's advertised commands blobot is willing to put in front of a user.
 *
 * ADR-0003's rule, unchanged on the third runtime: **authored surface is offered, vendor and
 * plugin surface is not**, decided by reading the directories a person writes into and
 * intersecting with what the session actually advertised. Only the directories are Codex's,
 * which is why this file is here and not in core.
 *
 * The measurement, 2026-08-30, on a real session in an empty workspace: **52 commands
 * advertised**, ten built-ins and 42 prefixed with `$`. Those 42 reconcile exactly, and the
 * reconciliation is the whole design:
 *
 * - **36 are the operator's own**, from `~/.agents/skills` — the cross-vendor skills directory
 *   Codex reads alongside its own, and the same one the author's `~/.claude/skills` symlinks
 *   into. A person sat down and wrote these.
 * - **6 are the vendor's**, and they are hiding *inside* the operator's directory:
 *   `~/.codex/skills/.system/` holds `imagegen`, `openai-docs`, `plugin-creator`,
 *   `review-agent`, `skill-creator` and `skill-installer`. A dot-directory under the skills
 *   root is Codex's staging area and not somebody's work, so it is skipped by name.
 *
 * A plugin's skills are in neither, which is the line ADR-0003's amendment turns on. This
 * machine has three enabled plugins from a curated marketplace, cached under
 * `~/.codex/plugins/cache/`, and nothing in there can reach the menu by construction.
 *
 * Reading the directories ourselves risks drifting from Codex's own resolution, so the result
 * is only ever *intersected* with the advertisement: drift costs a command we failed to offer,
 * never one we offered that does not exist.
 */

/**
 * The built-ins blobot vouches for, by name. Five, chosen the way Claude's five were: each is
 * something a teammate on a coding team actually does.
 *
 * `logout` signs the user's whole machine out of Codex from inside a composer, and `goal`
 * belongs to the bridge's goal extension, which this effort declines. `plan` is left off
 * because it is `collaboration_mode` under another name and the option picker already offers
 * that decision once. `mcp` and `skills` list what is configured, which is introspection
 * rather than work.
 */
export const VOUCHED_BUILT_INS: readonly string[] = [
  'status',
  'compact',
  'review',
  'review-branch',
  'review-commit',
];

/** Where Codex reads a person's skills from, in the order it resolves them. */
export function skillRoots(cwd: string): string[] {
  const home = process.env['CODEX_HOME'] ?? join(homedir(), '.codex');
  return [join(cwd, '.agents', 'skills'), join(cwd, '.codex', 'skills'), join(home, 'skills'), join(homedir(), '.agents', 'skills')];
}

/** Everything blobot is willing to offer in this workspace, by name and without the `$`. */
export function offerableNames(cwd: string, box?: BoxPaletteScope, personalPath?: string): Set<string> {
  return new Set([...personalPaletteNames(personalPath), ...contextNames(cwd, box)]);
}

function contextNames(cwd: string, box?: BoxPaletteScope): Set<string> {
  if (box !== undefined) return new Set([...boxPaletteNames(cwd, [{ path: join(cwd, '.codex', 'skills'), kind: 'skills' }, { path: join(cwd, '.agents', 'skills'), kind: 'skills' }], box), ...VOUCHED_BUILT_INS]);
  const names = new Set<string>(VOUCHED_BUILT_INS);
  for (const root of skillRoots(cwd)) for (const name of skillNames(root)) names.add(name);
  return names;
}

/**
 * A skill is a directory holding a `SKILL.md`, and takes its directory's name.
 *
 * Asked for by `statSync` rather than by `Dirent.isDirectory`, because **a skill directory is
 * very often a symlink** — every one of the author's is, into `~/.agents/skills`. And a name
 * starting with `.` is skipped: that is where Codex keeps the six it ships.
 */
function skillNames(dir: string): string[] {
  let entries: { name: string }[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // A workspace with no `.codex/`, or a machine with no `~/.agents`, is the ordinary case.
    return [];
  }
  return entries
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => isFile(join(dir, name, 'SKILL.md')));
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Codex advertises a skill as `$name` and a built-in as `name`. The `$` is the runtime's own
 * spelling of *this one is a skill*, so it is stripped before the allowlist is consulted and
 * never stored in it: the directory on disk is called `research`, not `$research`.
 */
export function offeredName(advertised: string): string {
  return advertised.startsWith('$') ? advertised.slice(1) : advertised;
}
export const CODEX_SKILL_DISCOVERY: SkillDiscovery = {
  personal: true,
  locations: (cwd, box, shared) => [
    ...['.agents/skills', '.codex/skills'].map((path) => ({ path: join(cwd, path), scope: 'project' as const, ...(box ? { boundary: cwd } : {}) })),
    ...(box ? (shared ? [{ path: shared, scope: 'computer' as const, boundary: shared }] : [])
      : [join(process.env['CODEX_HOME'] ?? join(homedir(), '.codex'), 'skills'), join(homedir(), '.agents/skills')].map((path) => ({ path, scope: 'computer' as const }))),
  ],
};
