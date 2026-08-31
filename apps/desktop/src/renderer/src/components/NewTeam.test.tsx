/**
 * @vitest-environment jsdom
 *
 * The creation flow's folding, which no screenshot can reach.
 *
 * A step folds to its own answer once you have moved past it, and the whole risk of that is
 * hiding something the user still has to act on. So what is checked here is when a step folds,
 * when it must not, and that folding takes away the tail of a step and never the question: the
 * numeral and the title of all four stay on the page, because this screen is read start to
 * finish and it is not a wizard.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiAgentProfile, UiWorkspaceInspection } from '../../../shared/api.js';
import { NewTeam } from './NewTeam.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALICE: UiAgentProfile = {
  id: 'p_alice',
  name: 'Alice',
  role: 'reviewer',
  runtimeId: 'claude',
  runtimeLabel: 'Claude Code',
  teams: [],
};

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

async function screen(): Promise<HTMLElement> {
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    listAgents: vi.fn(async () => [ALICE]),
    detectRuntimes: vi.fn(async () => []),
    chooseWorkspace: vi.fn(async () => CHECKOUT.path),
    inspectWorkspace: vi.fn(async () => CHECKOUT),
    suggestTeamIcon: vi.fn(async () => undefined),
    createTeam: vi.fn(async () => ({ ok: true })),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount() });
  await act(async () => {
    root.render(React.createElement(NewTeam, { onCreated: () => {} }));
  });
  return host;
}

/** The head of one step, whether or not it is the kind that folds. */
function head(host: HTMLElement, n: string): HTMLElement | undefined {
  return [...host.querySelectorAll('.stephead')].find((one) =>
    (one.querySelector('.stepn')?.textContent ?? '').includes(n),
  ) as HTMLElement | undefined;
}

/** Whether that step's body is on the page at all. Folded means gone, not hidden. */
function open(host: HTMLElement, n: string): boolean {
  return head(host, n)?.parentElement?.querySelector('.stepbody') !== null;
}

async function type(host: HTMLElement, value: string): Promise<void> {
  const field = host.querySelector('.stepbody input.field') as HTMLInputElement;
  await act(async () => {
    // React listens on the property setter, so the value has to be set through it.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function press(host: HTMLElement, label: string): Promise<void> {
  const button = [...host.querySelectorAll('button')].find(
    (one) => (one.textContent ?? '').trim() === label,
  );
  await act(async () => {
    button?.click();
  });
}

describe('a step that has been answered', () => {
  it('stays open while it is the one being answered', async () => {
    const host = await screen();
    await type(host, 'checkout');

    // The whole reason folding is not keyed on validity: one keystroke makes the name valid,
    // and a field that folds under the cursor is the worst version of this feature.
    expect(open(host, '01')).toBe(true);
  });

  it('folds to its answer once the step below it has been answered', async () => {
    const host = await screen();
    await type(host, 'checkout');
    await press(host, 'choose a folder…');

    expect(open(host, '01')).toBe(false);
    expect(head(host, '01')?.querySelector('.stepsum')?.textContent).toContain('checkout');
    // And the folder step is still open, because nobody has joined yet.
    expect(open(host, '02')).toBe(true);
  });

  it('folds the folder step only once somebody has joined, and says what the folder is', async () => {
    const host = await screen();
    await type(host, 'checkout');
    await press(host, 'choose a folder…');
    expect(open(host, '02')).toBe(true);

    await act(async () => {
      (host.querySelector('.listrow.pick') as HTMLButtonElement).click();
    });

    expect(open(host, '02')).toBe(false);
    const summary = head(host, '02')?.querySelector('.stepsum')?.textContent ?? '';
    expect(summary).toContain(CHECKOUT.path);
    // The same words the open step uses. A summary with its own vocabulary would be a second
    // source of truth about one folder.
    expect(summary).toContain('git');
    expect(summary).toContain('clean');
  });

  it('comes back on a click, and stays back', async () => {
    const host = await screen();
    await type(host, 'checkout');
    await press(host, 'choose a folder…');
    expect(open(host, '01')).toBe(false);

    await act(async () => {
      head(host, '01')?.click();
    });
    expect(open(host, '01')).toBe(true);

    // Answering the step below it again must not shut it under the user's cursor.
    await act(async () => {
      (host.querySelector('.listrow.pick') as HTMLButtonElement).click();
    });
    expect(open(host, '01')).toBe(true);
  });

  it('never takes the question away, only the tail of it', async () => {
    const host = await screen();
    await type(host, 'checkout');
    await press(host, 'choose a folder…');
    await act(async () => {
      (host.querySelector('.listrow.pick') as HTMLButtonElement).click();
    });

    // Both folded, and the page still reads as the same four questions in the same order.
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('What the team is called');
    expect(text).toContain('The folder they work in');
    expect(text).toContain('Who joins');
    expect(text).toContain('How far they go on their own');
    expect([...host.querySelectorAll('.stepn')].map((one) => one.textContent)).toEqual([
      '01',
      '02',
      '03',
      '04',
    ]);
  });
});
