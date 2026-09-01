/**
 * Dictation's vocabulary: what turns speech into text, and what it says while it does.
 *
 * Pure on purpose, and exported from `@blobot/core/domain`: the renderer draws these events
 * and the composer is provider-agnostic in exactly the way it is for runtimes. Nothing here
 * knows which engine or which service is behind it, and nothing here touches audio — core
 * knows the audio *format* as a constant and processes none of it (`.scratch/dictation/`,
 * ticket 11).
 */

/**
 * What every Transcriber is fed: 16 kHz, one channel, signed 16-bit little-endian, in chunks
 * of about 100 ms. The renderer's `AudioContext({sampleRate: 16000})` makes Chromium resample
 * the microphone for free (ticket 04), so this is the one format on both sides of the IPC
 * boundary and no resampler exists anywhere in blobot.
 */
export const PCM_16K_MONO_INT16 = {
  sampleRate: 16_000,
  channels: 1,
  bytesPerSample: 2,
  /** How long one chunk is. The renderer cuts them; main and the engines count on it. */
  chunkMs: 100,
} as const;

/** Bytes in one second of audio in that format. */
export const PCM_BYTES_PER_SECOND =
  PCM_16K_MONO_INT16.sampleRate * PCM_16K_MONO_INT16.channels * PCM_16K_MONO_INT16.bytesPerSample;

/** Which Transcriber is behind a recording. Known to main and to Settings, never to the composer. */
export type TranscriberId = 'whisper' | 'openai' | 'deepgram' | 'mistral' | 'mock';

/**
 * The vocabulary hint, composed per recording (ticket 06) and handed to `start`. Terms only:
 * each engine spells it its own way (`--prompt`, `keywords[]`, `keyterm`), and that spelling is
 * the implementation's, not the caller's.
 */
export interface SpeechHint {
  readonly terms: readonly string[];
}

/**
 * What a Transcriber says. Four events, and the microphone level is deliberately not one of
 * them: it belongs to the renderer, which measures it, and never crosses IPC.
 *
 * - `partial` may be revised; `committed` will not be. Each Transcriber emits what it honestly
 *   can — a local engine only `committed`, per segment; a streaming provider both.
 * - `ended` is what was asked for, `failed` is what happened, and they stay apart. Committed
 *   text stays in the field on a failure; the next press starts clean.
 */
export type TranscriberEvent =
  | { readonly type: 'partial'; readonly text: string }
  | { readonly type: 'committed'; readonly text: string }
  | { readonly type: 'ended'; readonly reason: 'user' | 'ceiling' }
  | { readonly type: 'failed'; readonly cause: TranscriberFailure };

/**
 * Why a recording failed, named by cause and never by provider. `no_credit` is fx's lesson:
 * a signed-in account with nothing left on it is a fifth state that detection cannot see and
 * only a turn can find.
 */
export type TranscriberFailure = 'no_model' | 'engine_exited' | 'key_rejected' | 'network' | 'no_credit';

/**
 * One interface for both classes — a local engine fed whole segments, and a remote service fed
 * the stream. Two interfaces were refused because the composer would then know which one it
 * has, which is the rule the UI keeps with runtimes.
 */
export interface Transcriber {
  readonly id: TranscriberId;
  /** Whether `partial` is ever emitted, so the composer can draw a ghost or not expect one. */
  readonly partials: boolean;
  /**
   * What the renderer should send. `segments`: whole utterances between marks, silence never
   * sent, because the engine runs once per segment. `stream`: every chunk as it comes, silence
   * included, because the far end does its own endpointing and needs to hear the pause.
   *
   * A capability and not an identity, the way `partials` is: it says what to feed, not who is
   * eating. Ticket 06 assigned the two feeding policies and ticket 11's interface had nowhere
   * to say which one applies; this is that word.
   */
  readonly takes: 'segments' | 'stream';
  start(hint: SpeechHint): Promise<void>;
  /**
   * One chunk of `PCM_16K_MONO_INT16`. `dropped` is backpressure — ticket 04's rule that a
   * writer behind a stalled engine drops rather than queues, because a transcriber two seconds
   * behind a speaker is not going to catch up and a burst a minute later is worse than a gap.
   */
  feed(pcm: Uint8Array): 'taken' | 'dropped';
  /** A segment boundary, from the renderer's own silence detection. */
  mark(): void;
  /** Flush what is held, close what is open. `ended` follows on `events`. */
  stop(): Promise<void>;
  readonly events: AsyncIterable<TranscriberEvent>;
}

/**
 * The sentence the composer draws for a failure. Here rather than in the renderer because
 * Settings says the same thing about the same causes, and two surfaces describing one failure
 * in two ways is how a user learns to distrust both.
 */
export function describeTranscriberFailure(cause: TranscriberFailure): string {
  switch (cause) {
    case 'no_model':
      return 'stopped · no speech model is installed';
    case 'engine_exited':
      return 'stopped · the speech engine exited';
    case 'key_rejected':
      return 'stopped · the provider rejected the key';
    case 'network':
      return 'stopped · lost the connection to the provider';
    case 'no_credit':
      return 'stopped · the provider account has no credit';
  }
}
