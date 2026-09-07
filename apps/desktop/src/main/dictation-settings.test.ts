import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SqliteStore, openDatabase, type EngineBuild, type SpeechModel } from '@blobot/core';
import { DictationSettingsHost } from './dictation-settings.js';
import { SpeechFiles } from './speech-files.js';
import { SpeechKeys } from './speech-keys.js';

const BYTES = Buffer.from('weights'.repeat(1_000));
const SHA = createHash('sha256').update(BYTES).digest('hex');
const models: readonly SpeechModel[] = [
  { id: 'base', label: 'small', file: 'ggml-base.bin', url: 'http://c/base', bytes: BYTES.length, sha256: SHA, ramGb: 0.4 },
  { id: 'turbo', label: 'large', file: 'ggml-turbo.bin', url: 'http://c/turbo', bytes: BYTES.length, sha256: SHA, ramGb: 1 },
];
const engine: EngineBuild = { platform: 'darwin', arch: 'arm64', asset: 'whisper-cli', url: 'http://c/engine', sha256: SHA, bytes: BYTES.length };
const serve: typeof fetch = async () => new Response(new Uint8Array(BYTES), { status: 200 });

async function host() {
  const root = await mkdtemp(join(tmpdir(), 'blobot-dictation-'));
  const store = new SqliteStore(openDatabase({ path: ':memory:' }).db);
  const saved = vi.spyOn(store, 'saveDictationSettings');
  const settings = new DictationSettingsHost({
    store: () => store,
    files: new SpeechFiles({
      root,
      models,
      engine,
      fetch: serve,
      onChange: (target, state) => settings.noteFile(target, state),
    }),
    keys: new SpeechKeys({ file: join(root, 'keys.json'), crypto: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' }, env: {} }),
    now: () => 7,
  });
  return { settings, store, saved };
}

// Download starts asynchronously. Wait for its durable completion, never a wall-clock guess.
const settle = (saved: Awaited<ReturnType<typeof host>>['saved'], writes: number) =>
  vi.waitFor(() => expect(saved).toHaveBeenCalledTimes(writes));

describe('choosing a model', () => {
  it('a downloaded model becomes the Transcriber when nothing was chosen, and the mic word follows', async () => {
    const { settings, saved } = await host();
    await settings.set({ enabled: true });
    expect(settings.state()).toBe('unconfigured');
    await settings.download('engine');
    await settings.download('turbo');
    await settle(saved, 3);
    const view = await settings.view();
    expect(view.modelId).toBe('turbo');
    expect(view.transcriber).toBe('local');
    expect(settings.state()).toBe('ready');
  });

  it('never steals a remote choice: a chosen provider holds the model download to installed', async () => {
    const { settings, saved } = await host();
    await settings.set({ enabled: true, providerId: 'openai' });
    await settings.download('engine');
    await settings.download('turbo');
    await settle(saved, 3);
    const view = await settings.view();
    expect(view.transcriber).toBe('remote');
    expect(view.modelId).toBe('');
  });

  it('never steals a choice already made', async () => {
    const { settings, saved } = await host();
    await settings.set({ enabled: true });
    await settings.download('engine');
    await settings.download('turbo');
    await settle(saved, 3);
    await settings.download('base');
    await settle(saved, 4);
    expect((await settings.view()).modelId).toBe('turbo');
    // And choosing by hand still works.
    await settings.set({ modelId: 'base' });
    expect((await settings.view()).modelId).toBe('base');
    expect(settings.state()).toBe('ready');
  });
});
