import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineBuild, SpeechModel } from '@blobot/core';
import { SpeechFiles, type SpeechFileState, type SpeechTarget } from './speech-files.js';

const BYTES = Buffer.from('weights'.repeat(1_000));
const SHA = createHash('sha256').update(BYTES).digest('hex');
const models: readonly SpeechModel[] = [
  { id: 'base', label: 'small', file: 'ggml-base.bin', url: 'http://catalog/base', bytes: BYTES.length, sha256: SHA, ramGb: 0.4 },
  { id: 'small', label: 'medium', file: 'ggml-small.bin', url: 'http://catalog/small', bytes: BYTES.length, sha256: 'ff'.repeat(32), ramGb: 0.6 },
];
const engine: EngineBuild = { platform: 'darwin', arch: 'arm64', asset: 'whisper-cli-darwin-arm64', url: 'http://catalog/engine', sha256: SHA, bytes: BYTES.length };
const unpinned: EngineBuild = { platform: 'linux', arch: 'x64', asset: 'whisper-cli-linux-x64', url: 'http://catalog/engine' };

const serve: typeof fetch = async () =>
  new Response(new Uint8Array(BYTES), { status: 200, headers: { 'content-length': String(BYTES.length) } });

async function files(extra: { engine?: EngineBuild } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'blobot-speech-'));
  const changes: [SpeechTarget, SpeechFileState][] = [];
  const speech = new SpeechFiles({ root, models, engine: extra.engine ?? engine, fetch: serve, onChange: (t, s) => changes.push([t, s]) });
  return { root, speech, changes };
}

describe('speech files', () => {
  it('starts absent, downloads a model into models/, and prices its removal', async () => {
    const { speech, changes } = await files();
    expect(await speech.stateOf('base')).toEqual({ state: 'absent' });
    expect(await speech.download('base')).toEqual({ ok: true, bytes: BYTES.length });
    expect(await speech.stateOf('base')).toEqual({ state: 'installed', bytes: BYTES.length });
    expect(changes[0]).toEqual(['base', { state: 'downloading', received: 0, total: BYTES.length }]);
    expect(changes.at(-1)).toEqual(['base', { state: 'installed', bytes: BYTES.length }]);
    expect(await speech.footprint()).toEqual({ models: 1, engine: false, bytes: BYTES.length });
    expect(await speech.remove('base')).toBe(BYTES.length);
    expect(await speech.stateOf('base')).toEqual({ state: 'absent' });
  });

  it('says why a bad hash failed and keeps nothing', async () => {
    const { speech } = await files();
    const outcome = await speech.download('small');
    expect(outcome.ok).toBe(false);
    expect(await speech.stateOf('small')).toMatchObject({ state: 'failed', error: 'checksum did not match · deleted · try again' });
  });

  it('puts the engine under bin/<tag>/ and makes it executable', async () => {
    const { speech, root } = await files();
    expect(await speech.download('engine')).toEqual({ ok: true, bytes: BYTES.length });
    expect(speech.enginePath()).toBe(join(root, 'bin', 'whisper-b4938-1', 'whisper-cli-darwin-arm64'));
    expect(await speech.engineInstalled()).toBe(true);
    expect(await speech.footprint()).toEqual({ models: 0, engine: true, bytes: BYTES.length });
    expect(await speech.removeAll()).toBe(BYTES.length);
    expect(await speech.engineInstalled()).toBe(false);
  });

  it('refuses an engine with no pinned hash, and says so', async () => {
    const { speech } = await files({ engine: unpinned });
    expect(await speech.stateOf('engine')).toEqual({ state: 'unavailable', reason: 'the engine for this machine is not pinned yet' });
    expect((await speech.download('engine')).ok).toBe(false);
  });

  it('reads an orphan .part as paused, with what it holds', async () => {
    const { speech, root } = await files();
    await mkdir(join(root, 'models'), { recursive: true });
    await writeFile(join(root, 'models', 'ggml-base.bin.part'), BYTES.subarray(0, 100));
    expect(await speech.stateOf('base')).toEqual({ state: 'paused', received: 100, total: BYTES.length });
    expect((await speech.footprint()).bytes).toBe(100);
  });

  it('reads the machine from Node', async () => {
    const { speech } = await files();
    const facts = await speech.machineFacts();
    expect(facts.totalMemBytes).toBeGreaterThan(0);
    expect(facts.freeDiskBytes).toBeGreaterThan(0);
    expect(facts.platform).toBe(process.platform);
  });
});
