import { FX_MACHINE_IMAGE } from './image.js';
import { LocalMachine } from '../../machines/local-machine.js';
import type { Machine } from '../../machines/machine.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isExecutable, searchPath } from '../../process/child-transport.js';
import type { LineTransport } from '../acp/jsonrpc.js';
import type { TrustLevel } from '../../trust.js';
import { fxPermissionEnv } from './permissions.js';

/**
 * The version this adapter was written and observed against
 * (`.scratch/fx-runtime/research/01-acp-surface.md`, 2026-08-31).
 *
 * **Not enforced**, the same way OpenCode's is not and unlike the two pinned npm bridges: `fx`
 * is the user's own binary on the user's own upgrade channel — it even ships `fx upgrade` — and
 * refusing to start a team because they are one release ahead would be blobot breaking a working
 * machine. A mismatch goes to stderr and the launch continues.
 */
export const VERIFIED_FX_VERSION = '0.0.7';

export interface SpawnFxOptions {
  readonly machine?: Machine;
  /** The AgentWorkspace. fx binds the workspace to the process's cwd, so this is the whole of
   *  what makes one process one agent. */
  readonly cwd: string;
  /** The user's own `fx`. Resolved from `FX_BIN`, then `PATH`, then the installer's directory. */
  readonly fxExecutable?: string;
  /** Ticket 14's posture. Not optional, and `permissions.ts` says what happens without it. */
  readonly trust: TrustLevel;
  readonly env?: Readonly<Record<string, string>>;
  readonly onStderr?: (line: string) => void;
}

export type SpawnFx = (options: SpawnFxOptions) => LineTransport;

/**
 * One `fx acp` process per agent.
 *
 * fx documents one server per workspace and blobot has no reason to argue: the workspace is the
 * process's cwd, the persona is per prompt and therefore per instance, and the loopback server's
 * bearer token **is** the agent's identity, so a process shared between two agents would be two
 * agents sharing one identity. That last one is not a preference.
 *
 * `--log-file` is deliberately not passed. fx reserves stdout for the protocol and sends
 * diagnostics to stderr, which `childTransport` already forwards to the caller, and a log file
 * would be a path blobot chose on a disk nobody asked it to write to.
 */
export const spawnFx: SpawnFx = (options) => {
  const machine = options.machine ?? new LocalMachine({ agentId: 'standalone', workspacePath: options.cwd });
  return machine.spawn({
    command: { kind: 'exec', executable: machine.kind === 'box' ? FX_MACHINE_IMAGE.executable : resolveFxExecutable(options.fxExecutable), args: ['acp'] },
    cwd: options.cwd,
    env: {
      ...options.env,
      // The posture reaches the process here, in its environment, and dies with it. Nothing is
      // written into the AgentWorkspace, which is a checkout of the user's repository.
      ...fxPermissionEnv(options.trust),
      // fx opens a browser of its own accord when a credential needs refreshing. An agent on a
      // team is not a person at a terminal, and a browser tab appearing during someone else's
      // turn is not a thing blobot will cause. A credential that has actually expired fails the
      // launch instead, where ticket 11's remedies can say so.
      FX_NO_OPEN_BROWSER: '1',
      // stderr is diagnostics and the only channel that would carry colour; stdout is protocol.
      NO_COLOR: '1',
    },
    ...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
  });
};

/**
 * The user's own binary: an explicit setting, then `FX_BIN`, then `PATH`, then where the
 * vendor's installer puts it.
 *
 * Same shape and same reason as the other two: blobot is not in the credential business, so it
 * runs the binary the user already signed in with. `~/.local/bin` is where
 * `https://fx.sh/setup.sh` lands it, and it is already layer one of the cascade
 * `detectRuntimes` searches.
 */
export function resolveFxExecutable(explicit?: string): string {
  const candidates = [explicit, process.env.FX_BIN].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
    throw new Error(`fx executable not found at ${candidate}`);
  }
  const fromPath = searchPath('fx');
  if (fromPath !== undefined) return fromPath;
  const installed = join(homedir(), '.local', 'bin', 'fx');
  if (isExecutable(installed)) return installed;
  throw new Error('fx was not found on PATH. Install fx, or set FX_BIN to its path.');
}
