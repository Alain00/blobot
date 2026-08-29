import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { LineTransport } from './jsonrpc.js';

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

function childTransport(
  child: ChildProcessWithoutNullStreams,
  onStderr: ((line: string) => void) | undefined,
): LineTransport {
  const closeListeners = new Set<(reason: string | undefined) => void>();
  let closedBy: string | undefined;
  let closed = false;

  const announceClose = (reason: string | undefined): void => {
    if (closed) return;
    closed = true;
    closedBy = reason;
    for (const listener of closeListeners) listener(reason);
  };

  child.on('error', (error) => announceClose(error.message));
  child.on('exit', (code, signal) => {
    announceClose(
      code === 0 || code === null
        ? signal === null
          ? undefined
          : `the bridge process was killed by ${signal}`
        : `the bridge process exited with code ${code}`,
    );
  });

  if (onStderr !== undefined) {
    createInterface({ input: child.stderr }).on('line', onStderr);
  }

  return {
    write(line: string): void {
      if (child.stdin.destroyed) return;
      child.stdin.write(line);
    },
    lines(): AsyncIterable<string> {
      return createInterface({ input: child.stdout, crlfDelay: Infinity });
    },
    async close(): Promise<void> {
      if (child.exitCode !== null) return;
      // The bridge shuts down on stdin EOF (`connection.closed.then(shutdown)`), so a clean
      // stop is closing the pipe — no SIGKILL dance.
      child.stdin.end();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 2_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    onClose(listener: (reason: string | undefined) => void): () => void {
      if (closed) {
        listener(closedBy);
        return () => undefined;
      }
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
  };
}

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
      `Tried — ${failures.join('; ')}`,
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

function searchPath(binary: string): string | undefined {
  for (const entry of (process.env.PATH ?? '').split(':')) {
    if (entry.length === 0) continue;
    const candidate = join(entry, binary);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
