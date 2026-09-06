import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { OwnedSbxMachine } from './owned-machine.js';
import { SbxRegistry, type SbxRecord } from './registry.js';
import { SBX_DEVELOPMENT_PIN } from './observations.js';
import type { SbxCommandRunner } from './engine.js';
import type { SbxKitOptions } from './kit.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const limits = { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 };
const kit = { image: 'fixture:v1', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'blobot-owned-test-')); roots.push(root);
  const registry = new SbxRegistry(root);
  let boxes: { name: string; id: string; status: string }[] = [], rules: unknown[] = [];
  const run = vi.fn<SbxCommandRunner>(async args => {
    let data: unknown = {};
    if (args[0] === 'daemon') data = { status: 'running' };
    if (args[0] === 'version') data = { client: SBX_DEVELOPMENT_PIN, server: { ...SBX_DEVELOPMENT_PIN, state: 'running' } };
    if (args[0] === 'settings') data = { key: 'ssh.agentForwardingEnabled', type: 'bool', value: false };
    if (args[0] === 'diagnose') data = { checks: [{ name: 'Authentication', status: 'pass' }] };
    if (args[0] === 'create') boxes.push({ name: args[2]!, id: 'owned-id', status: 'running' });
    if (args[0] === 'stop') boxes = boxes.map(box => box.name === args[1] ? { ...box, status: 'stopped' } : box);
    if (args[0] === 'rm') boxes = boxes.filter(box => box.name !== args[2]);
    if (args[0] === 'ls') data = { sandboxes: boxes };
    if (args[0] === 'exec') {
      boxes = boxes.map(box => box.name === args[3] ? { ...box, status: 'running' } : box);
      data = { uid: Number(args[2]), cpus: 2, memoryKiB: 2066016, sshAbsent: true,
        roots: ['/home/agent', '/workspace'].map((path, device) => ({ path, uid: 1000, gid: 1000, mode: 0o700, directory: true, device })),
        mountinfo: '112 101 254:64 / /home/agent rw,relatime - ext4 /dev/vde rw\n113 101 254:80 / /workspace rw,relatime - ext4 /dev/vdf rw\n' +
          '114 101 0:27 /resolv.conf /etc/resolv.conf ro,relatime - virtiofs bind-a rw\n115 101 0:28 /hosts /etc/hosts ro,relatime - virtiofs bind-b rw\n' };
    }
    if (args[0] === 'policy') {
      const name = args[args.indexOf('--sandbox') + 1];
      if (args[1] === 'allow') rules = [{ id: 'owned-rule', scope: `sandbox:${name}`, applies_to: `sandbox:${name}`, sandbox_id: name,
        origin: 'scoped', layer: 'local', resource_type: 'network', decision: 'allow', status: 'active', editable: true, resources: ['**'] }];
      if (args[1] === 'rm') rules = [];
      if (args[1] === 'ls') data = { rules };
      if (args[1] === 'check') data = { action: 'net:connect:tcp', allowed: rules.length !== 0, context: `sandbox:${name}`,
        deny_kind: 'implicit', governance: { active: false }, resource_type: 'net:domain', resource_value: args.at(-1), target: args.at(-1), type: 'network' };
    }
    return { code: 0, stdout: JSON.stringify(data) };
  });
  const create = (options: SbxKitOptions = kit) => new OwnedSbxMachine({ agentId: 'alice', registry, kit: options, limits, run,
    transport: { moduleRoot: '/opt/blobot/node_modules', allowedEnvironment: [] } });
  const record: SbxRecord = { version: 1, agentId: 'alice', kit, retained: [] };
  return { registry, run, create, record, setBoxes: (value: typeof boxes) => { boxes = value; } };
}

it('clears a failed creation proven absent and permits the next cold start', async () => {
  const f = await fixture(), machine = f.create(), normal = f.run.getMockImplementation()!;
  f.run.mockImplementation(async (args, signal) => args[0] === 'create' ? { code: 1, stdout: '' } : normal(args, signal));
  await expect(machine.start({ mailboxPort: 3456 })).rejects.toThrow('create');
  expect((await f.registry.read('alice'))?.pending).toBeUndefined();
  f.run.mockImplementation(normal);
  await machine.start({ mailboxPort: 3456 });
  expect((await f.registry.read('alice'))?.active?.id).toBe('owned-id');
  await machine.stop();
});

