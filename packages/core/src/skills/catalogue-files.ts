import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function missing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }
export async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if (missing(error)) return false; throw error; }
}

export async function ownDirectory(path: string): Promise<void> {
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
  await checkedDirectory(path);
}

export async function checkedDirectory(path: string): Promise<string> {
  if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) throw new Error('A managed skills directory is a link or has moved outside its folder. Existing folders were kept.');
  return path;
}

export async function prepareCatalogue(root: string): Promise<void> {
  for (const relative of ['.agents', '.agents/skills', '.blobot', '.blobot/skills', '.blobot/skills/staging', '.blobot/skills/drafts', '.blobot/skills/draft-origins', '.blobot/skills/previous']) {
    await ownDirectory(join(root, relative));
  }
}

export async function readRegular(path: string, limit = 4 * 1024 * 1024): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid skill catalogue file. Existing files were kept.');
    const buffer = Buffer.alloc(stat.size + 1);
    let received = 0;
    while (received < buffer.length) {
      const result = await file.read(buffer, received, buffer.length - received, received);
      if (result.bytesRead === 0) break;
      received += result.bytesRead;
    }
    if (received !== stat.size || (await file.stat()).mtimeMs !== stat.mtimeMs) throw new Error('Skill catalogue changed while reading. Try again.');
    return buffer.subarray(0, received).toString('utf8');
  } finally { await file.close(); }
}

export async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, JSON.stringify(value));
}

export async function writeText(path: string, value: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}`;
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(value); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

export function operationId(value: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) throw new Error('Invalid skill operation.');
  return value;
}
