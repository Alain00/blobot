import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { childTransport, isExecutable, searchPath } from '../acp/child-transport.js';
import type { LineTransport } from '../acp/jsonrpc.js';

/** The one version this adapter is written against. Ticket 07: exact-pinned, checked loudly. */
export const BRIDGE_VERSION = '0.70.0';
export const BRIDGE_PACKAGE = '@agentclientprotocol/claude-agent-acp';

export interface SpawnBridgeOptions {
  /** The AgentWorkspace. The bridge overrides the session's `cwd` with `session/new`'s. */
  readonly cwd: string;
  /** The user's own `claude`, or the bridge silently runs its own bundled ~200MB copy.
   *  Resolved from `CLAUDE_CODE_EXECUTABLE` and then `PATH` when it is not given. */
  readonly claudeExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Where the bridge's stderr goes. Its own logs, never the JSON-RPC channel. */
  readonly onStderr?: (line: string) => void;
}

export type SpawnBridge = (options: SpawnBridgeOptions) => LineTransport;

/**
 * One bridge process per agent, uniformly (ticket 07). Sharing one process across agents
 * would buy memory we are not short of and cost a shared blast radius: one agent's crash
 * would take out three, and `stop()` would stop being a `kill`.
 */
export const spawnClaudeBridge: SpawnBridge = (options) => {
  const child = spawn(process.execPath, [bridgeEntryPath()], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
      CLAUDE_CODE_EXECUTABLE: resolveClaudeExecutable(options.claudeExecutable),
      // `process.execPath` is Electron in the desktop app, and Electron only behaves like
      // node when told to. Harmless under plain node, which ignores it.
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return childTransport(child, options.onStderr);
};

/**
 * The bridge's own entry point, resolved out of our pinned dependency rather than `npx`'d:
 * a first run that stalls on a network fetch is not a zero-setup product.
 *
 * Two anchors, because this file gets bundled. Under vitest it resolves from its own path;
 * inside the Electron main bundle that path is `out/main/`, whose `node_modules` chain is the
 * *app's*, not core's — which is why the desktop app carries the same exact pin.
 */
export function bridgeEntryPath(): string {
  const override = process.env.BLOBOT_CLAUDE_BRIDGE;
  if (override !== undefined && override.length > 0) return override;

  const failures: string[] = [];
  for (const anchor of [import.meta.url, `${process.cwd()}/`]) {
    try {
      const manifest = createRequire(anchor).resolve(`${BRIDGE_PACKAGE}/package.json`);
      return join(dirname(manifest), 'dist', 'index.js');
    } catch (error) {
      failures.push(`${anchor}: ${error instanceof Error ? error.message.split('\n')[0] : ''}`);
    }
  }
  throw new Error(
    `${BRIDGE_PACKAGE}@${BRIDGE_VERSION} could not be resolved, so no Claude agent can start. ` +
      'Install it beside the running bundle, or point BLOBOT_CLAUDE_BRIDGE at its dist/index.js. ' +
      `Tried: ${failures.join('; ')}`,
  );
}

/**
 * The user's own binary, in the order that keeps blobot out of the credential business: an
 * explicit setting, then the environment the bridge itself reads, then `PATH`.
 */
export function resolveClaudeExecutable(explicit?: string): string {
  const candidates = [explicit, process.env.CLAUDE_CODE_EXECUTABLE].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
    throw new Error(`claude executable not found at ${candidate}`);
  }
  const fromPath = searchPath('claude');
  if (fromPath !== undefined) return fromPath;
  throw new Error(
    'claude was not found on PATH. Install Claude Code, or set CLAUDE_CODE_EXECUTABLE to its path.',
  );
}
