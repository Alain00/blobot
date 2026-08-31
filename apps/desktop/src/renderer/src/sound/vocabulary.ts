/**
 * The twelve events, as data. `.scratch/sound/issues/02-the-vocabulary.md`.
 *
 * **No runtime id appears in this file and none may.** A `send` sounds the same whether the agent
 * behind it is Claude, Codex, OpenCode or fx, and the three permission sounds are identical across
 * all four despite the four postures behind them being genuinely different. Sound is an easy place
 * to break the provider-agnostic rule by accident: an fx-only diagnostic or a Codex-only permission
 * shape is a tempting thing to sound differently. It is refused in the same sentence that refuses
 * per-agent voices.
 *
 * One pitch set, pentatonic, so two sounds landing in the same moment never produce a dissonance.
 * That matters because this app has fan-out: several things genuinely can happen at once, and a
 * set that only sounds correct in isolation is a set that sounds broken exactly when the app is
 * busiest.
 *
 * Three grammatical rules, and they are what make twelve sounds one system rather than twelve
 * things to memorise:
 *
 * 1. **Yes and no are one interval, not two sounds.** `allow` rises a fifth, `reject` falls the
 *    same fifth. A user who learns either has learned both, and a falling fifth is *informative
 *    rather than punitive* without needing a buzz to say so.
 * 2. **A repeated note at a whisper means a standing rule was written.** `arm` and `allowAlways`
 *    both earn the suffix; `disarm` is `arm` reversed with the echo removed, because the echo was
 *    the part that meant it recurs. `allowed` and `allowed_always` are separate values in
 *    `PermissionOutcome` precisely because they are not the same record of what happened.
 * 3. **Consequence goes down and takes longer.** `purge` is the only unrecoverable act in the app
 *    and the only place the range goes below everything else.
 */
import type { Note } from './voice.js';

/** The pitch set. Pentatonic, and the only place a frequency is named. */
const D3 = 146.83;
const D4 = 293.66;
const F4 = 349.23;
const G4 = 392;
const A4 = 440;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;

/**
 * Which budget a sound answers to. `.scratch/sound/issues/01-two-budgets.md`.
 *
 * One test decides it: **did the person cause this sound in the last 200ms by an act they
 * committed?** Yes and it is `interaction`, which cannot interrupt by definition. No and it is
 * `notification`, which can, and which is why `DESIGN.md` needed amending for it alone.
 *
 * `navigational` is built and unreachable. See `NAVIGATIONAL` below.
 */
export type SoundGroup = 'interaction' | 'notification' | 'navigational';

export interface SoundEvent {
  readonly group: SoundGroup;
  readonly seq: readonly Note[];
}

