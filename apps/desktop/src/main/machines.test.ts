import { expect, it, vi } from 'vitest';
import { runtimeImageBuild, CODEX_MACHINE_IMAGE } from '@blobot/core';
import { DesktopBoxMachine, DesktopMachines } from './machines.js';

it('refuses sandbox activation before any engine operation unless preview is explicitly enabled', async () => {
  const machines = new DesktopMachines('/unused-machine-fixture', false);
  const engine = vi.spyOn(machines, 'engine');
  const machine = new DesktopBoxMachine(machines, { id: 'alice', teamId: 'team', name: 'Alice', role: 'Engineer',
    runtimeId: 'codex', workspacePath: '/fixture', createdAt: 0,
    machine: { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 4 * 1024 ** 3 } } },
  { id: 'team', name: 'Team', workspaceKind: 'plain', workspacePath: '/fixture', turnBudget: 10 });
  await expect(machine.start({ mailboxPort: 12345 })).rejects.toThrow('preview disabled');
  expect(engine).not.toHaveBeenCalled();
});

it('cancels one image waiter without cancelling peers, and aborts shared downloads on close', async () => {
  const machines = new DesktopMachines('/unused-machine-fixture');
  const build = runtimeImageBuild(CODEX_MACHINE_IMAGE, 'arm64')!;
  let finish!: () => void;
  const download = new Promise<void>((resolve) => { finish = resolve; });
  let signal: AbortSignal | undefined;
  vi.spyOn(machines.images(), 'install').mockImplementation((_build, options) => {
    signal = options?.signal;
    return download;
  });
  const abort = new AbortController();
  const cancelled = machines.installImage(build, abort.signal);
  const peer = machines.installImage(build);
  const rejected = expect(cancelled).rejects.toThrow();
  abort.abort();
  await rejected;
  expect(signal?.aborted).toBe(false);
  const closing = machines.close();
  expect(signal?.aborted).toBe(true);
  finish();
  await peer;
  await closing;
});