it('retries admission on a durable created identity without creating or adopting another sandbox', async () => {
  const f = await fixture(), machine = f.create(), normal = f.run.getMockImplementation()!;
  f.run.mockImplementation(async (args, signal) => args[0] === 'exec' ? { code: 1, stdout: '' } : normal(args, signal));
  await expect(machine.start({ mailboxPort: 3456 })).rejects.toThrow('exec');
  const pending = (await f.registry.read('alice'))?.pending;
  expect(pending?.id).toBe('owned-id');
  expect(await machine.reconcile()).toMatchObject({ state: 'lost', detail: expect.stringContaining('creation was interrupted') });
  f.run.mockImplementation(normal);
  await machine.start({ mailboxPort: 3456 });
  expect(f.run.mock.calls.filter(([args]) => args[0] === 'create')).toHaveLength(1);
  expect((await f.registry.read('alice'))?.active?.name).toBe(pending?.name);
  expect((await f.registry.read('alice'))?.pending).toBeUndefined();
  await machine.stop();
});

it('never adopts or removes a name-only partial creation whose identity was not saved', async () => {
  const f = await fixture(), pending = { name: 'blobot-unverified', limits };
  await f.registry.save({ ...f.record, pending });
  f.setBoxes([{ name: pending.name, id: 'unverified-id', status: 'running' }]);
  const machine = f.create();
  await expect(machine.start({ mailboxPort: 3456 })).rejects.toThrow('no verified ownership');
  await expect(machine.stop()).rejects.toThrow('no verified ownership');
  expect((await f.registry.read('alice'))?.pending).toEqual(pending);
  expect(f.run.mock.calls.some(([args]) => ['create', 'exec', 'stop', 'rm'].includes(args[0]!))).toBe(false);
});

it('propagates wake cancellation into create and still reconciles absence without the cancelled signal', async () => {
  const f = await fixture(), machine = f.create(), normal = f.run.getMockImplementation()!, abort = new AbortController();
  f.run.mockImplementation(async (args, signal) => {
    if (args[0] === 'create') {
      expect(signal).toBe(abort.signal);
      await new Promise<void>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
    }
    return normal(args, signal);
  });
  const start = machine.start({ mailboxPort: 3456, signal: abort.signal });
  const rejected = expect(start).rejects.toThrow('cancelled');
  await vi.waitFor(() => expect(f.run.mock.calls.some(([args]) => args[0] === 'create')).toBe(true));
  abort.abort(); await rejected;
  expect(f.run.mock.calls.at(-1)).toEqual([['ls', '--json'], undefined]);
  expect((await f.registry.read('alice'))?.pending).toBeUndefined();
  const release = await new SbxRegistry(f.registry.directory).lease('alice'); await release();
});

it('reports a software mismatch before identity checks, including records without an active box', async () => {
  const f = await fixture(); await f.registry.save(f.record);
  expect(await f.create({ ...kit, image: 'fixture:v2' }).reconcile()).toMatchObject({ state: 'lost', detail: expect.stringContaining('earlier software version') });
  expect(f.run).not.toHaveBeenCalled();
});

it('removes an explicitly discarded creation with a recorded id without requiring a completed baseline', async () => {
  const f = await fixture(), pending = { name: 'blobot-created', id: 'created-id', limits };
  const mounted = { ...kit, workspace: { path: join(f.registry.directory, 'work'), commonGit: [] } };
  await f.registry.save({ ...f.record, kit: mounted, pending });
  f.setBoxes([{ ...pending, status: 'stopped' }]);
  const machine = f.create(mounted);
  await machine.stop(); await machine.destroy();
  expect(await f.registry.read('alice')).toBeUndefined();
  expect(f.run.mock.calls.filter(([args]) => args[0] === 'rm')).toEqual([[['rm', '-f', pending.name], undefined]]);
});

it('refuses a reused pending name during deletion and retains its ownership journal', async () => {
  const f = await fixture(), pending = { name: 'blobot-created', id: 'created-id', limits };
  const mounted = { ...kit, workspace: { path: join(f.registry.directory, 'work'), commonGit: [] } };
  await f.registry.save({ ...f.record, kit: mounted, pending });
  f.setBoxes([{ name: pending.name, id: 'foreign-id', status: 'stopped' }]);
  await expect(f.create(mounted).destroy()).rejects.toThrow('has been replaced');
  expect((await f.registry.read('alice'))?.pending).toEqual(pending);
  expect(f.run.mock.calls.some(([args]) => ['stop', 'rm'].includes(args[0]!))).toBe(false);
});

it('stops a newly admitted box if saving its active binding fails', async () => {
  const f = await fixture(), machine = f.create(), save = f.registry.save.bind(f.registry);
  vi.spyOn(f.registry, 'save').mockImplementation(async record => {
    if (record.active !== undefined) throw new Error('disk full');
    return save(record);
  });
  await expect(machine.start({ mailboxPort: 3456 })).rejects.toThrow('could not start safely');
  expect((await f.registry.read('alice'))?.pending?.id).toBe('owned-id');
  expect(f.run.mock.calls.filter(([args]) => args[0] === 'stop')).toHaveLength(1);
  const release = await new SbxRegistry(f.registry.directory).lease('alice'); await release();
});
