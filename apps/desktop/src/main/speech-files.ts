import { mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import { totalmem } from 'node:os';
import { join } from 'node:path';
import {
  ENGINE_BUILDS,
  SPEECH_MODELS,
  WHISPER_RELEASE_TAG,
  downloadVerified,
  engineBuildFor,
  type DownloadOutcome,
  type EngineBuild,
  type MachineFacts,
  type SpeechModel,
  type SpeechModelId,
} from '@blobot/core';

/**
 * What blobot has downloaded for a local Transcriber, under `~/.local/share/blobot/speech/`
 * beside worktrees and handoffs — never userData and never a workspace (ticket 09).
 *
 * `models/<file>` for the weights and `bin/<tag>/<asset>` for the engine, each with its
 * `.part` beside it while it is on the way. One download per target at a time; cancel deletes
 * the `.part`, a drop keeps it, and an orphan `.part` from a quit shows as `paused` and counts
 * in *recovers about*.
 */
export type SpeechTarget = SpeechModelId | 'engine';

export type SpeechFileState =
  | { readonly state: 'absent' }
  | { readonly state: 'downloading'; readonly received: number; readonly total?: number }
  | { readonly state: 'paused'; readonly received: number; readonly total?: number }
  | { readonly state: 'failed'; readonly received: number; readonly error: string }
  | { readonly state: 'installed'; readonly bytes: number }
  /** The engine has no pinned hash for this OS yet, so it is not fetched (catalog). */
  | { readonly state: 'unavailable'; readonly reason: string };

export interface SpeechFilesOptions {
  readonly root: string;
  readonly platform?: string;
  readonly arch?: string;
  readonly models?: readonly SpeechModel[];
  readonly engine?: EngineBuild;
  readonly fetch?: typeof fetch;
  /** Told on every change of any target's state. */
  readonly onChange?: (target: SpeechTarget, state: SpeechFileState) => void;
}

interface Live {
  readonly controller: AbortController;
  received: number;
  total?: number;
}

export class SpeechFiles {
  readonly #root: string;
  readonly #models: readonly SpeechModel[];
  readonly #engine: EngineBuild | undefined;
  readonly #fetch: typeof fetch | undefined;
  readonly #onChange: ((target: SpeechTarget, state: SpeechFileState) => void) | undefined;
  readonly #live = new Map<SpeechTarget, Live>();
  readonly #failed = new Map<SpeechTarget, { received: number; error: string }>();

  constructor(options: SpeechFilesOptions) {
    this.#root = options.root;
    this.#models = options.models ?? SPEECH_MODELS;
    this.#engine =
      options.engine ?? engineBuildFor(options.platform ?? process.platform, options.arch ?? process.arch);
    this.#fetch = options.fetch;
    this.#onChange = options.onChange;
  }

  get root(): string {
    return this.#root;
  }

  modelPath(id: SpeechModelId): string | undefined {
    const model = this.#models.find((entry) => entry.id === id);
    return model === undefined ? undefined : join(this.#root, 'models', model.file);
  }

  enginePath(): string | undefined {
    return this.#engine === undefined ? undefined : join(this.#root, 'bin', WHISPER_RELEASE_TAG, this.#engine.asset);
  }

  /** Whether the engine can run on this machine at all: a pinned, downloaded binary. */
  async engineInstalled(): Promise<boolean> {
    const path = this.enginePath();
    return path !== undefined && (await stat(path).catch(() => undefined)) !== undefined;
  }

  async modelInstalled(id: SpeechModelId): Promise<boolean> {
    const path = this.modelPath(id);
    return path !== undefined && (await stat(path).catch(() => undefined)) !== undefined;
  }

  async stateOf(target: SpeechTarget): Promise<SpeechFileState> {
    const live = this.#live.get(target);
    if (live !== undefined) {
      return { state: 'downloading', received: live.received, ...(live.total === undefined ? {} : { total: live.total }) };
    }
    const path = target === 'engine' ? this.enginePath() : this.modelPath(target);
    if (path === undefined) {
      return {
        state: 'unavailable',
        reason: target === 'engine' ? 'no engine is built for this machine yet' : 'not in the catalog',
      };
    }
    if (target === 'engine' && this.#engine?.sha256 === undefined) {
      return { state: 'unavailable', reason: 'the engine for this machine is not pinned yet' };
    }
    const whole = await stat(path).catch(() => undefined);
    if (whole !== undefined) return { state: 'installed', bytes: whole.size };
    const failed = this.#failed.get(target);
    if (failed !== undefined) return { state: 'failed', ...failed };
    const part = await stat(`${path}.part`).catch(() => undefined);
    if (part !== undefined) {
      const total = target === 'engine' ? this.#engine?.bytes : this.#models.find((m) => m.id === target)?.bytes;
      return { state: 'paused', received: part.size, ...(total === undefined ? {} : { total }) };
    }
    return { state: 'absent' };
  }

  /** Every target's state, for the section. */
  async states(): Promise<Record<SpeechTarget, SpeechFileState>> {
    const entries = await Promise.all(
      ([...this.#models.map((model) => model.id), 'engine'] as SpeechTarget[]).map(
        async (target) => [target, await this.stateOf(target)] as const,
      ),
    );
    return Object.fromEntries(entries) as Record<SpeechTarget, SpeechFileState>;
  }

  /**
   * Fetch one target, verified. Resumes a `.part` if there is one. A second call for a target
   * already on the way joins nothing and does nothing: the first is still running.
   */
  async download(target: SpeechTarget): Promise<DownloadOutcome> {
    if (this.#live.has(target)) return { ok: false, kind: 'network', error: 'already downloading', received: 0 };
    const { url, sha256, bytes, to, executable } = this.#requestFor(target) ?? {};
    if (url === undefined || sha256 === undefined || to === undefined) {
      return { ok: false, kind: 'network', error: 'nothing pinned to fetch for this target', received: 0 };
    }
    const live: Live = { controller: new AbortController(), received: 0, ...(bytes === undefined ? {} : { total: bytes }) };
    this.#live.set(target, live);
    this.#failed.delete(target);
    this.#changed(target, { state: 'downloading', received: 0, ...(bytes === undefined ? {} : { total: bytes }) });
    let last = 0;
    const outcome = await downloadVerified({
      url,
      sha256,
      to,
      ...(bytes === undefined ? {} : { bytes }),
      ...(executable === undefined ? {} : { executable }),
      signal: live.controller.signal,
      ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
      onProgress: (received, total) => {
        live.received = received;
        if (total !== undefined) live.total = total;
        // A figure, not a bar: told every megabyte, which is as often as a number can change.
        if (received - last >= 1_000_000 || received === total) {
          last = received;
          this.#changed(target, { state: 'downloading', received, ...(total === undefined ? {} : { total }) });
        }
      },
    });
    this.#live.delete(target);
    if (outcome.ok) this.#changed(target, { state: 'installed', bytes: outcome.bytes });
    else if (outcome.kind === 'checksum') {
      this.#failed.set(target, { received: 0, error: outcome.error });
      this.#changed(target, { state: 'failed', received: 0, error: outcome.error });
    } else if (outcome.kind === 'network') {
      this.#failed.set(target, { received: outcome.received, error: outcome.error });
      this.#changed(target, { state: 'failed', received: outcome.received, error: outcome.error });
    } else this.#changed(target, { state: 'absent' });
    return outcome;
  }

  /** Cancel deletes the `.part`: cancel means *not this*. */
  cancel(target: SpeechTarget): void {
    this.#live.get(target)?.controller.abort();
  }

  /** Remove one target's file, and whatever `.part` sits beside it. Answers the bytes recovered. */
  async remove(target: SpeechTarget): Promise<number> {
    this.cancel(target);
    const path = target === 'engine' ? this.enginePath() : this.modelPath(target);
    if (path === undefined) return 0;
    let recovered = 0;
    for (const file of [path, `${path}.part`]) {
      const size = (await stat(file).catch(() => undefined))?.size ?? 0;
      await rm(file, { force: true });
      recovered += size;
    }
    this.#failed.delete(target);
    this.#changed(target, { state: 'absent' });
    return recovered;
  }

  /** *remove all*: every model, every part, the engine. What the switch prices before it goes. */
  async removeAll(): Promise<number> {
    let recovered = 0;
    for (const model of this.#models) recovered += await this.remove(model.id);
    recovered += await this.remove('engine');
    await rm(join(this.#root, 'bin'), { recursive: true, force: true });
    return recovered;
  }

  /** What is on disk, priced: the switch row's `keeping 2 speech models and the engine · 780 MB`. */
  async footprint(): Promise<{ models: number; engine: boolean; bytes: number }> {
    let bytes = 0;
    let models = 0;
    for (const dir of ['models', join('bin', WHISPER_RELEASE_TAG)]) {
      const at = join(this.#root, dir);
      const names = await readdir(at).catch(() => [] as string[]);
      for (const name of names) {
        const size = (await stat(join(at, name)).catch(() => undefined))?.size ?? 0;
        bytes += size;
        if (dir === 'models' && !name.endsWith('.part')) models += 1;
      }
    }
    return { models, engine: await this.engineInstalled(), bytes };
  }

  /** What the static readiness stage reads, from Node and nothing else. */
  async machineFacts(): Promise<MachineFacts> {
    await mkdir(this.#root, { recursive: true });
    const disk = await statfs(this.#root).catch(() => undefined);
    return {
      totalMemBytes: totalmem(),
      platform: process.platform,
      arch: process.arch,
      freeDiskBytes: disk === undefined ? Number.MAX_SAFE_INTEGER : disk.bavail * disk.bsize,
    };
  }

  #requestFor(
    target: SpeechTarget,
  ): { url: string; sha256?: string; bytes?: number; to: string; executable?: boolean } | undefined {
    if (target === 'engine') {
      const to = this.enginePath();
      if (this.#engine === undefined || to === undefined) return undefined;
      return {
        url: this.#engine.url,
        ...(this.#engine.sha256 === undefined ? {} : { sha256: this.#engine.sha256 }),
        ...(this.#engine.bytes === undefined ? {} : { bytes: this.#engine.bytes }),
        to,
        executable: true,
      };
    }
    const model = this.#models.find((entry) => entry.id === target);
    const to = this.modelPath(target);
    if (model === undefined || to === undefined) return undefined;
    return { url: model.url, sha256: model.sha256, bytes: model.bytes, to };
  }

  #changed(target: SpeechTarget, state: SpeechFileState): void {
    this.#onChange?.(target, state);
  }
}

/** Every build the catalog knows, for the row that says which machines have an engine. */
export const KNOWN_ENGINE_BUILDS = ENGINE_BUILDS;
