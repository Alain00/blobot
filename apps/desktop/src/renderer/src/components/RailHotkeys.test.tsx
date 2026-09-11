/**
 * @vitest-environment jsdom
 *
 * ctrl+1 to ctrl+9 open the rail's rows, and holding ctrl alone numbers them. `DESIGN.md`, *Rows
 * by number*. The claims are the distinctions a screenshot cannot make: a hold against a combo,
 * the physical key against the character it types, the order under a held key against the order
 * a moment later, and a rail that can be pressed against one that is covered.
 */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiAgent, UiRailAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { HOLD_MS } from '../useRailHotkeys.js';
import { Rail } from './Rail.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const OPEN: UiTeam = { id: 'open', name: 'portfolio', workspacePath: '/w', turnBudget: 10, leadAgentId: 'alice' };
const AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w/a', accepts: { images: true, textFiles: true } },
];
const team = (id: string, name: string, lastActiveAt: number): UiTeamSummary => ({
  id,
  name,
  workspacePath: `/${id}`,
  workspaceKind: 'git',
  members: [{ id: `${id}_m`, name: 'M' }],
  lastActiveAt,
});
const PROFILES: readonly UiRailAgent[] = [{ id: 'p_omar', name: 'Omar', role: 'writes', hiredAt: 400 }];
/** Drawn as Omar (400), portfolio (300), hermes (200). */
const TEAMS: readonly UiTeamSummary[] = [team('open', 'portfolio', 300), team('other', 'hermes', 200)];

let host: HTMLDivElement;
let root: Root;
const calls = { team: vi.fn(), agent: vi.fn(), select: vi.fn() };

function render(teams: readonly UiTeamSummary[] = TEAMS, demo = false): void {
  act(() => {
    root.render(
      <Rail
        team={OPEN}
        teams={teams}
        profiles={PROFILES}
        agents={AGENTS}
        statuses={{}}
        pane={{ kind: 'team' }}
        unread={[]}
        pinned={[]}
        onSelect={calls.select}
        {...(demo ? {} : { onSelectTeam: calls.team, onSelectAgent: calls.agent })}
      />,
    );
  });
}

function down(init: KeyboardEventInit): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}
function up(init: KeyboardEventInit): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, ...init }));
  });
}
const ctrl = (): void => down({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
const letGo = (): void => up({ key: 'Control', code: 'ControlLeft' });
const wait = (ms = HOLD_MS): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const badges = (): string[] => [...host.querySelectorAll('.when.key')].map((one) => one.textContent ?? '');

beforeEach(() => {
  vi.useFakeTimers();
  for (const one of Object.values(calls)) one.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  letGo();
  act(() => root.unmount());
  host.remove();
  document.querySelectorAll('.scrim').forEach((one) => one.remove());
  vi.useRealTimers();
});

describe('holding ctrl', () => {
  it('numbers the rows only once it has been held on its own', () => {
    render();
    ctrl();
    wait(HOLD_MS - 1);
    expect(badges()).toEqual([]);
    wait(1);
    expect(badges()).toEqual(['CTRL 1', 'CTRL 2', 'CTRL 3']);
    letGo();
    expect(badges()).toEqual([]);
  });

  it('never numbers them after a combo, so a copy does not flash the column', () => {
    render();
    ctrl();
    down({ key: 'c', code: 'KeyC', ctrlKey: true });
    wait();
    expect(badges()).toEqual([]);
  });

  it('keeps them up across a digit, and takes them down on any other key', () => {
    render();
    ctrl();
    wait();
    down({ key: '3', code: 'Digit3', ctrlKey: true });
    expect(badges()).toHaveLength(3);
    down({ key: 'Shift', code: 'ShiftLeft', ctrlKey: true, shiftKey: true });
    expect(badges()).toEqual([]);
  });

  it('announces the key on the first nine rows', () => {
    render();
    expect(host.querySelector('.railrow')?.getAttribute('aria-keyshortcuts')).toBe('Control+1 Meta+1');
  });
});

describe('ctrl and a digit', () => {
  it('does what pressing that row does', () => {
    render();
    down({ key: '1', code: 'Digit1', ctrlKey: true });
    expect(calls.agent).toHaveBeenCalledWith('p_omar');
    // The open team's row goes back to the team pane, as its press does.
    down({ key: '2', code: 'Digit2', ctrlKey: true });
    expect(calls.select).toHaveBeenCalledWith({ kind: 'team' });
  });

  it('takes cmd as well as ctrl, and the numpad as well as the top row', () => {
    render();
    down({ key: 'Meta', code: 'MetaLeft', metaKey: true });
    down({ key: '3', code: 'Numpad3', metaKey: true });
    expect(calls.team).toHaveBeenCalledWith('other');
  });

  it('matches the physical key, so AZERTY needs no shift', () => {
    render();
    down({ key: 'é', code: 'Digit1', ctrlKey: true });
    expect(calls.agent).toHaveBeenCalledWith('p_omar');
  });

  it('opens what the numbers said when ctrl went down, not what the rail says now', () => {
    render();
    ctrl();
    render([team('open', 'portfolio', 300), team('other', 'hermes', 999)]);
    down({ key: '1', code: 'Digit1', ctrlKey: true });
    expect(calls.agent).toHaveBeenCalledWith('p_omar');
    expect(calls.team).not.toHaveBeenCalled();
    letGo();
    ctrl();
    down({ key: '1', code: 'Digit1', ctrlKey: true });
    expect(calls.team).toHaveBeenCalledWith('other');
  });

  it('does nothing past the last row', () => {
    render();
    down({ key: '9', code: 'Digit9', ctrlKey: true });
    expect([calls.agent, calls.team, calls.select].every((one) => one.mock.calls.length === 0)).toBe(true);
  });
});

describe('where the press could not happen', () => {
  it('does nothing under a scrim, and shows no numbers there', () => {
    render();
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.append(scrim);
    ctrl();
    wait();
    down({ key: '1', code: 'Digit1', ctrlKey: true });
    expect(badges()).toEqual([]);
    expect(calls.agent).not.toHaveBeenCalled();
  });

  it('leaves a terminal its keys', () => {
    render();
    const term = document.createElement('div');
    term.className = 'xterm';
    const field = document.createElement('textarea');
    term.append(field);
    document.body.append(term);
    field.focus();
    down({ key: '1', code: 'Digit1', ctrlKey: true });
    expect(calls.agent).not.toHaveBeenCalled();
    term.remove();
  });

  it('is off in demo mode, where a row cannot be opened', () => {
    render(TEAMS, true);
    ctrl();
    wait();
    expect(badges()).toEqual([]);
  });
});
