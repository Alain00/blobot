import { AsyncQueue } from '../mock/async-queue.js';
import type { SpeechHint, Transcriber, TranscriberEvent, TranscriberFailure } from './domain.js';
import { wavHeader } from './whisper.js';

/**
 * Mistral Voxtral over the batch endpoint (`.scratch/dictation/research/03` §4): one
 * multipart `POST` per segment, the WAV in the body, `context_bias` carrying the vocabulary
 * hint, the text back in one piece. `partials` is false and honestly so.
 *
 * It takes whole segments, like the local engine: the renderer cuts them from the level it
 * measures and never sends silence, so each request is a sentence and each answer lands as
 * its `committed`. One request at a time; two waiting is the queue's limit and past it a chunk
 * is dropped rather than held (ticket 04).
 */
export interface MistralTranscriberOptions {
  readonly key: string;
  readonly fetch?: typeof fetch;
  readonly url?: string;
  readonly model?: string;
}

export const MISTRAL_TRANSCRIPTIONS_URL = 'https://api.mistral.ai/v1/audio/transcriptions';
export const MISTRAL_MODEL = 'voxtral-mini-latest';
const QUEUE_LIMIT = 2;

export class MistralTranscriber implements Transcriber {
  readonly id = 'mistral' as const;
  readonly partials = false;
  readonly takes = 'segments' as const;
  readonly #options: MistralTranscriberOptions;
  readonly #queue = new AsyncQueue<TranscriberEvent>();
  #terms: readonly string[] = [];
  #open: Uint8Array[] = [];
  #openBytes = 0;
  #pending: Uint8Array[][] = [];
  #running: Promise<void> | undefined;
  #done = false;
  #stopping = false;

  constructor(options: MistralTranscriberOptions) {
    this.#options = options;
  }

  get events(): AsyncIterable<TranscriberEvent> {
    return this.#queue;
  }

  async start(hint: SpeechHint): Promise<void> {
    this.#terms = hint.terms;
  }

  feed(pcm: Uint8Array): 'taken' | 'dropped' {
    if (this.#done || this.#stopping) return 'dropped';
    if (this.#pending.length >= QUEUE_LIMIT) return 'dropped';
    this.#open.push(pcm);
    this.#openBytes += pcm.byteLength;
    return 'taken';
  }

  mark(): void {
    if (this.#done || this.#openBytes === 0) return;
    this.#pending.push(this.#open);
    this.#open = [];
    this.#openBytes = 0;
    this.#running ??= this.#drain();
  }

  async stop(): Promise<void> {
    if (this.#done) return;
    this.#stopping = true;
    this.mark();
    await this.#running;
    this.#finish({ type: 'ended', reason: 'user' });
  }

  async #drain(): Promise<void> {
    for (;;) {
      const segment = this.#pending.shift();
      if (segment === undefined) break;
      const outcome = await this.#transcribe(segment);
      if (!outcome.ok) {
        this.#pending = [];
        this.#finish({ type: 'failed', cause: outcome.cause });
        break;
      }
      if (outcome.text !== '') this.#queue.push({ type: 'committed', text: outcome.text });
    }
    this.#running = undefined;
  }

  async #transcribe(segment: readonly Uint8Array[]): Promise<{ ok: true; text: string } | { ok: false; cause: TranscriberFailure }> {
    const bytes = segment.reduce((total, chunk) => total + chunk.byteLength, 0);
    const wav = new Uint8Array(44 + bytes);
    wav.set(wavHeader(bytes), 0);
    let at = 44;
    for (const chunk of segment) {
      wav.set(chunk, at);
      at += chunk.byteLength;
    }
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'segment.wav');
    form.append('model', this.#options.model ?? MISTRAL_MODEL);
    for (const term of this.#terms.slice(0, 100)) form.append('context_bias', term);
    let response: Response;
    try {
      response = await (this.#options.fetch ?? fetch)(this.#options.url ?? MISTRAL_TRANSCRIPTIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.#options.key}`, Accept: 'application/json' },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      return { ok: false, cause: 'network' };
    }
    if (response.status === 401 || response.status === 403) return { ok: false, cause: 'key_rejected' };
    if (response.status === 402) return { ok: false, cause: 'no_credit' };
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, cause: /quota|credit|billing|insufficient/i.test(body) ? 'no_credit' : 'network' };
    }
    let parsed: { text?: unknown };
    try {
      parsed = (await response.json()) as { text?: unknown };
    } catch {
      return { ok: false, cause: 'network' };
    }
    return { ok: true, text: typeof parsed.text === 'string' ? parsed.text.replace(/\s+/g, ' ').trim() : '' };
  }

  #finish(last: TranscriberEvent): void {
    if (this.#done) return;
    this.#done = true;
    this.#queue.push(last);
    this.#queue.close();
  }
}
