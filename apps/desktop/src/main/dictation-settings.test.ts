import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
  return { settings, store };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('choosing a model', () => {
  it('a downloaded model becomes the Transcriber when nothing was chosen, and the mic word follows', async () => {
    const { settings } = await host();
    await settings.set({ enabled: true });
    expect(settings.state()).toBe('unconfigured');
    await settings.download('engine');
    await settings.download('turbo');
    await settle();
    const view = await settings.view();
    expect(view.modelId).toBe('turbo');
    expect(view.transcriber).toBe('local');
    expect(settings.state()).toBe('ready');
  });

  it('never steals a choice already made', async () => {
    const { settings } = await host();
    await settings.set({ enabled: true });
    await settings.download('engine');
    await settings.download('turbo');
    await settle();
    await settings.download('base');
    await settle();
    expect((await settings.view()).modelId).toBe('turbo');
    // And choosing by hand still works.
    await settings.set({ modelId: 'base' });
    expect((await settings.view()).modelId).toBe('base');
    expect(settings.state()).toBe('ready');
  });
});
