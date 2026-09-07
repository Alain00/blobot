/**
 * @vitest-environment jsdom
 *
 * The agent bar, which replaced the agent dialog on 2026-09-07.
 *
 * Four claims, and each is a thing the dialog it replaced could not get wrong because it did not
 * try: that the bar is complete the moment there is a name, that Enter is the arrow, that an
 * edit's arrow is dead until something has changed, and that the seven answers are on screen
 * before anything is opened. The last one is the whole argument for the shape — a chip row
 * states what the columns of fields used to ask.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiAgentProfile, UiRuntimeChoice } from '../../../shared/api.js';
import { EditAgent, HireAgent } from './AgentForm.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
stubGazeHost();
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const RUNTIMES: readonly UiRuntimeChoice[] = [
  {
    runtimeId: 'claude-code',
    label: 'Claude Code',
    supported: true,
    readiness: 'ready',
    detail: 'Signed in on this machine',
    version: '2.1.263',
    remedies: [],
    trustLevels: ['careful', 'normal', 'trusting'],
  },
];

const MARA: UiAgentProfile = {
  id: 'p1',
  name: 'Mara',
  role: 'marketing',
  runtimeId: 'claude-code',
  runtimeLabel: 'Claude Code',
  teams: [],
};

const hired = vi.fn(async (_spec: unknown) => ({ ok: true, profileId: 'p9' }));
const edited = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  hired.mockClear();
  edited.mockClear();
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    describeRuntimeOptions: vi.fn(async () => ({ groups: [] })),
    hireAgent: hired,
    editAgent: edited,
  };
});

const drawn: { unmount: () => void; host: HTMLElement }[] = [];
afterEach(() => {
  act(() => {
    for (const entry of drawn.splice(0)) {
      entry.unmount();
      entry.host.remove();
    }
  });
});

function draw(element: React.JSX.Element): void {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  drawn.push({ unmount: () => root.unmount(), host });
}

/** Radix portals the sheet, so everything below is looked up on the document. */
const go = (): HTMLButtonElement =>
  document.querySelector('.pickgo') as HTMLButtonElement;
const name = (): HTMLInputElement =>
  document.querySelector('.agentname') as HTMLInputElement;
const type = (into: HTMLInputElement, value: string): void => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    set?.call(into, value);
    into.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('hiring', () => {
  it('states every answer before anything is opened', () => {
    draw(<HireAgent runtimes={RUNTIMES} onClose={() => {}} onHired={() => {}} />);
    const said = document.body.textContent ?? '';
    // The five defaults, in blobot's words and the runtime's, with nothing pressed.
    expect(said).toContain('Claude Code');
    expect(said).toContain('normal');
    expect(said).toContain('on');
    // And ticket 11's line, which is the one fact here that is about the machine.
    expect(said).toContain('ready');
    expect(said).toContain('2.1.263');
  });

  it('is complete the moment there is a name', () => {
    draw(<HireAgent runtimes={RUNTIMES} onClose={() => {}} onHired={() => {}} />);
    expect(go().disabled).toBe(true);
    type(name(), 'Alice');
    expect(go().disabled).toBe(false);
  });

  it('takes Enter for the arrow', () => {
    draw(<HireAgent runtimes={RUNTIMES} onClose={() => {}} onHired={() => {}} />);
    type(name(), 'Alice');
    act(() => {
      name().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(hired).toHaveBeenCalledTimes(1);
    expect(hired).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice', runtimeId: 'claude-code' }),
    );
  });

  it('leaves Enter alone in the standing instructions, which are paragraphs', () => {
    draw(<HireAgent runtimes={RUNTIMES} onClose={() => {}} onHired={() => {}} />);
    type(name(), 'Alice');
    const open = [...document.querySelectorAll('button')].find(
      (element) => element.textContent?.includes('standing instructions') === true,
    );
    act(() => open?.click());
    const area = document.querySelector('.agentstanding textarea') as HTMLTextAreaElement;
    act(() => {
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(hired).not.toHaveBeenCalled();
  });
});

describe('editing', () => {
  it('holds the arrow until something has changed', () => {
    draw(<EditAgent agent={MARA} runtimes={RUNTIMES} onClose={() => {}} onSaved={() => {}} />);
    expect(go().disabled).toBe(true);
    type(name(), 'Mara Q');
    expect(go().disabled).toBe(false);
  });

  it('says where the change lands before it is pressed', () => {
    draw(
      <EditAgent
        agent={{ ...MARA, teams: ['checkout'] }}
        runtimes={RUNTIMES}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const said = document.body.textContent ?? '';
    expect(said).toContain('checkout');
    expect(said).toContain('The face reaches');
  });
});
