/**
 * `SoundPlayer`: the one place a sound is refused. `.scratch/sound/issues/09-the-seam.md`.
 *
 * Holds the lazily created `AudioContext`, the switches and their persistence, and ticket 08's
 * debounce. Everything that decides *whether* a sound happens is here; `voice.ts` decides what it
 * sounds like and `vocabulary.ts` decides what there is.
 *
 * **Failure is silent.** No output device, a refused context, a platform that says no: the call
 * returns and nothing is reported. Sound is *a bonus layer, never the message*, so nothing in the
 * app may depend on one having been heard — which is also why `issues/07` makes it a standing
 * constraint that no sound is the only carrier of its fact.
 */
import { LEVEL, noiseBuffer, playNote } from './voice.js';
import { DEFAULT_ARMED, SOUNDS, type SoundId } from './vocabulary.js';

/**
 * The three switches that ship. `issues/04`, `issues/06`.
 *
 * Thirteen switches persist under this and three are exposed, on the `bounds.ts` principle: blobot
 * states its own ceilings in words a person can hold, and *interaction* and *notifications* are two
 * words somebody can decide between. Thirteen is a list nobody reads.
 */
export interface SoundSettings {
  /** The master. */
  readonly on: boolean;
  /** The eight committed acts. */
  readonly interaction: boolean;
  /** `waiting`, and `handoff`. */
  readonly notifications: boolean;
}

/**
 * All three default on.
 *
 * Notifications defaulting on was argued and is deliberate. The one notification that ships reports
 * the one state where **silence itself loses work**: an agent stopped on a permission request, on a
 * team you are not looking at, whose request with nobody listening is cancelled, never allowed. A
 * default of off makes the failure this sound exists to prevent the default experience, and the
 * user only finds the fix after paying for it once.
 */
export const DEFAULT_SETTINGS: SoundSettings = { on: true, interaction: true, notifications: true };

const KEY = 'blobot.sound';

/**
 * At most one notification in any two second window, **app-wide and not per team**.
 *
 * `TeamPool` keeps three teams live, so three agents can enter `waiting` inside the same second.
 * The count is not encoded: three teams waiting does not play three times, or louder, or longer.
 * The sound means *somebody needs you* and the rail already carries who and how many, inverted, on
 * the row. Two seconds because it is longer than the longest sound in the set plus its tail, so no
 * two notifications overlap, and short enough that two genuinely separate events a few seconds
 * apart are still two events.
 */
export const NOTIFICATION_DEBOUNCE_MS = 2_000;

export function loadSettings(): SoundSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const stored = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      on: stored.on ?? DEFAULT_SETTINGS.on,
      interaction: stored.interaction ?? DEFAULT_SETTINGS.interaction,
      notifications: stored.notifications ?? DEFAULT_SETTINGS.notifications,
    };
    // A private window, cleared site data, a browser refusing storage: come back at the default,
    // which is on, and one click fixes it. Never an error the user sees.
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: SoundSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Preference, not domain state. Losing it is survivable by construction.
  }
}

export class SoundPlayer {
  private settings: SoundSettings;
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private lastNotification = Number.NEGATIVE_INFINITY;
  /** Which events are armed once their group is on. Not user-facing; see `issues/04`. */
  private readonly armed: Readonly<Record<SoundId, boolean>> = DEFAULT_ARMED;

  /**
   * @param silent A hard mute the switch cannot override. `--screenshot` sets it: a switch the user
   *   set on their own machine should not make an automated capture noisy. `issues/10`.
   * @param now Injected so the debounce is testable without waiting two seconds.
   */
  constructor(
    private readonly silent: boolean = false,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.settings = loadSettings();
  }

  read(): SoundSettings {
    return this.settings;
  }

  write(settings: SoundSettings): void {
    this.settings = settings;
    saveSettings(settings);
  }

  /**
   * Would this sound be admitted right now? Pure, and the whole of the policy.
   *
   * Separate from `play` so the refusals are testable without an audio device, which is what
   * `issues/10` means by the suite being silent for the same reason the app is robust.
   */
  admits(id: SoundId): boolean {
    if (this.silent || !this.settings.on) return false;
    if (!this.armed[id]) return false;
    const group = SOUNDS[id].group;
    if (group === 'interaction') return this.settings.interaction;
    if (!this.settings.notifications) return false;
    return this.now() - this.lastNotification >= NOTIFICATION_DEBOUNCE_MS;
  }

  /** Play it, if it is admitted. Returns whether it was, so callers can be tested. */
  play(id: SoundId): boolean {
    if (!this.admits(id)) return false;
    if (SOUNDS[id].group === 'notification') this.lastNotification = this.now();

    const ctx = this.context();
    if (ctx === undefined || this.master === undefined || this.noise === undefined) return true;
    try {
      for (const note of SOUNDS[id].seq) playNote(ctx, this.master, this.noise, note, 0);
    } catch {
      // An output device that vanished mid-session. The decision stands; the sound does not.
    }
    return true;
  }

  /**
   * The context, built on the first admitted sound and never at module load.
   *
   * Both obligations from `issues/07` live here. A context constructed before a user gesture is a
   * `suspended` object that plays nothing and reports success, and nothing in this app is allowed
   * to be a silent no-op. And jsdom has no `AudioContext` at all, which is why the suite is quiet
   * with no test-only branch.
   */
  private context(): AudioContext | undefined {
    if (this.ctx !== undefined) {
      // Autoplay policy can suspend it again after a period with no gesture.
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return this.ctx;
    }
    const Ctor = (
      window as unknown as { AudioContext?: new () => AudioContext }
    ).AudioContext;
    if (Ctor === undefined) return undefined;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = LEVEL;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.noise = noiseBuffer(ctx);
      return ctx;
    } catch {
      return undefined;
    }
  }
}
