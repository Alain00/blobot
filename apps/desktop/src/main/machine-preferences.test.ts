import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MachinePreferences } from './machine-preferences.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'blobot-machine-preferences-'));
  roots.push(root);
  return new MachinePreferences(join(root, 'preferences.json'));
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
describe('Machine sleep preferences', () => {
  it('defaults to two hours and persists live changes, including disabled sleep', async () => {
    const prefs = await fixture();
    await prefs.load();
    expect(prefs.idleAfterMs).toBe(7_200_000);
    await Promise.all([prefs.setIdleAfterMs(1000), prefs.setIdleAfterMs(0)]);
    const reopened = new MachinePreferences(prefs.path);
    await reopened.load();
    expect(reopened.idleAfterMs).toBe(0);
    expect(JSON.parse(await readFile(prefs.path, 'utf8'))).toEqual({ idleAfterMs: 0 });
  });
  it('rejects invalid IPC values without overwriting the saved setting', async () => {
    const prefs = await fixture();
    await prefs.setIdleAfterMs(1000);
    for (const bad of [-1, NaN, Infinity, 0.5, 31_536_000_001]) {
      await expect(prefs.setIdleAfterMs(bad)).rejects.toThrow();
    }
    expect(prefs.idleAfterMs).toBe(1000);
    expect(JSON.parse(await readFile(prefs.path, 'utf8'))).toEqual({ idleAfterMs: 1000 });
  });
  it('keeps a malformed saved file rather than silently replacing it with defaults', async () => {
    const prefs = await fixture();
    await writeFile(prefs.path, 'invalid');
    await expect(prefs.load()).rejects.toThrow('kept');
    expect(await readFile(prefs.path, 'utf8')).toBe('invalid');
  });
});
