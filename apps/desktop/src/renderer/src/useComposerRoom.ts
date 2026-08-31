import { useCallback, useRef } from 'react';

/** How near the bottom still counts as reading the newest message, as in the pane's own fold. */
const PINNED = 40;

/**
 * The room the floating composer takes out of the transcript, measured rather than guessed.
 *
 * The composer sits over the transcript now, not under it, so what is being written blurs
 * whatever it covers instead of shortening the pane. Nothing about that is free: a floating bar
 * hides the last message, which is the one the reader came for. So the pane keeps a
 * `--composerroom` of bottom padding exactly as tall as the composer is, and the transcript's
 * bottom ends above the pill rather than behind it. Padding and not a spacer, because it is the
 * scroll container's own height that stick-to-bottom scrolls to.
 *
 * It has to be measured: the composer's height is not a constant. The field grows to six lines,
 * attachments add a row, the workspace tray adds another, a refusal adds a sentence. A hardcoded
 * number would be wrong in four ways at once.
 *
 * And a reader who is at the bottom stays there while the composer grows under their hands.
 * Without that follow-up scroll, typing a third line slides the last message behind the pill —
 * the exact failure the padding exists to prevent.
 *
 * The two nodes are found under the pane rather than passed in, so neither the transcript nor
 * the composer has to know that the other one floats. A callback ref rather than an effect,
 * because the pane mounts after several early returns and an effect with no node has nothing
 * to observe.
 */
export function useComposerRoom(): (node: HTMLDivElement | null) => void {
  const observer = useRef<ResizeObserver | undefined>(undefined);

  return useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = undefined;
    if (node === null || typeof ResizeObserver === 'undefined') return;

    const composer = node.querySelector<HTMLElement>(':scope > .composer');
    const stream = node.querySelector<HTMLElement>(':scope > .stream');
    if (composer === null || stream === null) return;

    observer.current = new ResizeObserver(() => {
      const pinned = stream.scrollHeight - stream.scrollTop - stream.clientHeight < PINNED;
      node.style.setProperty('--composerroom', `${Math.round(composer.offsetHeight)}px`);
      if (pinned) stream.scrollTop = stream.scrollHeight;
    });
    observer.current.observe(composer);
  }, []);
}
