/**
 * @vitest-environment jsdom
 *
 * How dictation lands in the composer (`.scratch/dictation/`, tickets 06 and 07).
 *
 * Three claims: with no dictation there is no microphone; a `committed` sentence is inserted at
 * the caret, spaced, and the caret follows it; a `partial` is a ghost in the mirror after the
 * caret and never in the field's value.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { UiAgent } from '../../../shared/api.js';
import { Composer, type DictationView } from './Composer.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

const AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w/a', accepts: { images: true, textFiles: true } },
];

function draw(dictation?: DictationView) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (view?: DictationView): void => {
    act(() => {
      root.render(
        React.createElement(Composer, {
          agents: AGENTS,
          commands: {},
          pane: { kind: 'agent', agentId: 'alice' },
          usage: {},
          onSend: () => undefined,
          ...(view === undefined ? {} : { dictation: view }),
        }),
      );
    });
  };
  render(dictation);
  const field = (): HTMLTextAreaElement => host.querySelector('textarea') as HTMLTextAreaElement;
  return {
    host,
    render,
    field,
    type: (text: string, caret = text.length) => {
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(field(), text);
        field().setSelectionRange(caret, caret);
        field().dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
  };
}

const listening = (extra: Partial<DictationView> = {}): DictationView => ({
  state: 'listening',
  level: () => 0,
  seconds: 5,
  onToggle: () => undefined,
  ...extra,
});

describe('the microphone', () => {
  it('is not drawn at all without dictation', () => {
    const drawn = draw();
    expect(drawn.host.querySelector('button.mic')).toBeNull();
    expect(drawn.host.querySelector('.wave')).toBeNull();
  });

  it('is a stop while listening, with the wave and the word', () => {
    const drawn = draw(listening());
    const mic = drawn.host.querySelector('button.mic') as HTMLButtonElement;
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(drawn.host.querySelector('.wave')).not.toBeNull();
    expect(drawn.host.querySelector('.stranded.speech')?.textContent).toBe('listening · 0:05');
  });

  it('says paused when audio is being dropped, and why it stopped once it has', () => {
    const drawn = draw(listening({ paused: true }));
    expect(drawn.host.querySelector('.stranded.speech')?.textContent).toBe('listening · 0:05 · paused');
    drawn.render({ state: 'ready', level: () => 0, seconds: 0, note: 'stopped · 5 min', onToggle: () => undefined });
    expect(drawn.host.querySelector('.stranded.speech')?.textContent).toBe('stopped · 5 min');
    expect(drawn.host.querySelector('.wave')).toBeNull();
  });
});

describe('committed text', () => {
  it('is inserted at the caret, spaced, with the caret after it', () => {
    const drawn = draw(listening());
    drawn.type('Hola mundo', 4);
    drawn.render(listening({ committed: { text: '@Alice', at: 1 } }));
    expect(drawn.field().value).toBe('Hola @Alice mundo');
    expect(drawn.field().selectionStart).toBe(11);
    // A second sentence at the end continues the line.
    drawn.type('Hola @Alice mundo');
    drawn.render(listening({ committed: { text: 'revisa el session/new', at: 2 } }));
    expect(drawn.field().value).toBe('Hola @Alice mundo revisa el session/new');
  });

  it('fills an empty field without a leading space', () => {
    const drawn = draw(listening());
    drawn.render(listening({ committed: { text: 'Hola', at: 1 } }));
    expect(drawn.field().value).toBe('Hola');
    // The same moment again is not a second sentence.
    drawn.render(listening({ committed: { text: 'Hola', at: 1 } }));
    expect(drawn.field().value).toBe('Hola');
  });
});

describe('the partial', () => {
  it('is a ghost in the mirror after the caret and never in the field', () => {
    const drawn = draw(listening({ partial: 'adapter de Cursor' }));
    expect(drawn.field().value).toBe('');
    expect(drawn.host.querySelector('.hl .ghost')?.textContent).toBe('adapter de Cursor');
    drawn.type('Hola mundo', 4);
    drawn.render(listening({ partial: 'querido' }));
    expect(drawn.field().value).toBe('Hola mundo');
    const mirror = drawn.host.querySelector('.hl') as HTMLElement;
    expect(mirror.textContent?.replace('​', '')).toBe('Hola querido mundo');
    expect(mirror.querySelector('.ghost')?.textContent).toBe(' querido');
  });

  it('goes after a mention rather than through it', () => {
    const drawn = draw(listening({ partial: 'hola' }));
    drawn.type('@Alice mira', 3);
    drawn.render(listening({ partial: 'hola' }));
    const mirror = drawn.host.querySelector('.hl') as HTMLElement;
    expect(mirror.textContent?.replace('​', '')).toBe('@Alice hola mira');
  });

  it('is gone when its committed form lands', () => {
    const drawn = draw(listening({ partial: 'hol' }));
    drawn.render(listening({ committed: { text: 'Hola', at: 1 } }));
    expect(drawn.host.querySelector('.hl .ghost')).toBeNull();
    expect(drawn.field().value).toBe('Hola');
  });
});
