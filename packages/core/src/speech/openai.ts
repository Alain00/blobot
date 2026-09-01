import { AsyncQueue } from '../mock/async-queue.js';
import type { SpeechHint, Transcriber, TranscriberEvent, TranscriberFailure } from './domain.js';
import { SOCKET_BACKLOG_LIMIT, base64Of, nodeSocket, opened, resample16to24, textOf, type SocketFactory, type SocketLike } from './socket.js';

/**
 * OpenAI's live transcription over the Realtime WebSocket (`.scratch/dictation/research/03`
 * §2): a transcription-only session on `gpt-live-transcribe`, audio up as base64 PCM at the
 * one rate it takes — 24 kHz, resampled here from the capture's 16 — and `delta` / `completed`
 * events back, which are ticket 06's `partial` and `committed` exactly.
 *
 * `turn_detection` is off: the renderer already knows where the pauses are, and a `mark()`
 * commits the buffer. `languages` is a hint list and not a restriction, `keywords` is the
 * vocabulary hint. Zero retries inside a recording: a drop is `failed · network`.
 */
export interface OpenAiTranscriberOptions {
  readonly key: string;
  /** `app.getLocale()`, deduplicated against `en`. */
  readonly locale?: string;
  readonly socket?: SocketFactory;
  readonly url?: string;
}

export const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
export const OPENAI_LIVE_MODEL = 'gpt-live-transcribe';

export class OpenAiTranscriber implements Transcriber {
  readonly id = 'openai' as const;
  readonly partials = true;
  readonly takes = 'stream' as const;
  readonly #options: OpenAiTranscriberOptions;
  readonly #queue = new AsyncQueue<TranscriberEvent>();
  #socket: SocketLike | undefined;
  #done = false;
  #stopping = false;
  #partial = '';
  #carry: Int16Array = new Int16Array(0);
  #uncommitted = false;
  #awaitingFinal: (() => void) | undefined;

  constructor(options: OpenAiTranscriberOptions) {
    this.#options = options;
  }

  get events(): AsyncIterable<TranscriberEvent> {
    return this.#queue;
  }

  async start(hint: SpeechHint): Promise<void> {
    const socket = (this.#options.socket ?? nodeSocket)(this.#options.url ?? OPENAI_REALTIME_URL, {
      Authorization: `Bearer ${this.#options.key}`,
    });
    this.#socket = socket;
    socket.addEventListener('message', (event) => this.#onMessage(event.data));
    socket.addEventListener('close', (event) => this.#onClose(event.code, event.reason));
    socket.addEventListener('error', () => this.#fail('network'));
    await opened(socket);
    const languages = [...new Set([localeLanguage(this.#options.locale), 'en'].filter((l): l is string => l !== undefined))];
    socket.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24_000 },
              transcription: {
                model: OPENAI_LIVE_MODEL,
                ...(hint.terms.length === 0 ? {} : { keywords: hint.terms.filter((t) => !/[<>\r\n]/.test(t)) }),
                languages,
              },
              turn_detection: null,
            },
          },
        },
      }),
    );
  }

  feed(pcm: Uint8Array): 'taken' | 'dropped' {
    const socket = this.#socket;
    if (socket === undefined || this.#done || this.#stopping || socket.readyState !== 1) return 'dropped';
    if (socket.bufferedAmount > SOCKET_BACKLOG_LIMIT) return 'dropped';
    const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    const joined = new Int16Array(this.#carry.length + samples.length);
    joined.set(this.#carry, 0);
    joined.set(samples, this.#carry.length);
    const even = joined.length - (joined.length % 2);
    this.#carry = joined.slice(even);
    const out = resample16to24(joined.subarray(0, even));
    socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64Of(new Uint8Array(out.buffer)) }));
    this.#uncommitted = true;
    return 'taken';
  }

  mark(): void {
    const socket = this.#socket;
    if (socket === undefined || this.#done || socket.readyState !== 1 || !this.#uncommitted) return;
    socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    this.#uncommitted = false;
  }

  async stop(): Promise<void> {
    if (this.#done) return;
    this.#stopping = true;
    const socket = this.#socket;
    if (socket !== undefined && socket.readyState === 1) {
      if (this.#uncommitted) {
        this.mark();
        // The last sentence's `completed` is worth a short wait; a socket that never answers
        // is closed anyway.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 3_000);
          this.#awaitingFinal = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
      socket.close(1000, 'done');
    }
    this.#finish({ type: 'ended', reason: 'user' });
  }

  #onMessage(data: unknown): void {
    const text = textOf(data);
    if (text === undefined) return;
    let message: { type?: string; delta?: string; transcript?: string; error?: { code?: string; message?: string; type?: string } };
    try {
      message = JSON.parse(text) as typeof message;
    } catch {
      return;
    }
    switch (message.type) {
      case 'conversation.item.input_audio_transcription.delta':
        this.#partial += message.delta ?? '';
        if (this.#partial.trim() !== '') this.#queue.push({ type: 'partial', text: this.#partial.trim() });
        return;
      case 'conversation.item.input_audio_transcription.completed': {
        const committed = (message.transcript ?? this.#partial).trim();
        this.#partial = '';
        if (committed !== '') this.#queue.push({ type: 'committed', text: committed });
        this.#awaitingFinal?.();
        this.#awaitingFinal = undefined;
        return;
      }
      case 'conversation.item.input_audio_transcription.failed':
        this.#partial = '';
        this.#awaitingFinal?.();
        return;
      case 'error':
        this.#fail(failureOf(message.error));
        return;
      default:
        return;
    }
  }

  #onClose(code: number, reason: string): void {
    if (this.#done || this.#stopping) return;
    this.#fail(/quota|credit|billing/i.test(reason) ? 'no_credit' : code === 4001 || code === 3000 ? 'key_rejected' : 'network');
  }

  #fail(cause: TranscriberFailure): void {
    this.#awaitingFinal?.();
    this.#finish({ type: 'failed', cause });
    this.#socket?.close();
  }

  #finish(last: TranscriberEvent): void {
    if (this.#done) return;
    this.#done = true;
    this.#queue.push(last);
    this.#queue.close();
  }
}

/** `es-ES` → `es`; nothing for a locale that is not a language. */
export function localeLanguage(locale: string | undefined): string | undefined {
  const language = locale?.split(/[-_]/)[0]?.toLowerCase();
  return language !== undefined && /^[a-z]{2}$/.test(language) ? language : undefined;
}

function failureOf(error: { code?: string; message?: string; type?: string } | undefined): TranscriberFailure {
  const text = `${error?.code ?? ''} ${error?.type ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (/invalid_api_key|incorrect api key|unauthorized|invalid_authentication/.test(text)) return 'key_rejected';
  if (/insufficient_quota|quota|billing|credit/.test(text)) return 'no_credit';
  return 'network';
}
