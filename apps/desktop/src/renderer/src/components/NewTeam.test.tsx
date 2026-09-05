/**
 * @vitest-environment jsdom
 *
 * Forming a team in two questions, and the keys that carry it.
 *
 * The bar is a field that is a search and a multi-select at once, so the whole risk is in the
 * keyboard: Enter has to mean *this one* while you are typing and *go on* when you are not, Tab
 * has to take what the arrow keys landed on, and Backspace on an empty field has to give an
 * agent back. None of that is reachable by a screenshot, and all of it is what stands between a
 * new user and the only thing this app does.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiAgentProfile, UiWorkspaceInspection } from '../../../shared/api.js';
import { NewTeam } from './NewTeam.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The faces in the field and the list are animated, and cmdk measures its own list.
stubGazeHost();
// cmdk scrolls its highlighted row into view, which jsdom has no layout to do.
HTMLElement.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const ALICE: UiAgentProfile = {
  id: 'p_alice',
  name: 'Alice',
  role: 'reviewer',
  runtimeId: 'claude',
  runtimeLabel: 'Claude Code',
  teams: [],
};
const BOB: UiAgentProfile = { ...ALICE, id: 'p_bob', name: 'Bob', role: 'builder' };

const CHECKOUT: UiWorkspaceInspection = {
  path: '/home/someone/code/checkout',
  kind: 'git',
  hasCommits: true,
  dirty: false,
  branch: 'main',
  repos: [],
  looseFiles: false,
};

const drawn: { unmount: () => void }[] = [];
afterEach(() => {
  for (const one of drawn.splice(0)) act(() => one.unmount());
});

/** What the bar handed over. It does not create anything itself, so this is the whole output. */
const created = vi.fn();
const prepareWorkspace = vi.fn(async (name: string) => ({
  ...CHECKOUT,
  path: `/home/someone/blobot/${name}`,
}));

async function screen(): Promise<HTMLElement> {
  created.mockClear();
  prepareWorkspace.mockClear();
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    listAgents: vi.fn(async () => [ALICE, BOB]),
    detectRuntimes: vi.fn(async () => []),
    chooseWorkspace: vi.fn(async () => CHECKOUT.path),
    inspectWorkspace: vi.fn(async () => CHECKOUT),
    prepareWorkspace,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount() });
  await act(async () => {
    root.render(React.createElement(NewTeam, { onCreate: created }));
  });
  return host;
}

function field(host: HTMLElement): HTMLInputElement {
  return host.querySelector('.pickfield input') as HTMLInputElement;
}

