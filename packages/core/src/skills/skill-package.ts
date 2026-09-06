import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { parseDocument } from 'yaml';
import type { SkillMetadata } from './types.js';
import { syncDirectory } from './catalogue-files.js';

export function skillName(value: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 64) throw new Error('Use a skill name with lowercase letters, numbers and single hyphens (up to 64 characters).');
  return value;
}

export function parseSkill(text: string): SkillMetadata {
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (frontmatter === null) throw new Error('SKILL.md needs YAML frontmatter with a name and description.');
  const document = parseDocument(frontmatter[1]!, { uniqueKeys: true, prettyErrors: false });
  if (document.errors.length > 0) throw new Error('SKILL.md has invalid YAML frontmatter.');
  const data: unknown = document.toJS({ maxAliasCount: 20 });
  if (!data || typeof data !== 'object' || Array.isArray(data) || !('name' in data) || typeof data.name !== 'string' ||
      !('description' in data) || typeof data.description !== 'string' || data.description.trim().length === 0 || data.description.length > 1024) {
    throw new Error('SKILL.md needs a name and a description of when to use the skill (up to 1024 characters).');
  }
  return { name: skillName(data.name), description: data.description.trim(),
    ...('metadata' in data && data.metadata && typeof data.metadata === 'object' && 'author' in data.metadata && typeof data.metadata.author === 'string' ? { author: data.metadata.author } : {}),
    ...('license' in data && typeof data.license === 'string' ? { license: data.license } : {}),
    ...('compatibility' in data && typeof data.compatibility === 'string' ? { compatibility: data.compatibility } : {}),
  };
}

export interface SkillFile { readonly path: string; readonly bytes: Buffer; readonly mode: number; }
export interface SkillPackage { readonly files: readonly SkillFile[]; readonly hash: string; readonly metadata: SkillMetadata; }
export type SkillContents = Pick<SkillPackage, 'files' | 'hash'>;

export function inside(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`));
}

/** A package is bounded and self-contained. Symlinks within it become independent copies. */
export async function readSkillPackage(path: string): Promise<SkillPackage> {
  const content = await readSkillContents(path);
  const text = content.files.find((file) => file.path === 'SKILL.md')!.bytes.toString('utf8');
  return { ...content, metadata: parseSkill(text) };
}

/** Copying an explicitly requested draft preserves incomplete frontmatter too. */
export async function readSkillContents(path: string): Promise<SkillContents> {
  const root = await realpath(path);
  const files: SkillFile[] = [];
  let bytes = 0;
  const walk = async (directory: string, prefix: string, ancestors: ReadonlySet<string>): Promise<void> => {
    const resolved = await realpath(directory);
    if (!inside(root, resolved) || ancestors.has(resolved) || ancestors.size > 16) throw new Error('A skill has an external or circular directory link. Copy its resources into the skill folder.');
    for (const name of (await readdir(directory)).sort()) {
      if (name === '.git') continue;
      if (/[\x00-\x1f\\]/.test(name)) throw new Error('A skill contains an unsupported filename.');
      const source = join(directory, name), target = await realpath(source), entry = await lstat(target);
      if (!inside(root, target)) throw new Error('A skill links to files outside its folder. Copy its resources into the skill folder.');
      const filePath = prefix ? `${prefix}/${name}` : name;
      if (entry.isDirectory()) { await walk(source, filePath, new Set([...ancestors, resolved])); continue; }
      if (!entry.isFile()) throw new Error('Skills can contain only regular files and directories.');
      if (entry.size > 8 * 1024 * 1024 || bytes + entry.size > 32 * 1024 * 1024 || files.length >= 4096) throw new Error('The skill is too large (32 MB total, 8 MB per file, 4096 files).');
      const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const before = await file.stat();
        if (!before.isFile() || before.size !== entry.size || before.ino !== entry.ino) throw new Error('Skill files changed during preview. Preview the folder again.');
        const buffer = Buffer.alloc(before.size + 1);
        let received = 0;
        while (received < buffer.length) {
          const read = await file.read(buffer, received, buffer.length - received, received);
          if (read.bytesRead === 0) break;
          received += read.bytesRead;
        }
        const contents = buffer.subarray(0, received);
        const after = await file.stat();
        if (contents.length !== before.size || after.mtimeMs !== before.mtimeMs || await realpath(source) !== target) throw new Error('Skill files changed during preview. Preview the folder again.');
        bytes += contents.length;
        files.push({ path: filePath, bytes: contents, mode: 0o644 | (before.mode & 0o111) });
      } finally { await file.close(); }
    }
  };
  await walk(root, '', new Set());
  const instructions = files.find((file) => file.path === 'SKILL.md');
  if (instructions === undefined || instructions.bytes.length > 1024 * 1024) throw new Error('Choose a folder containing a SKILL.md file (up to 1 MB).');
  const hash = createHash('sha256');
  for (const file of files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    hash.update(JSON.stringify([file.path, file.mode, file.bytes.length])).update('\0').update(file.bytes);
  }
  return { files, hash: hash.digest('hex') };
}

export async function writeSkillPackage(path: string, content: SkillContents): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const directories = new Set([path]);
  for (const file of content.files) {
    const target = join(path, file.path);
    if (!inside(path, target)) throw new Error('Invalid skill file path.');
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const handle = await open(target, 'wx', file.mode);
    try { await handle.writeFile(file.bytes); await handle.sync(); } finally { await handle.close(); }
    let directory = dirname(target);
    while (inside(path, directory)) { directories.add(directory); if (directory === path) break; directory = dirname(directory); }
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) await syncDirectory(directory);
  await syncDirectory(dirname(path));
}

/** A collection may nest skills, but dependencies and our own management files are not skills. */
export async function discoverSkills(path: string): Promise<string[]> {
  const root = await realpath(path), found: string[] = [];
  let visited = 0;
  const scan = async (directory: string, depth: number): Promise<void> => {
    if (++visited > 4096 || depth > 8) throw new Error('Choose a smaller skill collection.');
    const names = await readdir(directory);
    if (names.includes('SKILL.md')) { found.push(directory); return; }
    for (const name of names.sort()) {
      if (['.git', '.blobot', 'node_modules', '.venv'].includes(name)) continue;
      const child = join(directory, name), info = await lstat(child);
      if (info.isDirectory()) await scan(child, depth + 1);
    }
  };
  await scan(root, 0);
  if (found.length === 0) throw new Error('No SKILL.md found. Choose a skill folder or collection, or create a skill.');
  return found;
}
