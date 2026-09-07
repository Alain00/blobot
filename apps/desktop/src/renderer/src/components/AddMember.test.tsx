/**
 * @vitest-environment jsdom
 *
 * Putting somebody else on a team that already exists.
 *
 * The claims are the ones a screenshot cannot make. That the people already on the team are
 * **shown and not removable**, because a departure needs `EditTeam`'s confirmation and its
 * removal report and must not hide behind the cheapest control in the app. That submitting hands
 * over the **whole** roster, which is what `editTeam` takes and what a persona needs. And that
 * the bar **does not wait for the team**: an edit restarts it, which is seconds, and the caller
 * owns both the call and the failure.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiAgentProfile, UiTeamSummary } from '../../../shared/api.js';
import { AddMember } from './AddMember.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// cmdk watches its list for resizes and the badges carry blobatars; jsdom has neither API.
stubGazeHost();
// cmdk scrolls its highlighted row into view, and the list has a highlighted row from the first
// paint now that hiring is one of them. jsdom has no scrolling at all.
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const profile = (id: string, name: string, teams: string[]): UiAgentProfile =>
  ({ id, name, role: 'works', runtimeId: 'claude-code', runtimeLabel: 'claude code', teams, hiredAt: 0 }) as UiAgentProfile;

const ROSTER: readonly UiAgentProfile[] = [
  profile('alice', 'Alice', ['Experiment']),
  profile('bob', 'Bob', ['Experiment']),
  profile('mara', 'Mara', []),
];

const TEAM: UiTeamSummary = {
  id: 't1',
  name: 'Experiment',
  workspacePath: '/w',
  workspaceKind: 'git',
  leadProfileId: 'alice',
  members: [{ id: 'a1', name: 'Alice' }, { id: 'b1', name: 'Bob' }],
};

let host: HTMLDivElement | undefined;
afterEach(() => {
  host?.remove();
  host = undefined;
});

async function open(): Promise<{ handed: (readonly string[])[]; closed: number }> {
  (window as unknown as { blobot: unknown }).blobot = {
    listAgents: vi.fn(async () => ROSTER),
    detectRuntimes: vi.fn(async () => []),
  };
  const counted: { handed: (readonly string[])[]; closed: number } = { handed: [], closed: 0 };
  host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    createRoot(host as HTMLDivElement).render(
      <AddMember
        team={TEAM}
        onClose={() => (counted.closed += 1)}
        onAdd={(profileIds) => counted.handed.push(profileIds)}
      />,
    );
  });
  return counted;
}

const chips = (): HTMLElement[] => [...(host?.querySelectorAll('.pickchip') ?? [])] as HTMLElement[];
// The agents, and not the hire row, which is a `[cmdk-item]` too now.
const rows = (): HTMLElement[] =>
  [...(host?.querySelectorAll('[cmdk-item]:not(.hirerow)') ?? [])] as HTMLElement[];
const go = (): HTMLButtonElement | null => host?.querySelector('.pickgo') ?? null;

describe('adding a member', () => {
  it('shows who is on the team already and offers no way to take them off', async () => {
    await open();
    expect(chips().map((chip) => chip.querySelector('.nm')?.textContent)).toEqual(['Alice', 'Bob']);
    // A × here would be the cheapest control in the app doing the most expensive thing in it:
    // a departure can strand work, and the result has to be reported.
    expect(chips().every((chip) => chip.querySelector('.off') === null)).toBe(true);
    // And they are not offered again in the list, which is what stops adding somebody twice.
    expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining('Mara')]);
  });

  it('hands over the whole roster and asks nothing of the wire itself', async () => {
    const state = await open();
    expect(go()?.disabled).toBe(true);
    await act(async () => rows()[0]?.click());
    expect(go()?.disabled).toBe(false);
    await act(async () => go()?.click());
    // The members plus the new one, because a persona names the roster and a team gains a member
    // by being restarted with them in it.
    expect(state.handed).toEqual([['alice', 'bob', 'mara']]);
  });

  it('does not shut when the hire bar it opened is clicked in', async () => {
    // The hire bar portals to the body, but a React event travels the *tree*, so while it was a
    // child of the scrim every click on its own prose reached the scrim's `onMouseDown` and shut
    // both bars. Everything a person reads in there was doing it. *2026-09-07.*
    const state = await open();
    const door = host?.querySelector('.hirerow') as HTMLElement | null;
    await act(async () => door?.click());
    const bar = document.querySelector('.agentbar') as HTMLElement | null;
    expect(bar).not.toBeNull();
    await act(async () => {
      bar?.querySelector('.pickto')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(state.closed).toBe(0);
    expect(document.querySelector('.agentbar')).not.toBeNull();
  });

  it('answers Escape to the hire bar over it and not to itself', async () => {
    // The window listener that lets this bar leave answered a key aimed at the layer above it,
    // so one press shut the dialog and took the roster behind it. *2026-09-07.*
    const state = await open();
    const door = host?.querySelector('.hirerow') as HTMLElement | null;
    await act(async () => door?.click());
    expect(document.querySelector('.agentbar')).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(state.closed).toBe(0);
  });

  it('takes back somebody added by mistake, and never a member', async () => {
    await open();
    await act(async () => rows()[0]?.click());
    expect(chips()).toHaveLength(3);
    act(() => (chips()[2]?.querySelector('.off') as HTMLElement | null)?.click());
    expect(chips().map((chip) => chip.querySelector('.nm')?.textContent)).toEqual(['Alice', 'Bob']);
    expect(go()?.disabled).toBe(true);
  });
});
