/**
 * @vitest-environment jsdom
 *
 * What an agent is set to on its runtime, and the one rule that is easy to get wrong: choosing
 * the runtime's own default stores nothing, so an agent set to "whatever this runtime does"
 * follows the provider instead of being pinned to what the provider did the day it was hired.
 *
 * The other claim here is the provider rule. This component is handed groups it cannot name
 * and draws them in order, which is why one runtime can offer three and another one, with no
 * branch anywhere in the renderer. The filter is the same rule under load: it matches the text
 * it was handed, and a runtime advertising forty models gets a field while one advertising two
 * does not.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiRuntimeOptionGroup, UiRuntimeOptions } from '../../../shared/api.js';
import { RuntimeOptions, narrow, summaryOf } from './RuntimeOptions.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The list is cmdk's, and cmdk measures it. Same two stubs the navigator needs: jsdom has
// neither a ResizeObserver nor a scroll.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const CLAUDE: readonly UiRuntimeOptionGroup[] = [
  {
    id: 'model',
    label: 'Model',
    choices: [
      { value: 'opus[1m]', label: 'opus[1m]', isDefault: true },
      { value: 'sonnet', label: 'sonnet' },
    ],
  },
  {
    id: 'effort',
    label: 'Reasoning',
    choices: [
      { value: 'low', label: 'low' },
      { value: 'medium', label: 'medium', isDefault: true },
      { value: 'max', label: 'max' },
    ],
  },
];

async function draw(
  answer: UiRuntimeOptions,
  value: Readonly<Record<string, string>> = {},
): Promise<{ host: HTMLElement; chosen: Readonly<Record<string, string>>[] }> {
  const chosen: Readonly<Record<string, string>>[] = [];
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    describeRuntimeOptions: vi.fn(async () => answer),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount(), host });
  await act(async () => {
    root.render(
      <RuntimeOptions
        runtimeId={answer.runtimeId}
        value={value}
        onChange={(options) => chosen.push(options)}
      />,
    );
  });
  return { host, chosen };
}

// Menus are drawn into a portal on the body, so a test that leaves one open would be found by
// the next one's queries. Unmounted rather than wiped: the portal is React's to remove.
const drawn: { unmount: () => void; host: HTMLElement }[] = [];
afterEach(() => {
  act(() => {
    for (const entry of drawn.splice(0)) {
      entry.unmount();
      entry.host.remove();
    }
  });
});

describe('the trigger', () => {
  it('says what the agent will actually do, defaults included', async () => {
    const { host } = await draw({ runtimeId: 'claude-code', groups: CLAUDE });
    // Not an empty control the user has to open to understand: an agent with nothing stored
    // still answers somehow, and this is the line that says how.
    expect(host.textContent).toContain('opus[1m] · medium');
  });

  it('reads the stored choices where there are some', () => {
    expect(summaryOf(CLAUDE, { effort: 'max' })).toBe('opus[1m] · max');
  });

  it('says the runtime offers nothing rather than drawing an empty menu', async () => {
    // OpenCode advertises no effort scale at all, which is a real answer and not a gap.
    const { host } = await draw({ runtimeId: 'opencode', groups: [] });
    expect(host.textContent).toContain('nothing to choose');
  });

  it('does not claim a runtime offers nothing before one is picked', async () => {
    // The beat between the dialog opening and detection answering. Saying "nothing to choose"
    // here would be stating an answer nobody has asked for yet.
    const { host } = await draw({ runtimeId: '', groups: [] });
    expect(host.textContent).toContain('pick a runtime first');
  });

  it('never refuses when the runtime could not be asked', async () => {
    // Hiring is not gated on a runtime answering, exactly as it is not gated on detection.
    const { host } = await draw({
      runtimeId: 'claude-code',
      groups: [],
      error: 'claude was not found on PATH',
    });
    expect(host.textContent).toContain('could not be read');
    expect(host.textContent).toContain('claude was not found on PATH');
  });
});

/** cmdk draws rows as `option`s: this list is a combobox, not a menu. */
function items(): HTMLElement[] {
  return [...document.querySelectorAll('[cmdk-item]')] as HTMLElement[];
}

function itemNamed(text: string): HTMLElement | undefined {
  return items().find((node) => node.textContent?.startsWith(text));
}

