import { describe, expect, it } from 'vitest';
import { DeepgramTranscriber, deepgramQuery } from './deepgram.js';
import type { TranscriberEvent } from './domain.js';
import { MistralTranscriber } from './mistral.js';
import { OpenAiTranscriber, localeLanguage } from './openai.js';
import { resample16to24, type SocketFactory, type SocketLike } from './socket.js';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function collect(events: AsyncIterable<TranscriberEvent>): TranscriberEvent[] {
  const seen: TranscriberEvent[] = [];
  void (async () => {
    for await (const event of events) seen.push(event);
  })();
  return seen;
}

/** A socket that opens on the next tick, records what was sent, and lets a test speak back. */
class FakeSocket implements SocketLike {
  readyState = 0;
  bufferedAmount = 0;
  readonly sent: (string | Uint8Array)[] = [];
  readonly closes: [number | undefined, string | undefined][] = [];
  readonly #listeners: Record<string, ((event: never) => void)[]> = {};
  constructor(readonly url: string, readonly headers: Record<string, string>) {
    setTimeout(() => {
      this.readyState = 1;
      this.#emit('open', undefined);
    }, 0);
  }
  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closes.push([code, reason]);
    this.#emit('close', { code: code ?? 1005, reason: reason ?? '' });
  }
  addEventListener(type: string, listener: (event: never) => void): void {
    (this.#listeners[type] ??= []).push(listener);
  }
  /** The server speaks. */
  receive(message: unknown): void {
    this.#emit('message', { data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  serverClose(code: number, reason: string): void {
    this.readyState = 3;
    this.#emit('close', { code, reason });
  }
  fail(): void {
    this.#emit('error', new Error('boom'));
  }
  #emit(type: string, event: unknown): void {
    for (const listener of this.#listeners[type] ?? []) listener(event as never);
  }
}

function sockets(): { factory: SocketFactory; made: FakeSocket[] } {
  const made: FakeSocket[] = [];
  return {
    made,
    factory: (url, headers) => {
      const socket = new FakeSocket(url, headers);
      made.push(socket);
      return socket;
    },
  };
}

const jsonSent = (socket: FakeSocket): Record<string, unknown>[] =>
  socket.sent.filter((s): s is string => typeof s === 'string').map((s) => JSON.parse(s) as Record<string, unknown>);

