/**
 * @vitest-environment jsdom
 *
 * What the player refuses, and why each refusal exists.
 *
 * The policy is separated from the audio on purpose: `admits` is pure, so every rule this effort
 * argued for is decidable with no output device, and the suite is silent for exactly the same
 * reason the app is robust on a machine that has none. `.scratch/sound/issues/10`.
 *
 * jsdom has no `AudioContext`, so `play` reaches the guard in `context()` and returns having made
 * nothing. That is the shipped path on a machine with no sound, not a test-only branch.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, NOTIFICATION_DEBOUNCE_MS, SoundPlayer, loadSettings } from './player.js';
import { DEFAULT_ARMED, NAVIGATIONAL, SOUNDS } from './vocabulary.js';

/**
 * jsdom under this runner exposes no `localStorage`, which is the same shape as a browser
 * refusing storage: the player survives it by construction, because every read and write is
 * guarded and the fallback is the default, which is on. A test that cannot store anything cannot
 * assert that something was stored, so it gets one that works.
 */
function storage(): void {
  const held = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string): string | null => held.get(key) ?? null,
      setItem: (key: string, value: string): void => void held.set(key, value),
      removeItem: (key: string): void => void held.delete(key),
      clear: (): void => held.clear(),
    },
  });
}

describe('what is armed', () => {
  beforeEach(() => storage());

  it('sounds on all three switches by default', () => {
    expect(DEFAULT_SETTINGS).toEqual({ on: true, interaction: true, notifications: true });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('leaves the patient waiting unarmed, because it is the alternative and not an addition', () => {
    expect(DEFAULT_ARMED.waiting).toBe(true);
    expect(DEFAULT_ARMED.waitingPatient).toBe(false);
    expect(new SoundPlayer().admits('waitingPatient')).toBe(false);
  });

  it('has no navigational sound to reach', () => {
    for (const id of NAVIGATIONAL) expect(id in SOUNDS).toBe(false);
  });
});

describe('the switches', () => {
  beforeEach(() => storage());

  it('admits a committed act and a notification when everything is on', () => {
    const player = new SoundPlayer();
    expect(player.admits('send')).toBe(true);
    expect(player.admits('waiting')).toBe(true);
  });

  it('takes both groups down with the master', () => {
    const player = new SoundPlayer();
    player.write({ on: false, interaction: true, notifications: true });
    expect(player.admits('send')).toBe(false);
    expect(player.admits('waiting')).toBe(false);
  });

  // The two groups are the whole of what the settings screen exposes, and they are independent:
  // somebody who wants to be told an agent is stuck and does not want a click is not an odd case.
  it('separates the two groups', () => {
    const player = new SoundPlayer();
    player.write({ on: true, interaction: false, notifications: true });
    expect(player.admits('send')).toBe(false);
    expect(player.admits('waiting')).toBe(true);

    player.write({ on: true, interaction: true, notifications: false });
    expect(player.admits('send')).toBe(true);
    expect(player.admits('waiting')).toBe(false);
  });

  it('remembers across a reload', () => {
    new SoundPlayer().write({ on: false, interaction: true, notifications: false });
    expect(loadSettings()).toEqual({ on: false, interaction: true, notifications: false });
    expect(new SoundPlayer().admits('send')).toBe(false);
  });
});

describe('the notification debounce', () => {
  beforeEach(() => storage());

  /**
   * `TeamPool` keeps three teams live, so three agents can enter `waiting` inside one second. The
   * count is deliberately not encoded: the rail already carries who and how many.
   */
  it('plays once for three teams arriving together', () => {
    let now = 1_000;
    const player = new SoundPlayer(false, () => now);
    expect(player.play('waiting')).toBe(true);
    expect(player.play('waiting')).toBe(false);
    expect(player.play('waiting')).toBe(false);
  });

  it('lets a genuinely separate event through', () => {
    let now = 1_000;
    const player = new SoundPlayer(false, () => now);
    expect(player.play('waiting')).toBe(true);
    now += NOTIFICATION_DEBOUNCE_MS - 1;
    expect(player.play('waiting')).toBe(false);
    now += 1;
    expect(player.play('waiting')).toBe(true);
  });

  it('shares the window across the whole group rather than per event', () => {
    let now = 1_000;
    const player = new SoundPlayer(false, () => now);
    expect(player.play('waiting')).toBe(true);
    expect(player.play('handoff')).toBe(false);
  });

  // A person can only commit acts so fast, and that bound is one the person holds. Two arriving
  // together do not clash: the pitch set is pentatonic for this reason.
  it('does not debounce a committed act', () => {
    let now = 1_000;
    const player = new SoundPlayer(false, () => now);
    expect(player.play('send')).toBe(true);
    expect(player.play('send')).toBe(true);
    expect(player.play('allow')).toBe(true);
  });

  it('does not spend the window on a refused notification', () => {
    let now = 1_000;
    const player = new SoundPlayer(false, () => now);
    player.write({ on: true, interaction: true, notifications: false });
    expect(player.play('waiting')).toBe(false);
    player.write({ on: true, interaction: true, notifications: true });
    expect(player.play('waiting')).toBe(true);
  });
});

describe('--screenshot', () => {
  beforeEach(() => storage());

  /** A switch somebody set on their own machine must not make an automated capture noisy. */
  it('is a hard mute the switch cannot override', () => {
    const player = new SoundPlayer(true);
    player.write({ on: true, interaction: true, notifications: true });
    expect(player.admits('send')).toBe(false);
    expect(player.admits('waiting')).toBe(false);
  });
});

describe('no output device', () => {
  beforeEach(() => storage());

  /**
   * jsdom has none, which is the same shape as a machine that has none. The decision still
   * happened, and nothing threw: sound is a bonus layer, never the message.
   */
  it('reports the decision and makes no sound', () => {
    expect('AudioContext' in window).toBe(false);
    expect(new SoundPlayer().play('send')).toBe(true);
  });
});
