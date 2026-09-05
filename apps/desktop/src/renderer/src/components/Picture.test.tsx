/**
 * @vitest-environment jsdom
 *
 * What a Picture says, which after the author's two amendments is very little.
 *
 * The claims worth holding are the ones a screenshot would not catch: that an **observed**
 * Picture carries no line at all, because blobot measures nothing about one and the tool's own
 * name was already on screen in the fold above it; that a **shown** one carries the single fact
 * only it can answer; that Escape closes the full-size view, which is on the document rather
 * than on the overlay and so is exactly the wiring a manual check would miss; and that a run of
 * refusals counts rather than repeating.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../model.js';
import { Picture } from './Picture.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PictureItem = Extract<Item, { kind: 'picture' }>;

const shot = (over: Partial<PictureItem> = {}): PictureItem => ({
  kind: 'picture',
  id: 'p1',
  at: 1,
  agentId: 'bob',
  source: 'observed',
  pictureId: 'pic_1',
  ...over,
});

/** The other outcome: nothing was kept, so there is no id and there never was one. */
const refused = (over: Partial<PictureItem> = {}): PictureItem => {
  const { pictureId: _dropped, ...rest } = shot(over);
  return rest as PictureItem;
};

const drawn: { unmount: () => void; host: HTMLElement }[] = [];
afterEach(() => {
  for (const one of drawn.splice(0)) {
    act(() => one.unmount());
    one.host.remove();
  }
});

beforeEach(() => {
  (window as unknown as { blobot: unknown }).blobot = {
    pictureUrl: vi.fn().mockResolvedValue('data:image/png;base64,AA=='),
  };
});

/** Renders and lets the one fetch settle, which is how the picture gets a `src` at all. */
async function draw(item: PictureItem, fromName?: string): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<Picture item={item} fromName={fromName} />);
    await Promise.resolve();
  });
  drawn.push({ unmount: () => root.unmount(), host });
  return host;
}

describe('a picture in the transcript', () => {
  it('says nothing at all about an observed one', async () => {
    const host = await draw(shot());
    expect(host.querySelector('img')).not.toBeNull();
    expect(host.querySelector('.pline')).toBeNull();
  });

  it('says of a shown one the one thing only a shown one can answer', async () => {
    const host = await draw(shot({ source: 'shown', name: 'login-page.png', writtenThisTurn: true }));
    expect(host.querySelector('.pline')?.textContent).toBe(
      'login-page.png · written during this turn',
    );
  });

  it('opens at full size on a click, and closes on Escape', async () => {
    const host = await draw(shot());
    await act(async () => {
      host.querySelector('img')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('.pfull')).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(host.querySelector('.pfull')).toBeNull();
  });

  it('counts a run of refusals rather than repeating it, and never apologises', async () => {
    const host = await draw(refused({ notDrawn: 'unreadable', count: 4 }), 'bob');
    expect(host.querySelector('.pnone')?.textContent).toBe(
      '4 pictures from bob · not drawn · its bytes did not arrive whole',
    );
  });
});