function open(host: HTMLElement): void {
  const trigger = host.querySelector('button');
  act(() => {
    trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('choosing', () => {
  it('draws every group it was handed, in the order it was handed them', async () => {
    const { host } = await draw({ runtimeId: 'claude-code', groups: CLAUDE });
    open(host);

    const labels = [...document.querySelectorAll('.optionslabel')].map((node) => node.textContent);
    expect(labels).toEqual(['MODEL', 'REASONING']);
    // The badge says which one is what happens when blobot stores nothing.
    expect(itemNamed('medium')?.textContent).toContain('default');
  });

  it('stores a choice that is not the default', async () => {
    const { host, chosen } = await draw({ runtimeId: 'claude-code', groups: CLAUDE });
    open(host);
    act(() => {
      itemNamed('max')?.click();
    });

    expect(chosen.at(-1)).toEqual({ effort: 'max' });
  });

  it('stores nothing when the default is chosen back', async () => {
    const { host, chosen } = await draw({ runtimeId: 'claude-code', groups: CLAUDE }, { effort: 'max' });
    open(host);
    act(() => {
      itemNamed('medium')?.click();
    });

    // The key goes rather than being written as `medium`: an agent pinned to today's default
    // keeps it after the provider moves on, which is not what the user picked.
    expect(chosen.at(-1)).toEqual({});
  });
});

describe('a long list', () => {
  // What a real OpenCode roster looks like from here: a value the user reads in a changelog and
  // a label they read in a menu, which are rarely the same string.
  const MANY: readonly UiRuntimeOptionGroup[] = [
    {
      id: 'model',
      label: 'Model',
      choices: Array.from({ length: 20 }, (_unused, index) => ({
        value: `openai/gpt-5.${index}`,
        label: `GPT-5.${index}`,
        ...(index === 0 ? { isDefault: true } : {}),
      })),
    },
    {
      id: 'effort',
      label: 'Reasoning',
      choices: [
        { value: 'low', label: 'low' },
        { value: 'high', label: 'high', isDefault: true },
      ],
    },
  ];

  function type(text: string): void {
    const input = document.querySelector('[cmdk-input]') as HTMLInputElement;
    // React tracks the last value it wrote and swallows an event whose value it thinks it
    // already has, so the field has to be set through the prototype's own setter.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('grows a field, and says how much of the list is left', async () => {
    const { host } = await draw({ runtimeId: 'opencode', groups: MANY });
    open(host);
    expect(document.querySelector('[cmdk-input]')).not.toBeNull();
    expect(document.querySelector('.optionscount')?.textContent).toBe('22');

    type('5.1');

    // 5.1 and 5.10 through 5.19: a substring, not a fuzzy score, which on a name this dense
    // with digits would have returned most of the list.
    expect(document.querySelector('.optionscount')?.textContent).toBe('11 of 22');
    expect(items()).toHaveLength(11);
  });

  it('does not grow one on a runtime with a handful of choices', async () => {
    const { host } = await draw({ runtimeId: 'claude-code', groups: CLAUDE });
    open(host);

    // A field the user pays for on every hire and needs on one runtime.
    expect(document.querySelector('[cmdk-input]')).toBeNull();
  });

  it('drops a group the query empties rather than leaving a heading over nothing', async () => {
    const { host } = await draw({ runtimeId: 'opencode', groups: MANY });
    open(host);
    type('gpt');

    expect([...document.querySelectorAll('.optionslabel')].map((node) => node.textContent)).toEqual(
      ['MODEL'],
    );
  });

  it('says so when nothing matches, and still stores a choice made after narrowing', async () => {
    const { host, chosen } = await draw({ runtimeId: 'opencode', groups: MANY });
    open(host);
    type('claude');
    expect(document.body.textContent).toContain('Nothing matches');

    type('5.7');
    act(() => {
      itemNamed('GPT-5.7')?.click();
    });

    expect(chosen.at(-1)).toEqual({ model: 'openai/gpt-5.7' });
  });
});

describe('narrowing', () => {
  it('matches the value the user read in a changelog as well as the label in the menu', () => {
    const groups: readonly UiRuntimeOptionGroup[] = [
      {
        id: 'model',
        label: 'Model',
        choices: [
          { value: 'openai/gpt-5.4', label: 'GPT-5.4' },
          { value: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
        ],
      },
    ];

    expect(narrow(groups, 'openai')[0]?.choices).toHaveLength(1);
    expect(narrow(groups, 'sonnet')[0]?.choices[0]?.value).toBe('anthropic/claude-sonnet-5');
  });

  it('narrows on every token rather than widening on any of them', () => {
    const groups: readonly UiRuntimeOptionGroup[] = [
      {
        id: 'model',
        label: 'Model',
        choices: [
          { value: 'gpt-5-mini', label: 'GPT-5 mini' },
          { value: 'gpt-4-mini', label: 'GPT-4 mini' },
        ],
      },
    ];

    // A naive OR here returns both, which is the filter answering a question nobody asked.
    expect(narrow(groups, 'gpt 5')[0]?.choices).toHaveLength(1);
  });

  it('hands back every group when nothing is typed', () => {
    expect(narrow(CLAUDE, '   ')).toHaveLength(2);
  });
});
