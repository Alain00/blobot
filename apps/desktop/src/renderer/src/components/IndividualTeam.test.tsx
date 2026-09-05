/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiAgentProfile, UiTeamSummary } from '../../../shared/api.js';
import { IndividualTeam } from './IndividualTeam.js';
import { Agents } from './Agents.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();
const ALICE: UiAgentProfile = { id: 'p1', name: 'Alice', role: 'writer', runtimeId: 'opaque', runtimeLabel: 'Runtime', teams: [] };
const SOLO: UiTeamSummary = { id: 'solo', name: 'Writing desk', workspacePath: '/work', workspaceKind: 'git', members: [{ id: 'a1', name: 'Alice', profileId: 'p1' }] };
const teams: UiTeamSummary[] = [SOLO,
  { ...SOLO, id: 'other', name: 'Other profile', members: [{ id: 'a2', name: 'Alice', profileId: 'p2' }] },
  { ...SOLO, id: 'legacy', name: 'Legacy', members: [{ id: 'a3', name: 'Alice' }] },
  { ...SOLO, id: 'group', name: 'Group', members: [...SOLO.members, { id: 'a4', name: 'Bob' }] },
];
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});
async function mount(element: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
}
function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === text);
  if (found === undefined) throw new Error(`No button ${text}`);
  return found;
}
async function click(text: string) { await act(async () => button(text).click()); }

describe('talking through an individual Team', () => {
  it('offers only exact one-member identities and opens the chosen history explicitly', async () => {
    const onOpen = vi.fn(async () => ({ ok: true }));
    const onCreate = vi.fn();
    await mount(<IndividualTeam agent={ALICE} teams={teams} onOpen={onOpen} onCreate={onCreate} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click('talk');
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Writing desk');
    for (const name of ['Other profile', 'Legacy', 'Group']) expect(dialog.textContent).not.toContain(name);
    expect(onOpen).not.toHaveBeenCalled();
    await click('Writing desk');
    expect(onOpen).toHaveBeenCalledWith(ALICE.id, SOLO);
    expect(onCreate).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps a stale-selection refusal visible and allows choosing again', async () => {
    const onOpen = vi.fn(async () => ({ ok: false, error: 'The team changed. Choose again.' }));
    await mount(<IndividualTeam agent={ALICE} teams={[SOLO]} onOpen={onOpen} onCreate={vi.fn()} />);
    await click('talk');
    await click('Writing desk');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Choose again');
    expect(button('Writing desk').disabled).toBe(false);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('offers creation when no team exists, without selecting a runtime or starting work', async () => {
    const onCreate = vi.fn();
    const onOpen = vi.fn(async () => ({ ok: true }));
    await mount(<IndividualTeam agent={ALICE} teams={[]} onCreate={onCreate} onOpen={onOpen} />);
    await click('talk');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('No individual teams yet');
    await click('new individual team');
    expect(onCreate).toHaveBeenCalledWith(ALICE);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('Escape closes the chooser while leaving Your agents open and returning focus to talk', async () => {
    Object.assign(window, { blobot: { listAgents: async () => [ALICE], detectRuntimes: async () => [] } });
    const close = vi.fn();
    await mount(<Agents teams={[SOLO]} onClose={close} onCreateIndividualTeam={vi.fn()}
      onOpenIndividualTeam={async () => ({ ok: true })} />);
    await click('talk');
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(close).not.toHaveBeenCalled();
    // Radix restores focus after its exit cleanup, on the next timer turn.
    await vi.waitFor(() => expect(document.activeElement).toBe(button('talk')));
  });
});
