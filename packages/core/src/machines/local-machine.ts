import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { childEnvironment } from '../process/child-env.js';
import { childTransport } from '../process/child-transport.js';
import { PERSONAL_DIRECTORY_ENV, type PersonalDirectory } from '../personal/personal-directory.js';
import type {
  Machine,
  MachineIdentity,
  MachineLocation,
  MachineReadiness,
  MachineReconcileOutcome,
  MachineSpawnRequest,
  MachineStartRequest,
  MachineTransport,
} from './machine.js';

/** Today's execution, behind the same boundary a box will implement. Owns no host files. */
export class LocalMachine implements Machine {
  readonly kind = 'local';
  readonly mailboxHostname = '127.0.0.1';
  readonly #location: MachineLocation;
  readonly #nodeExecutable: string;
  readonly #personal: PersonalDirectory | undefined;
  #prepared = false;

  constructor(identity: MachineIdentity, options: { readonly nodeExecutable?: string; readonly personalDirectory?: PersonalDirectory } = {}) {
    this.#personal = options.personalDirectory;
    this.#location = Object.freeze({ ...identity, kind: this.kind, volumes: null,
      ...(this.#personal === undefined ? {} : { personalPath: this.#personal.path }) });
    this.#nodeExecutable = options.nodeExecutable ?? process.execPath;
  }

  location(): MachineLocation {
    return this.#location;
  }

  async readiness(): Promise<MachineReadiness> {
    return { state: 'ready' };
  }

  async reconcile(): Promise<MachineReconcileOutcome> {
    return { state: 'ok', location: this.#location };
  }
  async start(_request: MachineStartRequest): Promise<MachineLocation> {
    await this.#personal?.prepare();
    this.#prepared = true;
    return this.#location;
  }

  async beforeWork(): Promise<void> { await this.#personal?.prepare(); }

  spawn(request: MachineSpawnRequest): MachineTransport {
    if (this.#personal !== undefined && !this.#prepared) throw new Error('Prepare the agent’s personal folder before starting its runtime.');
    const command = request.command;
    const isModule = command.kind === 'node-module';
    const executable = isModule ? this.#nodeExecutable : command.executable;
    const args = isModule
      ? [
          command.localEntryPath ?? join(
            dirname(createRequire(import.meta.url).resolve(`${command.package}/package.json`)),
            ...command.entry.split('/'),
          ),
        ]
      : [...command.args];
    const child = spawn(executable, args, {
      cwd: request.cwd,
      env: childEnvironment(request.env, isModule ? { ELECTRON_RUN_AS_NODE: '1' } : undefined,
        { [PERSONAL_DIRECTORY_ENV]: this.#personal?.path }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return childTransport(child, request.onStderr);
  }

  // The runtime closes its transport. LocalMachine owns no VM, volumes or user login to delete.
  async stop(): Promise<void> { this.#prepared = false; }
  async destroy(): Promise<void> {}
  async measure(): Promise<number> {
    return 0;
  }
}
