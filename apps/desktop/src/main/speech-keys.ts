import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The one key blobot may hold, and the two places it may live (ADR-0005, clauses 4–6).
 *
 * One file, `dictation-keys.json`, beside `runtime-options.json` in blobot's data folder, mode
 * `0600`, never SQLite. Each value carries its own form: `encrypted` with `safeStorage` where
 * the OS can, **plain and stated** where it cannot. `basic_text` is never asked for and
 * `setUsePlainTextEncryption` is never called: a hard-coded password with the word *encrypted*
 * on it is the one form the ADR forbids. A plain value found on a launch that can encrypt is
 * re-encrypted in that launch; the reverse never happens.
 *
 * The environment variable `BLOBOT_<PROVIDER>_API_KEY` — blobot's own name, never the
 * provider's — is always a door and always wins. Settings names it and offers no *remove*.
 *
 * Nothing here knows what a key is for. Each key goes to its own provider only, and the
 * adapters strip these variables from every spawned runtime's environment.
 */
export interface KeyCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export type KeyForm = 'encrypted' | 'plain';

interface KeysFile {
  readonly version: 1;
  readonly keys: Record<string, { readonly form: KeyForm; readonly value: string }>;
}

export type KeyDescription =
  | { readonly state: 'none' }
  | { readonly state: 'saved'; readonly form: KeyForm }
  | { readonly state: 'environment'; readonly variable: string };

export function keyVariableFor(providerId: string): string {
  return `BLOBOT_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
}

export class SpeechKeys {
  readonly #file: string;
  readonly #crypto: KeyCrypto;
  readonly #env: Readonly<Record<string, string | undefined>>;

  constructor(options: {
    readonly file: string;
    readonly crypto: KeyCrypto;
    readonly env?: Readonly<Record<string, string | undefined>>;
  }) {
    this.#file = options.file;
    this.#crypto = options.crypto;
    this.#env = options.env ?? process.env;
  }

  /**
   * Called once at launch: a plain value on a machine that can now encrypt is re-encrypted.
   * Never the reverse — a value does not go from encrypted to plain because a keyring went
   * missing; it becomes unreadable and the section says so.
   */
  migrate(): void {
    if (!this.#crypto.isEncryptionAvailable()) return;
    const held = this.#read();
    let changed = false;
    const keys = { ...held.keys };
    for (const [id, entry] of Object.entries(keys)) {
      if (entry.form !== 'plain') continue;
      keys[id] = { form: 'encrypted', value: this.#crypto.encryptString(entry.value).toString('base64') };
      changed = true;
    }
    if (changed) this.#write({ version: 1, keys });
  }

  /** What the section may say about a provider's key: a state and a form, never the key. */
  describe(providerId: string): KeyDescription {
    const variable = keyVariableFor(providerId);
    const fromEnv = this.#env[variable];
    if (fromEnv !== undefined && fromEnv !== '') return { state: 'environment', variable };
    const entry = this.#read().keys[providerId];
    return entry === undefined ? { state: 'none' } : { state: 'saved', form: entry.form };
  }

  /** The key itself, for the one caller that sends it to its provider. The environment wins. */
  keyFor(providerId: string): string | undefined {
    const fromEnv = this.#env[keyVariableFor(providerId)];
    if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
    const entry = this.#read().keys[providerId];
    if (entry === undefined) return undefined;
    if (entry.form === 'plain') return entry.value;
    try {
      return this.#crypto.decryptString(Buffer.from(entry.value, 'base64'));
    } catch {
      // Encrypted by a keyring this launch cannot reach. Not a key, and not plain either.
      return undefined;
    }
  }

  /** Keep one key, in the form this machine allows. Answers the form it took. */
  save(providerId: string, key: string): KeyForm {
    const held = this.#read();
    const encrypted = this.#crypto.isEncryptionAvailable();
    const entry = encrypted
      ? { form: 'encrypted' as const, value: this.#crypto.encryptString(key).toString('base64') }
      : { form: 'plain' as const, value: key };
    this.#write({ version: 1, keys: { ...held.keys, [providerId]: entry } });
    return entry.form;
  }

  remove(providerId: string): void {
    const held = this.#read();
    if (held.keys[providerId] === undefined) return;
    const keys = { ...held.keys };
    delete keys[providerId];
    this.#write({ version: 1, keys });
  }

  #read(): KeysFile {
    try {
      const parsed = JSON.parse(readFileSync(this.#file, 'utf8')) as KeysFile;
      return parsed.version === 1 && typeof parsed.keys === 'object' ? parsed : { version: 1, keys: {} };
    } catch {
      return { version: 1, keys: {} };
    }
  }

  #write(file: KeysFile): void {
    mkdirSync(dirname(this.#file), { recursive: true });
    const scratch = `${this.#file}.${process.pid}.tmp`;
    // Mode set on creation and again after, so a file that already existed wider is narrowed.
    writeFileSync(scratch, JSON.stringify(file), { encoding: 'utf8', mode: 0o600 });
    renameSync(scratch, this.#file);
    try {
      chmodSync(this.#file, 0o600);
    } catch {
      // Windows has no mode bits; the rename already put the file where only this user reads.
    }
  }
}
