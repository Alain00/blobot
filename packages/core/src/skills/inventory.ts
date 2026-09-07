import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { inside, parseSkill } from './skill-package.js';
import { readRegular } from './catalogue-files.js';

export interface SkillLocation { readonly path: string; readonly scope: 'personal' | 'project' | 'computer'; readonly boundary?: string; }
export interface SkillDiscovery { readonly personal: boolean; locations(cwd: string, box: boolean, shared?: string): readonly SkillLocation[]; }
export interface DiscoveredSkill { readonly name: string; readonly description: string; readonly path: string; readonly scope: SkillLocation['scope']; readonly command: boolean; readonly conflict: boolean; }

/** A read-only inventory. An announced name cannot identify the winner of a collision. */
export async function inspectSkillLocations(locations: readonly SkillLocation[], commands: readonly string[]): Promise<readonly DiscoveredSkill[]> {
  const found: Omit<DiscoveredSkill, 'conflict'>[] = [], seen = new Set<string>();
  const announced = new Set(commands.map((name) => name.replace(/^[$/]/, '')));
  for (const location of locations) {
    let entries: string[];
    try { entries = await readdir(location.path); } catch { continue; }
    for (const name of entries.slice(0, 4096)) {
      if (name.startsWith('.')) continue;
      try {
        const path = await realpath(join(location.path, name, 'SKILL.md'));
        if (seen.has(path) || location.boundary && !inside(await realpath(location.boundary), path)) continue;
        const metadata = parseSkill(await readRegular(path, 1024 * 1024));
        seen.add(path);
        found.push({ name: metadata.name, description: metadata.description, path, scope: location.scope, command: announced.has(metadata.name) });
      } catch { /* A non-skill or malformed file is not evidence of runtime discovery. */ }
    }
  }
  return found.map((skill) => ({ ...skill, conflict: found.some((other) => other !== skill && other.name === skill.name) }));
}
