import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { childTransport, isExecutable, searchPath } from '../acp/child-transport.js';
import type { LineTransport } from '../acp/jsonrpc.js';

/**
 * The version this adapter was written against from Cursor's published ACP docs (2026-08-31).
 *
 * Not enforced: `cursor-agent` is the user's binary on the user's update schedule. A mismatch
 * is reported on stderr and the launch continues, the way OpenCode's does.
 */
export const VERIFIED_CURSOR_VERSION = 'unmeasured';

/**
 * Flags blobot will never pass, named so a test can pin the refusal rather than the absence.
 *
 * `--worktree` is Cursor's own worktrees under `~/.cursor/worktrees/`, a different object in a
 * different place from ticket 10's AgentWorkspace. `--force` / `--yolo` are ticket 14's
 * ceiling. `--api-key` would make blobot the thing that carries a credential.
 */
export const FORBIDDEN_CURSOR_ARGS = ['--worktree', '--force', '--yolo', '--api-key'] as const;

export interface SpawnCursorOptions {
  /** The AgentWorkspace. Also passed as `--workspace`, because an implicit cwd is a worse contract. */
  readonly cwd: string;
  /** Per-agent config directory. Becomes `CURSOR_CONFIG_DIR` on the child. */
  readonly configDir: string;
  /** The user's own `cursor-agent` (or a verified `agent`). From detection. */
  readonly cursorExecutable?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly onStderr?: (line: string) => void;
}

export type SpawnCursor = (options: SpawnCursorOptions) => LineTransport;

/**
 * One `cursor-agent acp` (or `agent acp`) process per agent.
 *
 * `--sandbox enabled` is ticket 10, not ticket 14: the AgentWorkspace is the writable world.
 * `--approve-mcps` is for the one server in *this* config dir — blobot's loopback — so a
 * mailbox that waits for a human has not started. `--trust` is Cursor's workspace-trust
 * prompt, not blobot's trust word: this folder is one blobot created.
 */
export const spawnCursor: SpawnCursor = (options) => {
  const args = [
    'acp',
    '--workspace',
    options.cwd,
    '--sandbox',
    'enabled',
    '--approve-mcps',
    '--trust',
  ];
  const child = spawn(resolveCursorExecutable(options.cursorExecutable), args, {
    cwd: options.cwd,
    env: childEnv(options),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return childTransport(child, options.onStderr);
};

/**
 * The child's environment: our config dir, no API key, no auth token.
 *
 * Stripping the two credential variables is load-bearing. They may be in the user's shell
 * for other reasons; putting them on this child would make blobot the path that carries a
 * Cursor key, which `CLAUDE.md` forbids. The CLI's own `agent login` is the login.
 */
export function childEnv(options: SpawnCursorOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...options.env, NO_COLOR: '1' };
  delete env['CURSOR_API_KEY'];
  delete env['CURSOR_AUTH_TOKEN'];
  env['CURSOR_CONFIG_DIR'] = options.configDir;
  return env;
}

/**
 * Prefer `cursor-agent`. The documented command is `agent`, which is about the most
 * collision-prone name on a developer's PATH; detection verifies identity before believing
 * that one. Here we take an explicit path from detection, then `CURSOR_AGENT_BIN`, then
 * `cursor-agent` on PATH, then the installer location.
 */
export function resolveCursorExecutable(explicit?: string): string {
  const candidates = [explicit, process.env['CURSOR_AGENT_BIN']].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
    throw new Error(`cursor-agent executable not found at ${candidate}`);
  }
  const fromPath = searchPath('cursor-agent') ?? searchPath('agent');
  if (fromPath !== undefined) return fromPath;
  const installed = join(homedir(), '.local', 'bin', 'cursor-agent');
  if (isExecutable(installed)) return installed;
  const agentInstalled = join(homedir(), '.local', 'bin', 'agent');
  if (isExecutable(agentInstalled)) return agentInstalled;
  throw new Error(
    'cursor-agent was not found on PATH. Install Cursor CLI, or set CURSOR_AGENT_BIN to its path.',
  );
}
