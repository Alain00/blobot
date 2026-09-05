import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SbxRegistry, type OwnedSbx, type SbxRecord } from './registry.js';
const roots: string[] = [];
async function registry() { const root = await mkdtemp(join(tmpdir(), 'blobot-registry-')); roots.push(root); return new SbxRegistry(root); }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const record: SbxRecord = { version: 1, agentId: 'alice', kit: { image: 'fixture:v1', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 }, retained: [] };
const original: OwnedSbx = { name: 'blobot-original', id: 'original-id', limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 }, baseline: { memoryKiB: 2_000_000, mounts: 'synthetic' } };
const candidate: OwnedSbx = { ...original, name: 'blobot-candidate', id: 'candidate-id' };
describe('owned sandbox registry', () => {
  it('round-trips ownership and a pending creation without making it active', async () => {
    const db = await registry();
    expect(await db.read('alice')).toBeUndefined();
    const pending = { ...record, pending: { name: 'blobot-alice-fixture', limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 } } };
    await db.locked('alice', () => db.save(pending));
    expect(await new SbxRegistry(db.directory).read('alice')).toEqual(pending);
    expect((await db.read('alice'))?.active).toBeUndefined();
  });
  it('retains both admitted identities and the interrupted phase across a new registry instance', async () => {
    const db = await registry();
    for (const phase of ['copying', 'verifying'] as const) {
      await db.save({ ...record, active: original, pending: { name: candidate.name, id: candidate.id, limits: candidate.limits, candidate, phase } });
      const recovered = await new SbxRegistry(db.directory).read('alice');
      expect(recovered?.active).toEqual(original);
      expect(recovered?.pending?.candidate).toEqual(candidate);
      expect(recovered?.pending?.phase).toBe(phase);
      expect(recovered?.retained).toEqual([]);
    }
  });
  it.each(['same original', 'different candidate', 'unknown phase', 'different limits', 'retained candidate'])('refuses a %s replacement journal without modifying it', async problem => {
    const db = await registry();
    const pending = { name: candidate.name, id: candidate.id, limits: candidate.limits, candidate, phase: 'copying' };
    if (problem === 'same original') { pending.id = original.id; pending.candidate = { ...candidate, id: original.id }; }
    else if (problem === 'different candidate') pending.candidate = { ...candidate, id: 'unrelated-id' };
    else if (problem === 'unknown phase') pending.phase = 'finished';
    else if (problem === 'different limits') pending.limits = { ...candidate.limits, maxCpus: 7 };
    const path = join(db.directory, 'blobot-alice.json');
    const bytes = JSON.stringify({ ...record, active: original, pending, retained: problem === 'retained candidate' ? [candidate] : [] });
    await writeFile(path, bytes);
    await expect(db.read('alice')).rejects.toThrow('replacement record is invalid');
    expect(await readFile(path, 'utf8')).toBe(bytes);
  });
  it('excludes another instance for the whole live execution, not just during commands', async () => {
    const db = await registry();
    const release = await db.lease('alice');
    await expect(new SbxRegistry(db.directory).lease('alice')).rejects.toThrow('another execution');
    await release();
    const releaseAgain = await new SbxRegistry(db.directory).lease('alice');
    await releaseAgain();
  });
  it.each(['owner', 'lock'] as const)('releases the %s OS lock on process death and preserves the pending journal', async kind => {
    const db = await registry();
    const pending = { ...record, active: original,
      pending: { name: candidate.name, id: candidate.id, limits: candidate.limits, candidate, phase: 'copying' } };
    // Import the actual registry in a separate process. No stale timeout or PID override.
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx/esm'), '--input-type=module', '-e', `
      import { SbxRegistry } from ${JSON.stringify(new URL('./registry.ts', import.meta.url).href)};
      const db = new SbxRegistry(process.argv[1]);
      const record = JSON.parse(process.argv[2]);
      const hold = async () => { await db.save(record); process.send('held'); await new Promise(() => { setInterval(() => {}, 1000); }); };
      if (process.argv[3] === 'owner') { await db.lease('alice'); await hold(); }
      else await db.locked('alice', hold);
    `, db.directory, JSON.stringify(pending), kind], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let errorText = '';
    child.stderr?.on('data', data => { errorText += String(data); });
    const exit = once(child, 'exit');
    try {
      const ready = await Promise.race([once(child, 'message'), exit.then(() => { throw new Error(errorText || 'Fixture exited before locking'); })]);
      expect(ready[0]).toBe('held');
      if (kind === 'owner') await expect(db.lease('alice')).rejects.toThrow('another execution');
      else await expect(db.locked('alice', async () => {})).rejects.toThrow('in progress');
      child.kill('SIGKILL');
      await exit;
      const fresh = new SbxRegistry(db.directory);
      if (kind === 'owner') { const release = await fresh.lease('alice'); await release(); }
      else await fresh.locked('alice', async () => {});
      expect(await fresh.read('alice')).toEqual(pending);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exit;
    }
  });
  it('keeps legacy directory locks for explicit recovery without guessing their owner is dead', async () => {
    const db = await registry();
    await mkdir(join(db.directory, 'blobot-alice.owner'));
    await expect(db.lease('alice')).rejects.toThrow('recovery');
    await mkdir(join(db.directory, 'blobot-alice.lock'));
    await expect(db.locked('alice', async () => {})).rejects.toThrow('Legacy');
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
