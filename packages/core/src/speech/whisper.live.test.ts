import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TranscriberEvent } from './domain.js';
import { WhisperTranscriber } from './whisper.js';

/**
 * The local Transcriber against a real `whisper-cli` and a real clip, the way the composer
 * will run it: 100 ms chunks, one mark, stop. Ticket 02's measurement was that the vocabulary
 * hint gets every identifier right even on `base`; this is that claim, held by the adapter.
 *
 * `BLOBOT_LIVE_WHISPER=1` runs it, with `BLOBOT_WHISPER_CLI`, `BLOBOT_WHISPER_MODEL` and
 * `BLOBOT_WHISPER_CLIP` (a 16 kHz mono 16-bit WAV) naming the three files.
 */
const live = process.env['BLOBOT_LIVE_WHISPER'] === '1';
const binary = process.env['BLOBOT_WHISPER_CLI'] ?? '';
const model = process.env['BLOBOT_WHISPER_MODEL'] ?? '';
const clip = process.env['BLOBOT_WHISPER_CLIP'] ?? '';

describe.skipIf(!live)('whisper-cli, live', () => {
  it('transcribes the research clip with the identifiers intact when the hint names them', async () => {
    const wav = readFileSync(clip);
    const pcm = new Uint8Array(wav.buffer, wav.byteOffset + 44, wav.byteLength - 44);
    const whisper = new WhisperTranscriber({ binary, model, onStderr: () => undefined });
    const seen: TranscriberEvent[] = [];
    const reading = (async () => {
      for await (const event of whisper.events) seen.push(event);
    })();
    await whisper.start({ terms: ['Alice', 'Bob', 'AgentRuntime', 'session/new', 'pnpm demo', 'waiting', 'idle'] });
    const began = Date.now();
    for (let at = 0; at < pcm.byteLength; at += 3_200) {
      expect(whisper.feed(pcm.subarray(at, Math.min(at + 3_200, pcm.byteLength)))).toBe('taken');
    }
    whisper.mark();
    await whisper.stop();
    await reading;
    const elapsed = Date.now() - began;
    const text = seen.filter((e) => e.type === 'committed').map((e) => (e as { text: string }).text).join(' ');
    process.stderr.write(`\nwhisper live · ${elapsed} ms · ${text}\n`);
    expect(text).toContain('AgentRuntime');
    expect(text).toContain('session/new');
    expect(text.toLowerCase()).toContain('pnpm demo');
    expect(seen.at(-1)).toEqual({ type: 'ended', reason: 'user' });
  }, 60_000);
});
