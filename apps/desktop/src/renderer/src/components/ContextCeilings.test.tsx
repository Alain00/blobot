/**
 * @vitest-environment jsdom
 *
 * *Context*, the settings screen's second section.
 *
 * What is worth holding down here is the honesty of a row rather than its layout: a number
 * blobot decided must be readable as blobot's, the fallback must not draw a figure it cannot
 * stand behind, and *unset* must exist only where there is something of the user's to take back.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiContextCeiling } from '../../../shared/api.js';
import { ContextCeilings } from './ContextCeilings.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SHIPPED: UiContextCeiling = {
  runtimeId: 'claude-code',
  runtimeLabel: 'Claude Code',
  model: 'opus',
  tokens: 300_000,
  source: 'measured',
  used: ['Alice'],
};

const FALLBACK: UiContextCeiling = {
  runtimeId: 'codex',
  runtimeLabel: 'Codex',
  source: 'unmeasured',
  used: ['Cass'],
};

const MINE: UiContextCeiling = { ...SHIPPED, tokens: 420_000, source: 'yours' };

const drawn: { unmount: () => void; host: HTMLElement }[] = [];
afterEach(() => {
  act(() => {
    for (const entry of drawn.splice(0)) {
      entry.unmount();
      entry.host.remove();
    }
  });
});

async function draw(rows: readonly UiContextCeiling[]): Promise<{
  host: HTMLElement;
  set: ReturnType<typeof vi.fn>;
}> {
  const set = vi.fn(async () => rows);
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    contextCeilings: vi.fn(async () => rows),
    setContextCeiling: set,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount(), host });
  await act(async () => {
    root.render(<ContextCeilings />);
  });
  return { host, set };
}

const buttons = (host: HTMLElement, label: string): HTMLButtonElement[] =>
  [...host.querySelectorAll('button')].filter((element) => element.textContent === label);

describe('a row', () => {
  it('says what the number is, what it does, and whose it is', async () => {
    const { host } = await draw([SHIPPED]);
    const text = host.textContent ?? '';
    expect(text).toContain('300,000 tokens');
    // The consequence, not just the figure: this is the number that decides when an agent is
    // asked to hand off to itself.
    expect(text).toContain('handoff at 240,000');
    expect(text).toContain('blobot ships this one');
  });

  it('draws the rule and not a figure where nobody has measured anything', async () => {
    // The fallback is a fraction of a window nobody is reporting for a model nobody is running.
    const { host } = await draw([FALLBACK]);
    const line = host.querySelector('.listrow .sub')?.textContent ?? '';
    expect(line).toContain("blobot's fallback");
    expect(line).toContain('60% of the window, up to 200,000');
    // The row states no figure of its own, so it cannot name the moment either.
    expect(line).not.toMatch(/handoff at/);
  });

  it('names a runtime that offers no model to choose, rather than inventing one', async () => {
    const { host } = await draw([FALLBACK]);
    expect(host.textContent).toContain('Codex, whichever model it picks');
  });

  it('says who is on it, so the row is about somebody', async () => {
    const { host } = await draw([SHIPPED]);
    expect(host.textContent).toContain('Alice');
  });
});

describe('changing one', () => {
  it("offers to take back the user's own number and nothing else", async () => {
    const shipped = await draw([SHIPPED]);
    expect(buttons(shipped.host, 'unset')).toHaveLength(0);
    const mine = await draw([MINE]);
    expect(buttons(mine.host, 'unset')).toHaveLength(1);
  });

  it('hands the ceiling back to blobot when it is unset', async () => {
    const { host, set } = await draw([MINE]);
    await act(async () => {
      buttons(host, 'unset')[0]?.click();
    });
    expect(set).toHaveBeenCalledWith('claude-code', 'opus', undefined);
  });

  it('refuses a figure that is not a token count, before the round trip', async () => {
    const { host, set } = await draw([SHIPPED]);
    const field = host.querySelector('input') as HTMLInputElement;
    const type = (value: string): void => {
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };

    type('900');
    expect(buttons(host, 'set')[0]?.disabled).toBe(true);
    type('300000');
    // The number it already holds is not a change, so there is nothing to press.
    expect(buttons(host, 'set')[0]?.disabled).toBe(true);
    type('420,000');
    expect(buttons(host, 'set')[0]?.disabled).toBe(false);
    await act(async () => {
      buttons(host, 'set')[0]?.click();
    });
    expect(set).toHaveBeenCalledWith('claude-code', 'opus', 420_000);
  });
});
