import { CLAUDE_MACHINE_IMAGE } from './image.js';
import {
  bridgeEntryPathOf,
  resolveBridgeExecutable,
  spawnNpmBridge,
  type NpmBridgeSpec,
} from '../acp/npm-bridge.js';
import type { LineTransport } from '../acp/jsonrpc.js';
import type { Machine } from '../../machines/machine.js';

/** The one version this adapter is written against. Ticket 07: exact-pinned, checked loudly. */
export const BRIDGE_VERSION = '0.70.0';
export const BRIDGE_PACKAGE = '@agentclientprotocol/claude-agent-acp';

/**
 * Claude's five names. Everything else about spawning this bridge is the protocol's shape and
 * lives in `acp/npm-bridge.ts`; `CLAUDE_CODE_EXECUTABLE` is the only line here that was ever
 * about Claude.
 */
export const CLAUDE_BRIDGE: NpmBridgeSpec = {
  package: BRIDGE_PACKAGE,
  version: BRIDGE_VERSION,
  entry: 'dist/index.js',
  overrideEnv: 'BLOBOT_CLAUDE_BRIDGE',
  binary: 'claude',
  guestExecutable: CLAUDE_MACHINE_IMAGE.executable,
  executableEnv: 'CLAUDE_CODE_EXECUTABLE',
  agent: 'Claude',
  install: 'Claude Code',
};

export interface SpawnBridgeOptions {
  /** The AgentWorkspace. The bridge overrides the session's `cwd` with `session/new`'s. */
  readonly cwd: string;
  readonly machine?: Machine;
  /** The user's own `claude`, or the bridge silently runs its own bundled ~200MB copy.
   *  Resolved from `CLAUDE_CODE_EXECUTABLE` and then `PATH` when it is not given. */
  readonly claudeExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Where the bridge's stderr goes. Its own logs, never the JSON-RPC channel. */
  readonly onStderr?: (line: string) => void;
}

export type SpawnBridge = (options: SpawnBridgeOptions) => LineTransport;

export const spawnClaudeBridge: SpawnBridge = (options) =>
  spawnNpmBridge(CLAUDE_BRIDGE, {
    cwd: options.cwd,
    ...(options.machine === undefined ? {} : { machine: options.machine }),
    ...(options.claudeExecutable === undefined ? {} : { executable: options.claudeExecutable }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
  });

export function bridgeEntryPath(): string {
  return bridgeEntryPathOf(CLAUDE_BRIDGE);
}

export function resolveClaudeExecutable(explicit?: string): string {
  return resolveBridgeExecutable(CLAUDE_BRIDGE, explicit);
}
