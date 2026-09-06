import { OPENCODE_MACHINE_IMAGE } from './image.js';
import { LocalMachine } from '../../machines/local-machine.js';
import type { Machine } from '../../machines/machine.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isExecutable, searchPath } from '../acp/child-transport.js';
import type { LineTransport } from '../acp/jsonrpc.js';

/**
 * The version this adapter was written and observed against (research 03 and 16, 2026-08-29).
 *
 * Unlike the Claude bridge's pin, this is **not** enforced. The bridge is a dependency blobot
 * chose and installs; `opencode` is the user's own binary, which they update on their own
 * schedule, and refusing to start a team because they are one release ahead would be blobot
 * breaking a working machine. A mismatch is reported on stderr and the launch continues.
 */
export const VERIFIED_OPENCODE_VERSION = '1.18.4';

export interface SpawnOpencodeOptions {
  readonly machine?: Machine;
  /** The AgentWorkspace. Also passed per-session: `cwd` binds to the session, not the process. */
  readonly cwd: string;
  /** The user's own `opencode`. Resolved from `OPENCODE_BIN`, then `PATH`, then `~/.opencode/bin`. */
  readonly opencodeExecutable?: string;
  /** The persona and posture, as `OPENCODE_CONFIG_CONTENT`. See `config.ts`. */
  readonly configContent?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly onStderr?: (line: string) => void;
}

export type SpawnOpencode = (options: SpawnOpencodeOptions) => LineTransport;

/**
 * One `opencode acp` process per agent.
 *
 * OpenCode binds `cwd` per session rather than per process, so one process could serve a
 * whole team (research 03 §2.1). It does not, for two reasons: `OPENCODE_CONFIG_CONTENT` is
 * per process and carries exactly one persona, and a shared process makes one agent's crash
 * everybody's. Uniform with the Claude adapter, and for the same reason.
 *
 * **`--pure` is deliberately not passed**, against research 03's suggestion. It runs OpenCode
 * without external plugins, and on this machine the user's global config loads an *auth*
 * plugin: a determinism flag that can log the user out is not a trade blobot gets to make.
 * The command menu is controlled where ADR-0003 says it belongs, in `palette.ts`, which
 * decides what blobot *offers* rather than what the agent *can do*.
 */
export const spawnOpencode: SpawnOpencode = (options) => {
  const machine = options.machine ?? new LocalMachine({ agentId: 'standalone', workspacePath: options.cwd });
  return machine.spawn({
    command: { kind: 'exec', executable: machine.kind === 'box' ? OPENCODE_MACHINE_IMAGE.executable : resolveOpencodeExecutable(options.opencodeExecutable), args: ['acp'] },
    cwd: options.cwd,
    env: {
      ...options.env,
      ...(options.configContent === undefined
        ? {}
        : { OPENCODE_CONFIG_CONTENT: options.configContent }),
      // stderr is diagnostics, and it is the only channel that would carry colour. stdout is
      // protocol and was observed clean from byte 0 either way.
      NO_COLOR: '1',
    },
    ...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
  });
};

/**
 * The user's own binary: an explicit setting, then `OPENCODE_BIN`, then `PATH`, then the
 * install directory the official installer uses.
 *
 * Same shape as the Claude adapter's, and same reason: blobot is not in the credential
 * business, so it runs the binary the user already logged in with.
 */
export function resolveOpencodeExecutable(explicit?: string): string {
  const candidates = [explicit, process.env.OPENCODE_BIN].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
    throw new Error(`opencode executable not found at ${candidate}`);
  }
  const fromPath = searchPath('opencode');
  if (fromPath !== undefined) return fromPath;
  const installed = join(homedir(), '.opencode', 'bin', 'opencode');
  if (isExecutable(installed)) return installed;
  throw new Error(
    'opencode was not found on PATH. Install OpenCode, or set OPENCODE_BIN to its path.',
  );
}
