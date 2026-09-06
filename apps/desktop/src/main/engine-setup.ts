import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpus, totalmem } from 'node:os';
import { SbxInstaller, sbxHostArtifact, sbxKvmAvailable, sbxClientEnvironment } from '@blobot/core';
import type { DesktopMachines } from './machines.js';
import type { EngineSetupView, SetupProgress, UiConfiguredMachine, UiMachineInventory } from '../shared/machines.js';
export interface EngineSetupEffects {
  readonly configuredMachines?: () => readonly UiConfiguredMachine[];
  readonly changed: () => void;
  readonly openPackage: (path: string) => Promise<string>;
  readonly sleepError?: () => string | undefined;
  readonly inventory?: () => Promise<UiMachineInventory>;
}

/** No terminal or CLI output crosses this boundary. The engine owns its browser and credentials. */
export class EngineSetup {
  #closed = false;
  #operation: SetupProgress | undefined;
  #active: { id: string; abort: AbortController; task: Promise<void> } | undefined;
  constructor(readonly machines: DesktopMachines, readonly effects: EngineSetupEffects) {}

  async view(): Promise<EngineSetupView> {
    const [readiness, artifact, kvmAvailable, inventory] = await Promise.all([
      this.machines.engine().readiness(), sbxHostArtifact(), sbxKvmAvailable(), this.effects.inventory?.(),
    ]);
    return { readiness, canInstall: artifact !== undefined, kvmAvailable,
      host: { cpus: cpus().length, memoryBytes: totalmem() },
      ...(inventory === undefined ? {} : { inventory }),
      ...(this.effects.sleepError?.() === undefined ? {} : { sleepError: this.effects.sleepError!()! }),
      previewEnabled: this.machines.previewEnabled, configuredMachines: this.effects.configuredMachines?.() ?? [],
      ...(this.#operation === undefined ? {} : { operation: this.#operation }) };
  }
  start(kind: 'install' | 'sign_in' | 'check'): string {
    if (this.#closed) throw new Error('The application is closing.');
    if (!['install', 'sign_in', 'check'].includes(kind)) throw new Error('Unknown sandbox setup action.');
    if (this.#active !== undefined) throw new Error('Sandbox setup is already in progress.');
    const id = randomUUID(), abort = new AbortController();
    const update = (value: Omit<SetupProgress, 'id'>) => {
      this.#operation = { id, ...value }; this.effects.changed();
    };
    update({ phase: 'starting', detail: 'Preparing sandboxes…' });
    // Begin on the next microtask, so cancellation/ownership exist before any operation emits.
    const task = Promise.resolve().then(async () => {
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(20 * 60_000)]);
      signal.throwIfAborted();
      if (kind === 'install') {
        const installed = await this.machines.engine(signal).readiness();
        signal.throwIfAborted();
        if (installed.state === 'not_installed') {
          const installer = new SbxInstaller(this.machines.directory);
          let lastProgressAt = 0;
          const result = await installer.install({ signal, onProgress: (received, total) => {
            const now = Date.now();
            if (now - lastProgressAt < 1000 && received !== total) return;
            lastProgressAt = now;
            update({ phase: 'downloading', detail: 'Downloading sandbox software…', received,
              ...(total === undefined ? {} : { total }) });
          } });
          signal.throwIfAborted();
          if (result.kind === 'package') {
            const error = await this.effects.openPackage(result.path);
            signal.throwIfAborted();
            if (error) throw new Error('The system package installer could not open. Check that a graphical package installer is available.');
            update({ phase: 'done', detail: 'Finish installing in the system installer, then check again.' });
            return;
          }
        }
        signal.throwIfAborted();
        update({ phase: 'checking', detail: 'Preparing the sandbox engine…' });
        // The setup button discloses this shared setting change; an occupied engine refuses it.
        const readiness = await this.machines.engine(signal).setup(async () => !signal.aborted);
        signal.throwIfAborted();
        update({ phase: 'done', detail: readiness.state === 'ready' ? 'Sandboxes are ready.' : readiness.detail });
      } else if (kind === 'sign_in') {
        update({ phase: 'waiting', detail: 'Continue signing in to Docker in your browser. If no browser opens, cancel and try again.' });
        await runEngineLogin(this.machines.executable, signal);
        signal.throwIfAborted();
        update({ phase: 'checking', detail: 'Checking sandbox access…' });
        const readiness = await this.machines.engine(signal).readiness('work');
        signal.throwIfAborted();
        update({ phase: 'done', detail: readiness.state === 'ready' ? 'Sandboxes are ready.' : readiness.detail });
      } else {
        update({ phase: 'checking', detail: 'Checking sandbox access…' });
        const readiness = await this.machines.engine(signal).start();
        signal.throwIfAborted();
        update({ phase: 'done', detail: readiness.state === 'ready' ? 'Sandboxes are ready.' : readiness.detail });
      }
    }).catch((error: unknown) => {
      update({ phase: abort.signal.aborted ? 'cancelled' : 'failed', detail: abort.signal.aborted
        ? 'Sandbox setup cancelled.' : error instanceof Error ? error.message : 'Sandbox setup did not complete.' });
    }).finally(() => { if (this.#active?.id === id) this.#active = undefined; });
    this.#active = { id, abort, task }; return id;
  }
  cancel(id: string): void { if (this.#active?.id === id) this.#active.abort.abort(); }
  async close(): Promise<void> { this.#closed = true; this.#active?.abort.abort(); await this.#active?.task; }
}

/** Host browser/keyring session endpoints only; never used by sandbox or Agent processes. */
export function engineLoginEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = sbxClientEnvironment(source);
  for (const name of ['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'] as const) {
    if (source[name] !== undefined) env[name] = source[name];
  }
  return env;
}

export function runEngineLogin(executable: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['login'], { env: engineLoginEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] });
    // No output is logged or retained, including URLs or possible account identifiers.
    child.stdout.resume(); child.stderr.resume();
    let killer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const abort = () => {
      child.stdin.end(); child.kill('SIGTERM');
      killer = setTimeout(() => child.kill('SIGKILL'), 1000);
    };
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(killer); signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(new Error('Sandbox sign-in cancelled.'));
      else if (error) reject(error); else resolve();
    };
    child.stdin.on('error', () => {});
    child.once('error', () => finish(new Error('Sandbox sign-in could not start.')));
    child.once('close', (code) => finish(code === 0 ? undefined : new Error('Docker browser sign-in did not complete. Check that your browser and account keyring are available, then try again.')));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    // The managed browser flow has no terminal/input surface. An interactive fallback
    // must see EOF and fail, rather than wait invisibly for input that cannot arrive.
    child.stdin.end();
  });
}
