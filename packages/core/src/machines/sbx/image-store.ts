import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { downloadVerified } from '../../speech/download.js';
import type { MachineReadiness } from '../machine.js';
import type { RuntimeImageBuild } from '../runtime-image.js';
import { sbxCommandRunner, type SbxCommandRunner } from './engine.js';

const exec = promisify(execFile);
const sha = /^[a-f0-9]{64}$/;
function validate(build: RuntimeImageBuild): void {
  if (!['arm64', 'amd64'].includes(build.arch) || !/^blobot-machine-[a-z0-9-]+:[a-z0-9-]+$/.test(build.reference)
    || !sha.test(build.sha256) || !/^sha256:[a-f0-9]{64}$/.test(build.imageId)
    || !Number.isSafeInteger(build.bytes) || build.bytes <= 0) throw new Error('Runtime download is not pinned.');
  const url = new URL(build.url);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid runtime download URL.');
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Incomplete runtime image response.');
  return value as Record<string, unknown>;
}
async function digest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Validate the single-image OCI archive that our build exports, without extracting to disk. */
export async function verifyRuntimeImageArchive(file: string, build: RuntimeImageBuild): Promise<void> {
  validate(build);
  const read = async (member: string) => (await exec('tar', ['-xOf', file, member], { timeout: 30_000, maxBuffer: 2 * 1024 ** 2 })).stdout;
  const index = object(JSON.parse(await read('index.json')));
  if (!Array.isArray(index['manifests']) || index['manifests'].length !== 1) throw new Error('Runtime archive must contain one image.');
  const entry = object(index['manifests'][0]);
  const annotations = object(entry['annotations']);
  if (entry['digest'] !== build.imageId || annotations['io.containerd.image.name'] !== `docker.io/library/${build.reference}`) {
    throw new Error('Runtime archive reference does not match the pin.');
  }
  const manifestBytes = await read(`blobs/sha256/${build.imageId.slice(7)}`);
  if (createHash('sha256').update(manifestBytes).digest('hex') !== build.imageId.slice(7)) throw new Error('Runtime manifest digest mismatch.');
  const manifest = object(JSON.parse(manifestBytes));
  const configDigest = object(manifest['config'])['digest'];
  if (typeof configDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(configDigest)) throw new Error('Runtime config digest is absent.');
  const configBytes = await read(`blobs/sha256/${configDigest.slice(7)}`);
  if (createHash('sha256').update(configBytes).digest('hex') !== configDigest.slice(7)) throw new Error('Runtime config digest mismatch.');
  const config = object(JSON.parse(configBytes));
  const settings = object(config['config']);
  if (config['architecture'] !== build.arch || config['os'] !== 'linux' || settings['User'] !== 'agent' ||
      object(settings['Labels'])['com.docker.sandboxes.start-docker'] !== 'false') {
    throw new Error('Runtime archive architecture, user or Docker storage contract does not match.');
  }
  // Docker-compatible metadata must agree too; template load must not introduce extra tags.
  const legacy: unknown = JSON.parse(await read('manifest.json'));
  if (!Array.isArray(legacy) || legacy.length !== 1 || JSON.stringify(object(legacy[0])['RepoTags']) !== JSON.stringify([build.reference])) {
    throw new Error('Runtime archive contains unexpected tags.');
  }
  const docker = object(legacy[0]);
  const layers = manifest['layers'];
  if (!Array.isArray(layers) || docker['Config'] !== `blobs/sha256/${configDigest.slice(7)}` ||
      JSON.stringify(docker['Layers']) !== JSON.stringify(layers.map(layer => {
        const digest = object(layer)['digest'];
        if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid runtime layer digest.');
        return `blobs/sha256/${digest.slice(7)}`;
      }))) throw new Error('Runtime archive metadata disagrees about its contents.');
}

export interface InstallRuntimeImageOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (received: number, total: number | undefined) => void;
}

/** Shared runtime images outlive Agents. Agent removal never calls this service to delete one. */
export class SbxImageStore {
  readonly #pending = new Map<string, { build: RuntimeImageBuild; task: Promise<void> }>();
  constructor(readonly cacheDirectory: string, readonly run: SbxCommandRunner = sbxCommandRunner('sbx', 180_000),
    readonly fetcher: typeof fetch = fetch) {}