export const SOUNDS = {
  /**
   * The most frequent committed act, so the shortest and quietest thing in the set. It survives
   * despite the frequency because it is the one committed act whose completion nothing else
   * reports once the eye has moved: the composer clears, but you are already reading the
   * transcript.
   */
  send: { group: 'interaction', seq: [{ f: D5, t: 0, g: 0.3, d: 0.75 }] },

  /** Up a fifth. The interval carries the direction; the words on screen carry the rest. */
  allow: {
    group: 'interaction',
    seq: [
      { f: A4, t: 0, g: 0.34, d: 0.9 },
      { f: E5, t: 0.085, g: 0.32, d: 1.1 },
    ],
  },

  /** `allow`, plus rule 2's whisper: this one wrote a rule into the agent's own settings file. */
  allowAlways: {
    group: 'interaction',
    seq: [
      { f: A4, t: 0, g: 0.34, d: 0.9 },
      { f: E5, t: 0.085, g: 0.32, d: 1.1 },
      { f: E5, t: 0.34, g: 0.1, d: 1.4 },
    ],
  },

  /** The same fifth, mirrored. No buzz and no dissonance: never punitive. */
  reject: {
    group: 'interaction',
    seq: [
      { f: E5, t: 0, g: 0.32, d: 0.9 },
      { f: A4, t: 0.085, g: 0.34, d: 1.2 },
    ],
  },

  /** The echo is the schedule: a thing that will happen more than once. */
  arm: {
    group: 'interaction',
    seq: [
      { f: G4, t: 0, g: 0.32, d: 0.9 },
      { f: C5, t: 0.09, g: 0.3, d: 1.0 },
      { f: G4, t: 0.34, g: 0.09, d: 1.4 },
    ],
  },

  /** `arm` reversed, echo removed. Removing it is the statement. */
  disarm: {
    group: 'interaction',
    seq: [
      { f: C5, t: 0, g: 0.3, d: 0.9 },
      { f: G4, t: 0.09, g: 0.3, d: 1.1 },
    ],
  },

  /** Falling, with a longer tail. The transcript survives, so this is not the bottom of anything. */
  remove: {
    group: 'interaction',
    seq: [
      { f: A4, t: 0, g: 0.3, d: 1.0 },
      { f: F4, t: 0.1, g: 0.3, d: 1.2 },
      { f: D4, t: 0.2, g: 0.3, d: 2.0 },
    ],
  },

  /** `remove` with a floor under it. The one unrecoverable act, matched to a dialog that prices it. */
  purge: {
    group: 'interaction',
    seq: [
      { f: A4, t: 0, g: 0.3, d: 1.0 },
      { f: F4, t: 0.1, g: 0.3, d: 1.2 },
      { f: D4, t: 0.2, g: 0.3, d: 2.0 },
      { f: D3, t: 0.24, g: 0.22, d: 3.4 },
    ],
  },

  /**
   * The one notification that ships, and the reason `DESIGN.md` was amended at all.
   *
   * A step and never a leap, because the point is to be noticed rather than announced. It is the
   * one state where silence itself loses work: with nobody listening a permission request is
   * **cancelled, never allowed**.
   */
  waiting: {
    group: 'notification',
    seq: [
      { f: C5, t: 0, g: 0.26, d: 1.0 },
      { f: D5, t: 0.16, g: 0.24, d: 1.3 },
    ],
  },

  /**
   * The alternative to `waiting`, **never an addition**, and unarmed by default.
   *
   * `crisp` at a low level is 85ms of bright and easy to miss from across a room. The reflex fix is
   * volume, and it is refused: a notification that is the loudest thing in the app breaks *quiet by
   * design*. The fix is **duration** — the same two notes, wider, then the pair again a second
   * later at half. Noticeable across a room and still quiet next to a keyboard, which is the
   * property wanted and the one volume cannot give.
   */
  waitingPatient: {
    group: 'notification',
    seq: [
      { f: C5, t: 0, g: 0.24, d: 1.4 },
      { f: D5, t: 0.22, g: 0.22, d: 1.8 },
      { f: C5, t: 1.05, g: 0.12, d: 1.4 },
      { f: D5, t: 1.27, g: 0.11, d: 1.8 },
    ],
  },

  /**
   * A compaction handoff. The quietest thing in the set, because it reports rather than requests.
   *
   * The weakest member, and `issues/02` says so on its own comments: a notification that asks
   * nothing of the user is the hardest kind to justify. If one sound comes back out, it is this one.
   */
  handoff: {
    group: 'notification',
    seq: [
      { f: D5, t: 0, g: 0.16, d: 1.1 },
      { f: G4, t: 0.13, g: 0.15, d: 1.5 },
    ],
  },
} as const satisfies Record<string, SoundEvent>;

export type SoundId = keyof typeof SOUNDS;

/**
 * Built, off, and reachable from no switch the app exposes. `hover`, `key` and `popover` live in
 * `.scratch/sound/prototype.html` so the argument against them can be **heard** rather than
 * asserted: the same twenty five second session is 8 sounds with them off and about 65 with them
 * on.
 *
 * The precedent is not taste. `DESIGN.md` refuses the composer's `@mention` list its open
 * animation on frequency alone, and that list opens silently. Frequency is a harsher disqualifier
 * for a sound than for a motion, because a sound cannot be looked away from.
 *
 * Exposing any of these is a reopen of `issues/02`, not a settings change.
 */
export const NAVIGATIONAL: readonly string[] = ['hover', 'key', 'popover'];

/** Armed by default, once sound is on at all. `issues/04`. */
export const DEFAULT_ARMED: Readonly<Record<SoundId, boolean>> = {
  send: true,
  allow: true,
  allowAlways: true,
  reject: true,
  arm: true,
  disarm: true,
  remove: true,
  purge: true,
  waiting: true,
  // The alternative to `waiting`, never an addition.
  waitingPatient: false,
  handoff: true,
};
