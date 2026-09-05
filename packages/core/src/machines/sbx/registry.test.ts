import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SbxRegistry, type SbxRecord } from './registry.js';
const roots: string[] = [];
async function registry() { const root = await mkdtemp(join(tmpdir(), 'blobot-registry-')); roots.push(root); return new SbxRegistry(root); }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const record: SbxRecord = { version: 1, agentId: 'alice', kit: { image: 'fixture:v1', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 }, retained: [] };
describe('owned sandbox registry', () => {
  it('round-trips ownership and a pending creation without making it active', async () => {
    const db = await registry();
    expect(await db.read('alice')).toBeUndefined();
    const pending = { ...record, pending: { name: 'blobot-alice-fixture', limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 } } };
    await db.locked('alice', () => db.save(pending));
    expect(await new SbxRegistry(db.directory).read('alice')).toEqual(pending);
    expect((await db.read('alice'))?.active).toBeUndefined();
  });
  it('excludes another instance for the whole live execution, not just during commands', async () => {
    const db = await registry();
    const release = await db.lease('alice');
    await expect(new SbxRegistry(db.directory).lease('alice')).rejects.toThrow('another execution');
    await release();
    const releaseAgain = await new SbxRegistry(db.directory).lease('alice');
    await releaseAgain();
  });
  it('releases a failed operation lock without deleting another instance’s lock', async () => {
    const db = await registry();
    await db.locked('alice', async () => {
      await expect(new SbxRegistry(db.directory).locked('alice', async () => {})).rejects.toThrow();
      await expect(db.locked('alice', async () => {})).rejects.toThrow();
    });
    await expect(db.locked('alice', async () => { throw new Error('fixture'); })).rejects.toThrow('fixture');
    await expect(db.locked('alice', async () => {})).resolves.toBeUndefined();
  });
  it('refuses a mismatched ownership file and leaves it intact', async () => {
    const db = await registry();
    const path = join(db.directory, 'blobot-alice.json');
    const text = JSON.stringify({ ...record, agentId: 'bob' });
    await writeFile(path, text);
    await expect(db.read('alice')).rejects.toThrow('invalid');
    expect(await readFile(path, 'utf8')).toBe(text);
  });
});
