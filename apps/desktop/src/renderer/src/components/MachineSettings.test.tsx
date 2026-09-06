/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { BlobotApi, EngineSetupView } from '../../../shared/api.js';
import { EngineSetupControls } from './MachineSettings.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); });

const READY: EngineSetupView = {
  readiness: { state: 'ready' }, previewEnabled: true, canInstall: true, kvmAvailable: true,
  configuredMachines: [],
};

async function draw(initial: EngineSetupView) {
  let view = initial;
  const listeners = new Set<() => void>();
  const read = vi.fn<BlobotApi['engineSetup']>(async () => structuredClone(view));
  const remove = vi.fn<BlobotApi['removeRetainedMachine']>(async () => {});
  const api = {
    engineSetup: read, removeRetainedMachine: remove,
    onMachines: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  } satisfies Pick<BlobotApi, 'engineSetup' | 'removeRetainedMachine' | 'onMachines'>;
  Object.defineProperty(window, 'blobot', { configurable: true, value: api });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<EngineSetupControls />));
  const button = (label: string, within: ParentNode = host) => [...within.querySelectorAll('button')].find((node) => node.textContent?.trim() === label);
  const update = async (next: EngineSetupView) => {
    view = next;
    await act(async () => { for (const listener of listeners) listener(); });
  };
  return { host, read, remove, button, update };
}

it('shows current readiness after a completed setup instead of using the historical success as live status', async () => {
  const operation = { id: 'setup', phase: 'done', detail: 'The earlier setup completed successfully.' } as const;
  const f = await draw({ ...READY, operation });
  expect(f.host.querySelector('[role="status"]')?.textContent).toContain('Sandboxes are ready');
  await f.update({ ...READY, operation, readiness: { state: 'unknown', detail: 'The sandbox engine is no longer reachable.' } });
  expect(f.host.querySelector('[role="status"]')?.textContent).toContain('no longer reachable');
  expect(f.host.querySelector('[role="status"]')?.textContent).not.toContain('completed successfully');
  expect(f.host.textContent).toContain('Last setup attempt: The earlier setup completed successfully.');
  expect(f.button('check again')?.disabled).toBe(false);
});

it('requires a separate retained-data confirmation and sends only the confirmed Agent identity', async () => {
  const f = await draw({ ...READY, inventory: {
    state: 'ready', downloadCacheBytes: 0,
    entries: [
      { id: 'saved-a', name: 'old-a', agentId: 'alice', agentName: 'Alice', kind: 'retained', presence: 'present', canRemove: true, detail: 'Retained private data.' },
      { id: 'saved-b', name: 'old-b', agentId: 'bob', agentName: 'Bob', kind: 'retained', presence: 'present', canRemove: true, detail: 'Retained private data.' },
    ],
  } });
  const row = [...f.host.querySelectorAll('dl > div')].find((node) => node.querySelector('dt')?.textContent === 'Alice')!;
  await act(async () => f.button('remove retained data…', row)!.click());
  expect(f.remove).not.toHaveBeenCalled();
  expect(row.textContent).toContain('homes, logins and installed software');
  await act(async () => f.button('keep it', row)!.click());
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.button('remove retained data', row)).toBeUndefined();
  await act(async () => f.button('remove retained data…', row)!.click());
  await act(async () => f.button('remove retained data', row)!.click());
  expect(f.remove).toHaveBeenCalledExactlyOnceWith('alice');
  expect(f.read).toHaveBeenCalledTimes(2);
});

it('shows unverified sandbox inventory without offering removal', async () => {
  const f = await draw({ ...READY, inventory: {
    state: 'unknown', downloadCacheBytes: null, detail: 'Ownership could not be verified.',
    entries: [{ id: 'unverified', name: 'Unverified sandbox', agentId: 'alice', kind: 'unverified', presence: 'unknown', canRemove: false, detail: 'The ownership record could not be read.' }],
  } });
  expect(f.host.textContent).toContain('Unverified sandbox');
  expect(f.host.textContent).toContain('ownership record could not be read');
  expect([...f.host.querySelectorAll('button')].some((button) => button.textContent?.includes('remove retained data'))).toBe(false);
  expect(f.remove).not.toHaveBeenCalled();
});
