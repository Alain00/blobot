import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SbxEngine, type SbxRecord } from '@blobot/core';
import { DesktopMachines } from './machines.js';
import { MachineInventory } from './machine-inventory.js';
import type { UiConfiguredMachine } from '../shared/machines.js';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const limits = { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 };
const active = { name: 'blobot-created', id: 'created-id', limits, baseline: { memoryKiB: 2066016, mounts: 'fixture' } };
const retained = { ...active, name: 'blobot-retained', id: 'retained-id' };
const version = { version: 'v0.42.0-rc5', revision: 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a' };
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'blobot-inventory-')); roots.push(directory);
  const work = join(directory, 'workspace'); await mkdir(work); await writeFile(join(work, 'kept'), 'work');
  const machines = new DesktopMachines(directory);
  const record: SbxRecord = { version: 1, agentId: 'deleted-agent', kit: { image: 'fixture:v1', guestNode: '/usr/bin/node', dataBytes: 1024 ** 3,
    workspace: { path: work, commonGit: [] } }, active, retained: [retained] };
  await machines.registry.save(record);
  let boxes = [active, retained].map(box => ({ name: box.name, id: box.id, status: 'stopped' }));
  let configured: UiConfiguredMachine[] = [];
  const run = vi.fn(async (args: readonly string[]) => {
    let data: unknown = {};
    if (args[0] === 'daemon') data = { status: 'running' };
    if (args[0] === 'ls') data = { sandboxes: boxes };
    if (args[0] === 'version') data = { client: version, server: { ...version, state: 'running' } };
    if (args[0] === 'settings') data = { key: 'ssh.agentForwardingEnabled', type: 'bool', value: false };
    if (args[0] === 'diagnose') data = { checks: [{ name: 'Authentication', status: 'pass' }] };
    if (args[0] === 'stop') boxes = boxes.map(box => box.name === args[1] ? { ...box, status: 'stopped' } : box);
    if (args[0] === 'rm') boxes = boxes.filter(box => box.name !== args[2]);
    return { code: 0, stdout: JSON.stringify(data) };
  });
  vi.spyOn(machines, 'engine').mockImplementation(() => new SbxEngine(run));
  return { directory, work, machines, record, run, inventory: new MachineInventory(machines, () => configured),
    setBoxes: (value: typeof boxes) => { boxes = value; }, setConfigured: (value: UiConfiguredMachine[]) => { configured = value; } };
}
const configured = { agentId: 'deleted-agent', agentName: 'Alice', teamId: 'team-id', teamName: 'Team', limits };

it('lists owned retained and unclaimed resources without treating a prefix as ownership', async () => {
  const f = await fixture();
  f.setBoxes([active, retained, { name: 'blobot-unclaimed', id: 'unclaimed-id' }, { name: 'external', id: 'external-id' }].map(box => ({ ...box, status: 'stopped' })));
  const view = await f.inventory.view();
  expect(view.state).toBe('ready'); expect(view.downloadCacheBytes).toBe(0);
  expect(view.entries.map(entry => [entry.kind, entry.canRemove])).toEqual([['active', true], ['retained', true], ['unclaimed', false]]);
  expect(f.run.mock.calls.map(([args]) => args)).toEqual([['daemon', 'status', '--json'], ['ls', '--json']]);
});

it('refuses deletion of a configured Agent even if a previous screen offered removal', async () => {
  const f = await fixture(); expect((await f.inventory.view()).entries[0]?.canRemove).toBe(true);
  f.setConfigured([configured]);
  expect((await f.inventory.view()).entries.every(entry => !entry.canRemove)).toBe(true);
  await expect(f.inventory.remove(f.record.agentId)).rejects.toThrow('still configured');
  expect(f.run.mock.calls.some(([args]) => args[0] === 'rm' || args[0] === 'stop')).toBe(false);
});

it.each(['local', 'invalid'])('uses full membership to protect a %s Agent absent from the configured box list', async () => {
  const f = await fixture();
  const inventory = new MachineInventory(f.machines, () => [], agentId => agentId === f.record.agentId);
  expect((await inventory.view()).entries.every(entry => !entry.canRemove)).toBe(true);
  await expect(inventory.remove(f.record.agentId)).rejects.toThrow('still configured');
  expect(f.run.mock.calls.some(([args]) => args[0] === 'rm' || args[0] === 'stop')).toBe(false);
  expect(await f.machines.registry.read(f.record.agentId)).toEqual(f.record);
});

