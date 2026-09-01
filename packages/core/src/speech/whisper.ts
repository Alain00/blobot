import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { cpus } from 'node:os';
import { AsyncQueue } from '../mock/async-queue.js';
import { PCM_16K_MONO_INT16, PCM_BYTES_PER_SECOND, type SpeechHint, type Transcriber, type TranscriberEvent } from './domain.js';

/**
 * The local Transcriber: whisper.cpp's `whisper-cli`, **one process per segment** (ticket 02,
 * measured: WAV on stdin, JSON on stdout, 0.45 s end-to-end on `base` including the model
 * load). No server, no resident process, no native module — nothing starts with the app, and
 * Metal's first-run shader cache is paid inside *say something*, where a person is watching.
 *
 * It takes whole segments: the renderer cuts them from the level it measures and never sends
 * silence, because Whisper hallucinates on silence. Each segment is decoded with the
 * vocabulary hint on `--prompt`, which ticket 02 found to be the whole game for identifiers.
 *
 * `partials` is false and honestly so: a partial would be a full re-decode of the window.
 */
export interface WhisperTranscriberOptions {
  /** The `whisper-cli` blobot downloaded and verified. */
  readonly binary: string;
  /** The `ggml-*.bin` blobot downloaded and verified. */
  readonly model: string;
  readonly threads?: number;
  readonly spawn?: typeof nodeSpawn;
  readonly onStderr?: (line: string) => void;
}

/** Segments waiting for the one process at a time. Past this, `feed` answers `dropped`. */
const QUEUE_LIMIT = 2;

export class WhisperTranscriber implements Transcriber {
  readonly id = 'whisper' as const;
  readonly partials = false;
  readonly takes = 'segments' as const;
  readonly #options: WhisperTranscriberOptions;
  readonly #queue = new AsyncQueue<TranscriberEvent>();
  #prompt = '';
  #open: Uint8Array[] = [];
  #openBytes = 0;
  #pending: Uint8Array[][] = [];
  #running: Promise<void> | undefined;
  #done = false;
  #stopping = false;

  constructor(options: WhisperTranscriberOptions) {
    this.#options = options;
  }

  get events(): AsyncIterable<TranscriberEvent> {
    return this.#queue;
  }

  async start(hint: SpeechHint): Promise<void> {
    this.#prompt = hint.terms.join(', ');
  }

  feed(pcm: Uint8Array): 'taken' | 'dropped' {
    if (this.#done || this.#stopping) return 'dropped';
    // Behind by more than the queue allows: drop, never queue (ticket 04). A transcriber this
    // far behind a speaker is not going to catch up, and the composer says `paused`.
    if (this.#pending.length >= QUEUE_LIMIT) return 'dropped';
    this.#open.push(pcm);
    this.#openBytes += pcm.byteLength;
    return 'taken';
  }

  mark(): void {
    if (this.#done) return;
    if (this.#openBytes === 0) return;
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
      const outcome = await this.#decode(segment);
      if (outcome.kind === 'died') {
        this.#pending = [];
        this.#finish({ type: 'failed', cause: 'engine_exited' });
        break;
      }
      if (outcome.text !== '') this.#queue.push({ type: 'committed', text: outcome.text });
    }
    this.#running = undefined;
  }

  #decode(segment: readonly Uint8Array[]): Promise<{ kind: 'text'; text: string } | { kind: 'died' }> {
    const spawn = this.#options.spawn ?? nodeSpawn;
    const threads = this.#options.threads ?? Math.max(1, Math.min(8, cpus().length));
    const args = [
      '-m', this.#options.model,
      '-f', '-',
      '-l', 'auto',
      '-t', String(threads),
      '-bs', '5',
      '-np', '-nt',
      '-oj', '-of', '-',
      ...(this.#prompt === '' ? [] : ['--prompt', this.#prompt]),
    ];
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(this.#options.binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        resolve({ kind: 'died' });
        return;
      }
      const out: Buffer[] = [];
      let settled = false;
      const settle = (value: { kind: 'text'; text: string } | { kind: 'died' }): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split('\n')) if (line !== '') this.#options.onStderr?.(line);
      });
      child.on('error', () => settle({ kind: 'died' }));
      child.on('close', (code) => {
        if (code !== 0) return settle({ kind: 'died' });
        settle({ kind: 'text', text: parseTranscription(Buffer.concat(out).toString('utf8')) });
      });
      const bytes = segment.reduce((total, chunk) => total + chunk.byteLength, 0);
      const stdin = child.stdin;
      if (stdin === null || stdin === undefined) return settle({ kind: 'died' });
      // One segment is at most 30 s — under a megabyte — so the whole thing is written at once and
      // the socket's high-water mark is not the concern it is for a continuous stream.
      stdin.on('error', () => undefined);
      stdin.write(wavHeader(bytes));
      for (const chunk of segment) stdin.write(chunk);
      stdin.end();
    });
  }

  #finish(last: TranscriberEvent): void {
    if (this.#done) return;
    this.#done = true;
    this.#queue.push(last);
    this.#queue.close();
  }
}

/** The 44-byte RIFF header for `PCM_16K_MONO_INT16`, in front of `bytes` of samples. */
export function wavHeader(bytes: number): Buffer {
  const header = Buffer.alloc(44);
  const { sampleRate, channels, bytesPerSample } = PCM_16K_MONO_INT16;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(PCM_BYTES_PER_SECOND, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bytesPerSample * 8, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes, 40);
  return header;
}

/**
 * `whisper-cli -oj -of -` writes one JSON document: `transcription[].text`. Joined, trimmed,
 * and with the engine's own markers for nothing (`[BLANK_AUDIO]`, `(silence)`) treated as
 * nothing, because a bracket is not something a person said.
 */
export function parseTranscription(stdout: string): string {
  const start = stdout.indexOf('{');
  if (start < 0) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start));
  } catch {
    return '';
  }
  const segments = (parsed as { transcription?: { text?: unknown }[] }).transcription;
  if (!Array.isArray(segments)) return '';
  const text = segments
    .map((segment) => (typeof segment.text === 'string' ? segment.text : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^[[(].*[\])]$/.test(text)) return '';
  return text;
}
