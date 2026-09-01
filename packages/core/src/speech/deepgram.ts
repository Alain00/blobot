import { AsyncQueue } from '../mock/async-queue.js';
import type { SpeechHint, Transcriber, TranscriberEvent, TranscriberFailure } from './domain.js';
import { SOCKET_BACKLOG_LIMIT, nodeSocket, opened, textOf, type SocketFactory, type SocketLike } from './socket.js';

/**
 * Deepgram Nova-3 over its streaming socket (`.scratch/dictation/research/03` §3): raw
 * `linear16` at the capture rate, `language=multi` with `endpointing=100` for code-switching,
 * `keyterm` for the vocabulary hint, interim results as `partial` and `is_final` as
 * `committed`.
 *
 * **`mip_opt_out=true` on every request, unconditionally.** It is the one query parameter the
 * retention sentence in `providers.ts` depends on; without it that sentence is false.
 */
export interface DeepgramTranscriberOptions {
  readonly key: string;
  readonly socket?: SocketFactory;
  readonly url?: string;
  readonly keepAliveMs?: number;
}

export const DEEPGRAM_LISTEN_URL = 'wss://api.deepgram.com/v1/listen';

export function deepgramQuery(hint: SpeechHint): string {
  const query = new URLSearchParams({
    model: 'nova-3',
    language: 'multi',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    interim_results: 'true',
    smart_format: 'true',
    endpointing: '100',
    mip_opt_out: 'true',
  });
  for (const term of hint.terms) query.append('keyterm', term);
  return query.toString();
}

export class DeepgramTranscriber implements Transcriber {
  readonly id = 'deepgram' as const;
  readonly partials = true;
  readonly takes = 'stream' as const;
  readonly #options: DeepgramTranscriberOptions;
  readonly #queue = new AsyncQueue<TranscriberEvent>();
  #socket: SocketLike | undefined;
  #keepAlive: ReturnType<typeof setInterval> | undefined;
  #done = false;
  #stopping = false;
  #closed: (() => void) | undefined;

  constructor(options: DeepgramTranscriberOptions) {
    this.#options = options;
  }

  get events(): AsyncIterable<TranscriberEvent> {
    return this.#queue;
  }

  async start(hint: SpeechHint): Promise<void> {
    const socket = (this.#options.socket ?? nodeSocket)(`${this.#options.url ?? DEEPGRAM_LISTEN_URL}?${deepgramQuery(hint)}`, {
      Authorization: `Token ${this.#options.key}`,
    });
    this.#socket = socket;
    socket.addEventListener('message', (event) => this.#onMessage(event.data));
    socket.addEventListener('close', (event) => this.#onClose(event.code, event.reason));
    socket.addEventListener('error', () => this.#fail('network'));
    await opened(socket);
    // Silence over ten seconds closes the socket (`NET-0001`); a keep-alive every five does not.
    this.#keepAlive = setInterval(() => {
      if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'KeepAlive' }));
    }, this.#options.keepAliveMs ?? 5_000);
  }

  feed(pcm: Uint8Array): 'taken' | 'dropped' {
    const socket = this.#socket;
    if (socket === undefined || this.#done || this.#stopping || socket.readyState !== 1) return 'dropped';
    if (socket.bufferedAmount > SOCKET_BACKLOG_LIMIT) return 'dropped';
    socket.send(pcm);
    return 'taken';
  }

  mark(): void {
    const socket = this.#socket;
    if (socket === undefined || this.#done || socket.readyState !== 1) return;
    socket.send(JSON.stringify({ type: 'Finalize' }));
  }

  async stop(): Promise<void> {
    if (this.#done) return;
    this.#stopping = true;
    clearInterval(this.#keepAlive);
    const socket = this.#socket;
    if (socket !== undefined && socket.readyState === 1) {
      // The server flushes, sends the final results and closes; that is worth a short wait.
      socket.send(JSON.stringify({ type: 'CloseStream' }));
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3_000);
        this.#closed = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      socket.close(1000, 'done');
    }
    this.#finish({ type: 'ended', reason: 'user' });
  }

  #onMessage(data: unknown): void {
    const text = textOf(data);
    if (text === undefined) return;
    let message: {
      type?: string;
      is_final?: boolean;
      channel?: { alternatives?: { transcript?: string }[] };
      description?: string;
      message?: string;
    };
    try {
      message = JSON.parse(text) as typeof message;
    } catch {
      return;
    }
    if (message.type === 'Results') {
      const transcript = (message.channel?.alternatives?.[0]?.transcript ?? '').trim();
      if (transcript === '') return;
      this.#queue.push(message.is_final === true ? { type: 'committed', text: transcript } : { type: 'partial', text: transcript });
      return;
    }
    if (message.type === 'Error') this.#fail(failureOf(`${message.description ?? ''} ${message.message ?? ''}`));
  }

  #onClose(code: number, reason: string): void {
    clearInterval(this.#keepAlive);
    this.#closed?.();
    if (this.#done || this.#stopping) return;
    this.#fail(failureOf(`${code} ${reason}`));
  }

  #fail(cause: TranscriberFailure): void {
    clearInterval(this.#keepAlive);
    this.#closed?.();
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

function failureOf(text: string): TranscriberFailure {
  const lower = text.toLowerCase();
  if (/invalid_auth|invalid credentials|unauthorized|401/.test(lower)) return 'key_rejected';
  if (/payment_required|payment required|insufficient|402/.test(lower)) return 'no_credit';
  return 'network';
}
