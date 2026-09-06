import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_MACHINE_IDLE_MS, machineIdleMs } from '@blobot/core';

/** A closed, credential-free preference. Atomic replacement; writes serialized in main. */
export class MachinePreferences {
  #idleAfterMs = DEFAULT_MACHINE_IDLE_MS;
  #readError: string | undefined;
  #writes: Promise<void> = Promise.resolve();
  constructor(readonly path: string) {}
  get idleAfterMs(): number { return this.#idleAfterMs; }
  get readError(): string | undefined { return this.#readError; }
  async load(): Promise<void> {
    try {
      const data: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      if (typeof data !== 'object' || data === null || !('idleAfterMs' in data) || typeof data.idleAfterMs !== 'number') {
        throw new Error('Invalid Machine preferences.');
      }
      this.#idleAfterMs = machineIdleMs(data.idleAfterMs);
      this.#readError = undefined;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      this.#idleAfterMs = 0; // preserve work when a saved policy cannot be interpreted
      this.#readError = 'Saved sleep settings could not be read. Automatic sleep is temporarily disabled. Choose and save a duration to repair this setting.';
      throw new Error(this.#readError);
    }
  }
  async setIdleAfterMs(value: number): Promise<number> {
    const idleAfterMs = machineIdleMs(value);
    const save = this.#writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.next`, JSON.stringify({ idleAfterMs }), { mode: 0o600 });
      await rename(`${this.path}.next`, this.path);
      this.#idleAfterMs = idleAfterMs;
      this.#readError = undefined;
    });
    this.#writes = save.catch(() => {});
    await save;
    return idleAfterMs;
  }
}
