/**
 * The React seam. `.scratch/sound/issues/09-the-seam.md`.
 *
 * One player for the app, because the debounce in `issues/08` is app-wide rather than per team and
 * a second instance would be a second window on that state.
 *
 * **The discipline that keeps call sites from sprawling** is `issues/01`'s test, and it is one
 * line: *did the person cause this sound in the last 200ms by an act they committed?* Yes and it
 * belongs at the act. No and it does not belong at a call site at all — `waiting` and `handoff` are
 * subscribed off channels that already carry every team, in `App.tsx`, because a component only
 * ever sees the open one and the whole point of that sound is the team you are not looking at.
 *
 * A hover handler cannot answer yes, and is therefore not a call site.
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import { SoundPlayer, type SoundSettings } from './player.js';
import type { SoundId } from './vocabulary.js';

const SoundContext = createContext<SoundPlayer | undefined>(undefined);

export function SoundProvider({
  silent,
  children,
}: {
  /** `--screenshot` in the hash. A hard mute above the switch. `issues/10`. */
  silent: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const player = useMemo(() => new SoundPlayer(silent), [silent]);
  return createElement(SoundContext.Provider, { value: player }, children);
}

/**
 * `play(id)` for a call site.
 *
 * Stable across renders, and a no-op outside a provider, so a component under test never needs one
 * and no test has to remember to mock audio.
 */
export function usePlaySound(): (id: SoundId) => void {
  const player = useContext(SoundContext);
  return useCallback(
    (id: SoundId) => {
      player?.play(id);
    },
    [player],
  );
}

/** The Settings screen's three switches, and nothing else. */
export function useSoundSettings(): {
  readonly settings: SoundSettings;
  readonly set: (next: SoundSettings) => void;
} {
  const player = useContext(SoundContext);
  const [settings, setSettings] = useState<SoundSettings>(
    () => player?.read() ?? { on: false, interaction: false, notifications: false },
  );
  const set = useCallback(
    (next: SoundSettings) => {
      player?.write(next);
      setSettings(next);
      // Confirm the change in the channel the change is about. Turning a group on plays its own
      // example, which is the only way to hear what a switch means without hunting for the act
      // that triggers it. Turning one off is silent, because silence is what was asked for.
      if (next.on && next.interaction && !settings.interaction) player?.play('allow');
      if (next.on && next.notifications && !settings.notifications) player?.play('waiting');
      if (next.on && !settings.on) player?.play('allow');
    },
    [player, settings],
  );
  return { settings, set };
}
