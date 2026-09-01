/**
 * The one voice, and the synthesis behind it. `.scratch/sound/issues/03-one-voice.md`.
 *
 * **One voice for the whole app.** A second timbre would be a fourth channel inside a fourth
 * channel, which is the mistake `DESIGN.md`'s governing rule exists to prevent one channel over:
 * colour means identity, motion means status, and a channel with two meanings has none. Which
 * category a sound belongs to is already carried three times over — by what the user just did, by
 * where the sound falls relative to their own action, and by the pitch grammar in `vocabulary.ts`.
 * A person who cannot tell an `allow` from a `waiting` is not helped by a different oscillator.
 *
 * **Synthesized, never a file.** Velvet UI's *never identical twice*, and also the right answer
 * for this repo for three unglamorous reasons: no asset to ship, no licence to track, nothing to
 * load before the first sound can play. Every note is jittered, so the twentieth `send` of the day
 * is not mechanically identical to the first.
 *
 * This file knows nothing about blobot. It takes notes and makes sound.
 */

/** One note: frequency, its offset within the sequence, its gain, and a multiplier on the decay. */
export interface Note {
  /** Hertz. The pitch set lives in `vocabulary.ts`; this file never names one. */
  readonly f: number;
  /** Seconds from the start of the sequence. */
  readonly t: number;
  /** Peak gain, before the master level. */
  readonly g: number;
  /** Multiplier on the voice's decay, so one note can ring longer than its neighbour. */
  readonly d: number;
}

interface Partial {
  readonly ratio: number;
  readonly gain: number;
  readonly type: OscillatorType;
}

/**
 * `crisp`, chosen by ear against `signature` and `velvet` in `.scratch/sound/prototype.html`.
 *
 * A triangle at the fundamental with a sine third harmonic under it, a highpassed noise transient
 * at the attack, and 85ms of decay. Sharp, small, and over before the eye gets back to the status
 * column, which is the same sentence `DESIGN.md` uses to admit interaction motion.
 */
const VOICE = {
  partials: [
    { ratio: 1, gain: 1, type: 'triangle' },
    { ratio: 3, gain: 0.16, type: 'sine' },
  ] as readonly Partial[],
  attack: 0.0012,
  decay: 0.085,
  cutoff: 8200,
  q: 0.9,
  /** The noise transient, as a fraction of the note's gain. What makes `crisp` crisp. */
  click: 0.16,
} as const;

/** The default level. Not a user-facing slider: `issues/06` refuses one. */
export const LEVEL = 0.32;

/** ±`amount` around `value`, uniform. Velvet's *never identical twice*, cheaply. */
function jitter(value: number, amount: number): number {
  return value * (1 + (Math.random() - 0.5) * amount);
}

/** A fifth of a second of white noise, reused by every transient. Built once per context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Schedule one note into `destination`, `at` seconds from now.
 *
 * Everything is scheduled rather than played: a sequence is submitted in one synchronous pass and
 * the context keeps the timing, so a busy render frame cannot ragged the interval that carries
 * the meaning.
 */
export function playNote(
  ctx: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  note: Note,
  at: number,
): void {
  const start = ctx.currentTime + at + jitter(note.t, 0.1);
  const frequency = jitter(note.f, 0.012);
  const gain = Math.max(jitter(note.g, 0.16), 0.0005);
  const decay = VOICE.decay * note.d;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = VOICE.cutoff;
  filter.Q.value = VOICE.q;

  // Exponential, because gain is perceived that way and a linear ramp to zero clicks at the end.
  // It cannot reach zero, hence the floor rather than a `setValueAtTime(0)`.
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + VOICE.attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + VOICE.attack + decay);
  filter.connect(envelope);
  envelope.connect(destination);

  for (const partial of VOICE.partials) {
    const oscillator = ctx.createOscillator();
    oscillator.type = partial.type;
    oscillator.frequency.value = frequency * partial.ratio;
    const level = ctx.createGain();
    level.gain.value = partial.gain;
    oscillator.connect(level);
    level.connect(filter);
    oscillator.start(start);
    oscillator.stop(start + VOICE.attack + decay + 0.06);
  }

  const source = ctx.createBufferSource();
  source.buffer = noise;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 2400;
  const transient = ctx.createGain();
  transient.gain.setValueAtTime(gain * VOICE.click, start);
  transient.gain.exponentialRampToValueAtTime(0.0001, start + 0.02);
  source.connect(highpass);
  highpass.connect(transient);
  transient.connect(destination);
  source.start(start);
  source.stop(start + 0.03);
}