async function type(host: HTMLElement, value: string): Promise<void> {
  const input = field(host);
  await act(async () => {
    // React listens on the property setter, so the value has to be set through it.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function key(host: HTMLElement, k: string): Promise<void> {
  await act(async () => {
    field(host).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
    );
  });
}

/** Everybody currently in the field, by name. */
function chips(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.pickchip .nm')].map((one) => (one.textContent ?? '').trim());
}

/** The one badge carrying the word. */
function leader(host: HTMLElement): string | undefined {
  return host.querySelector('.pickchip.lead .nm')?.textContent ?? undefined;
}

/** Whether the bar is asking the second question yet. */
function naming(host: HTMLElement): boolean {
  return host.querySelector('.pickinput') !== null;
}

describe('who is on the team', () => {
  it('takes an agent into the field and stops offering them', async () => {
    const host = await screen();
    await act(async () => {
      (host.querySelector('[cmdk-item]') as HTMLElement).click();
    });

    expect(chips(host)).toEqual(['Alice']);
    const offered = [...host.querySelectorAll('[cmdk-item]')].map((one) => one.textContent ?? '');
    expect(offered.some((one) => one.includes('Alice'))).toBe(false);
    expect(offered.some((one) => one.includes('Bob'))).toBe(true);
  });

  it('takes the highlighted row on Tab', async () => {
    const host = await screen();
    await key(host, 'Tab');
    // The top of the list, which is what Tab takes when the arrow keys have moved nothing.
    expect(chips(host)).toEqual(['Alice']);
  });

  it('takes the highlighted row on Space, and only with the field empty', async () => {
    const host = await screen();
    await key(host, ' ');
    expect(chips(host)).toEqual(['Alice']);

    // A name with a space in the middle of it has to stay typable, so a query keeps its spaces.
    await type(host, 'compaign');
    await key(host, ' ');
    expect(chips(host)).toEqual(['Alice']);
  });

  it('leads with the first one picked, and says so', async () => {
    const host = await screen();
    await key(host, ' ');
    await key(host, ' ');
    expect(chips(host)).toEqual(['Alice', 'Bob']);
    expect(leader(host)).toBe('Alice');
  });

  it('moves the lead to whichever badge is pressed', async () => {
    const host = await screen();
    await key(host, ' ');
    await key(host, ' ');
    await act(async () => {
      ([...host.querySelectorAll('.pickchip .who')][1] as HTMLButtonElement).click();
    });

    expect(leader(host)).toBe('Bob');
    // Pressing a badge is not how you take somebody off, so nobody left.
    expect(chips(host)).toEqual(['Alice', 'Bob']);
  });

  it('takes somebody off from the × and promotes nobody in their place', async () => {
    const host = await screen();
    await key(host, ' ');
    await key(host, ' ');
    await act(async () => {
      ([...host.querySelectorAll('.pickchip .who')][1] as HTMLButtonElement).click();
    });
    await act(async () => {
      ([...host.querySelectorAll('.pickchip .off')][1] as HTMLButtonElement).click();
    });

    // The lead left, so the first one still in the field leads, which is where an unanswered
    // lead has always landed.
    expect(chips(host)).toEqual(['Alice']);
    expect(leader(host)).toBe('Alice');
  });

  it('gives the last one back on Backspace, and only with the field empty', async () => {
    const host = await screen();
    await key(host, 'Tab');
    await key(host, 'Tab');
    expect(chips(host)).toEqual(['Alice', 'Bob']);

    await type(host, 'ali');
    await key(host, 'Backspace');
    expect(chips(host)).toEqual(['Alice', 'Bob']);

    await type(host, '');
    await key(host, 'Backspace');
    expect(chips(host)).toEqual(['Alice']);
  });

  it('goes on when Enter has nothing typed to mean instead', async () => {
    const host = await screen();
    await key(host, 'Tab');
    expect(naming(host)).toBe(false);

    await key(host, 'Enter');
    expect(naming(host)).toBe(true);
  });

  it('refuses to go on with nobody chosen', async () => {
    const host = await screen();
    await key(host, 'Enter');
    expect(naming(host)).toBe(false);
    expect((host.querySelector('.pickgo') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('where they work', () => {
  async function named(name: string): Promise<HTMLElement> {
    const host = await screen();
    await key(host, 'Tab');
    await key(host, 'Enter');
    const input = host.querySelector('.pickinput') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, name);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return host;
  }

  it('names the folder it is about to make, before the arrow is pressed', async () => {
    const host = await named('checkout');
    expect(host.querySelector('.pickfoot')?.textContent).toContain('~/blobot/checkout');
  });

  it('makes that folder on the way to handing the team over', async () => {
    const host = await named('checkout');
    await act(async () => {
      (host.querySelector('.pickgo') as HTMLButtonElement).click();
    });

    expect(prepareWorkspace).toHaveBeenCalledWith('checkout');
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'checkout',
        workspacePath: '/home/someone/blobot/checkout',
        profileIds: ['p_alice'],
        // Whoever the field said leads is who the spec says leads.
        leadProfileId: 'p_alice',
      }),
    );
  });

  it('takes a folder that was chosen, and says what it is', async () => {
    const host = await named('checkout');
    await act(async () => {
      (host.querySelector('.pickact') as HTMLButtonElement).click();
    });

    const foot = host.querySelector('.pickfoot')?.textContent ?? '';
    expect(foot).toContain(CHECKOUT.path);
    expect(foot).toContain('git');
    expect(foot).toContain('clean');

    await act(async () => {
      (host.querySelector('.pickgo') as HTMLButtonElement).click();
    });
    expect(prepareWorkspace).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: CHECKOUT.path }),
    );
  });

  it('will not create a team with no name', async () => {
    const host = await named('');
    expect((host.querySelector('.pickgo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('still states what the user is taking on', async () => {
    const host = await named('checkout');
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('its own copy of this folder');
    expect(text).toContain('blobot is not a sandbox');
  });
});
