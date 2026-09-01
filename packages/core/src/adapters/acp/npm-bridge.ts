import { childEnvironment } from './child-env.js';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { childTransport, isExecutable, searchPath } from './child-transport.js';
import type { LineTransport } from './jsonrpc.js';

/**
 * Spawning a pinned npm ACP bridge, which is the protocol's shape and not a provider's.
 *
 * Neither Claude Code nor Codex speaks ACP itself. Both are reached through a published stdio
 * server that starts the vendor's own program and translates in both directions, and everything
 * true of running one is true of running the other: pin the version exactly and check it loudly,
 * resolve its entry point out of the dependency rather than `npx`-ing it, spawn it under
 * `process.execPath` with `ELECTRON_RUN_AS_NODE=1` one process per agent, and point it at **the
 * user's own binary** so it does not silently run its bundled copy.
 *
 * Only the names differ. `CLAUDE_CODE_EXECUTABLE` against `CODEX_PATH`, `claude` against
 * `codex` — which is what a {@link NpmBridgeSpec} is: the five names, and nothing else.
 *
 * This is the second time the shared half turned out to be the protocol rather than the vendor,
 * after JSON-RPC, the child transport, the wire shapes and the `session/update` translation.
 */
export interface NpmBridgeSpec {
  /** The bridge package. Exact-pinned in `packages/core` **and** in the desktop app. */
  readonly package: string;
  /** The one version the adapter is written against, checked against what the bridge reports. */
  readonly version: string;
  /** Its entry point inside the package, posix-separated. */
  readonly entry: string;
  /** The escape hatch that names a `dist/index.js` directly. Packaging will use it. */
  readonly overrideEnv: string;
  /** The user's own CLI, as it is named on `PATH`. */
  readonly binary: string;
  /** The environment variable the bridge reads to find that binary. */
  readonly executableEnv: string;
  /** How the agent is named in the sentence a failure to resolve produces. */
  readonly agent: string;
  /** How the CLI is named when telling the user to install it. */
  readonly install: string;
}

export interface SpawnNpmBridgeOptions {
  /** The AgentWorkspace. The bridge overrides the session's `cwd` with `session/new`'s. */
  readonly cwd: string;
  /** The user's own binary. Resolved from the spec's environment variable and then `PATH`
   *  when it is not given. */
  readonly executable?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Where the bridge's stderr goes. Its own logs, never the JSON-RPC channel. */
  readonly onStderr?: (line: string) => void;
}

/**
 * One bridge process per agent, uniformly (ticket 07). Sharing one process across agents
 * would buy memory we are not short of and cost a shared blast radius: one agent's crash
 * would take out three, and `stop()` would stop being a `kill`.
 */
export function spawnNpmBridge(
  spec: NpmBridgeSpec,
  options: SpawnNpmBridgeOptions,
): LineTransport {
  const child = spawn(process.execPath, [bridgeEntryPathOf(spec)], {
    cwd: options.cwd,
    env: childEnvironment(options.env, {
      [spec.executableEnv]: resolveBridgeExecutable(spec, options.executable),
      // `process.execPath` is Electron in the desktop app, and Electron only behaves like
      // node when told to. Harmless under plain node, which ignores it.
      ELECTRON_RUN_AS_NODE: '1',
    }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return childTransport(child, options.onStderr);
}

/**
 * The bridge's own entry point, resolved out of our pinned dependency rather than `npx`'d:
 * a first run that stalls on a network fetch is not a zero-setup product.
 *
 * Two anchors, because this file gets bundled. Under vitest it resolves from its own path;
 * inside the Electron main bundle that path is `out/main/`, whose `node_modules` chain is the
 * *app's*, not core's — which is why the desktop app carries the same exact pins.
 */
export function bridgeEntryPathOf(spec: NpmBridgeSpec): string {
  const override = process.env[spec.overrideEnv];
  if (override !== undefined && override.length > 0) return override;

  const failures: string[] = [];
  for (const anchor of [import.meta.url, `${process.cwd()}/`]) {
    try {
      const manifest = createRequire(anchor).resolve(`${spec.package}/package.json`);
      return join(dirname(manifest), ...spec.entry.split('/'));
    } catch (error) {
      failures.push(`${anchor}: ${error instanceof Error ? error.message.split('\n')[0] : ''}`);
    }
  }
  throw new Error(
    `${spec.package}@${spec.version} could not be resolved, so no ${spec.agent} agent can start. ` +
      `Install it beside the running bundle, or point ${spec.overrideEnv} at its ${spec.entry}. ` +
      `Tried: ${failures.join('; ')}`,
  );
}

/**
 * The user's own binary, in the order that keeps blobot out of the credential business: an
 * explicit setting, then the environment the bridge itself reads, then `PATH`.
 */
export function resolveBridgeExecutable(spec: NpmBridgeSpec, explicit?: string): string {
  const candidates = [explicit, process.env[spec.executableEnv]].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
    throw new Error(`${spec.binary} executable not found at ${candidate}`);
  }
  const fromPath = searchPath(spec.binary);
  if (fromPath !== undefined) return fromPath;
  throw new Error(
    `${spec.binary} was not found on PATH. Install ${spec.install}, or set ` +
      `${spec.executableEnv} to its path.`,
  );
}
