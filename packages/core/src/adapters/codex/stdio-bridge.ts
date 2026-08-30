import {
  bridgeEntryPathOf,
  resolveBridgeExecutable,
  spawnNpmBridge,
  type NpmBridgeSpec,
} from '../acp/npm-bridge.js';
import type { LineTransport } from '../acp/jsonrpc.js';
import { DEFAULT_TRUST, type TrustLevel } from '../../trust.js';
import { codexPostureEnv } from './permissions.js';

/** The one version this adapter is written against. Exact-pinned, checked loudly, as Claude's is. */
export const CODEX_BRIDGE_VERSION = '1.7.0';
export const CODEX_BRIDGE_PACKAGE = '@agentclientprotocol/codex-acp';

/**
 * Codex's five names. Read off the installed package's own README, 2026-08-30.
 *
 * `CODEX_PATH` matters more here than `CLAUDE_CODE_EXECUTABLE` does there. The bridge depends on
 * `@openai/codex` at `^0.148.0` — a caret range — and runs that bundled copy when the variable is
 * unset, so without it blobot does not know which Codex answered and the user's own install is
 * not the one running. Pointing at the user's binary is also what keeps the login the CLI's:
 * the bundled copy has its own `CODEX_HOME` story and blobot wants no part of one.
 */
export const CODEX_BRIDGE: NpmBridgeSpec = {
  package: CODEX_BRIDGE_PACKAGE,
  version: CODEX_BRIDGE_VERSION,
  entry: 'dist/index.js',
  overrideEnv: 'BLOBOT_CODEX_BRIDGE',
  binary: 'codex',
  executableEnv: 'CODEX_PATH',
  agent: 'Codex',
  install: 'Codex',
};

export interface SpawnCodexBridgeOptions {
  /** The AgentWorkspace. The bridge overrides the session's `cwd` with `session/new`'s. */
  readonly cwd: string;
  /** The user's own `codex`, from detection. Resolved from `CODEX_PATH` and then `PATH` when it
   *  is not given — and a failure to find one is the launch refused by name, which is what
   *  ticket 11 asks of a runtime that is not installed. */
  readonly codexExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly onStderr?: (line: string) => void;
  /** How much of the agent's own work blobot vouches for. On this runtime it is one mode id,
   *  and the same one at every level: see `permissions.ts`. */
  readonly trust?: TrustLevel;
}

export type SpawnCodexBridge = (options: SpawnCodexBridgeOptions) => LineTransport;

export const spawnCodexBridge: SpawnCodexBridge = (options) =>
  spawnNpmBridge(CODEX_BRIDGE, {
    cwd: options.cwd,
    ...(options.codexExecutable === undefined ? {} : { executable: options.codexExecutable }),
    env: {
      // The bridge advertises three ACP auth methods, and blobot takes exactly one of them:
      // the CLI's own `codex login`, on a PTY, reading none of it. `NO_BROWSER=1` hides the
      // ChatGPT method here, and the API-key and gateway methods are refused by never
      // populating `CODEX_API_KEY` or `OPENAI_API_KEY` from anything (ticket 04).
      NO_BROWSER: '1',
      // `APP_SERVER_LOGS` names a directory for the adapter's own logs, and is deliberately
      // not set: the bridge's stderr already reaches `onStderr`, and a log directory is a pile
      // of files on the user's disk that nothing in blobot would ever clean up or show.
      ...options.env,
      // Last, because the posture is not the caller's to unset. Leaving `INITIAL_AGENT_MODE`
      // off is not a neutral default: the bridge's own default mode wrote a file into the
      // user's home directory without asking once (ticket 02).
      ...codexPostureEnv(options.trust ?? DEFAULT_TRUST),
    },
    ...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
  });

export function codexBridgeEntryPath(): string {
  return bridgeEntryPathOf(CODEX_BRIDGE);
}

export function resolveCodexExecutable(explicit?: string): string {
  return resolveBridgeExecutable(CODEX_BRIDGE, explicit);
}
