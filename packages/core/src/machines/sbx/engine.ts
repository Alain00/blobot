import { execFile } from 'node:child_process';
import type { MachineReadiness } from '../machine.js';
import { sbxClientEnvironment } from './client-environment.js';
import { verifySbxVersion } from './observations.js';

export interface SbxCommandResult { readonly code: number; readonly stdout: string; readonly missing?: boolean; }
export type SbxCommandRunner = (args: readonly string[], signal?: AbortSignal) => Promise<SbxCommandResult>;
/** The desktop owns a watched PTY. Its bytes are forwarded, never inspected or retained. */
export type SbxPtyRunner = (request: {
  readonly args: readonly string[];
  readonly env: Readonly<NodeJS.ProcessEnv>;
}) => Promise<void>;

export function sbxCommandRunner(executable = 'sbx', timeoutMs = 90_000): SbxCommandRunner {
  return (args, signal) => new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    execFile(executable, [...args], { env: sbxClientEnvironment(), timeout: timeoutMs, maxBuffer: 1024 * 1024,
      ...(signal === undefined ? {} : { signal }) }, (error, stdout) => {
      if (error?.code === 'ENOENT') resolve({ code: 127, stdout: '', missing: true });
      else if (error?.killed || (error !== null && typeof error.code !== 'number')) reject(new Error('Sandbox engine did not answer.'));
      else resolve({ code: error === null ? 0 : Number(error.code), stdout });
    });
  });
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Incomplete engine response.');
  return value as Record<string, unknown>;
}

/**
 * Read-only display and explicit work/setup are distinct capabilities. RC5 settings reads
 * may start the daemon, so display never calls them. No credential/output parsing or install
 * command is offered here; the development pin is not a production distribution policy.
 */
export class SbxEngine {
  constructor(readonly run: SbxCommandRunner = sbxCommandRunner(), readonly signal?: AbortSignal) {}

  async readiness(purpose: 'display' | 'work' = 'display'): Promise<MachineReadiness> {
    try {
      const status = await this.invoke(['daemon', 'status', '--json']);
      if (status.missing) return { state: 'not_installed', detail: 'Sandbox engine is not installed on this computer.' };
      if (status.code !== 0 || object(JSON.parse(status.stdout))['status'] !== 'running') {
        return { state: 'unknown', detail: 'Sandbox engine is stopped or could not be checked.' };
      }
      if (purpose === 'display') return { state: 'unknown', detail: 'Sandbox engine is running; checked before work.' };
      verifySbxVersion(await this.json(['version', '--json']));
      const settings = await this.json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled']);
      if (settings['key'] !== 'ssh.agentForwardingEnabled' || settings['type'] !== 'bool' || settings['value'] !== false) {
        return { state: 'unknown', detail: 'Sandbox engine needs isolation setup.' };
      }
      const checks = (await this.json(['diagnose', '--json']))['checks'];
      const auth = Array.isArray(checks) ? checks.map(object).filter((check) => check['name'] === 'Authentication') : [];
      // Non-pass shapes have not been measured. They do not all mean signed out.
      if (auth.length !== 1 || auth[0]?.['status'] !== 'pass') {
        return { state: 'unknown', detail: 'Sandbox engine sign-in could not be checked.' };
      }
      return { state: 'ready' };
    } catch { return { state: 'unknown', detail: 'Sandbox engine could not be checked.' }; }
  }

  async beforeWork(): Promise<void> {
    const result = await this.readiness('work');
    if (result.state !== 'ready') throw new Error(result.detail);
  }

  /** Explicit setup only. Shared changes require consent and an empty inventory on BOTH sides of it. */
  async configureIsolation(confirm: () => Promise<boolean>): Promise<MachineReadiness> {
    const inventory = await this.json(['ls', '--json']);
    this.empty(inventory);
    verifySbxVersion(await this.json(['version', '--json']));
    if (!await confirm()) return this.readiness();
    this.empty(await this.json(['ls', '--json']));
    await this.command(['settings', 'set', 'ssh.agentForwardingEnabled', 'false']);
    // Check again just before the shared restart; a new sandbox invalidates the consent.
    this.empty(await this.json(['ls', '--json']));
    await this.command(['daemon', 'restart']);
    return this.readiness('work');
  }

  /** On explicit use, never on a render. Existing global policy is left untouched. */
  async start(): Promise<MachineReadiness> {
    await this.command(['daemon', 'start', '--detach']);
    return this.readiness('work');
  }

  /** Explicit onboarding. Only this action may change shared SSH forwarding settings. */
  async setup(confirm: () => Promise<boolean>): Promise<MachineReadiness> {
    await this.command(['daemon', 'start', '--detach']);
    verifySbxVersion(await this.json(['version', '--json']));
    const settings = await this.json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled']);
    if (settings['key'] === 'ssh.agentForwardingEnabled' && settings['type'] === 'bool' && settings['value'] === false) {
      return this.readiness('work');
    }
    if (settings['key'] !== 'ssh.agentForwardingEnabled' || settings['type'] !== 'bool' || settings['value'] !== true) {
      throw new Error('Sandbox isolation settings could not be checked.');
    }
    return this.configureIsolation(confirm);
  }

  /** The engine owns its browser flow. An exit is not evidence of successful sign-in. */
  async signIn(perform: SbxPtyRunner): Promise<{ readonly completed: boolean; readonly readiness: MachineReadiness }> {
    let completed = false;
    try { await perform({ args: ['login'], env: sbxClientEnvironment() }); completed = true; }
    catch { /* The observed state below, not an exit code, ends the remedy. */ }
    return { completed, readiness: await this.readiness('work') };
  }

  private empty(value: Record<string, unknown>): void {
    if (!Array.isArray(value['sandboxes']) || value['sandboxes'].length !== 0) {
      throw new Error('Close all sandbox work before changing the shared engine. Nothing was stopped.');
    }
  }
  private async command(args: readonly string[]): Promise<string> {
    const result = await this.invoke(args);
    if (result.code !== 0 || result.missing) throw new Error('Sandbox setup could not complete.');
    return result.stdout;
  }
  private async json(args: readonly string[]): Promise<Record<string, unknown>> {
    return object(JSON.parse(await this.command(args)));
  }
  private async invoke(args: readonly string[]): Promise<SbxCommandResult> {
    this.signal?.throwIfAborted();
    const result = await (this.signal === undefined ? this.run(args) : this.run(args, this.signal));
    this.signal?.throwIfAborted();
    return result;
  }
}
