import { detectAgentRuntime, type MachineDetection } from '../../detect/machine-runtime.js';
import { RUNTIME_PROBES, type CommandRunner, type RuntimeDetection } from '../../detect/runtimes.js';
import { remedyFor } from '../../detect/remedies.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBoxMountPaths } from '../../workspace/box-mounts.js';
import type { Machine, MachineLocation, MachineReadiness, MachineSpawnRequest, MachineStartRequest, MachineTransport } from '../machine.js';
import { machineLimits, sameMachineLimits, type MachineLimits } from '../resources.js';
import { sbxClientEnvironment } from './client-environment.js';
import { SbxEngine, sbxCommandRunner, type SbxCommandRunner, type SbxPtyRunner } from './engine.js';
import type { SleepingRuntime } from '../sleeping-runtime.js';
import { SBX_RUNTIME_PROBE } from './runtime-probe.js';
import { copySbxData, type SbxReference } from './data-transfer.js';
import { renderSbxKit, sbxKitMismatch, sbxNameFor, type SbxKitOptions } from './kit.js';
import { SBX_BOUNDARY_PROBE, verifySbxBoundary, verifySbxMailboxRule, verifySbxOpenNetworkRule, verifySbxReference, verifySbxNetworkRules, verifySbxNetworkCheck, verifySbxStopped, readSbxNetworkRules } from './observations.js';
import { SbxRegistry, type OwnedSbx, type SbxRecord } from './registry.js';
import { spawnSbxTransport, type SbxExecOptions } from './transport.js';

export interface OwnedSbxMachineOptions {
  readonly agentId: string;
  readonly registry: SbxRegistry;
  readonly kit: SbxKitOptions;
  readonly limits: MachineLimits;
  readonly transport: Omit<SbxExecOptions, 'sandboxName' | 'guestNode' | 'sbxExecutable'>;
  readonly sbxExecutable?: string;
  readonly commandTimeoutMs?: number;
  readonly run?: SbxCommandRunner;
}

/**
 * Owned RC5 lifecycle, selected by DesktopMachines behind the explicit development preview gate.
 * Host mounts are the AgentWorkspace, its approved shared Git directories and read-only skills.
 * No daemon/global-settings mutations or credential imports. Existing resource limits remain fixed
 * until complete-state preservation is supported by the engine.
 */
export class OwnedSbxMachine implements Machine {
  readonly kind = 'box';
  readonly mailboxHostname = 'host.docker.internal';
  readonly #options: OwnedSbxMachineOptions;
  readonly #location: MachineLocation;
  readonly #engineClient: SbxEngine;
  readonly #runner: SbxCommandRunner;
  readonly #transports = new Set<MachineTransport>();
  #active: OwnedSbx | undefined;
  #started = false;
  #exclusive = false;
  #release: (() => Promise<void>) | undefined;
  #safeToRelease = true;
  #signal: AbortSignal | undefined;

