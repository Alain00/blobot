import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIVE_TEAM_LIMIT, MachinePreferences } from './machine-preferences.js';

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
    // The whole file every time, so saving one setting never drops the other.
    expect(JSON.parse(await readFile(prefs.path, 'utf8'))).toEqual({ idleAfterMs: 0, liveTeamLimit: DEFAULT_LIVE_TEAM_LIMIT });
  });
  it('rejects invalid IPC values without overwriting the saved setting', async () => {
    const prefs = await fixture();
    await prefs.setIdleAfterMs(1000);
    for (const bad of [-1, NaN, Infinity, 0.5, 31_536_000_001]) {
      await expect(prefs.setIdleAfterMs(bad)).rejects.toThrow();
    }
    expect(prefs.idleAfterMs).toBe(1000);
    expect(JSON.parse(await readFile(prefs.path, 'utf8'))).toEqual({ idleAfterMs: 1000, liveTeamLimit: DEFAULT_LIVE_TEAM_LIMIT });
  });
  it('takes a live-team count, and reads a file written before there was one', async () => {
    const prefs = await fixture();
    await prefs.load();
    expect(prefs.liveTeamLimit).toBe(DEFAULT_LIVE_TEAM_LIMIT);
    await prefs.setLiveTeamLimit(7);
    await prefs.setIdleAfterMs(1000);
    const reopened = new MachinePreferences(prefs.path);
    await reopened.load();
    expect(reopened.liveTeamLimit).toBe(7);
    expect(reopened.idleAfterMs).toBe(1000);

    // Younger than the file: every preferences file written before today has no such key, and
    // that is a default rather than a corrupt file.
    await writeFile(prefs.path, JSON.stringify({ idleAfterMs: 1000 }));
    const older = new MachinePreferences(prefs.path);
    await older.load();
    expect(older.liveTeamLimit).toBe(DEFAULT_LIVE_TEAM_LIMIT);

    for (const bad of [0, -1, NaN, 1.5, 101]) {
      await expect(older.setLiveTeamLimit(bad)).rejects.toThrow();
    }
    expect(older.liveTeamLimit).toBe(DEFAULT_LIVE_TEAM_LIMIT);
  });
  it('keeps a malformed saved file rather than silently replacing it with defaults', async () => {
    const prefs = await fixture();
    await writeFile(prefs.path, 'invalid');
    await expect(prefs.load()).rejects.toThrow('could not be read');
    expect(await readFile(prefs.path, 'utf8')).toBe('invalid');
    expect(prefs.readError).toContain('temporarily disabled');
    await prefs.setIdleAfterMs(1000);
    expect(prefs.readError).toBeUndefined();
  });
});
