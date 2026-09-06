import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  LocalMachine, PersonalDirectories, OwnedSbxMachine, SbxEngine, SbxImageStore, SbxRegistry, SBX_INITIAL_STORAGE, SBX_INSTALL_VERSION, DEFAULT_MACHINE_LIMITS,
  boxWorkspaceMounts, machinePlacement, runtimeImageBuild, sbxCommandRunner,
  sbxKitMismatch,
  type AgentRecord, type Machine, type MachineDetection, type MachineLocation, type MachineReadiness,
  type MachineSpawnRequest, type MachineStartRequest, type MachineTransport, type SbxPtyRunner,
  type SleepingRuntime, type Team,
  type RuntimeImageBuild,
} from '@blobot/core';
import { imageFor } from './runtime-for.js';
import type { SetupProgress } from '../shared/machines.js';

interface ImageRequest {
  build: RuntimeImageBuild;
  abort: AbortController;
  task: Promise<void>;
  waiters: number;
  progress: Set<(received: number, total?: number) => void>;
  last?: { received: number; total?: number };
}

/** The shared engine/image service owns no credentials and no global defaults. */
export class DesktopMachines {
  readonly registry: SbxRegistry;
  readonly personal: PersonalDirectories;
  readonly #imageStores = new Map<string, SbxImageStore>();
  readonly #abort = new AbortController();
  readonly #downloads = new Set<Promise<void>>();
  readonly #imageRequests = new Map<string, ImageRequest>();
  constructor(readonly directory: string, readonly previewEnabled = process.env['BLOBOT_MACHINES_PREVIEW'] === '1', readonly changed: () => void = () => {},
    personalRoot = join(dirname(directory), 'profiles')) {
    this.registry = new SbxRegistry(join(directory, 'agents'));
    this.personal = new PersonalDirectories(personalRoot);
  }

  get executable(): string {
    const installed = join(this.directory, 'engine', SBX_INSTALL_VERSION, 'bin', 'sbx');
    return existsSync(installed) ? installed : 'sbx';
  }
  engine(signal?: AbortSignal): SbxEngine { return new SbxEngine(sbxCommandRunner(this.executable), signal); }
  images(): SbxImageStore {
    const executable = this.executable;
    let images = this.#imageStores.get(executable);
    if (images === undefined) {
      images = new SbxImageStore(join(this.directory, 'images'), sbxCommandRunner(executable, 180_000));
      this.#imageStores.set(executable, images);
    }
    return images;
  }

