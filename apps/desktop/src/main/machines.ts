import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  LocalMachine, OwnedSbxMachine, SbxEngine, SbxImageStore, SbxRegistry, SBX_INITIAL_STORAGE, SBX_INSTALL_VERSION,
  boxWorkspaceMounts, machinePlacement, runtimeImageBuild, sbxCommandRunner,
  type AgentRecord, type Machine, type MachineDetection, type MachineLocation, type MachineReadiness,
  type MachineSpawnRequest, type MachineStartRequest, type MachineTransport, type SbxPtyRunner,
  type SleepingRuntime, type Team,
  type RuntimeImageBuild,
} from '@blobot/core';
import { imageFor } from './runtime-for.js';

/** The shared engine/image service owns no credentials and no global defaults. */
export class DesktopMachines {
  readonly registry: SbxRegistry;
  readonly #imageStores = new Map<string, SbxImageStore>();
  readonly #abort = new AbortController();
  readonly #downloads = new Set<Promise<void>>();
  constructor(readonly directory: string, readonly previewEnabled = process.env['BLOBOT_MACHINES_PREVIEW'] === '1') {
    this.registry = new SbxRegistry(join(directory, 'agents'));
  }

  get executable(): string {
    const installed = join(this.directory, 'engine', SBX_INSTALL_VERSION, 'bin', 'sbx');
    return existsSync(installed) ? installed : 'sbx';
  }
  engine(): SbxEngine { return new SbxEngine(sbxCommandRunner(this.executable)); }
  images(): SbxImageStore {
    const executable = this.executable;
    let images = this.#imageStores.get(executable);
    if (images === undefined) {
      images = new SbxImageStore(join(this.directory, 'images'), sbxCommandRunner(executable, 180_000));
      this.#imageStores.set(executable, images);
    }
    return images;
  }

  async installImage(build: RuntimeImageBuild, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const task = this.images().install(build, { signal: this.#abort.signal });
    this.#downloads.add(task);
    const settled = task.finally(() => this.#downloads.delete(task));
    if (signal === undefined) return settled;
    // Cancelling one Agent releases only its wait. Other Agents may need this same image.
    return new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      settled.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
    });
  }
  async close(): Promise<void> {
    this.#abort.abort();
    await Promise.allSettled([...this.#downloads]);
  }

  forAgent(record: AgentRecord, team: Team): Machine {
    const placement = machinePlacement(record.machine);
    return placement.kind === 'local'
      ? new LocalMachine({ agentId: record.id, workspacePath: record.workspacePath })
      : new DesktopBoxMachine(this, record, team);
  }

  forTeam(records: readonly AgentRecord[], team: Team): ReadonlyMap<string, Machine> {
    return new Map(records.map((record) => [record.id, this.forAgent(record, team)]));
  }
}

/** Preparation is part of start(), so a failed image/setup affects only this Agent. */
export class DesktopBoxMachine implements Machine {
  readonly kind = 'box';
  readonly mailboxHostname = 'host.docker.internal';
  #owned: OwnedSbxMachine | undefined;
  #detection: MachineDetection | undefined;
  constructor(readonly services: DesktopMachines, readonly record: AgentRecord, readonly team: Team) {}

  location(): MachineLocation {
    return this.#owned?.location() ?? { kind: 'box', agentId: this.record.id, workspacePath: this.record.workspacePath,
      volumes: { data: '/home/agent', workspace: null } };
  }
  readiness(): Promise<MachineReadiness> { return this.services.engine().readiness(); }
  async reconcile() {
    const stored = await this.services.registry.read(this.record.id);
    if (stored === undefined) return { state: 'absent' as const, detail: 'This sandbox has not been created.' };
    return (await this.#prepare(false))!.reconcile();
  }
  async start(request: MachineStartRequest): Promise<MachineLocation> {
    if (!this.services.previewEnabled) throw new Error('Sandboxes are awaiting release validation. This build has sandbox preview disabled.');
    request.signal?.throwIfAborted();
    const ready = await this.services.engine().start();
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
    const placement = machinePlacement(this.record.machine);
    if (placement.kind !== 'box') throw new Error('This agent has no sandbox.');
    const stored = await this.services.registry.read(this.record.id);
    if (!forWork && stored === undefined) return undefined;
    const image = imageFor(this.record.runtimeId);
    if (image === undefined) throw new Error('No sandbox software is available for this runtime.');
    const build = runtimeImageBuild(image, process.arch);
    if (build === undefined || (process.platform !== 'darwin' && process.platform !== 'linux')) {
      throw new Error('Sandbox software is not available for this computer.');
    }
    // Retain the recorded configuration for cleanup, even if the original folder has moved.
    // A work start derives/validates the current worktree instead of retargeting a saved mount.
    const kit = !forWork && stored !== undefined ? stored.kit : {
      image: build.reference, guestNode: image.guestNode, dataBytes: SBX_INITIAL_STORAGE.homeBytes,
      dockerBytes: SBX_INITIAL_STORAGE.dockerBytes, sharedSkillLocations: image.sharedSkillLocations,
      workspace: await boxWorkspaceMounts(this.team.workspaceKind, {
        workspacePath: this.team.workspacePath, teamName: this.team.name,
        agentId: this.record.id, agentName: this.record.name,
        ...(this.team.workspaceRepos === undefined ? {} : { repos: this.team.workspaceRepos }),
      }, { agentId: this.record.id, path: this.record.workspacePath }),
    };
    if (forWork) {
      if (stored?.active !== undefined && (stored.active.limits.maxCpus !== placement.limits.maxCpus ||
          stored.active.limits.maxMemoryBytes !== placement.limits.maxMemoryBytes)) {
        throw new Error('The saved resource limits do not match this sandbox. Its data was kept.');
      }
      await this.services.installImage(build, signal);
      // The shared download may be used by peers; cancellation never aborts their install.
      signal?.throwIfAborted();
    }
    const owned = new OwnedSbxMachine({
      agentId: this.record.id, registry: this.services.registry, kit, limits: placement.limits,
      sbxExecutable: this.services.executable,
      transport: { moduleRoot: image.moduleRoot, allowedEnvironment: image.allowedEnvironment },
    });
    // Cleanup must not memoize an unvalidated configuration for a later work start.
    if (forWork) this.#owned = owned;
    return owned;
  }
}
