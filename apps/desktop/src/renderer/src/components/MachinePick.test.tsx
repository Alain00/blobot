/** @vitest-environment jsdom */
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { MachinePlacement, StoredMachinePlacement } from '@blobot/core/domain';
import { MachineCapacity, MachinePick } from './MachinePick.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};
let root: Root | undefined;
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); });

async function draw(value: StoredMachinePlacement, previewEnabled = true) {
  const changed = vi.fn<(value: MachinePlacement) => void>();
  function Form() {
    const [placement, setPlacement] = useState(value);
    return <MachinePick label="Execution" value={placement} previewEnabled={previewEnabled}
      onChange={(next) => { changed(next); setPlacement(next); }} />;
  }
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<Form />));
  const trigger = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const open = async (label: string) => {
    await act(async () => trigger(label).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
  };
  const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  const select = async (label: string) => {
    const option = options().find((node) => node.textContent?.startsWith(label));
    expect(option).toBeDefined();
    await act(async () => option!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  };
  return { host, changed, trigger, open, options, select };
}

it('preserves non-preset persisted limits and changes one limit without rounding the other', async () => {
  const f = await draw({ kind: 'box', limits: { maxCpus: 3, maxMemoryBytes: 6 * 1024 ** 3 } });
  expect(f.trigger('Execution: CPUs').textContent).toContain('up to 3 CPUs');
  expect(f.trigger('Execution: memory').textContent).toContain('up to 6 GiB RAM');
  expect(f.changed).not.toHaveBeenCalled();
  await f.open('Execution: CPUs');
  expect(f.options().filter((option) => option.textContent === 'up to 3 CPUs')).toHaveLength(1);
  await f.select('up to 4 CPUs');
  expect(f.changed).toHaveBeenLastCalledWith({ kind: 'box', limits: { maxCpus: 4, maxMemoryBytes: 6 * 1024 ** 3 } });
  await f.open('Execution: memory');
  await f.select('up to 8 GiB RAM');
  expect(f.changed).toHaveBeenLastCalledWith({ kind: 'box', limits: { maxCpus: 4, maxMemoryBytes: 8 * 1024 ** 3 } });
});

it('keeps invalid persisted placement unavailable until the user explicitly chooses a valid location', async () => {
  const f = await draw({ kind: 'invalid', detail: 'Stored Machine settings need repair.' });
  expect(f.trigger('Execution').textContent).toContain('unavailable');
  expect(f.host.textContent).toContain('Stored Machine settings need repair');
  expect(f.changed).not.toHaveBeenCalled();
  await f.open('Execution');
  expect(f.options().find((option) => option.textContent?.startsWith('unavailable'))?.getAttribute('aria-disabled')).toBe('true');
  await f.select('this computer');
  expect(f.changed).toHaveBeenCalledExactlyOnceWith({ kind: 'local' });
  expect(f.host.textContent).not.toContain('Stored Machine settings need repair');
});

it('keeps sandbox creation unavailable when preview is disabled', async () => {
  const f = await draw({ kind: 'local' }, false);
  await f.open('Execution');
  const sandbox = f.options().find((option) => option.textContent?.startsWith('a sandbox'))!;
  expect(sandbox.getAttribute('aria-disabled')).toBe('true');
  await f.select('a sandbox');
  expect(f.changed).not.toHaveBeenCalled();
});

it('compares aggregate sandbox limits with the host without treating local or invalid choices as allocations', async () => {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<MachineCapacity host={{ cpus: 8, memoryBytes: 8 * 1024 ** 3 }} placements={[
    { kind: 'local' }, { kind: 'invalid', detail: 'unavailable' },
    { kind: 'box', limits: { maxCpus: 3, maxMemoryBytes: 6 * 1024 ** 3 } },
    { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 4 * 1024 ** 3 } },
  ]} />));
  expect(host.textContent).toContain('8 CPUs · 8 GiB RAM');
  expect(host.textContent).toContain('5 CPUs · 10 GiB RAM');
  expect(host.textContent).toContain('memory limits exceed');
  expect(host.querySelector('button, input, [role="alert"]')).toBeNull();
});
