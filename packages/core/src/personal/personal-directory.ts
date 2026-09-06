import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

/** The receipt lives outside the personal storage tree; only its identity marker is mounted. */
export interface PersonalDirectoryReference {
  readonly profileId: string;
  readonly path: string;
  readonly identity: string;
}

export const PERSONAL_DIRECTORY_MARKER = '.blobot-personal-id';
export const PERSONAL_DIRECTORY_ENV = 'BLOBOT_PERSONAL_DIR';

function validateProfileId(value: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(value)) throw new Error('Invalid personal directory profile id.');
}

export function validatePersonalDirectory(value: PersonalDirectoryReference): void {
  validateProfileId(value.profileId);
  if (!isAbsolute(value.path) || resolve(value.path) !== value.path || /[\x00-\x1f:]/.test(value.path) ||
      !/^[a-f0-9-]{36}$/.test(value.identity)) throw new Error('Invalid personal directory reference.');
}

async function directory(path: string): Promise<void> {
  if (await realpath(path) !== path || !(await lstat(path)).isDirectory()) throw new Error('Personal directory moved.');
}

async function readRegular(path: string): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw new Error('Invalid personal directory identity.');
    return await file.readFile('utf8');
  } finally { await file.close(); }
}

async function writeExclusive(path: string, text: string): Promise<void> {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
}

/** A missing or replaced folder is recovery, never permission to create an empty replacement. */
export async function verifyPersonalDirectory(reference: PersonalDirectoryReference): Promise<void> {
  validatePersonalDirectory(reference);
  try {
    await directory(reference.path);
    if (await readRegular(join(reference.path, PERSONAL_DIRECTORY_MARKER)) !== reference.identity) throw new Error();
  } catch {
    throw new Error('The agent’s personal folder is unavailable or changed. Restore its original folder; existing data was kept.');
  }
}

/** Profile-owned storage. Machines borrow it and never delete it, including after retirement. */
export class PersonalDirectories {
  readonly #directories = new Map<string, PersonalDirectory>();
  constructor(readonly root: string) {
    if (!isAbsolute(root) || resolve(root) !== root || /[\x00-\x1f:]/.test(root)) throw new Error('Invalid personal storage root.');
  }

  forProfile(id: string): PersonalDirectory {
    validateProfileId(id);
    let personal = this.#directories.get(id);
    if (personal === undefined) {
      personal = new PersonalDirectory(this.root, id);
      this.#directories.set(id, personal);
    }
    return personal;
  }
}

export class PersonalDirectory {
  readonly path: string;
  #preparing: Promise<PersonalDirectoryReference> | undefined;
  #reference: PersonalDirectoryReference | undefined;
  constructor(readonly root: string, readonly profileId: string) {
    validateProfileId(profileId);
    this.path = join(root, profileId, 'files');
  }

  /** Coalesces simultaneous first starts of the same profile; later calls revalidate disk. */
  prepare(): Promise<PersonalDirectoryReference> {
    this.#preparing ??= this.#prepare().finally(() => { this.#preparing = undefined; });
    return this.#preparing;
  }

  async #prepare(): Promise<PersonalDirectoryReference> {
    // Keep the catalog beside the data root: even losing the whole personal volume must
    // not look like first use after the application restarts.
    const records = `${this.root}.records`, owner = join(this.root, this.profileId);
    const receipt = join(records, `${this.profileId}.json`);
    if (this.#reference !== undefined) await verifyPersonalDirectory(this.#reference);
    await mkdir(records, { recursive: true, mode: 0o700 });
    await directory(records);
    let reference: PersonalDirectoryReference;
    try {
      reference = JSON.parse(await readRegular(receipt)) as PersonalDirectoryReference;
      validatePersonalDirectory(reference);
      if (reference.profileId !== this.profileId || reference.path !== this.path ||
          (this.#reference !== undefined && reference.identity !== this.#reference.identity)) throw new Error();
    } catch (error) {
      if (this.#reference !== undefined || !(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new Error('The agent’s personal folder ownership needs recovery. Existing files were kept.');
      }
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await directory(this.root);
      try { await mkdir(owner, { mode: 0o700 }); }
      catch {
        // A directory without a receipt can be interrupted initialization or lost metadata.
        throw new Error('The agent’s personal folder ownership needs recovery. Existing files were kept.');
      }
      reference = { profileId: this.profileId, path: this.path, identity: randomUUID() };
      await mkdir(this.path, { mode: 0o700 });
      await writeExclusive(join(this.path, PERSONAL_DIRECTORY_MARKER), reference.identity);
      await writeExclusive(receipt, JSON.stringify(reference));
      for (const path of [this.path, owner, this.root, records]) {
        const parent = await open(path, 'r');
        try { await parent.sync(); } finally { await parent.close(); }
      }
    }
    await verifyPersonalDirectory(reference);
    this.#reference = Object.freeze(reference);
    return this.#reference;
  }
}
