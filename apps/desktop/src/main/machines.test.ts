import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeImageBuild, CODEX_MACHINE_IMAGE } from '@blobot/core';
import { DesktopBoxMachine, DesktopMachines } from './machines.js';

it('assigns personal storage by profile across local/box memberships and keeps it after every local member is removed', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-profile-memberships-')));
  try {
    const services = new DesktopMachines(join(root, 'machines'));
    const team = { id: 'contab', name: 'Contab', workspaceKind: 'plain' as const, workspacePath: root, turnBudget: 10 };
    const record = { id: 'ana-contab', profileId: 'ana', teamId: team.id, name: 'Ana', role: 'Marketing', runtimeId: 'codex', workspacePath: root, createdAt: 0 };
    const local = services.forAgent(record, team);
    const box = services.forAgent({ ...record, id: 'ana-blue', teamId: 'blue', name: 'Renamed Ana',
      machine: { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 4 * 1024 ** 3 } } }, { ...team, id: 'blue' });
    expect(box.location().personalPath).toBe(local.location().personalPath);
    const other = services.forAgent({ ...record, id: 'bea-contab', profileId: 'bea' }, team);
    expect(other.location().personalPath).not.toBe(local.location().personalPath);
    await local.start({ mailboxPort: 1234 });
    await writeFile(join(local.location().personalPath!, 'marketing-script'), 'learned');
    await local.stop(); await local.destroy(); await services.close();
    const reopened = new DesktopMachines(join(root, 'machines'));
    const rejoined = reopened.forAgent({ ...record, id: 'ana-new-team', teamId: 'new-team' }, { ...team, id: 'new-team' });
    await rejoined.start({ mailboxPort: 1234 });
    expect(await readFile(join(rejoined.location().personalPath!, 'marketing-script'), 'utf8')).toBe('learned');
    await rejoined.stop(); await reopened.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

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

it('allows cleanup lookup for a damaged placement while refusing execution before any engine operation', async () => {
  const machines = new DesktopMachines('/unused-machine-fixture', true);
  vi.spyOn(machines.registry, 'read').mockResolvedValue(undefined);
  const engine = vi.spyOn(machines, 'engine');
  const team = { id: 'team', name: 'Team', workspaceKind: 'plain' as const, workspacePath: '/fixture', turnBudget: 10 };
  const record = { id: 'alice', teamId: 'team', name: 'Alice', role: 'Engineer', runtimeId: 'codex', workspacePath: '/fixture', createdAt: 0,
    machine: { kind: 'invalid' as const, detail: 'Damaged settings.' } };
  expect(() => machines.forAgent(record, team)).toThrow('Invalid Machine placement');
  const cleanup = machines.forTeam([record], team).get(record.id)!;
  await cleanup.stop(); await cleanup.destroy();
  await expect(cleanup.start({ mailboxPort: 12345 })).rejects.toThrow('Invalid Machine placement');
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

it('shares progress with every waiting agent and cancels the transfer when the final waiter leaves', async () => {
  const machines = new DesktopMachines('/unused-machine-fixture');
  const build = runtimeImageBuild(CODEX_MACHINE_IMAGE, 'arm64')!;
  let signal!: AbortSignal;
  let progress!: (received: number, total?: number) => void;
  const install = vi.spyOn(machines.images(), 'install').mockImplementation((_build, options) => {
    signal = options!.signal!; progress = options!.onProgress!;
    return new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const a = new AbortController(), b = new AbortController();
  const firstProgress = vi.fn(), secondProgress = vi.fn();
  const first = machines.installImage(build, a.signal, firstProgress);
  progress(10, 100);
  const second = machines.installImage(build, b.signal, secondProgress);
  expect(secondProgress).toHaveBeenCalledWith(10, 100);
  expect(install).toHaveBeenCalledOnce();
  const firstCancelled = expect(first).rejects.toThrow(); a.abort(); await firstCancelled;
  expect(signal.aborted).toBe(false);
  progress(20, 100);
  expect(firstProgress).toHaveBeenCalledTimes(1);
  expect(secondProgress).toHaveBeenLastCalledWith(20, 100);
  const secondCancelled = expect(second).rejects.toThrow(); b.abort(); await secondCancelled;
  expect(signal.aborted).toBe(true);
  await machines.close();
});
