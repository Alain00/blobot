import { spawn } from 'node:child_process';
import { posix } from 'node:path';
import { childTransport } from '../../process/child-transport.js';
import type { MachineConfigPatch, MachineSpawnRequest, MachineTransport } from '../machine.js';
import { SBX_BOOTSTRAP_SOURCE } from './bootstrap.js';
import { sbxClientEnvironment } from './client-environment.js';
import { PERSONAL_DIRECTORY_ENV } from '../../personal/personal-directory.js';

const MAX_HEADER_BYTES = 1024 * 1024;
const FORBIDDEN_ENV = /^(?:BLOBOT_[A-Z0-9_]+_API_KEY|SSH_AUTH_SOCK|ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH|LD_PRELOAD|LD_LIBRARY_PATH|HOME|PATH|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/i;

/** An adapter-owned JSON patch, applied in the guest before the runtime starts. */
export type SbxConfigPatch = MachineConfigPatch;

export interface SbxExecOptions {
  readonly sandboxName: string;
  /** Machine-owned path; an adapter cannot override another profile's identity. */
  readonly personalPath?: string;
  /** From the image contract, not the host's process.execPath. */
  readonly guestNode: string;
  readonly moduleRoot: string;
  /** Runtime-owned allowlist. Being in process.env is never authorization to cross. */
  readonly allowedEnvironment: readonly string[];
  readonly configs?: readonly SbxConfigPatch[];
  readonly sbxExecutable?: string;
}

function absoluteGuestPath(value: string): void {
  if (!posix.isAbsolute(value) || value.includes('\0')) throw new Error('Expected an absolute guest path');
}

/** Pure and separately inspectable: nothing supplied by an Agent is interpolated into code. */
export function prepareSbxExec(options: SbxExecOptions, request: MachineSpawnRequest): {
  readonly executable: string;
  readonly args: readonly string[];
  readonly header: Buffer;
} {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(options.sandboxName)) throw new Error('Invalid sandbox name');
  absoluteGuestPath(options.guestNode);
  absoluteGuestPath(options.moduleRoot);
  absoluteGuestPath(request.cwd);
  const allowed = new Set(options.allowedEnvironment);
  const env: Record<string, string | null> = Object.create(null) as Record<string, string | null>;
  for (const [key, value] of Object.entries(request.env ?? {})) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || key === PERSONAL_DIRECTORY_ENV || FORBIDDEN_ENV.test(key) || !allowed.has(key)) {
      throw new Error('A launch environment variable is not permitted in the sandbox');
    }
    if (value?.includes('\0')) throw new Error('Invalid launch environment value');
    env[key] = value ?? null;
  }
  if (options.personalPath !== undefined) absoluteGuestPath(options.personalPath);
  env[PERSONAL_DIRECTORY_ENV] = options.personalPath ?? null;
  const configs = [...options.configs ?? [], ...request.configs ?? []];
  for (const config of configs) {
    absoluteGuestPath(config.root);
    if (config.relativePath.includes('\0') || config.relativePath.split('/').some(
      (part) => part === '' || part === '.' || part === '..',
    )) throw new Error('Invalid guest config path');
  }
  const command = request.command;
  if (command.kind === 'node-module') {
    if (command.localEntryPath !== undefined) throw new Error('A host bridge path cannot enter a sandbox');
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(command.package) ||
        command.entry.split('/').some((part) => part === '' || part === '.' || part === '..')) {
      throw new Error('Invalid guest bridge specification');
    }
  } else if (command.executable.length === 0 || command.executable.includes('\0') ||
      command.args.some((arg) => arg.includes('\0'))) {
    throw new Error('Invalid guest command');
  }
  const body = Buffer.from(JSON.stringify({
    protocol: 1, command, cwd: request.cwd, env, configs, moduleRoot: options.moduleRoot,
  }), 'utf8');
  if (body.length > MAX_HEADER_BYTES) throw new Error('Sandbox launch configuration is too large');
  const header = Buffer.allocUnsafe(4 + body.length);
  header.writeUInt32BE(body.length, 0);
  body.copy(header, 4);
  return {
    executable: options.sbxExecutable ?? 'sbx',
    args: ['exec', '-i', options.sandboxName, options.guestNode, '-e', SBX_BOOTSTRAP_SOURCE],
    header,
  };
}

/**
 * Opens a channel to an already-prepared box. It does not create a sandbox, configure a
 * daemon, or establish the isolation guarantee. The engine must do those before calling it.
 */
export function spawnSbxTransport(options: SbxExecOptions, request: MachineSpawnRequest): MachineTransport {
  const prepared = prepareSbxExec(options, request);
  const child = spawn(prepared.executable, [...prepared.args], {
    env: sbxClientEnvironment(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const transport = childTransport(child, request.onStderr);
  child.stdin.write(prepared.header);
  return transport;
}
