import { withRecordingCeiling, type SpeechHint, type Transcriber } from '@blobot/core';
import type { UiDictationStart } from '../shared/api.js';

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
}

interface Live {
  readonly teamId: string;
  readonly transcriber: Transcriber;
  /** The event loop; settled when the stream closes, by a stop or by a failure. */
  readonly done: Promise<void>;
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

  async start(teamId: string): Promise<UiDictationStart> {
    await this.stop();
    const made = this.#options.transcriberFor();
    if ('error' in made) return { ok: false, error: made.error };
    const transcriber = withRecordingCeiling(made);
    const done = (async () => {
      for await (const event of transcriber.events) this.#options.send('dictation:event', teamId, event);
    })();
    try {
      await transcriber.start(this.#options.hintFor(teamId));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const live: Live = { teamId, transcriber, done };
    this.#live = live;
    // A failure closes the stream from the far side; the slot is freed so the next press
    // starts clean rather than stopping a corpse first.
    void done.then(() => {
      if (this.#live === live) this.#live = undefined;
    });
    return { ok: true, partials: transcriber.partials, takes: transcriber.takes };
  }

  feed(pcm: Uint8Array): 'taken' | 'dropped' {
    return this.#live?.transcriber.feed(pcm) ?? 'dropped';
  }

  mark(): void {
    this.#live?.transcriber.mark();
  }

  async stop(): Promise<void> {
    const live = this.#live;
    if (live === undefined) return;
    this.#live = undefined;
    await live.transcriber.stop();
    await live.done;
  }
}