  constructor(options: OwnedSbxMachineOptions) {
    sbxNameFor(options.agentId);
    renderSbxKit(options.kit);
    machineLimits(options.limits);
    if (options.commandTimeoutMs !== undefined && (!Number.isSafeInteger(options.commandTimeoutMs) || options.commandTimeoutMs < 1)) {
      throw new Error('Invalid sandbox command timeout.');
    }
    this.#options = { ...options, kit: Object.freeze({ ...options.kit,
      ...(options.kit.sharedSkillLocations === undefined ? {} : { sharedSkillLocations: Object.freeze([...options.kit.sharedSkillLocations]) }),
      ...(options.kit.workspace === undefined ? {} : { workspace: Object.freeze({ ...options.kit.workspace,
        commonGit: Object.freeze([...options.kit.workspace.commonGit]) }) }),
    }), limits: machineLimits(options.limits) };
    this.#runner = options.run ?? sbxCommandRunner(options.sbxExecutable, options.commandTimeoutMs);
    this.#engineClient = new SbxEngine(this.#runner);
    this.#location = Object.freeze({ agentId: options.agentId, kind: 'box', workspacePath: options.kit.workspace?.path ?? '/workspace',
      ...(options.kit.workspace?.sharedSkillsPath === undefined ? {} : { sharedSkillsPath: options.kit.workspace.sharedSkillsPath }),
      volumes: Object.freeze({ data: '/home/agent', workspace: options.kit.workspace === undefined ? '/workspace' : null }) });
  }
  location(): MachineLocation { return this.#location; }

  /** Status only. Never use settings/diagnose/guest exec merely to paint a screen. */
  async readiness(): Promise<MachineReadiness> {
    return this.#engineClient.readiness();
  }

  /** Bound to this Agent; neither host PATH nor the host login memo participates. */
  async detectRuntime(runtimeId: string, execution: Pick<SleepingRuntime, 'agentId' | 'inspect' | 'power'>): Promise<MachineDetection> {
    if (execution.agentId !== this.#options.agentId) throw new Error('Runtime detection belongs to a different Agent.');
    return detectAgentRuntime({ agentId: this.#options.agentId, runtimeId, power: () => execution.power,
      inspect: (read) => execution.inspect(() => this.#locked(async () => {
        if (!this.#started || this.#active === undefined) throw new Error('Machine is not awake.');
        // Never ask settings or execute inside a known-stopped guest just to render readiness.
        if ((await this.#json(['daemon', 'status', '--json']))['status'] !== 'running') throw new Error('Engine is stopped.');
        const inventory = await this.#json(['ls', '--json']);
        verifySbxReference(inventory, this.#active);
        const boxes = inventory['sandboxes'] as Record<string, unknown>[];
        if (boxes.find((box) => box['id'] === this.#active?.id)?.['status'] !== 'running') throw new Error('Machine is stopped.');
        return read();
      })),
      run: this.#probeRuntime,
    });
  }

  /** Explicit launch/sign-in already owns the execution transition; no nested inspection lock. */
  async checkRuntime(runtimeId: string): Promise<MachineDetection> {
    return this.detectRuntime(runtimeId, { agentId: this.#options.agentId,
      power: this.#started ? 'awake' : 'asleep', inspect: async (read) => read() });
  }

  /** Explicit sign-in before an Agent runtime launches. The watched PTY stays opaque. */
  async signInRuntime(runtimeId: string, perform: SbxPtyRunner): Promise<{ readonly completed: boolean; readonly detection: MachineDetection }> {
    return this.#locked(async () => {
      if (!this.#started || this.#active === undefined || this.#transports.size !== 0) {
        throw new Error('Open this Machine without an active Agent execution before signing in.');
      }
      const probe = RUNTIME_PROBES.find((value) => value.runtimeId === runtimeId);
      if (probe === undefined) throw new Error('Unknown runtime.');
      await this.#engine();
      await this.#boundary(this.#active);
      const detection: RuntimeDetection = { runtimeId, label: probe.label, supported: probe.supported,
        executablePath: probe.binary, readiness: 'unknown', detail: '' };
      const remedy = remedyFor(detection, 'sign_in', 'linux');
      if (remedy === undefined) throw new Error('No sign-in remedy is available.');
      let completed = false;
      try {
        await perform({ args: ['exec', '-it', '-u', '1000', '-w', '/home/agent', this.#active.name, ...remedy.argv],
          env: sbxClientEnvironment() });
        completed = true;
      } catch {
        // Abandonment is reported separately from what the fresh probe can establish.
      } finally {
        // A failed or abandoned PTY is not permission to keep stale engine readiness.
        await this.#engine();
        await this.#identity(this.#active);
      }
      return { completed, detection: await detectAgentRuntime({ agentId: this.#options.agentId, runtimeId, power: () => 'awake',
        inspect: async (read) => read(), run: this.#probeRuntime }) };
    });
  }

  readonly #probeRuntime: CommandRunner = async (command, args, options) => {
    if (!this.#started || this.#active === undefined) throw new Error('Machine is not awake.');
    const value = await this.#json(['exec', '-u', '1000', this.#active.name, this.#options.kit.guestNode, '-e', SBX_RUNTIME_PROBE,
      JSON.stringify({ command, args, timeoutMs: options?.timeoutMs ?? 5000 })]);
    if (value['protocol'] !== 'blobot-runtime-probe-v1' || !Number.isInteger(value['code']) ||
        typeof value['stdout'] !== 'string' || value['stderr'] !== '') throw new Error('Runtime probe could not be read.');
    return { code: value['code'] as number, stdout: value['stdout'], stderr: '' };
  };
  async reconcile() {
    const record = await this.#options.registry.read(this.#options.agentId);
    if (record === undefined) return { state: 'absent' as const, detail: 'No owned sandbox is recorded.' };
    if (record.pending !== undefined) return { state: 'lost' as const,
      detail: record.active === undefined ? 'Sandbox creation was interrupted. Retry to verify its recorded state. Existing data was kept.'
        : 'A sandbox replacement was interrupted. Existing data was kept for recovery.' };
    const mismatch = sbxKitMismatch(record.kit, this.#options.kit);
    if (mismatch !== undefined) return { state: 'lost' as const, detail: mismatch };
    if (record.active === undefined) return { state: 'absent' as const, detail: 'No owned sandbox is recorded.' };
    try {
      await this.#identity(record.active);
      return { state: 'ok' as const, location: this.#location };
    } catch {
      return { state: 'lost' as const, detail: 'The recorded sandbox needs recovery. Existing data was kept.' };
    }
  }
  async start(request: MachineStartRequest): Promise<MachineLocation> {
    request.signal?.throwIfAborted();
    if (!Number.isInteger(request.mailboxPort) || request.mailboxPort < 1 || request.mailboxPort > 65535) throw new Error('Invalid mailbox port.');
    if (request.runtime !== undefined && request.runtime.image !== this.#options.kit.image) {
      throw new Error('The runtime image does not match this Machine.');
    }
    return this.#locked(async () => {
      this.#signal = request.signal;
      let active: OwnedSbx | undefined;
      try {
        await this.#engine();
        request.signal?.throwIfAborted();
        let record = await this.#record(true);
        active = record.active;
        if (active === undefined) {
          active = await this.#create(record, this.#options.limits);
          record = { ...record, active };
          await this.#options.registry.save(record);
        }
        request.signal?.throwIfAborted();
        this.#safeToRelease = false;
        await this.#boundary(active);
        record = await this.#revokeNetwork(record);
        const before = await this.#rules(active);
        verifySbxNetworkRules(before, true);
        await this.#run(['policy', 'allow', 'network', '--sandbox', active.name, '**']);
        const after = await this.#rules(active);
        const added = after.filter((rule) => !before.some((prior) => prior['id'] === rule['id']));
        if (added.length !== 1 || typeof added[0]?.['id'] !== 'string') throw new Error('Network permission creation could not be verified.');
        const network = { id: added[0]['id'], mailboxPort: request.mailboxPort };
        verifySbxOpenNetworkRule(added[0], active.name, network);
        await this.#options.registry.save({ ...record, network });
        verifySbxNetworkRules(after.filter((rule) => rule['id'] !== network.id), true);
        await this.#networkChecks(active, network.mailboxPort);
        await this.#identity(active);
        request.signal?.throwIfAborted();
        this.#active = active;
        this.#started = true;
        return this.#location;
      } catch (error) {
        this.#started = false;
        if (active === undefined) throw error;
        const reference = active;
        await this.#cleanup(() => this.#stopOwned(reference)).then(() => { this.#safeToRelease = true; }).catch(() => {});
        throw new Error('This Machine could not start safely. Its stored data was kept.');
      } finally { this.#signal = undefined; }
    });
  }

  spawn(request: MachineSpawnRequest): MachineTransport {
    if (!this.#started || this.#exclusive || this.#active === undefined) throw new Error('The Machine must be started before launching a process.');
    const channel = spawnSbxTransport({ ...this.#options.transport, sandboxName: this.#active.name,
      guestNode: this.#options.kit.guestNode,
      ...(this.#options.sbxExecutable === undefined ? {} : { sbxExecutable: this.#options.sbxExecutable }),
    }, request);
    this.#transports.add(channel);
    channel.onClose(() => this.#transports.delete(channel));
    return channel;
  }
  async beforeWork(): Promise<void> {
    await this.#locked(async () => {
      if (!this.#started || this.#active === undefined) throw new Error('This Machine is not awake.');
      await this.#engine();
      const record = await this.#record();
      if (this.#options.kit.workspace !== undefined) await verifyBoxMountPaths(this.#options.kit.workspace);
      if (record.active?.id !== this.#active.id || record.network === undefined) throw new Error('Machine configuration changed.');
      const rules = await this.#rules(this.#active);
      const network = rules.filter((rule) => rule['id'] === record.network?.id);
      if (network.length !== 1) throw new Error('The network permission is unavailable.');
      verifySbxOpenNetworkRule(network[0], this.#active.name, record.network);
      verifySbxNetworkRules(rules.filter((rule) => rule['id'] !== record.network?.id), true);
      await this.#networkChecks(this.#active, record.network.mailboxPort);
    });
  }
  async stop(): Promise<void> {
    await this.#locked(async () => {
      this.#started = false;
      const closed = await Promise.allSettled([...this.#transports].map((channel) => channel.close()));
      this.#transports.clear();
      let record = await this.#options.registry.read(this.#options.agentId);
      if (record?.pending !== undefined && record.pending.id === undefined) record = await this.#clearAbsentCreation(record);
      if (record?.pending !== undefined) {
        if (record.pending.id === undefined) throw new Error('An interrupted Machine creation needs recovery before its power can be confirmed.');
        await this.#stopOwned({ name: record.pending.name, id: record.pending.id });
      }
      if (record?.active !== undefined) {
        await this.#stopOwned(record.active);
        await this.#revokeNetwork(record);
      }
      this.#safeToRelease = true;
      if (closed.some((result) => result.status === 'rejected')) throw new Error('Some Agent channels could not close.');
    });
  }
  /** Called only after the Workspace owner has preserved work and the user requested removal. */
  async destroy(): Promise<void> {
    if (this.#options.kit.workspace === undefined) throw new Error('Machine data removal awaits Workspace preservation integration. No data was deleted.');
    await this.#locked(async () => {
      if (this.#started || this.#transports.size !== 0) throw new Error('Stop this Machine before deleting its data.');
      const stored = await this.#options.registry.read(this.#options.agentId);
      if (stored === undefined) return;
      let record = stored.pending?.id === undefined ? await this.#clearAbsentCreation(stored) : stored;
      const mismatch = sbxKitMismatch(record.kit, this.#options.kit);
      if (mismatch !== undefined) throw new Error(mismatch);
      await this.#engine();
      record = await this.#revokeNetwork(record);
      if (record.pending !== undefined) {
        if (record.pending.id === undefined) throw new Error('The interrupted sandbox has no verified identity. Its data was kept.');
        await this.#removeOwned({ name: record.pending.name, id: record.pending.id });
        const { pending: _pending, ...kept } = record;
        record = kept;
        await this.#options.registry.save(record);
      }
      // Save each completed removal so an interrupted deletion can continue from its journal.
      for (const reference of [...record.retained, ...record.active === undefined ? [] : [record.active]]) {
        await this.#removeOwned(reference);
        const { active, ...rest } = record;
        record = { ...rest, ...(active?.id === reference.id || active === undefined ? {} : { active }),
          retained: record.retained.filter((box) => box.id !== reference.id) };
        await this.#options.registry.save(record);
      }
      await this.#options.registry.remove(this.#options.agentId);
      this.#active = undefined;
      this.#safeToRelease = true;
    });
  }
  async measure(): Promise<number | null> { return null; } // no verified engine-owned byte metric

  /**
   * Caller closes the Agent runtime after any busy-work warning/confirmation, then calls this.
   * Any open channel refuses. Whole-VM stop quiesces leftover application writers before copy.
   * The original stays recorded and stopped after cutover; it is never automatically deleted.
   */
  async reconfigure(limits: MachineLimits, options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {}): Promise<void> {
    const desired = machineLimits(limits);
    if (options.signal?.aborted) throw new Error('Machine reconfiguration was cancelled.');
    await this.#locked(async () => {
      if (this.#transports.size !== 0) throw new Error('Close this Agent execution before changing its resource limits.');
      await this.#engine();
      let record = await this.#record();
      const original = record.active;
      if (original === undefined) throw new Error('This Machine has not been created.');
      if (sameMachineLimits(original.limits, desired)) return;
      // A mounted Workspace needs no copy. The remaining private system/Docker state must
      // be preserved by the image contract before replacement is admitted.
      if (this.#options.kit.workspace !== undefined || this.#options.kit.dockerBytes !== undefined) {
        throw new Error('Resource changes await complete Machine state preservation. The Machine was kept.');
      }
      this.#started = false;
      await this.#identity(original);
      record = await this.#revokeNetwork(record);
      await this.#stopOwned(original);
      this.#safeToRelease = true;
      let candidate: OwnedSbx | undefined;
      try {
        if (options.signal?.aborted) throw new Error('Machine reconfiguration was cancelled.');
        // The journal retains the original as active until verified cutover.
        candidate = await this.#create(record, desired);
        // The admitted candidate must be durable before the first private byte is copied.
        // A restart can distinguish partial data from a creation whose identity is unknown.
        const pending = { name: candidate.name, id: candidate.id, limits: desired, candidate };
        await this.#options.registry.save({ ...record, pending: { ...pending, phase: 'copying' } });
        await this.#stopOwned(candidate);
        await this.#boundary(original);
        await this.#boundary(candidate);
        await copySbxData({ source: original, target: candidate, guestNode: this.#options.kit.guestNode,
          ...(this.#options.sbxExecutable === undefined ? {} : { sbxExecutable: this.#options.sbxExecutable }),
          ...options });
        if (options.signal?.aborted) throw new Error('Machine reconfiguration was cancelled.');
        await this.#options.registry.save({ ...record, pending: { ...pending, phase: 'verifying' } });
        // Verify after an actual stop/reopen, not just in the VM that received the copy.
        await this.#stopOwned(candidate);
        await this.#engine();
        await this.#boundary(candidate);
        await this.#stopOwned(candidate);
        await this.#stopOwned(original);
        if (options.signal?.aborted) throw new Error('Machine reconfiguration was cancelled.');
        await this.#options.registry.save({ ...record, active: candidate, retained: [...record.retained, original] });
        this.#active = candidate;
      } catch {
        throw new Error('Machine reconfiguration did not complete. The original and any replacement data were kept for recovery.');
      } finally {
        const stopped = await Promise.allSettled([
          ...(candidate === undefined ? [] : [this.#stopOwned(candidate)]), this.#stopOwned(original),
        ]);
        // An unknown partial create cannot be certified stopped or have its lease released.
        this.#safeToRelease = candidate !== undefined && stopped.every((result) => result.status === 'fulfilled');
      }
    });
  }

  /** Explicitly keep using the original after an interrupted, recorded replacement. */
  async recoverReconfiguration(): Promise<void> {
    await this.#locked(async () => {
      if (this.#started || this.#transports.size !== 0) throw new Error('Close this Agent execution before recovering its Machine.');
      const record = await this.#options.registry.read(this.#options.agentId);
      const original = record?.active, candidate = record?.pending?.candidate;
      if (record === undefined || original === undefined || candidate === undefined ||
          (record.pending?.phase !== 'copying' && record.pending?.phase !== 'verifying')) {
        throw new Error('There is no admitted replacement to recover. Unknown creation data was kept.');
      }
      if (renderSbxKit(record.kit) !== renderSbxKit(this.#options.kit) ||
          JSON.stringify(record.kit.workspace ?? null) !== JSON.stringify(this.#options.kit.workspace ?? null)) {
        throw new Error('The recorded Machine configuration does not match.');
      }
      await this.#engine();
      await this.#identity(original);
      await this.#identity(candidate);
      this.#safeToRelease = false;
      try {
        await this.#stopOwned(candidate);
        await this.#stopOwned(original);
        await this.#boundary(original);
        await this.#stopOwned(original);
        const { pending: _pending, ...kept } = record;
        await this.#options.registry.save({ ...kept, retained: [...kept.retained, candidate] });
        this.#active = original;
      } catch {
        throw new Error('Machine recovery did not complete. Both copies were kept.');
      } finally {
        const stopped = await Promise.allSettled([this.#stopOwned(candidate), this.#stopOwned(original)]);
        this.#safeToRelease = stopped.every(result => result.status === 'fulfilled');
      }
    });
  }

  async #record(retryCreation = false): Promise<SbxRecord> {
    let record: SbxRecord = await this.#options.registry.read(this.#options.agentId) ?? {
      version: 1, agentId: this.#options.agentId, kit: this.#options.kit, retained: [],
    };
    const mismatch = sbxKitMismatch(record.kit, this.#options.kit);
    if (mismatch !== undefined) throw new Error(mismatch);
    if (retryCreation && record.active === undefined && record.pending !== undefined) {
      record = await this.#clearAbsentCreation(record);
      if (record.pending?.id !== undefined) {
        if (!sameMachineLimits(record.pending.limits, this.#options.limits)) {
          throw new Error('The saved resource limits do not match this interrupted sandbox. Its data was kept.');
        }
        const reference = { name: record.pending.name, id: record.pending.id };
        this.#safeToRelease = false;
        try {
          const active = await this.#admit(reference, record.pending.limits);
          const { pending: _pending, ...kept } = record;
          record = { ...kept, active };
          await this.#options.registry.save(record);
        } catch (error) {
          await this.#cleanup(() => this.#stopOwned(reference)).then(() => { this.#safeToRelease = true; }).catch(() => {});
          throw error;
        }
      }
    }
    if (record.pending !== undefined) throw new Error('This Machine has an unfinished operation. Recover it before continuing.');
    return record;
  }
  /** Absence permits retry. A name-only match never proves ownership or permits adoption. */
  async #clearAbsentCreation(record: SbxRecord): Promise<SbxRecord> {
    if (record.pending === undefined || record.pending.id !== undefined) return record;
    const boxes = (await this.#json(['ls', '--json']))['sandboxes'];
    if (!Array.isArray(boxes) || boxes.some(box => typeof box !== 'object' || box === null || typeof box.name !== 'string' || typeof box.id !== 'string')) {
      throw new Error('Sandbox inventory is unavailable. The interrupted creation was kept.');
    }
    if (boxes.some(box => box.name === record.pending?.name)) {
      throw new Error('An interrupted sandbox has no verified ownership. Its data was kept; inspect it in Machines settings.');
    }
    const { pending: _pending, ...kept } = record;
    await this.#options.registry.save(kept);
    this.#safeToRelease = true;
    return kept;
  }
  async #create(record: SbxRecord, limits: MachineLimits): Promise<OwnedSbx> {
    if (record.kit.workspace !== undefined) await verifyBoxMountPaths(record.kit.workspace);
    // Keep engine names short; ownership is the durable Agent/id binding, not a name prefix.
    const name = `blobot-${randomUUID()}`;
    const pending = { name, limits: machineLimits(limits) };
    const root = await mkdtemp(join(tmpdir(), 'blobot-machine-kit-'));
    let created: SbxReference | undefined;
    try {
      const kit = join(root, 'kit');
      await mkdir(kit);
      await writeFile(join(kit, 'spec.yaml'), renderSbxKit(record.kit), { mode: 0o600 });
      await this.#options.registry.save({ ...record, pending });
      this.#safeToRelease = false;
      const mounts = record.kit.workspace === undefined ? [] : [record.kit.workspace.path, ...record.kit.workspace.commonGit,
        ...(record.kit.workspace.sharedSkillsPath === undefined ? [] : [`${record.kit.workspace.sharedSkillsPath}:ro`])];
      await this.#run(['create', '--name', name, '--cpus', String(limits.maxCpus), '--memory', String(limits.maxMemoryBytes), kit, ...mounts]);
      const inventory = await this.#json(['ls', '--json']);
      const boxes = inventory['sandboxes'];
      if (!Array.isArray(boxes)) throw new Error('Sandbox inventory is unavailable.');
      const matches = boxes.filter((value: unknown) => typeof value === 'object' && value !== null && 'name' in value && value.name === name);
      if (matches.length !== 1 || typeof matches[0]?.id !== 'string') throw new Error('New sandbox identity could not be verified.');
      const reference = { name, id: matches[0].id as string };
      created = reference;
      this.#safeToRelease = false;
      await this.#options.registry.save({ ...record, pending: { ...pending, id: reference.id } });
      // Caller alone publishes the binding, after first admission or verified data transfer.
      return await this.#admit(reference, limits);
    } catch (error) {
      await this.#cleanup(async () => {
        if (created !== undefined) {
          await this.#stopOwned(created);
          this.#safeToRelease = true;
        } else {
          await this.#clearAbsentCreation(await this.#options.registry.read(this.#options.agentId) ?? record);
        }
      }).catch(() => {});
      throw error;
    } finally {
      await rm(root, { recursive: true, force: true }); // only our generated kit; never Agent data
    }
  }
  async #admit(reference: SbxReference, limits: MachineLimits): Promise<OwnedSbx> {
    await this.#identity(reference);
    const rootProbe = await this.#json(['exec', '-u', '0', reference.name, this.#options.kit.guestNode, '-e', SBX_BOUNDARY_PROBE, this.#privatePaths()]);
    const baseline = verifySbxBoundary(rootProbe, limits, 0, undefined, this.#options.kit.workspace, this.#storage());
    const active: OwnedSbx = { ...reference, limits, baseline };
    await this.#boundary(active);
    const rules = await this.#rules(active);
    verifySbxNetworkRules(rules, true);
    if (!rules.some(rule => rule['decision'] === 'allow')) await this.#networkChecks(active);
    return active;
  }
  async #engine(): Promise<void> {
    await new SbxEngine(this.#runner, this.#signal).beforeWork();
    // Settings alone cannot prove that a required restart was applied; #boundary verifies
    // the effective root and Agent socket absence in every admitted guest.
  }
  async #identity(reference: SbxReference): Promise<void> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(reference.name) || !/^[a-zA-Z0-9-]+$/.test(reference.id)) throw new Error('Invalid recorded sandbox identity.');
    verifySbxReference(await this.#json(['ls', '--json']), reference);
  }
  async #boundary(reference: OwnedSbx): Promise<void> {
    if (this.#options.kit.workspace !== undefined) await verifyBoxMountPaths(this.#options.kit.workspace);
    await this.#identity(reference);
    for (const uid of [0, 1000] as const) {
      verifySbxBoundary(await this.#json(['exec', '-u', String(uid), reference.name, this.#options.kit.guestNode, '-e', SBX_BOUNDARY_PROBE, this.#privatePaths()]),
        reference.limits, uid, reference.baseline, this.#options.kit.workspace, this.#storage());
    }
    await this.#identity(reference);
  }
  #privatePaths(): string {
    return JSON.stringify([...(this.#options.kit.workspace === undefined ? ['/home/agent', '/workspace'] : ['/home/agent']),
      ...(this.#options.kit.dockerBytes === undefined ? [] : ['/var/lib/docker'])]);
  }
  #storage(): { homeBytes: number; dockerBytes: number } | undefined {
    return this.#options.kit.dockerBytes === undefined ? undefined
      : { homeBytes: this.#options.kit.dataBytes, dockerBytes: this.#options.kit.dockerBytes };
  }
  async #stopOwned(reference: SbxReference): Promise<void> {
    await this.#identity(reference);
    await this.#run(['stop', reference.name]);
    verifySbxStopped(await this.#json(['ls', '--json']), reference);
  }
  async #removeOwned(reference: SbxReference): Promise<void> {
    const before = (await this.#json(['ls', '--json']))['sandboxes'];
    if (!Array.isArray(before) || before.some(box => typeof box !== 'object' || box === null || typeof box.name !== 'string' || typeof box.id !== 'string')) {
      throw new Error('Sandbox inventory is unavailable. Existing data was kept.');
    }
    // A previous explicit removal can finish before its journal save. Absence is safe to
    // acknowledge; a reused name or moved id still has to pass the exact identity check.
    if (!before.some(box => box.name === reference.name || box.id === reference.id)) return;
    await this.#stopOwned(reference);
    await this.#run(['rm', '-f', reference.name]);
    const inventory = await this.#json(['ls', '--json']);
    if (!Array.isArray(inventory['sandboxes']) || inventory['sandboxes'].some((box: { id?: string; name?: string }) =>
      box.id === reference.id || box.name === reference.name)) throw new Error('Machine removal could not be verified.');
  }
  /** Cancellation ends requested work; identity checks and power cleanup still have to finish. */
  async #cleanup<T>(work: () => Promise<T>): Promise<T> {
    const signal = this.#signal;
    this.#signal = undefined;
    try { return await work(); } finally { this.#signal = signal; }
  }
  async #rules(reference: SbxReference): Promise<Record<string, unknown>[]> {
    await this.#identity(reference);
    // The unnamed listing includes other sandboxes. Keep global and this exact scope;
    // the default-deny display row is synthetic and disappears when explicit rules exist.
    const layers = await Promise.all([
      this.#json(['policy', 'ls', '--type', 'network', '--json']),
      this.#json(['policy', 'ls', reference.name, '--type', 'network', '--json']),
    ]);
    const unique = new Map<string, Record<string, unknown>>();
    for (const [index, data] of layers.entries()) {
      for (const rule of readSbxNetworkRules(data)) {
        const id = rule['id'] as string;
        if (rule['scope'] !== 'global' && rule['scope'] !== `sandbox:${reference.name}`) {
          if (index === 0 && typeof rule['sandbox_id'] === 'string' && rule['scope'] === `sandbox:${rule['sandbox_id']}` &&
              rule['applies_to'] === rule['scope']) continue;
          throw new Error('Unexpected network policy scope.');
        }
        const prior = unique.get(id);
        if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(rule)) throw new Error('Conflicting network policy observations.');
        unique.set(id, rule);
      }
    }
    return [...unique.values()];
  }
  async #networkChecks(reference: SbxReference, mailboxPort?: number): Promise<void> {
    // No packets are sent by policy check. A running Machine admits arbitrary destinations;
    // without global allows, initial/replacement admission can also verify the closed baseline.
    const checks: [string, boolean][] = [['blobot-admission.invalid:443', mailboxPort !== undefined]];
    if (mailboxPort !== undefined) checks.push([`localhost:${mailboxPort}`, true]);
    for (const [target, allowed] of checks) {
      // A documented denial exits 1 with JSON. Other commands still require exit 0.
      const value: unknown = JSON.parse(await this.#run(['policy', 'check', 'network', '--sandbox', reference.name, '--json', target], true));
      verifySbxNetworkCheck(value, reference.name, target, allowed);
    }
  }
  async #revokeNetwork(record: SbxRecord): Promise<SbxRecord> {
    if (record.network !== undefined && record.active !== undefined) {
      const found = (await this.#rules(record.active)).filter((rule) => rule['id'] === record.network?.id);
      if (found.length > 1) throw new Error('Ambiguous network permission.');
      if (found.length === 1) {
        verifySbxOpenNetworkRule(found[0], record.active.name, record.network);
        await this.#run(['policy', 'rm', 'network', '--sandbox', record.active.name, '--id', record.network.id]);
        if ((await this.#rules(record.active)).some((rule) => rule['id'] === record.network?.id)) throw new Error('Network permission could not be revoked.');
      }
      const { network: _network, ...next } = record;
      await this.#options.registry.save(next);
      record = next;
    }
    // A journal from the staged exact-mailbox implementation may still own that old rule.
    if (record.mailbox === undefined || record.active === undefined) return record;
    const found = (await this.#rules(record.active)).filter((rule) => rule['id'] === record.mailbox?.id);
    if (found.length > 1) throw new Error('Ambiguous mailbox permission.');
    if (found.length === 1) {
      verifySbxMailboxRule(found[0], record.active.name, record.mailbox);
      await this.#run(['policy', 'rm', 'network', '--sandbox', record.active.name, '--id', record.mailbox.id]);
      if ((await this.#rules(record.active)).some((rule) => rule['id'] === record.mailbox?.id)) throw new Error('Mailbox permission could not be revoked.');
    }
    const { mailbox: _mailbox, ...next } = record;
    await this.#options.registry.save(next);
    return next;
  }
  async #locked<T>(work: () => Promise<T>): Promise<T> {
    if (this.#exclusive) throw new Error('This Machine is changing state.');
    this.#exclusive = true;
    try {
      this.#release ??= await this.#options.registry.lease(this.#options.agentId);
      return await this.#options.registry.locked(this.#options.agentId, work);
    } finally {
      try {
        if (!this.#started && this.#safeToRelease && this.#release !== undefined) { await this.#release(); this.#release = undefined; }
      } finally { this.#exclusive = false; }
    }
  }
  async #json(args: readonly string[]): Promise<Record<string, unknown>> {
    const data: unknown = JSON.parse(await this.#run(args));
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Invalid sandbox response.');
    return data as Record<string, unknown>;
  }
  async #run(args: readonly string[], allowDenied = false): Promise<string> {
    this.#signal?.throwIfAborted();
    const result = await this.#runner(args, this.#signal);
    this.#signal?.throwIfAborted();
    if (result.missing) throw new Error('Sandbox engine is not installed on this computer.');
    if (result.code !== 0 && !(allowDenied && result.code === 1)) throw new Error(`Sandbox ${args[0] ?? 'operation'} could not complete.`);
    return result.stdout;
  }
}
