import {
  DICTATION_CUT_LOOKBACK_MS,
  DICTATION_PREROLL_MS,
  DICTATION_SEGMENT_MAX_MS,
  DICTATION_SEGMENT_MIN_MS,
  DICTATION_SILENCE_MS,
  DICTATION_SILENCE_RMS,
  PCM_16K_MONO_INT16,
} from '@blobot/core/domain';

/**
 * Who cuts a segment: the renderer, from the level it already measures (ticket 06).
 *
 * A local engine runs once per segment and hallucinates on silence, so it is fed whole
 * utterances with the silence in front of them cut away; a streaming provider does its own
 * endpointing and needs to hear the pause, so it is fed everything and told where blobot
 * thinks the boundaries are. Both policies are here, chosen by what the Transcriber `takes`,
 * and neither knows which Transcriber that is.
 *
 * Pure: chunks and energies in, feed-and-mark actions out. Every number comes from
 * `bounds.ts`, where each is named provisional.
 */
export type SegmentAction =
  | { readonly kind: 'feed'; readonly chunk: Uint8Array }
  | { readonly kind: 'mark' };

export interface SegmenterOptions {
  readonly takes: 'segments' | 'stream';
  readonly chunkMs?: number;
  readonly silenceMs?: number;
  readonly minMs?: number;
  readonly maxMs?: number;
  readonly threshold?: number;
  readonly lookbackMs?: number;
  readonly prerollMs?: number;
}

interface Held {
  readonly chunk: Uint8Array;
  readonly energy: number;
}

export class Segmenter {
  readonly #takes: 'segments' | 'stream';
  readonly #chunkMs: number;
  readonly #silenceMs: number;
  readonly #minMs: number;
  readonly #maxMs: number;
  readonly #threshold: number;
  readonly #lookbackMs: number;
  readonly #prerollChunks: number;
  #open = false;
  #openMs = 0;
  #silentMs = 0;
  /** Silence kept ahead of a segment so its first word is not clipped. Segments mode only. */
  #preroll: Uint8Array[] = [];
  /** The tail of a segment near the ceiling, held so the cut can fall on its quietest moment. */
  #pending: Held[] = [];

  constructor(options: SegmenterOptions) {
    this.#takes = options.takes;
    this.#chunkMs = options.chunkMs ?? PCM_16K_MONO_INT16.chunkMs;
    this.#silenceMs = options.silenceMs ?? DICTATION_SILENCE_MS;
    this.#minMs = options.minMs ?? DICTATION_SEGMENT_MIN_MS;
    this.#maxMs = options.maxMs ?? DICTATION_SEGMENT_MAX_MS;
    this.#threshold = options.threshold ?? DICTATION_SILENCE_RMS;
    this.#lookbackMs = options.lookbackMs ?? DICTATION_CUT_LOOKBACK_MS;
    this.#prerollChunks = Math.round((options.prerollMs ?? DICTATION_PREROLL_MS) / this.#chunkMs);
  }

  get open(): boolean {
    return this.#open;
  }

  push(chunk: Uint8Array, energy: number): SegmentAction[] {
    const out: SegmentAction[] = [];
    const voiced = energy >= this.#threshold;
    if (!this.#open) {
      if (!voiced) {
        if (this.#takes === 'stream') out.push({ kind: 'feed', chunk });
        else {
          this.#preroll.push(chunk);
          if (this.#preroll.length > this.#prerollChunks) this.#preroll.shift();
        }
        return out;
      }
      this.#open = true;
      this.#openMs = 0;
      this.#silentMs = 0;
      if (this.#takes === 'segments') {
        for (const early of this.#preroll) out.push({ kind: 'feed', chunk: early });
        this.#openMs = this.#preroll.length * this.#chunkMs;
        this.#preroll = [];
      }
    }
    this.#openMs += this.#chunkMs;
    this.#silentMs = voiced ? 0 : this.#silentMs + this.#chunkMs;

    const nearCeiling = this.#takes === 'segments' && this.#openMs > this.#maxMs - this.#lookbackMs;
    if (nearCeiling) this.#pending.push({ chunk, energy });
    else out.push({ kind: 'feed', chunk });

    if (this.#silentMs >= this.#silenceMs && this.#openMs >= this.#minMs) {
      out.push(...this.#drain(), { kind: 'mark' });
      this.#close();
      return out;
    }
    if (this.#openMs >= this.#maxMs) {
      if (this.#pending.length === 0) {
        out.push({ kind: 'mark' });
        this.#close();
        return out;
      }
      // Cut at the quietest held chunk: between words when there is a between.
      let cut = 0;
      this.#pending.forEach((held, index) => {
        if (held.energy < (this.#pending[cut] as Held).energy) cut = index;
      });
      const rest = this.#pending.slice(cut + 1);
      for (const held of this.#pending.slice(0, cut + 1)) out.push({ kind: 'feed', chunk: held.chunk });
      out.push({ kind: 'mark' });
      this.#pending = [];
      this.#open = rest.length > 0;
      this.#openMs = rest.length * this.#chunkMs;
      let trailing = 0;
      for (let i = rest.length - 1; i >= 0 && (rest[i] as Held).energy < this.#threshold; i -= 1) trailing += 1;
      this.#silentMs = trailing * this.#chunkMs;
      for (const held of rest) out.push({ kind: 'feed', chunk: held.chunk });
    }
    return out;
  }

  /** On stop: whatever is held goes, and an open segment is closed so its words are not lost. */
  flush(): SegmentAction[] {
    const out = this.#drain();
    if (this.#open) out.push({ kind: 'mark' });
    this.#close();
    return out;
  }

  #drain(): SegmentAction[] {
    const out = this.#pending.map((held): SegmentAction => ({ kind: 'feed', chunk: held.chunk }));
    this.#pending = [];
    return out;
  }

  #close(): void {
    this.#open = false;
    this.#openMs = 0;
    this.#silentMs = 0;
    this.#preroll = [];
    this.#pending = [];
  }
}

/** The RMS of one chunk of Int16 samples, 0..1, which is the energy the segmenter cuts on. */
export function chunkEnergy(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = (pcm[i] as number) / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / pcm.length);
}