it('removes only all recorded private copies for an absent Agent and keeps workspace files', async () => {
  const f = await fixture();
  f.setBoxes([active, retained, { name: 'blobot-foreign', id: 'foreign-id' }].map(box => ({ ...box, status: 'stopped' })));
  await f.inventory.remove(f.record.agentId);
  expect(await f.machines.registry.read(f.record.agentId)).toBeUndefined();
  expect(await readFile(join(f.work, 'kept'), 'utf8')).toBe('work');
  expect(f.run.mock.calls.filter(([args]) => args[0] === 'rm').map(([args]) => args[2])).toEqual([retained.name, active.name]);
  expect((await f.inventory.view()).entries).toMatchObject([{ name: 'blobot-foreign', canRemove: false, kind: 'unclaimed' }]);
});

it('rechecks membership during removal before the first destructive command', async () => {
  const f = await fixture(), normal = f.run.getMockImplementation()!;
  f.run.mockImplementation(async args => {
    const result = await normal(args);
    if (args[0] === 'diagnose') f.setConfigured([configured]);
    return result;
  });
  await expect(f.inventory.remove(f.record.agentId)).rejects.toThrow('still configured');
  expect(f.run.mock.calls.some(([args]) => args[0] === 'rm')).toBe(false);
  expect(await f.machines.registry.read(f.record.agentId)).toEqual(f.record);
});

it.each(['missing id', 'foreign id', 'corrupt'] as const)('keeps %s ownership visible and refuses to delete it', async problem => {
  const f = await fixture();
  if (problem === 'missing id') {
    const { active: _active, ...record } = f.record;
    await f.machines.registry.save({ ...record, retained: [], pending: { name: active.name, limits } });
  }
  if (problem === 'foreign id') f.setBoxes([{ name: active.name, id: 'foreign-id', status: 'stopped' }]);
  if (problem === 'corrupt') await writeFile(join(f.machines.registry.directory, 'blobot-deleted-agent.json'), '{broken');
  const view = await f.inventory.view();
  expect(view.entries.some(entry => entry.kind === 'unverified')).toBe(true);
  expect(view.entries.every(entry => !entry.canRemove)).toBe(true);
  await expect(f.inventory.remove(f.record.agentId)).rejects.toThrow();
  expect(f.run.mock.calls.some(([args]) => args[0] === 'rm' || args[0] === 'stop')).toBe(false);
});

it('keeps an unavailable engine distinct from an empty inventory and never starts it', async () => {
  const f = await fixture(); f.run.mockResolvedValue({ code: 0, stdout: '{"status":"stopped"}' });
  const view = await f.inventory.view();
  expect(view.state).toBe('unknown'); expect(view.entries).toHaveLength(2);
  expect(view.entries.every(entry => entry.presence === 'unknown' && !entry.canRemove)).toBe(true);
  expect(f.run.mock.calls.map(([args]) => args)).toEqual([['daemon', 'status', '--json']]);
});

it('measures download caches separately and reports unknown instead of following a symlink', async () => {
  const f = await fixture(); await mkdir(join(f.directory, 'images')); await mkdir(join(f.directory, 'downloads'));
  await writeFile(join(f.directory, 'images', 'image.tar.part'), '123');
  await writeFile(join(f.directory, 'downloads', 'engine.deb'), '12345');
  expect((await f.inventory.view()).downloadCacheBytes).toBe(8);
  await symlink(join(f.work, 'kept'), join(f.directory, 'images', 'outside'));
  expect((await f.inventory.view()).downloadCacheBytes).toBeNull();
});

it('finishes an interrupted removal when one recorded copy is already absent', async () => {
  const f = await fixture(); f.setBoxes([{ ...active, status: 'stopped' }]);
  await f.inventory.remove(f.record.agentId);
  expect(await f.machines.registry.read(f.record.agentId)).toBeUndefined();
  expect(f.run.mock.calls.filter(([args]) => args[0] === 'rm').map(([args]) => args[2])).toEqual([active.name]);
});