describe('OpenAI live', () => {
  it('opens a transcription session with the hint, resamples to 24 kHz, commits on mark, and draws partials then committed', async () => {
    const { factory, made } = sockets();
    const openai = new OpenAiTranscriber({ key: 'sk-x', locale: 'es-ES', socket: factory });
    const seen = collect(openai.events);
    await openai.start({ terms: ['Alice', 'session/new', 'bad<term>'] });
    const socket = made[0] as FakeSocket;
    expect(socket.headers).toEqual({ Authorization: 'Bearer sk-x' });
    const update = jsonSent(socket)[0] as { type: string; session: { audio: { input: { format: unknown; transcription: unknown; turn_detection: unknown } } } };
    expect(update.type).toBe('session.update');
    expect(update.session.audio.input.format).toEqual({ type: 'audio/pcm', rate: 24000 });
    expect(update.session.audio.input.transcription).toEqual({ model: 'gpt-live-transcribe', keywords: ['Alice', 'session/new'], languages: ['es', 'en'] });
    expect(update.session.audio.input.turn_detection).toBeNull();

    expect(openai.feed(new Uint8Array(3_200))).toBe('taken');
    const append = jsonSent(socket)[1] as { type: string; audio: string };
    expect(append.type).toBe('input_audio_buffer.append');
    // 1,600 samples in → 2,400 out → 4,800 bytes → base64.
    expect(Buffer.from(append.audio, 'base64').length).toBe(4_800);
    openai.mark();
    expect(jsonSent(socket).at(-1)).toEqual({ type: 'input_audio_buffer.commit' });

    socket.receive({ type: 'conversation.item.input_audio_transcription.delta', delta: 'hola ' });
    socket.receive({ type: 'conversation.item.input_audio_transcription.delta', delta: 'alice' });
    socket.receive({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Hola, Alice.' });
    await settle();
    expect(seen).toEqual([
      { type: 'partial', text: 'hola' },
      { type: 'partial', text: 'hola alice' },
      { type: 'committed', text: 'Hola, Alice.' },
    ]);
    await openai.stop();
    await settle();
    expect(seen.at(-1)).toEqual({ type: 'ended', reason: 'user' });
    expect(socket.closes[0]?.[0]).toBe(1000);
  });

  it('drops when the socket is behind, and names a rejected key and a dead connection', async () => {
    const { factory, made } = sockets();
    const openai = new OpenAiTranscriber({ key: 'k', socket: factory });
    const seen = collect(openai.events);
    await openai.start({ terms: [] });
    const socket = made[0] as FakeSocket;
    socket.bufferedAmount = 1_000_000;
    expect(openai.feed(new Uint8Array(3_200))).toBe('dropped');
    socket.receive({ type: 'error', error: { code: 'invalid_api_key', message: 'Incorrect API key provided' } });
    await settle();
    expect(seen.at(-1)).toEqual({ type: 'failed', cause: 'key_rejected' });
    expect(openai.feed(new Uint8Array(3_200))).toBe('dropped');

    const second = new OpenAiTranscriber({ key: 'k', socket: factory });
    const seen2 = collect(second.events);
    await second.start({ terms: [] });
    (made[1] as FakeSocket).serverClose(1006, '');
    await settle();
    expect(seen2).toEqual([{ type: 'failed', cause: 'network' }]);
  });

  it('turns a locale into a language hint', () => {
    expect(localeLanguage('es-ES')).toBe('es');
    expect(localeLanguage('en')).toBe('en');
    expect(localeLanguage(undefined)).toBeUndefined();
    expect(localeLanguage('C')).toBeUndefined();
  });
});

describe('Deepgram', () => {
  it('asks for multi with mip_opt_out on every request, streams raw PCM, and draws interim then final', async () => {
    const { factory, made } = sockets();
    const deepgram = new DeepgramTranscriber({ key: 'dg', socket: factory, keepAliveMs: 60_000 });
    const seen = collect(deepgram.events);
    await deepgram.start({ terms: ['Alice', 'session/new'] });
    const socket = made[0] as FakeSocket;
    expect(socket.headers).toEqual({ Authorization: 'Token dg' });
    const query = new URL(socket.url).searchParams;
    expect(query.get('model')).toBe('nova-3');
    expect(query.get('language')).toBe('multi');
    expect(query.get('mip_opt_out')).toBe('true');
    expect(query.get('endpointing')).toBe('100');
    expect(query.getAll('keyterm')).toEqual(['Alice', 'session/new']);
    const chunk = new Uint8Array(3_200);
    expect(deepgram.feed(chunk)).toBe('taken');
    expect(socket.sent[0]).toBe(chunk);
    deepgram.mark();
    expect(socket.sent.at(-1)).toBe('{"type":"Finalize"}');
    socket.receive({ type: 'Results', is_final: false, channel: { alternatives: [{ transcript: 'hola al' }] } });
    socket.receive({ type: 'Results', is_final: true, channel: { alternatives: [{ transcript: 'Hola Alice' }] } });
    socket.receive({ type: 'Results', is_final: true, channel: { alternatives: [{ transcript: '' }] } });
    await settle();
    expect(seen).toEqual([
      { type: 'partial', text: 'hola al' },
      { type: 'committed', text: 'Hola Alice' },
    ]);
    const stopping = deepgram.stop();
    expect(socket.sent.at(-1)).toBe('{"type":"CloseStream"}');
    socket.serverClose(1000, '');
    await stopping;
    await settle();
    expect(seen.at(-1)).toEqual({ type: 'ended', reason: 'user' });
    expect(deepgramQuery({ terms: [] })).not.toContain('keyterm');
  });

  it('names a payment problem and a dead socket', async () => {
    const { factory, made } = sockets();
    const deepgram = new DeepgramTranscriber({ key: 'dg', socket: factory, keepAliveMs: 60_000 });
    const seen = collect(deepgram.events);
    await deepgram.start({ terms: [] });
    (made[0] as FakeSocket).serverClose(1008, 'ASR_PAYMENT_REQUIRED');
    await settle();
    expect(seen).toEqual([{ type: 'failed', cause: 'no_credit' }]);
  });
});

describe('Mistral', () => {
  it('posts one WAV per segment with the hint as context_bias and commits the text', async () => {
    const requests: { url: string; headers: Record<string, string>; form: FormData }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), headers: init?.headers as Record<string, string>, form: init?.body as FormData });
      return new Response(JSON.stringify({ text: ' Hola  @alice ', language: 'es' }), { status: 200 });
    };
    const mistral = new MistralTranscriber({ key: 'm', fetch: fetchImpl });
    const seen = collect(mistral.events);
    await mistral.start({ terms: ['Alice'] });
    expect(mistral.takes).toBe('segments');
    mistral.feed(new Uint8Array(3_200));
    mistral.feed(new Uint8Array(3_200));
    mistral.mark();
    await mistral.stop();
    await settle();
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe('https://api.mistral.ai/v1/audio/transcriptions');
    expect(request.headers['Authorization']).toBe('Bearer m');
    expect(request.form.get('model')).toBe('voxtral-mini-latest');
    expect(request.form.getAll('context_bias')).toEqual(['Alice']);
    const file = request.form.get('file') as File;
    expect(file.size).toBe(44 + 6_400);
    expect(seen).toEqual([{ type: 'committed', text: 'Hola @alice' }, { type: 'ended', reason: 'user' }]);
  });

  it('says key_rejected on 401 and no_credit on 402', async () => {
    for (const [status, cause] of [[401, 'key_rejected'], [402, 'no_credit'], [500, 'network']] as const) {
      const mistral = new MistralTranscriber({ key: 'm', fetch: async () => new Response('', { status }) });
      const seen = collect(mistral.events);
      await mistral.start({ terms: [] });
      mistral.feed(new Uint8Array(3_200));
      mistral.mark();
      await mistral.stop();
      await settle();
      expect(seen[0]).toEqual({ type: 'failed', cause });
    }
  });
});

describe('resampling 16 to 24 kHz', () => {
  it('turns two samples into three, straight lines staying straight', () => {
    expect(Array.from(resample16to24(new Int16Array([0, 300, 600, 900])))).toEqual([0, 200, 400, 600, 800, 900]);
    expect(resample16to24(new Int16Array([5])).length).toBe(0);
  });
});
