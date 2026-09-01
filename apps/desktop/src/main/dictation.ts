import { PCM_BYTES_PER_SECOND, withRecordingCeiling, type SpeechHint, type Transcriber } from '@blobot/core';
import { SPEECH_TRYOUT_PLACE, type UiDictationStart } from '../shared/api.js';

/**
 * The one recording, in main.
 *
 * Audio crosses IPC once, renderer → main, and the Transcriber lives here (ticket 11): the
 * renderer opens the microphone and cuts segments, this owns the engine or the socket. One
 * recording at a time — a second `start` stops the first — and its events go back on
 * `dictation:event`, leading with the team id the recording was started for, so a team
 * switched away from mid-sentence cannot draw its words into another team's composer.
 */
export interface DictationHostOptions {
  readonly send: (channel: string, ...args: unknown[]) => void;
  /** The configured Transcriber, or why there is none. Main decides; the renderer never asks which. */
  readonly transcriberFor: () => Transcriber | { readonly error: string };
  /** The vocabulary hint for this team, composed from what the store already holds. */
  readonly hintFor: (teamId: string) => SpeechHint;
  /**
   * Ticket 08's measured stage: the first committed segment of a *say something* recording,
   * timed from its mark to its text, as a real-time factor. Told once per such recording.
   */
  readonly onMeasured?: (measurement: { readonly text: string; readonly rtf: number }) => void;
  readonly now?: () => number;
}

/** The team id a *say something* recording is started on: a place, not a team. */
export const TRYOUT_TEAM = SPEECH_TRYOUT_PLACE;

interface Live {
  readonly teamId: string;
  readonly transcriber: Transcriber;
  /** The event loop; settled when the stream closes, by a stop or by a failure. */
  readonly done: Promise<void>;
  /** Timing for the measured stage, kept only on a tryout. */
  measure?: { segmentBytes: number; markedAt?: number; segmentMs?: number; reported: boolean };
}

export class DictationHost {
  readonly #options: DictationHostOptions;
  #live: Live | undefined;

  constructor(options: DictationHostOptions) {
    this.#options = options;
  }

  get listening(): boolean {
    return this.#live !== undefined;
  }

  async start(teamId: string, transcriber?: Transcriber): Promise<UiDictationStart> {
    await this.stop();
    const made = transcriber ?? this.#options.transcriberFor();
    if ('error' in made) return { ok: false, error: made.error };
    const bounded = withRecordingCeiling(made);
    const now = this.#options.now ?? (() => Date.now());
    const live: Live = {
      teamId,
      transcriber: bounded,
      done: Promise.resolve(),
      ...(teamId === TRYOUT_TEAM ? { measure: { segmentBytes: 0, reported: false } } : {}),
    };
    const done = (async () => {
      for await (const event of bounded.events) {
        this.#options.send('dictation:event', teamId, event);
        // The first sentence of a tryout, timed: audio in the segment against the wait for its
        // text. Only the first, because the engine's warm-up is inside it and that is the run
        // a person is watching.
        const measure = live.measure;
        if (
          event.type === 'committed' &&
          measure !== undefined &&
          !measure.reported &&
          measure.markedAt !== undefined &&
          measure.segmentMs !== undefined &&
          measure.segmentMs > 0
        ) {
          measure.reported = true;
          this.#options.onMeasured?.({ text: event.text, rtf: (now() - measure.markedAt) / measure.segmentMs });
        }
      }
    })();
    (live as { done: Promise<void> }).done = done;
    try {
      await bounded.start(teamId === TRYOUT_TEAM ? { terms: [] } : this.#options.hintFor(teamId));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    this.#live = live;
    // A failure closes the stream from the far side; the slot is freed so the next press
    // starts clean rather than stopping a corpse first.
    void done.then(() => {
      if (this.#live === live) this.#live = undefined;
    });
    return { ok: true, partials: bounded.partials, takes: bounded.takes };
  }

  feed(pcm: Uint8Array): 'taken' | 'dropped' {
    const live = this.#live;
    if (live === undefined) return 'dropped';
    const answer = live.transcriber.feed(pcm);
    if (live.measure !== undefined && answer === 'taken' && live.measure.markedAt === undefined) {
      live.measure.segmentBytes += pcm.byteLength;
    }
    return answer;
  }

  mark(): void {
    const live = this.#live;
    if (live === undefined) return;
    live.transcriber.mark();
    const measure = live.measure;
    if (measure !== undefined && measure.markedAt === undefined && measure.segmentBytes > 0) {
      measure.markedAt = (this.#options.now ?? (() => Date.now()))();
      measure.segmentMs = (measure.segmentBytes / PCM_BYTES_PER_SECOND) * 1000;
    }
  }

  async stop(): Promise<void> {
    const live = this.#live;
    if (live === undefined) return;
    this.#live = undefined;
    await live.transcriber.stop();
    await live.done;
  }
}
