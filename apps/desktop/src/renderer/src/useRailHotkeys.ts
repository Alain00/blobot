import { useEffect, useRef, useState } from 'react';

/** How long ctrl has to be held on its own before the rail shows its numbers. */
export const HOLD_MS = 400;

/** Rows past this carry no number: every badge means the same thing, and nine is the top row's. */
export const HOTKEY_ROWS = 9;

/**
 * What would take the click if the user reached for the rail instead: a dialog, a scrim, a
 * screen over the working surface, an open menu. The key works exactly when the click would.
 */
const COVERS = '.scrim, .navscrim, .agentspage, .setpage, [role="dialog"], [role="menu"]';

/**
 * ctrl+1 to ctrl+9 (or cmd) open the rail's rows by position, and holding ctrl alone numbers them.
 *
 * A window listener for `App.tsx`'s ctrl+k reason: the composer holds focus almost all the time.
 * Matched on `event.code`, the physical key, because on AZERTY the top row types `é` and `è`
 * without shift, and ctrl or cmd are both taken everywhere, like ctrl+k.
 *
 * The badges wait for a **hold on its own**, so a copy or a paste never flashes nine of them down
 * the column, and they never animate: a keyboard path takes no motion. The order is **frozen at
 * the moment ctrl goes down**, because the rail sorts by recency and a row that jumps while the key
 * is held would change what the digit under the user's finger opens.
 *
 * Returns the frozen row keys while the numbers are showing, and `undefined` otherwise.
 */
export function useRailHotkeys({
  keys,
  enabled,
  onOpen,
}: {
  /** The rail's rows, in the order they are drawn. */
  keys: readonly string[];
  /** Off where a row press does nothing, which is demo mode. */
  enabled: boolean;
  onOpen: (key: string) => void;
}): readonly string[] | undefined {
  const [shown, setShown] = useState<readonly string[] | undefined>(undefined);
  // Read at keydown rather than bound into the listener, so the listener is attached once and
  // never misses a press to a re-render.
  const latest = useRef({ keys, enabled, onOpen });
  latest.current = { keys, enabled, onOpen };

  useEffect(() => {
    let frozen: readonly string[] | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cancel = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const reset = (): void => {
      cancel();
      frozen = undefined;
      setShown(undefined);
    };

    const onDown = (event: KeyboardEvent): void => {
      if (!latest.current.enabled) return;
      if (event.key === 'Control' || event.key === 'Meta') {
        if (event.repeat || frozen !== undefined) return;
        frozen = latest.current.keys.slice(0, HOTKEY_ROWS);
        if (event.shiftKey || event.altKey) return;
        const held = frozen;
        timer = setTimeout(() => {
          timer = undefined;
          if (!blocked()) setShown(held);
        }, HOLD_MS);
        return;
      }
      const digit = digitOf(event);
      if (digit !== undefined && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        // A digit before the numbers showed makes this a combo, so they do not appear after it.
        // Once they are up they stay, so ctrl held down can go to 3 and then to 1.
        cancel();
        if (blocked()) return;
        const key = (frozen ?? latest.current.keys)[digit - 1];
        if (key === undefined) return;
        event.preventDefault();
        latest.current.onOpen(key);
        return;
      }
      // Anything else was a combo: ctrl+c, ctrl+k, shift. The numbers go, and do not come back
      // until ctrl is let go and held again.
      cancel();
      setShown(undefined);
    };

    const onUp = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) reset();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    // A keyup that happens in another window never arrives here.
    window.addEventListener('blur', reset);
    return () => {
      cancel();
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', reset);
    };
  }, []);

  return shown;
}

function digitOf(event: KeyboardEvent): number | undefined {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  return match === null ? undefined : Number(match[1]);
}

/** The terminal keeps its keys, and a covered rail cannot be pressed. */
function blocked(): boolean {
  if (document.querySelector(COVERS) !== null) return true;
  return (document.activeElement?.closest('.xterm') ?? null) !== null;
}
