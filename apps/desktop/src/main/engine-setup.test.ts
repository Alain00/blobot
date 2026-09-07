import { afterEach, expect, it, vi } from 'vitest';
import { SbxEngine } from '@blobot/core';
import { DesktopMachines } from './machines.js';
import { EngineSetup } from './engine-setup.js';

afterEach(() => vi.restoreAllMocks());

const engineVersion = { version: 'v0.42.0-rc5', revision: 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a' };

it('cancels setup during the last inventory read without changing settings or restarting', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let inventories = 0;
  const run = vi.fn(async (args: readonly string[]) => {
    let data: unknown = {};
    if (args[0] === 'daemon' && args[1] === 'status') data = { status: 'running' };
    if (args[0] === 'version') data = { client: engineVersion, server: { ...engineVersion, state: 'running' } };
    if (args[0] === 'settings' && args[1] === 'get') data = { key: 'ssh.agentForwardingEnabled', type: 'bool', value: true };
    if (args[0] === 'ls') { if (++inventories === 2) await pending; data = { sandboxes: [] }; }
    return { code: 0, stdout: JSON.stringify(data) };
  });
  const machines = new DesktopMachines('/unused-engine-setup');
  vi.spyOn(machines, 'engine').mockImplementation((signal) => new SbxEngine(run, signal));
  const setup = new EngineSetup(machines, { changed: () => {}, openPackage: vi.fn() });
  try {
    const id = setup.start('install');
    await vi.waitFor(() => expect(inventories).toBe(2));
    expect(() => setup.start('check')).toThrow('already in progress');
    setup.cancel(id);
    release();
    await expect.poll(async () => (await setup.view()).operation?.phase).toBe('cancelled');
    expect(run.mock.calls.some(([args]) => args.includes('set') || args.includes('restart'))).toBe(false);
  } finally { release(); await setup.close(); }
});

it('closes admission before draining pending setup and never starts work after close', async () => {
  const machines = new DesktopMachines('/unused-engine-setup');
  const engine = vi.spyOn(machines, 'engine');
  const setup = new EngineSetup(machines, { changed: () => {}, openPackage: vi.fn() });
  setup.start('check');
  const closing = setup.close();
  expect(() => setup.start('install')).toThrow('closing');
  await closing;
  await setup.close();
  expect(engine).not.toHaveBeenCalled();
});
