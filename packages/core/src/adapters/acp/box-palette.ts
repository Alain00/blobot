import { readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export interface BoxPaletteScope { readonly sharedSkillsPath?: string; }
export interface AuthoredDirectory { readonly path: string; readonly kind: 'skills' | 'commands' | 'mixed'; }

/** Enumerate only files the same-path mounts let the guest resolve, including loose work. */
export function boxPaletteNames(cwd: string, directories: readonly AuthoredDirectory[], scope: BoxPaletteScope): Set<string> {
  const names = new Set<string>();
  const within = (root: string, path: string): boolean => {
    try {
      const suffix = relative(realpathSync(root), realpathSync(path));
      return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`));
    } catch { return false; }
  };
  const isFile = (root: string, path: string): boolean => {
    try { return within(root, path) && statSync(path).isFile(); } catch { return false; }
  };
  const scan = (root: string, directory: AuthoredDirectory, prefix = '', depth = 0): void => {
    if (depth > 3 || !within(root, directory.path)) return;
    let entries: string[];
    try { entries = readdirSync(directory.path); } catch { return; }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const path = join(directory.path, entry);
      if (directory.kind !== 'commands' && isFile(root, join(path, 'SKILL.md'))) names.add(`${prefix}${entry}`);
      else if (directory.kind !== 'skills') {
        if (entry.endsWith('.md') && isFile(root, path)) names.add(`${prefix}${entry.slice(0, -3)}`);
        else scan(root, { ...directory, path }, `${prefix}${entry}:`, depth + 1);
      }
    }
  };
  for (const directory of directories) scan(cwd, directory);
  if (scope.sharedSkillsPath !== undefined) scan(scope.sharedSkillsPath, { path: scope.sharedSkillsPath, kind: 'skills' });
  return names;
}
