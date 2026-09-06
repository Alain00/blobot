import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_MACHINE_IDLE_MS, machineIdleMs } from '@blobot/core';
import { teamPoolLimit } from './team-pool.js';

/**
 * How many teams stay loaded, out of the box.
 *
 * It was three, hard-coded, chosen for the shape of a laptop with a handful of teams: the one
 * you are in, the one you are waiting on, the one you keep glancing at. The cost of being wrong
 * about that is not a slower switch — it is a Machine put to sleep behind the user's back, so
 * the power dot on a row they were reading a moment ago goes out for a reason nothing on screen
 * explains. Twenty is enough that an ordinary roster never trips it, and it is a setting now,
 * because how many processes this computer can hold is not blobot's to know.
 */
export const DEFAULT_LIVE_TEAM_LIMIT = 20;

/** A closed, credential-free preference. Atomic replacement; writes serialized in main. */
export class MachinePreferences {
  #idleAfterMs = DEFAULT_MACHINE_IDLE_MS;
  #liveTeamLimit = DEFAULT_LIVE_TEAM_LIMIT;
  #readError: string | undefined;
  #writes: Promise<void> = Promise.resolve();
  constructor(readonly path: string) {}
  get idleAfterMs(): number { return this.#idleAfterMs; }
  get liveTeamLimit(): number { return this.#liveTeamLimit; }
  get readError(): string | undefined { return this.#readError; }
  async load(): Promise<void> {
    try {
      const data: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      if (typeof data !== 'object' || data === null || !('idleAfterMs' in data) || typeof data.idleAfterMs !== 'number') {
        throw new Error('Invalid Machine preferences.');
      }
      this.#idleAfterMs = machineIdleMs(data.idleAfterMs);
      // Optional, and unlike the duration a missing one is not a corrupt file: this setting is
      // younger than the file, so every preferences file written before today has no such key.
      this.#liveTeamLimit =
        'liveTeamLimit' in data && typeof data.liveTeamLimit === 'number'
          ? teamPoolLimit(data.liveTeamLimit)
          : DEFAULT_LIVE_TEAM_LIMIT;
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
    await this.#write({ idleAfterMs, liveTeamLimit: this.#liveTeamLimit });
    this.#idleAfterMs = idleAfterMs;
    return idleAfterMs;
  }

  async setLiveTeamLimit(value: number): Promise<number> {
    const liveTeamLimit = teamPoolLimit(value);
    await this.#write({ idleAfterMs: this.#idleAfterMs, liveTeamLimit });
    this.#liveTeamLimit = liveTeamLimit;
    return liveTeamLimit;
  }

  /** The whole file every time, so saving one setting never drops the other. */
  async #write(next: { readonly idleAfterMs: number; readonly liveTeamLimit: number }): Promise<void> {
    const save = this.#writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.next`, JSON.stringify(next), { mode: 0o600 });
      await rename(`${this.path}.next`, this.path);
      this.#readError = undefined;
    });
    this.#writes = save.catch(() => {});
    await save;
  }
}
