/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MachineSleepSettings } from './MachineSleepSettings.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => { if (root !== undefined) act(() => root?.unmount()); document.body.replaceChildren(); });

async function draw(fails = false) {
  const save = vi.fn(async (value: number) => { if (fails) throw new Error('disk'); return value; });
  Object.defineProperty(window, 'blobot', { configurable: true, value: {
    machineIdleAfterMs: async () => 7_200_000, setMachineIdleAfterMs: save,
  } });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<MachineSleepSettings />); });
  const input = host.querySelector('input')!;
  const button = host.querySelector('button')!;
  const edit = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const submit = async () => { await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
  return { host, input, button, edit, submit, save };
}
describe('Machine sleep settings', () => {
  it('loads the current hours and saves zero as disabling automatic sleep', async () => {
    const f = await draw();
    expect(f.input.value).toBe('2'); expect(f.button.disabled).toBe(true);
    await f.edit('0'); expect(f.button.disabled).toBe(false);
    await f.submit(); expect(f.save).toHaveBeenCalledWith(0); expect(f.button.disabled).toBe(true);
  });
  it('refuses empty or negative values before IPC', async () => {
    const f = await draw();
    for (const value of ['', '-1']) {
      await f.edit(value); expect(f.button.disabled).toBe(true); await f.submit();
    }
    expect(f.save).not.toHaveBeenCalled();
  });
  it('shows a failed save without pretending the new setting is effective', async () => {
    const f = await draw(true);
    await f.edit('3'); await f.submit();
    expect(f.host.querySelector('[role="alert"]')?.textContent).toContain('could not be saved');
    expect(f.button.disabled).toBe(false);
  });
});