  async installImage(build: RuntimeImageBuild, signal?: AbortSignal, onProgress?: (received: number, total?: number) => void): Promise<void> {
    signal?.throwIfAborted();
    this.#abort.signal.throwIfAborted();
    let request = this.#imageRequests.get(build.reference);
    if (request?.abort.signal.aborted) {
      await request.task.catch(() => {});
      return this.installImage(build, signal, onProgress);
    }
    if (request !== undefined && (request.build.sha256 !== build.sha256 || request.build.imageId !== build.imageId ||
        request.build.bytes !== build.bytes || request.build.arch !== build.arch)) throw new Error('Sandbox software pins disagree.');
    if (request === undefined) {
      const entry: ImageRequest = { build, abort: new AbortController(), task: Promise.resolve(), waiters: 0, progress: new Set() };
      entry.task = this.images().install(build, { signal: AbortSignal.any([this.#abort.signal, entry.abort.signal]),
        onProgress: (received, total) => {
          entry.last = { received, ...(total === undefined ? {} : { total }) };
          for (const listener of entry.progress) listener(received, total);
        },
      }).finally(() => { this.#imageRequests.delete(build.reference); this.#downloads.delete(entry.task); });
      this.#downloads.add(entry.task);
      this.#imageRequests.set(build.reference, entry);
      request = entry;
    }
    const entry = request;
    entry.waiters += 1;
    if (onProgress !== undefined) { entry.progress.add(onProgress); if (entry.last) onProgress(entry.last.received, entry.last.total); }
    // Only the final departing Agent cancels the shared transfer; peers keep their progress.
    return new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      entry.task.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
      if (signal?.aborted) abort();
    }).finally(() => {
      if (onProgress) entry.progress.delete(onProgress);
      if (--entry.waiters === 0) entry.abort.abort();
    });
  }
  async close(): Promise<void> {
    this.#abort.abort();
    await Promise.allSettled([...this.#downloads]);
  }

  forAgent(record: AgentRecord, team: Team): Machine {
    const placement = machinePlacement(record.machine);
    return placement.kind === 'local'
      ? new LocalMachine({ agentId: record.id, workspacePath: record.workspacePath },
        record.profileId === undefined ? {} : { personalDirectory: this.personal.forProfile(record.profileId) })
      : new DesktopBoxMachine(this, record, team);
  }

  forTeam(records: readonly AgentRecord[], team: Team): ReadonlyMap<string, Machine> {
    // Cleanup must remain available for corrupt placement rows. The wrapper's start still
    // validates the choice; stop/destroy consult only the separately verified ownership journal.
    return new Map(records.map((record) => [record.id, record.machine?.kind === 'invalid'
      ? new DesktopBoxMachine(this, record, team) : this.forAgent(record, team)]));
  }
}

/** Preparation is part of start(), so a failed image/setup affects only this Agent. */
export class DesktopBoxMachine implements Machine {
  readonly kind = 'box';
  readonly mailboxHostname = 'host.docker.internal';
  #owned: OwnedSbxMachine | undefined;
  #detection: MachineDetection | undefined;
  #preparation: SetupProgress | undefined;
  #storage: { readonly homeBytes: number; readonly softwareBytes: number } | undefined;
  constructor(readonly services: DesktopMachines, readonly record: AgentRecord, readonly team: Team) {}

  get runtimeAccess() {
    return { lastDetection: this.#detection, check: () => this.checkRuntime(), beforeStart: () => this.beforeRuntimeStart() };
  }
  get preparation(): SetupProgress | undefined { return this.#preparation; }
  get storage() { return this.#storage; }

  location(): MachineLocation {
    return this.#owned?.location() ?? { kind: 'box', agentId: this.record.id, workspacePath: this.record.workspacePath,
      ...(this.record.profileId === undefined ? {} : { personalPath: this.services.personal.forProfile(this.record.profileId).path }),
      volumes: { data: '/home/agent', workspace: null } };
  }
  readiness(): Promise<MachineReadiness> { return this.services.engine().readiness(); }
  async reconcile() {
    const stored = await this.services.registry.read(this.record.id);
    if (stored === undefined) return { state: 'absent' as const, detail: 'This sandbox has not been created.' };
    return (await this.#prepare(false))!.reconcile();
  }
  async start(request: MachineStartRequest): Promise<MachineLocation> {
    if (machinePlacement(this.record.machine).kind !== 'box') throw new Error('This agent has no sandbox.');
    if (!this.services.previewEnabled) throw new Error('Sandboxes are awaiting release validation. This build has sandbox preview disabled.');
    request.signal?.throwIfAborted();
    const status = await this.services.engine(request.signal).readiness();
    if (status.state === 'not_installed') throw new Error('Sandboxes need to be set up. Open Settings → Machines.');
    const ready = await this.services.engine(request.signal).start();
    request.signal?.throwIfAborted();
    if (ready.state !== 'ready') throw new Error(ready.detail);
    const owned = (await this.#prepare(true, request.signal))!;
    request.signal?.throwIfAborted();
    return owned.start(request);
  }
  async beforeWork(): Promise<void> {
    if (this.#owned === undefined) throw new Error('This sandbox has not started.');
    await this.#owned.beforeWork();
  }
  spawn(request: MachineSpawnRequest): MachineTransport {
    if (this.#owned === undefined) throw new Error('This sandbox has not started.');
    return this.#owned.spawn(request);
  }
  async stop(): Promise<void> { await (await this.#prepare(false))?.stop(); }
  async destroy(): Promise<void> { await (await this.#prepare(false))?.destroy(); }
  async measure(): Promise<number | null> {
    const owned = await this.#prepare(false);
    return owned === undefined ? 0 : owned.measure();
  }
  async detectRuntime(execution: SleepingRuntime): Promise<MachineDetection> {
    if (this.#owned !== undefined) return this.#owned.detectRuntime(this.record.runtimeId, execution);
    return { subject: { kind: 'agent', agentId: this.record.id }, readiness: 'unknown', detail: 'This sandbox has not started.' };
  }
  get lastDetection(): MachineDetection | undefined { return this.#detection; }
  async checkRuntime(): Promise<MachineDetection> {
    if (this.#owned === undefined) throw new Error('This sandbox has not started.');
    this.#detection = await this.#owned.checkRuntime(this.record.runtimeId);
    return this.#detection;
  }
  async beforeRuntimeStart(): Promise<void> {
    const detection = await this.checkRuntime();
    if (detection.readiness === 'needs_sign_in' || detection.readiness === 'not_installed') {
      throw new Error(detection.detail);
    }
  }
  async signInRuntime(perform: SbxPtyRunner) {
    if (this.#owned === undefined) throw new Error('This sandbox has not started.');
    return this.#owned.signInRuntime(this.record.runtimeId, perform);
  }

  async #prepare(forWork: boolean, signal?: AbortSignal): Promise<OwnedSbxMachine | undefined> {
    signal?.throwIfAborted();
    if (this.#owned !== undefined) return this.#owned;
    const stored = await this.services.registry.read(this.record.id);
    if (!forWork) {
      if (stored === undefined) return undefined;
      return new OwnedSbxMachine({ agentId: this.record.id, registry: this.services.registry, kit: stored.kit,
        limits: stored.active?.limits ?? stored.pending?.limits ?? stored.retained[0]?.limits ?? DEFAULT_MACHINE_LIMITS,
        sbxExecutable: this.services.executable, transport: { moduleRoot: '/', allowedEnvironment: [] } });
    }
    const placement = machinePlacement(this.record.machine);
    if (placement.kind !== 'box') throw new Error('This agent has no sandbox.');
    const image = imageFor(this.record.runtimeId);
    if (image === undefined) throw new Error('No sandbox software is available for this runtime.');
    const build = runtimeImageBuild(image, process.arch);
    if (build === undefined || (process.platform !== 'darwin' && process.platform !== 'linux')) {
      throw new Error('Sandbox software is not available for this computer.');
    }
    // Work validates the current worktree without retargeting a saved skills mount.
    const kit = {
      image: build.reference, guestNode: image.guestNode, dataBytes: SBX_INITIAL_STORAGE.homeBytes,
      dockerBytes: SBX_INITIAL_STORAGE.dockerBytes, sharedSkillLocations: image.sharedSkillLocations,
      workspace: { ...await boxWorkspaceMounts(this.team.workspaceKind, {
        workspacePath: this.team.workspacePath, teamName: this.team.name,
        agentId: this.record.id, agentName: this.record.name,
        ...(this.team.workspaceRepos === undefined ? {} : { repos: this.team.workspaceRepos }),
      }, { agentId: this.record.id, path: this.record.workspacePath }, stored === undefined ? 'operator' : 'none'),
      ...(stored?.kit.workspace?.sharedSkillsPath === undefined ? {} : { sharedSkillsPath: stored.kit.workspace.sharedSkillsPath }) },
    };
    this.#storage = { homeBytes: kit.dataBytes, softwareBytes: kit.dockerBytes ?? SBX_INITIAL_STORAGE.dockerBytes };
    if (forWork) {
      if (stored !== undefined) {
        const mismatch = sbxKitMismatch(stored.kit, kit);
        if (mismatch !== undefined) throw new Error(mismatch);
      }
      if (stored?.active !== undefined && (stored.active.limits.maxCpus !== placement.limits.maxCpus ||
          stored.active.limits.maxMemoryBytes !== placement.limits.maxMemoryBytes)) {
        throw new Error('The saved resource limits do not match this sandbox. Its data was kept.');
      }
      let lastProgressAt = 0;
      try {
        this.#preparation = { id: this.record.id, phase: 'starting', detail: 'Preparing this agent’s sandbox software…' };
        this.services.changed();
        await this.services.installImage(build, signal, (received, total) => {
          const now = Date.now();
          if (now - lastProgressAt < 1000 && received !== total) return;
          lastProgressAt = now;
          this.#preparation = { id: this.record.id, phase: 'downloading', detail: 'Downloading sandbox software…', received,
            ...(total === undefined ? {} : { total }) };
          this.services.changed();
        });
      } finally { this.#preparation = undefined; this.services.changed(); }
      // The shared download may be used by peers; cancellation never aborts their install.
      signal?.throwIfAborted();
    }
    const owned = new OwnedSbxMachine({
      agentId: this.record.id, registry: this.services.registry, kit, limits: placement.limits,
      ...(this.record.profileId === undefined ? {} : { personalDirectory: this.services.personal.forProfile(this.record.profileId) }),
      sbxExecutable: this.services.executable,
      transport: { moduleRoot: image.moduleRoot, allowedEnvironment: image.allowedEnvironment },
    });
    // Cleanup must not memoize an unvalidated configuration for a later work start.
    if (forWork) this.#owned = owned;
    return owned;
  }
}
