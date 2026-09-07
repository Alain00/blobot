/**
 * @vitest-environment jsdom
 *
 * The way out of a readiness state, as the hire dialog offers it.
 *
 * Two claims are worth holding down here. The first is that this is **not a gate**: ticket 11
 * refuses to let detection stand between the user and trying, so a runtime that says *not
 * installed* is still selectable and the button beside that sentence is an offer. The second is
 * that installing is **confirmed and quoted** before anything runs, and signing in is not,
 * because one of them puts software on the machine and the other starts a program already on it.
 *
 * The sign-in dialog is not drawn here: it mounts a terminal on the first frame, and xterm needs
 * a real layout to measure. What that path does with a process is covered against a real
 * pseudo-terminal in `src/main/runtime-step.test.ts`.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiRuntimeChoice } from '../../../shared/api.js';
import { RuntimeSetup } from './RuntimeSetup.js';
import { HireAgent } from './AgentForm.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};
// xterm asks the window for its device pixel ratio through a media query, which jsdom does not
// implement. It is stubbed rather than avoided so the confirm can be pressed the way a person
// presses it, terminal and all.
(globalThis as unknown as { window: Record<string, unknown> }).window.matchMedia ??= (() => ({
  matches: false,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof window.matchMedia;

const MISSING: UiRuntimeChoice = {
  runtimeId: 'opencode',
  label: 'OpenCode',
  readiness: 'not_installed',
  supported: true,
  detail: 'No `opencode` on this machine',
  remedies: [
    {
      kind: 'install',
      shown: 'curl -fsSL https://opencode.ai/install | bash',
      note: "This is OpenCode's own install command.",
    },
  ],
  trustLevels: ['careful', 'normal', 'trusting'],
};

const READY: UiRuntimeChoice = {
  runtimeId: 'claude-code',
  label: 'Claude Code',
  readiness: 'ready',
  supported: true,
  detail: 'Signed in on this machine',
  version: '2.1.251',
  remedies: [],
  trustLevels: ['careful', 'normal', 'trusting', 'unattended'],
  localProtection: 'Synthetic local reach description supplied by the adapter.',
};

const drawn: { unmount: () => void; host: HTMLElement }[] = [];
afterEach(() => {
  act(() => {
    for (const entry of drawn.splice(0)) {
      entry.unmount();
      entry.host.remove();
    }
  });
});

async function draw(element: React.JSX.Element): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount(), host });
  await act(async () => {
    root.render(element);
  });
  return host;
}

/** The dialog portals onto the body, so that is where its text is read from. */
const onScreen = (): string => document.body.textContent ?? '';

function stubApi(over: Record<string, unknown> = {}): { started: unknown[][] } {
  const started: unknown[][] = [];
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    describeRuntimeOptions: vi.fn(async () => ({ runtimeId: 'opencode', groups: [] })),
    startRuntimeStep: vi.fn(async (...args: unknown[]) => {
      started.push(args);
      return { ok: true };
    }),
    sendRuntimeStepInput: vi.fn(async () => undefined),
    resizeRuntimeStep: vi.fn(async () => undefined),
    closeRuntimeStep: vi.fn(async () => undefined),
    onRuntimeStepData: vi.fn(() => () => undefined),
    onRuntimeStepExit: vi.fn(() => () => undefined),
    ...over,
  };
  return { started };
}

describe('the readiness line', () => {
  it('offers the way out beside the state it reports', async () => {
    stubApi();
    await draw(
      <HireAgent runtimes={[MISSING]} onClose={() => undefined} onHired={() => undefined} />,
    );
    expect(onScreen()).toContain('not installed');
    const button = [...document.querySelectorAll('button')].find(
      (element) => element.textContent === 'install it',
    );
    expect(button).toBeDefined();
  });

  it('leaves a ready runtime alone', async () => {
    // A second door labelled sign in, beside a runtime that works, reads as blobot doubting
    // the answer it just gave.
    stubApi();
    await draw(
      <HireAgent runtimes={[READY]} onClose={() => undefined} onHired={() => undefined} />,
    );
    expect(onScreen()).not.toContain('sign in');
    // The adapter's local-reach paragraph is not on this bar: it stood under the readiness line
    // as a second foot and said nothing the person hiring an agent was deciding. *2026-09-07.*
    expect(onScreen()).not.toContain(READY.localProtection);
  });

  it('does not gate the picker on any of it', async () => {
    stubApi();
    await draw(
      <HireAgent runtimes={[MISSING]} onClose={() => undefined} onHired={() => undefined} />,
    );
    // The trigger is a Radix select showing the runtime, not a disabled control: ticket 11's
    // rule is that the user is always allowed to try. It is a chip in the agent bar's first row
    // since 2026-09-07, and the rule is the same one.
    const trigger = document.querySelector('[aria-label="Runtime"]');
    expect(trigger?.hasAttribute('disabled')).toBe(false);
  });
});

describe('installing', () => {
  it('quotes the command and waits to be told to run it', async () => {
    const { started } = stubApi();
    await draw(
      <RuntimeSetup
        runtime={MISSING}
        remedy={MISSING.remedies[0]!}
        onClose={() => undefined}
      />,
    );
    expect(onScreen()).toContain('curl -fsSL https://opencode.ai/install | bash');
    // Nothing has run: this is the confirm, and the command is on screen to be read first.
    expect(started).toHaveLength(0);
    expect(onScreen()).toContain('run it');
  });

  it('sends the two ids and never the command line', async () => {
    const { started } = stubApi();
    await draw(
      <RuntimeSetup
        runtime={MISSING}
        remedy={MISSING.remedies[0]!}
        onClose={() => undefined}
      />,
    );
    const run = [...document.querySelectorAll('button')].find(
      (element) => element.textContent === 'run it',
    );
    await act(async () => {
      run?.click();
    });
    // The pane's own id leads, then the two ids core resolves a command from. No command line
    // travels in this direction, ever.
    expect(started).toHaveLength(1);
    expect(started[0]?.slice(1)).toEqual(['opencode', 'install']);
    expect(typeof started[0]?.[0]).toBe('string');
  });
});
