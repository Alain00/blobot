import { CURSOR_MACHINE_IMAGE } from './image.js';
import { LocalMachine } from '../../machines/local-machine.js';
import type { Machine } from '../../machines/machine.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { childEnvironment } from '../../process/child-env.js';
import { isExecutable, searchPath } from '../../process/child-transport.js';
import type { LineTransport } from '../acp/jsonrpc.js';
import { cursorCliConfig } from './permissions.js';

/**
 * The version this adapter was measured against (`.scratch/cursor-runtime/issues/01`,
 * 2026-08-31, three live turns on this machine).
 *
 * **Not enforced**, the same way OpenCode's and fx's are not: `cursor-agent` is the user's own
 * binary on the vendor's own update channel — it auto-updates by default and no per-process
 * off-switch was found, which ticket 05 records as an accepted named risk. A mismatch goes to
 * stderr and the launch continues; refusing to start a team because the vendor shipped a
 * release overnight would be blobot breaking a working machine.
 */
export const VERIFIED_CURSOR_VERSION = '2026.08.25-3e8eec8';

/**
 * Flags blobot will never pass, named so a test can pin the refusal rather than the absence.
 *
 * `--worktree` is Cursor's own worktrees under `~/.cursor/worktrees/` — somebody else's version
 * of ticket 10's AgentWorkspace, ruled out of scope on the map. `--force` / `--yolo` are ticket
 * 14's ceiling. `--api-key` / `--auth-token` would make blobot the thing that carries a
 * credential. `--plugin-dir` is a vendor surface ADR-0003's palette exists to not offer.
 */
export const FORBIDDEN_CURSOR_ARGS = [
  '--worktree',
  '--force',
  '--yolo',
  '--api-key',
  '--auth-token',
  '--plugin-dir',
] as const;

export interface SpawnCursorOptions {
  readonly machine?: Machine;
  /** The AgentWorkspace. Passed as `--workspace` as well as `cwd`, because an implicit cwd is
   *  a worse contract — and it is the pair ticket 01's measurement rig ran with. */
  readonly cwd: string;
  /** The per-agent config directory. Becomes `CURSOR_CONFIG_DIR` on the child. */
  readonly configDir: string;
  readonly config?: Readonly<Record<string, unknown>>;
  /** The user's own `cursor-agent`, from detection. */
  readonly cursorExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly onStderr?: (line: string) => void;
}

export type SpawnCursor = (options: SpawnCursorOptions) => LineTransport;

/**
 * One `cursor-agent acp` process per agent.
 *
 * The identity argument is the same as fx's and it is not a preference: the loopback server's
 * bearer token **is** the agent's identity, so a process shared between two agents would be two
 * agents sharing one identity. `CURSOR_CONFIG_DIR` is what makes the process one agent's:
 * ticket 01 measured it carrying `cli-config.json` (the posture, enforced) and `acp-sessions/`
 * (resume state), and nothing else — the login survives outside it, which is exactly the split
 * blobot needs.
 *
 * argv is `acp --workspace <ws>` and nothing more. The sandbox travels in `cli-config.json`
 * rather than as `--sandbox`, because one file carrying the whole posture beats a posture split
 * between a file and an argv, and the file is the half ticket 01 measured as enforced.
 */
export const spawnCursor: SpawnCursor = (options) => {
  const machine = options.machine ?? new LocalMachine({ agentId: 'standalone', workspacePath: options.cwd });
  return machine.spawn({
    command: { kind: 'exec', executable: machine.kind === 'box' ? CURSOR_MACHINE_IMAGE.executable : resolveCursorExecutable(options.cursorExecutable), args: cursorArgv(options.cwd) },
    cwd: options.cwd,
    env: cursorEnvironmentLayer(options),
    ...(machine.kind === 'box' ? { configs: [{ root: '/home/agent', relativePath: '.config/blobot/cursor/cli-config.json',
      patch: options.config ?? { ...cursorCliConfig('normal', 'box') } }] } : {}),
    ...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
  });
};

/** The whole of the command line, built in one place so the refusals are testable. */
export function cursorArgv(cwd: string): readonly string[] {
  return ['acp', '--workspace', cwd];
}

/**
 * The child's environment: blobot's config dir, and never a credential.
 *
 * Stripping `CURSOR_API_KEY` and `CURSOR_AUTH_TOKEN` is load-bearing (ticket 05). They may sit
 * in the user's shell for other reasons, and a child that inherited either would make blobot
 * the path that carries a Cursor key, which `CLAUDE.md` forbids outright. The login the child
 * uses is the one `cursor-agent login` established, which lives outside `CURSOR_CONFIG_DIR`
 * and survives the relocation — measured, ticket 01.
 */
export function childEnv(options: SpawnCursorOptions): NodeJS.ProcessEnv {
  // `childEnvironment` strips blobot's own speech-key doors (ADR-0005) before this strips
  // Cursor's: two credentials that must not travel, two places that say so.
  return childEnvironment(cursorEnvironmentLayer(options));
}

/** Undefined explicitly removes inherited values when LocalMachine composes the environment. */
function cursorEnvironmentLayer(options: SpawnCursorOptions): NodeJS.ProcessEnv {
  return {
    ...options.env,
    // stderr is diagnostics and the only channel that would carry colour; stdout is protocol.
    NO_COLOR: '1',
    CURSOR_API_KEY: undefined,
    CURSOR_AUTH_TOKEN: undefined,
    CURSOR_CONFIG_DIR: options.machine?.kind === 'box' ? '/home/agent/.config/blobot/cursor' : options.configDir,
  };
}

/**
 * The user's own binary: an explicit path from detection, then `CURSOR_AGENT_BIN`, then
 * `cursor-agent` on `PATH`, then where the vendor's installer puts it.
 *
 * **Never the bare name `agent`**, which the installer also drops and which is about the most
 * collision-prone name a binary can have on a developer's `PATH`. Ticket 05's answer: the
 * distinctive name always exists after a real install, so nothing ever needs to look at the
 * ambiguous one, and no verification machinery is needed because nothing can be fooled.
 */
export function resolveCursorExecutable(explicit?: string): string {
  const candidates = [explicit, process.env['CURSOR_AGENT_BIN']].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
    throw new Error(`cursor-agent executable not found at ${candidate}`);
  }
  const fromPath = searchPath('cursor-agent');
  if (fromPath !== undefined) return fromPath;
  const installed = join(homedir(), '.local', 'bin', 'cursor-agent');
  if (isExecutable(installed)) return installed;
  throw new Error(
    'cursor-agent was not found on PATH. Install the Cursor CLI, or set CURSOR_AGENT_BIN to its path.',
  );
}
