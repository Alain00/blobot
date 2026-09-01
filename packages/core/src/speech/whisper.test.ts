import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { TranscriberEvent } from './domain.js';
import { WhisperTranscriber, parseTranscription, wavHeader } from './whisper.js';

interface FakeRun {
  readonly args: readonly string[];
  readonly stdin: Buffer[];
}

/** A `whisper-cli` that answers with what it is told to, after reading all of stdin. */
function fakeSpawn(answer: (run: FakeRun) => { stdout: string; code: number }) {
  const runs: FakeRun[] = [];
  const spawn = ((_binary: string, args: readonly string[]) => {
    const child = new EventEmitter() as EventEmitter & ChildProcess;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdin, stdout, stderr });
    const run: FakeRun = { args, stdin: [] };
    runs.push(run);
    stdin.on('data', (chunk: Buffer) => run.stdin.push(chunk));
    stdin.on('end', () => {
      const { stdout: text, code } = answer(run);
      stdout.end(text);
      setTimeout(() => child.emit('close', code), 0);
    });
    return child;
  }) as unknown as typeof import('node:child_process').spawn;
  return { spawn, runs };
}

/** Events cross an async iterator, which is a few microtasks behind a resolved promise. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function collect(events: AsyncIterable<TranscriberEvent>): TranscriberEvent[] {
  const seen: TranscriberEvent[] = [];
  void (async () => {
    for await (const event of events) seen.push(event);
  })();
  return seen;
}

const JSON_OUT = (text: string): string =>
  JSON.stringify({ model: {}, params: {}, result: { language: 'es' }, transcription: [{ text }] });

describe('the whisper Transcriber', () => {
  it('runs one process per segment with a WAV on stdin and the hint on --prompt', async () => {
    const { spawn, runs } = fakeSpawn(() => ({ stdout: JSON_OUT(' Hola @alice, revisa el session/new'), code: 0 }));
    const whisper = new WhisperTranscriber({ binary: '/bin/whisper-cli', model: '/m/ggml-base.bin', threads: 4, spawn });
    const seen = collect(whisper.events);
    await whisper.start({ terms: ['Alice', 'session/new'] });
    expect(whisper.feed(new Uint8Array(3_200))).toBe('taken');
    expect(whisper.feed(new Uint8Array(3_200))).toBe('taken');
    whisper.mark();
    await whisper.stop();
    await settle();
    expect(runs).toHaveLength(1);
    const run = runs[0] as FakeRun;
    expect(run.args).toEqual(['-m', '/m/ggml-base.bin', '-f', '-', '-l', 'auto', '-t', '4', '-bs', '5', '-np', '-nt', '-oj', '-of', '-', '--prompt', 'Alice, session/new']);
    const written = Buffer.concat(run.stdin);
    expect(written.length).toBe(44 + 6_400);
    expect(written.subarray(0, 4).toString()).toBe('RIFF');
    expect(written.readUInt32LE(40)).toBe(6_400);
    expect(seen).toEqual([
      { type: 'committed', text: 'Hola @alice, revisa el session/new' },
      { type: 'ended', reason: 'user' },
    ]);
  });

  it('never runs a process for an empty segment, and stop flushes the open one', async () => {
    const { spawn, runs } = fakeSpawn(() => ({ stdout: JSON_OUT('adiós'), code: 0 }));
    const whisper = new WhisperTranscriber({ binary: 'w', model: 'm', threads: 1, spawn });
    const seen = collect(whisper.events);
    await whisper.start({ terms: [] });
    whisper.mark();
    expect(runs).toHaveLength(0);
    whisper.feed(new Uint8Array(3_200));
    await whisper.stop();
    await settle();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.args).not.toContain('--prompt');
    expect(seen[0]).toEqual({ type: 'committed', text: 'adiós' });
  });

  it('says engine_exited once when the process fails, and nothing after', async () => {
    const { spawn } = fakeSpawn(() => ({ stdout: '', code: 1 }));
    const whisper = new WhisperTranscriber({ binary: 'w', model: 'm', threads: 1, spawn });
    const seen = collect(whisper.events);
    await whisper.start({ terms: [] });
    whisper.feed(new Uint8Array(3_200));
    whisper.mark();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen).toEqual([{ type: 'failed', cause: 'engine_exited' }]);
    expect(whisper.feed(new Uint8Array(3_200))).toBe('dropped');
    await whisper.stop();
    expect(seen).toHaveLength(1);
  });

  it('drops rather than queues when the engine is behind', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { spawn } = fakeSpawn(() => ({ stdout: JSON_OUT('x'), code: 0 }));
    // A spawn that never finishes until released: the first segment sits in the engine.
    const slow = ((binary: string, args: readonly string[]) => {
      const child = spawn(binary, args) as unknown as EventEmitter & { stdin: PassThrough };
      const realEnd = child.stdin.end.bind(child.stdin);
      child.stdin.end = ((...rest: unknown[]) => {
        void gate.then(() => (realEnd as (...args: unknown[]) => unknown)(...rest));
        return child.stdin;
      }) as PassThrough['end'];
      return child;
    }) as unknown as typeof import('node:child_process').spawn;
    const whisper = new WhisperTranscriber({ binary: 'w', model: 'm', threads: 1, spawn: slow });
    collect(whisper.events);
    await whisper.start({ terms: [] });
    for (let i = 0; i < 3; i += 1) {
      whisper.feed(new Uint8Array(3_200));
      whisper.mark();
    }
    // One running, two waiting: the next chunk is refused.
    expect(whisper.feed(new Uint8Array(3_200))).toBe('dropped');
    release?.();
    await whisper.stop();
  });
});

describe('the engine’s output', () => {
  it('joins the transcription and ignores the engine’s own markers', () => {
    expect(parseTranscription(JSON_OUT(' Hola  mundo '))).toBe('Hola mundo');
    expect(parseTranscription('read_audio_data: read 3200 bytes\n' + JSON_OUT('x'))).toBe('x');
    expect(parseTranscription(JSON_OUT('[BLANK_AUDIO]'))).toBe('');
    expect(parseTranscription(JSON_OUT('(silence)'))).toBe('');
    expect(parseTranscription('not json')).toBe('');
  });

  it('writes a correct WAV header', () => {
    const header = wavHeader(32_000);
    expect(header.length).toBe(44);
    expect(header.readUInt32LE(24)).toBe(16_000);
    expect(header.readUInt16LE(22)).toBe(1);
    expect(header.readUInt16LE(34)).toBe(16);
    expect(header.readUInt32LE(4)).toBe(36 + 32_000);
  });
});
