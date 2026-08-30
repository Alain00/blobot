/**
 * @vitest-environment jsdom
 *
 * Who the team pane is talking to when the user names nobody.
 *
 * The reopen of ticket 12 turns on one exchange: the team pane may have an implicit recipient,
 * *provided* the composer names and draws the agent it resolved to. So the claims here are the
 * two halves of that bargain, plus the state the ticket's original rule still governs — a team
 * with no lead, where send stays shut until an `@mention` resolves.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { UiAgent } from '../../../shared/api.js';
import { Composer } from './Composer.js';
import type { Pane } from '../model.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// cmdk measures its list, and jsdom has no ResizeObserver. Only the tests that open the mention
// menu ever needed it, which is why it appeared the moment a mention was typed mid-sentence.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

const AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w/a' },
  { id: 'bob', name: 'Bob', role: 'reviews', runtimeLabel: 'mock', workspacePath: '/w/b' },
];

interface Drawn {
  readonly host: HTMLElement;
  readonly sent: [readonly string[], string][];
  type: (text: string) => void;
  send: () => HTMLButtonElement;
}

function draw(pane: Pane, lead?: string): Drawn {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const sent: [readonly string[], string][] = [];
  act(() => {
    root.render(
      React.createElement(Composer, {
        agents: AGENTS,
        commands: {},
        pane,
        ...(lead === undefined ? {} : { lead }),
        onSend: (agentIds: readonly string[], text: string) => sent.push([agentIds, text]),
      }),
    );
  });
  const input = host.querySelector('input') as HTMLInputElement;
  return {
    host,
    sent,
    type: (text: string) => {
      act(() => {
        // React listens for the native event, so the value goes in through the prototype setter.
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    send: () => host.querySelector('button.send') as HTMLButtonElement,
  };
}

describe('the team pane addresses the lead', () => {
  it('names and draws who it resolved to, and sends there', () => {
    const drawn = draw({ kind: 'team' }, 'alice');

    // Named before a key is pressed, and named again on the control that will do it.
    expect(drawn.host.textContent).toContain('Message Alice');
    drawn.type('ship it');
    expect(drawn.send().getAttribute('aria-label')).toBe('Send to Alice');
    expect(drawn.send().textContent).toContain('Alice');
    expect(drawn.send().disabled).toBe(false);

    act(() => drawn.send().click());
    expect(drawn.sent).toEqual([[['alice'], 'ship it']]);
  });

  it('lets a leading mention re-point the message off the lead', () => {
    const drawn = draw({ kind: 'team' }, 'alice');
    drawn.type('@Bob could you look');
    expect(drawn.send().getAttribute('aria-label')).toBe('Send to Bob');

    act(() => drawn.send().click());
    expect(drawn.sent).toEqual([[['bob'], '@Bob could you look']]);
  });

  // The fan-out issue 02 chose over a coordinator: the user's own words, the user's own
  // authority, one message row per named agent.
  it('sends the whole message to everybody in the leading run', () => {
    const drawn = draw({ kind: 'team' }, 'alice');
    drawn.type('@Alice @Bob the page double-charges');
    expect(drawn.send().getAttribute('aria-label')).toBe('Send to Alice, Bob');
    expect(drawn.send().textContent).toContain('Alice, Bob');

    act(() => drawn.send().click());
    expect(drawn.sent).toEqual([[['alice', 'bob'], '@Alice @Bob the page double-charges']]);
  });

  // The misfire the leading-run rule exists to prevent, and the behaviour it cost: a trailing
  // mention no longer addresses anything, so this falls back to the lead.
  it('treats a mention after the first ordinary word as a reference, not a recipient', () => {
    const drawn = draw({ kind: 'team' }, 'alice');
    drawn.type('@Bob about @Alice branch');
    expect(drawn.send().getAttribute('aria-label')).toBe('Send to Bob');

    drawn.type('ship it @Bob');
    expect(drawn.send().getAttribute('aria-label')).toBe('Send to Alice');
  });

  // Ticket 12's rule, still in force wherever nobody was chosen: a team formed before leads
  // existed, and one whose lead has left the roster.
  it('keeps send shut on a team with no lead until a mention resolves', () => {
    const drawn = draw({ kind: 'team' });
    drawn.type('ship it');
    expect(drawn.send().disabled).toBe(true);
    expect(drawn.send().getAttribute('aria-label')).toBe('Send');

    drawn.type('@Alice ship it');
    expect(drawn.send().disabled).toBe(false);
  });

  // Found on the first real team, which had no lead because it predates them: a typed message
  // and a disabled arrow, with the placeholder that would have explained it long gone.
  it('says why a typed message is going nowhere, and names both exits', () => {
    const drawn = draw({ kind: 'team' });
    expect(drawn.host.textContent).not.toContain('give this team a lead');

    drawn.type('good morning');
    expect(drawn.host.textContent).toContain('say who with @ · or give this team a lead');

    // Addressed, so there is nothing to explain.
    drawn.type('@Alice good morning');
    expect(drawn.host.textContent).not.toContain('give this team a lead');
  });

  it('leaves an agent pane exactly as it was: its own pane, and an arrow', () => {
    const drawn = draw({ kind: 'agent', agentId: 'bob' }, 'alice');
    expect(drawn.host.textContent).toContain('Message Bob');
    drawn.type('ship it');
    expect(drawn.send().textContent).not.toContain('Bob');

    act(() => drawn.send().click());
    expect(drawn.sent).toEqual([[['bob'], 'ship it']]);
  });
});
