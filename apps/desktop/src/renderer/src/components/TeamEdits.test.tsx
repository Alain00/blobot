/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { BlobotApi, TeamDeletionResult, UiTeamDiskUsage, UiTeamSummary } from '../../../shared/api.js';
import { DeleteTeam } from './TeamEdits.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); });

const TEAM: UiTeamSummary = { id: 'team', name: 'Fixture', workspacePath: '/fixture', workspaceKind: 'git', members: [] };

async function draw(usage: UiTeamDiskUsage, result: TeamDeletionResult = { ok: true, removals: [] }) {
  const remove = vi.fn<BlobotApi['deleteTeam']>(async () => result);
  const deleted = vi.fn();
  const api = {
    teamDiskUsage: async () => usage, deleteTeam: remove,
  } satisfies Pick<BlobotApi, 'teamDiskUsage' | 'deleteTeam'>;
  Object.defineProperty(window, 'blobot', { configurable: true, value: api });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<DeleteTeam team={TEAM} onClose={() => {}} onDeleted={deleted} />); });
  const button = (label: string) => [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === label)!;
  const clean = () => [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('full clean'))!;
  return { remove, deleted, button, clean };
}

it('keeps full clean disabled when the working-folder size cannot be read, while ordinary deletion remains available', async () => {
  const f = await draw({ bytes: null, workBytes: null, stateBytes: null, agents: [] });
  expect(f.clean().disabled).toBe(true);
  expect(f.clean().textContent).toContain('size unavailable');
  const ordinary = f.button('delete team');
  expect(ordinary.disabled).toBe(false);
  await act(async () => { ordinary.click(); });
  expect(f.remove).toHaveBeenCalledWith('team', false);
});

it('offers an explicit full clean when work is measurable even though private-state bytes are unknown', async () => {
  const f = await draw({ bytes: null, workBytes: 100, stateBytes: null, agents: [] });
  expect(f.clean().disabled).toBe(false);
  expect(f.clean().getAttribute('aria-pressed')).toBe('false');
  expect(f.clean().textContent).toContain('work 100 bytes');
  expect(f.clean().textContent).toContain('private state size unavailable');
  expect(f.remove).not.toHaveBeenCalled();
  await act(async () => f.clean().click());
  expect(f.clean().getAttribute('aria-pressed')).toBe('true');
  await act(async () => f.button('delete and clean').click());
  expect(f.remove).toHaveBeenCalledExactlyOnceWith('team', true);
  expect(f.deleted).toHaveBeenCalledOnce();
});

it('keeps a private-state removal failure visible after the working folder was successfully discarded', async () => {
  const f = await draw({ bytes: null, workBytes: 100, stateBytes: null, agents: [] }, {
    ok: true, freedBytes: 100,
    removals: [{ agentName: 'Alice', work: 'discarded', state: 'unknown', detail: 'Private home could not be removed; its login remains retained.' }],
  });
  await act(async () => f.clean().click());
  await act(async () => f.button('delete and clean').click());
  expect(f.deleted).toHaveBeenCalledOnce();
  expect(document.body.textContent).toContain('Alice');
  expect(document.body.textContent).toContain('working folder removed');
  expect(document.body.textContent).toContain('Private home could not be removed');
  expect(document.body.textContent).toContain('100 bytes of measured data recovered');
  expect(document.body.textContent).not.toContain('Nothing was left behind');
  expect(f.button('done')).toBeDefined();
});