  async readiness(build: RuntimeImageBuild | undefined): Promise<MachineReadiness> {
    if (build === undefined) return { state: 'not_installed', detail: 'No verified runtime download is available yet.' };
    try {
      validate(build);
      const row = await this.row(build);
      if (row === undefined) return { state: 'not_installed', detail: 'Runtime is not installed in the sandbox engine.' };
      this.matches(row, build);
      return { state: 'ready' };
    } catch { return { state: 'unknown', detail: 'The sandbox runtime could not be verified.' }; }
  }

  install(build: RuntimeImageBuild | undefined, options: InstallRuntimeImageOptions = {}): Promise<void> {
    if (build === undefined) return Promise.reject(new Error('No verified runtime download is available yet.'));
    try { validate(build); options.signal?.throwIfAborted(); } catch (error) { return Promise.reject(error); }
    const pending = this.#pending.get(build.reference);
    if (pending) {
      if (pending.build.sha256 !== build.sha256 || pending.build.imageId !== build.imageId ||
          pending.build.arch !== build.arch || pending.build.bytes !== build.bytes) {
        return Promise.reject(new Error('An install with different runtime pins is already in progress.'));
      }
      return pending.task;
    }
    const task = this.installOne(build, options).finally(() => this.#pending.delete(build.reference));
    this.#pending.set(build.reference, { build, task });
    return task;
  }

  private async installOne(build: RuntimeImageBuild, options: InstallRuntimeImageOptions): Promise<void> {
    options.signal?.throwIfAborted();
    const existing = await this.row(build);
    if (existing !== undefined) { this.matches(existing, build); return; }
    await mkdir(this.cacheDirectory, { recursive: true });
    const file = join(this.cacheDirectory, `${build.sha256}.tar`);
    const cached = await stat(file).catch(() => undefined);
    if (cached?.size !== build.bytes || await digest(file) !== build.sha256) {
      if (cached !== undefined) await rm(file);
      const result = await downloadVerified({ url: build.url, sha256: build.sha256, bytes: build.bytes, to: file,
        ...options, fetch: this.fetcher });
      if (!result.ok) throw new Error(result.kind === 'cancelled' ? 'Runtime download cancelled.' : result.error);
    }
    options.signal?.throwIfAborted();
    await verifyRuntimeImageArchive(file, build);
    // Recheck after a long download; never overwrite a different image that appeared meanwhile.
    const appeared = await this.row(build);
    if (appeared !== undefined) { this.matches(appeared, build); return; }
    options.signal?.throwIfAborted();
    const loaded = await this.run(['template', 'load', file]);
    if (loaded.code !== 0 || loaded.missing) throw new Error('Runtime could not be loaded into the sandbox engine.');
    const installed = await this.row(build);
    if (installed === undefined) throw new Error('Loaded runtime was not found in the sandbox engine.');
    this.matches(installed, build);
  }

  private async row(build: RuntimeImageBuild): Promise<Record<string, unknown> | undefined> {
    const result = await this.run(['template', 'ls', '--json']);
    if (result.code !== 0 || result.missing) throw new Error('Sandbox image store did not answer.');
    const inventory = object(JSON.parse(result.stdout));
    if (!Array.isArray(inventory['images'])) throw new Error('Sandbox image inventory is incomplete.');
    const [repository, tag] = build.reference.split(':');
    const rows = inventory['images'].map(object).filter(row => row['repository'] === `docker.io/library/${repository}` && row['tag'] === tag);
    if (rows.length > 1) throw new Error('Sandbox runtime reference is ambiguous.');
    return rows[0];
  }

  private matches(row: Record<string, unknown>, build: RuntimeImageBuild): void {
    // RC5 exposes an abbreviated manifest digest. Archive SHA is checked in full before load.
    const id = row['id'];
    if (typeof id !== 'string' || !/^[a-f0-9]{12,64}$/.test(id) || !build.imageId.slice(7).startsWith(id)) {
      throw new Error('A different runtime occupies the expected reference.');
    }
  }
}
