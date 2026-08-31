/**
 * @vitest-environment jsdom
 *
 * Attaching a file, in the one place a file can be attached.
 *
 * The claims are the decisions that cost something to get wrong: a refusal is said at pickup and
 * not at send, a fan-out is refused whole rather than delivered to two of three, the words and
 * the file leave together, and a runtime that takes nothing offers no paperclip.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UiAgent, UiAttachment } from '../../../shared/api.js';
import { Composer } from './Composer.js';
import type { Pane } from '../model.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

const png: UiAttachment = {
  id: 'att_1',
  kind: 'image',
  mimeType: 'image/png',
  name: 'shot.png',
  bytes: 284_000,
};

const agent = (id: string, name: string, accepts = { images: true, textFiles: true }): UiAgent => ({
  id,
  name,
  role: 'builds',
  runtimeLabel: 'mock',
  workspacePath: `/w/${id}`,
  accepts,
});

let chosen: UiAttachment | { error: string } | undefined;

beforeEach(() => {
  chosen = png;
  (window as unknown as { blobot: unknown }).blobot = {
    chooseAttachment: () => Promise.resolve(chosen),
    attachmentUrl: () => Promise.resolve('data:image/png;base64,AA=='),
    attachPath: () => Promise.resolve(chosen),
    attachBytes: () => Promise.resolve(chosen),
    pathOf: () => '/tmp/shot.png',
  };
});

interface Drawn {
  host: HTMLElement;
  sent: [readonly string[], string, readonly string[]][];
  clip: () => HTMLButtonElement;
  type: (text: string) => void;
  send: () => HTMLButtonElement;
}

function draw(agents: readonly UiAgent[], pane: Pane = { kind: 'agent', agentId: 'alice' }): Drawn {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const sent: [readonly string[], string, readonly string[]][] = [];
  act(() => {
    root.render(
      React.createElement(Composer, {
        agents,
        commands: {},
        pane,
        usage: {},
        onSend: (ids: readonly string[], text: string, attachmentIds: readonly string[]) =>
          sent.push([ids, text, attachmentIds]),
      }),
    );
  });
  const input = host.querySelector('textarea') as HTMLTextAreaElement;
  return {
    host,
    sent,
    clip: () => host.querySelector('.clip') as HTMLButtonElement,
    send: () => host.querySelector('.send') as HTMLButtonElement,
    type: (text: string) => {
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        setter?.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
  };
}

const click = async (button: HTMLButtonElement): Promise<void> => {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
};

describe('picking a file up', () => {
  it('draws it as a chip with its size, and sends it with the words', async () => {
    const drawn = draw([agent('alice', 'Alice')]);
    await click(drawn.clip());

    expect(drawn.host.querySelector('.chip .cname')?.textContent).toBe('shot.png');
    expect(drawn.host.querySelector('.chip .csize')?.textContent).toBe('284 KB');

    drawn.type('what is wrong here?');
    await click(drawn.send());

    expect(drawn.sent).toEqual([[['alice'], 'what is wrong here?', ['att_1']]]);
    // One message, one lifetime: the picture leaves with the words.
    expect(drawn.host.querySelector('.chip')).toBeNull();
  });

  it('says why a file was refused, in the composer, before anything is typed', async () => {
    chosen = { error: 'huge.png is 9.0 MB and the limit is 4.0 MB.' };
    const drawn = draw([agent('alice', 'Alice')]);
    await click(drawn.clip());

    // At pickup and not at send: the difference between a rule and a trap.
    expect(drawn.host.querySelector('.stranded')?.textContent).toContain('the limit is 4.0 MB');
    expect(drawn.host.querySelector('.chip')).toBeNull();
  });

  it('refuses the whole fan-out when one recipient cannot take it', async () => {
    const drawn = draw(
      [agent('alice', 'Alice'), agent('bob', 'Bob', { images: false, textFiles: true })],
      { kind: 'team' },
    );
    drawn.type('@Alice @Bob look at this');
    await click(drawn.clip());

    // Never delivered to two of three: blobot does not narrow a set the user typed.
    expect(drawn.host.querySelector('.stranded')?.textContent).toContain(
      'Bob runs on a runtime that does not take images',
    );
    expect(drawn.host.querySelector('.chip')).toBeNull();
  });

  it('offers no paperclip to an agent whose runtime takes nothing', () => {
    const drawn = draw([agent('alice', 'Alice', { images: false, textFiles: false })]);
    expect(drawn.clip().disabled).toBe(true);
    expect(drawn.clip().title).toBe('This agent takes no attachments');
  });

  it('says what a fan-out will cost, per recipient', async () => {
    const drawn = draw([agent('alice', 'Alice'), agent('bob', 'Bob')], { kind: 'team' });
    drawn.type('@Alice @Bob look');
    await click(drawn.clip());

    // Stated, not managed. The multiplication is the user's to see and the user's to decide on.
    expect(drawn.host.querySelector('.cost')?.textContent).toBe('284 KB to each of 2');
  });
});
