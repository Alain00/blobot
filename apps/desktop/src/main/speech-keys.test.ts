import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOBOT_KEY_VARIABLE, SpeechKeys, keyVariableFor, type KeyCrypto } from './speech-keys.js';

/** A keyring that reverses strings: enough to tell encrypted from plain in a file. */
const keyring = (available: boolean): KeyCrypto => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from(`enc:${plain}`),
  decryptString: (buffer) => buffer.toString().replace(/^enc:/, ''),
});

function file(): string {
  return join(mkdtempSync(join(tmpdir(), 'blobot-keys-')), 'dictation-keys.json');
}

describe('the one key', () => {
  it('is encrypted where the OS can, and the file is 0600 and never carries the plain key', () => {
    const path = file();
    const keys = new SpeechKeys({ file: path, crypto: keyring(true), env: {} });
    expect(keys.describe('openai')).toEqual({ state: 'none' });
    expect(keys.save('openai', 'sk-secret')).toBe('encrypted');
    expect(keys.describe('openai')).toEqual({ state: 'saved', form: 'encrypted' });
    expect(keys.keyFor('openai')).toBe('sk-secret');
    const raw = readFileSync(path, 'utf8');
    expect(raw).not.toContain('sk-secret');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('is plain and stated where the OS cannot, and re-encrypted at the first launch that can', () => {
    const path = file();
    const plain = new SpeechKeys({ file: path, crypto: keyring(false), env: {} });
    expect(plain.save('deepgram', 'dg-secret')).toBe('plain');
    expect(plain.describe('deepgram')).toEqual({ state: 'saved', form: 'plain' });
    expect(readFileSync(path, 'utf8')).toContain('dg-secret');
    const later = new SpeechKeys({ file: path, crypto: keyring(true), env: {} });
    later.migrate();
    expect(later.describe('deepgram')).toEqual({ state: 'saved', form: 'encrypted' });
    expect(readFileSync(path, 'utf8')).not.toContain('dg-secret');
    expect(later.keyFor('deepgram')).toBe('dg-secret');
  });

  it('lets the environment win, names it, and never removes it', () => {
    const path = file();
    const keys = new SpeechKeys({ file: path, crypto: keyring(true), env: { BLOBOT_MISTRAL_API_KEY: 'from-shell' } });
    keys.save('mistral', 'from-file');
    expect(keys.describe('mistral')).toEqual({ state: 'environment', variable: 'BLOBOT_MISTRAL_API_KEY' });
    expect(keys.keyFor('mistral')).toBe('from-shell');
    keys.remove('mistral');
    expect(keys.keyFor('mistral')).toBe('from-shell');
  });

  it('answers nothing for a key a missing keyring cannot open', () => {
    const path = file();
    new SpeechKeys({ file: path, crypto: keyring(true), env: {} }).save('openai', 'x');
    const broken: KeyCrypto = {
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.from(''),
      decryptString: () => {
        throw new Error('no keyring');
      },
    };
    expect(new SpeechKeys({ file: path, crypto: broken, env: {} }).keyFor('openai')).toBeUndefined();
  });

  it('names the variable blobot’s way, never the provider’s', () => {
    expect(keyVariableFor('openai')).toBe('BLOBOT_OPENAI_API_KEY');
    expect(BLOBOT_KEY_VARIABLE.test('BLOBOT_OPENAI_API_KEY')).toBe(true);
    expect(BLOBOT_KEY_VARIABLE.test('OPENAI_API_KEY')).toBe(false);
  });
});
