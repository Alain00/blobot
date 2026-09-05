/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DeleteTeam } from './TeamEdits.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); });

it('keeps full clean disabled when size cannot be read, while ordinary deletion remains available', async () => {
  const remove = vi.fn(async () => ({ ok: true, removals: [] }));
  Object.defineProperty(window, 'blobot', { configurable: true, value: {
    teamDiskUsage: async () => ({ bytes: null, workBytes: 100, stateBytes: null, agents: [] }), deleteTeam: remove,
  } });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<DeleteTeam team={{ id: 'team', name: 'Fixture', workspacePath: '/fixture', workspaceKind: 'git', members: [] }} onClose={() => {}} onDeleted={() => {}} />); });
  const buttons = [...document.querySelectorAll('button')];
  const clean = buttons.find((button) => button.textContent?.includes('full clean'))!;
  expect(clean.disabled).toBe(true);
  expect(clean.textContent).toContain('size unavailable');
  const ordinary = buttons.find((button) => button.textContent?.trim() === 'delete team')!;
  expect(ordinary.disabled).toBe(false);
  await act(async () => { ordinary.click(); });
  expect(remove).toHaveBeenCalledWith('team', false);
});
