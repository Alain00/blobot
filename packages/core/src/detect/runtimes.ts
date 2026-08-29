import { execFile, type ExecFileException } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Ticket 11: what the user already has, observed rather than asked for.
 *
 * The word **authenticated does not appear here**, and that is the ticket's finding rather
 * than a wording preference: every probe answers "is a credential present", never "does it
 * work" — `ANTHROPIC_API_KEY=sk-ant-fake` yields `{"loggedIn": true}`, exit 0. The signal is
 * asymmetric: a negative is reliable, a positive is not. So four honest states, and
 * **detection never gates team creation** — the user is always allowed to try.
 */
export type RuntimeReadiness = 'ready' | 'needs_sign_in' | 'not_installed' | 'unknown';

export interface RuntimeDetection {
  /** The id written to `agents.runtime_id`. The UI carries it back to us and never reads it. */
  readonly runtimeId: string;
  readonly label: string;
  readonly readiness: RuntimeReadiness;
  /**
   * Whether blobot has an adapter for it *yet*. Detection is about the user's machine and
   * this is about ours, so it is a separate field: OpenCode is detected honestly and offered
   * as "no adapter yet" rather than hidden, because hiding it would misreport their machine.
   */
  readonly supported: boolean;
  /** One honest line, shown as-is. Where "we could not tell" gets to be said out loud. */
  readonly detail: string;
  readonly executablePath?: string;
  readonly version?: string;
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Injected so the cascade and the probes are testable without the CLIs being installed. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: { readonly timeoutMs?: number },
) => Promise<CommandResult>;

export interface DetectOptions {
  readonly run?: CommandRunner;
  /** The login shell used by the alias-resolving layer. `$SHELL` by default. */
  readonly shell?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: string;
}

interface RuntimeProbe {
  readonly runtimeId: string;
  readonly label: string;
  readonly binary: string;
  readonly supported: boolean;
  /** Extra directories to look in when neither `PATH` nor the login shell finds the binary. */
  readonly extraDirs: readonly string[];
  probeAuth(path: string, run: CommandRunner): Promise<Pick<RuntimeDetection, 'readiness' | 'detail'>>;
}

const CLAUDE_CODE: RuntimeProbe = {
  runtimeId: 'claude-code',
  label: 'Claude Code',
  binary: 'claude',
  supported: true,
  extraDirs: ['.local/bin', '.claude/local'],
  probeAuth: async (path, run) => {
    // `claude auth status` exits 0 when a credential exists and 1 when none does, in ~0.24s,
    // with no network call and no directory-trust prompt.
    const result = await run(path, ['auth', 'status'], { timeoutMs: 5_000 });
    if (result.code === 0) return { readiness: 'ready', detail: 'Signed in on this machine' };
    if (result.code === 1) return { readiness: 'needs_sign_in', detail: 'Installed, not signed in' };
    return { readiness: 'unknown', detail: 'Installed; sign-in state could not be read' };
  },
};

const OPENCODE: RuntimeProbe = {
  runtimeId: 'opencode',
  label: 'OpenCode',
  binary: 'opencode',
  // Tickets 03 + 16 are deferred; `AgentRuntime` has one real implementation today.
  supported: false,
  extraDirs: ['.opencode/bin', '.local/bin'],
  probeAuth: async (path, run) => {
    // `opencode auth list` always exits 0, so stdout is the only signal — and it stays
    // ANSI-coloured even under `NO_COLOR=1`, which is why it is stripped before parsing.
    const result = await run(path, ['auth', 'list'], { timeoutMs: 5_000 });
    if (result.code !== 0) return { readiness: 'unknown', detail: 'Installed; sign-in state could not be read' };
    return parseOpencodeAuthList(result.stdout)
      ? { readiness: 'ready', detail: 'Credentials present on this machine' }
      : { readiness: 'needs_sign_in', detail: 'Installed, no credentials found' };
  },
};

/** The runtimes blobot can construct today, in the order the picker offers them. */
export const RUNTIME_PROBES: readonly RuntimeProbe[] = [CLAUDE_CODE, OPENCODE];

export async function detectRuntimes(options: DetectOptions = {}): Promise<RuntimeDetection[]> {
  const run = options.run ?? execRunner;
  const home = options.home ?? homedir();
  const shell = options.shell ?? options.env?.['SHELL'] ?? process.env['SHELL'];
  return Promise.all(
    RUNTIME_PROBES.map(async (probe) => {
      const executablePath = await locate(probe, run, { home, ...(shell === undefined ? {} : { shell }) });
      if (executablePath === undefined) {
        return {
          runtimeId: probe.runtimeId,
          label: probe.label,
          supported: probe.supported,
          readiness: 'not_installed' as const,
          detail: `No \`${probe.binary}\` on this machine`,
        };
      }
      const version = await readVersion(executablePath, run);
      const auth = await probe.probeAuth(executablePath, run);
      return {
        runtimeId: probe.runtimeId,
        label: probe.label,
        supported: probe.supported,
        executablePath,
        ...(version === undefined ? {} : { version }),
        ...auth,
      };
    }),
  );
}

/**
 * Three layers, cheapest first, and presence always comes from a **runnable binary**: a
 * config-file detector shows a confident false tick — this machine has a `0600`
 * `~/.codex/auth.json` and no `codex` installed at all.
 *
 * The login shell is layer three because it costs ~1.8s, and it is there at all because under
 * the macOS GUI `PATH` both installed CLIs return exit 127: neither `~/.local/bin` nor
 * `~/.opencode/bin` is in any system default.
 */
async function locate(
  probe: RuntimeProbe,
  run: CommandRunner,
  where: { home: string; shell?: string },
): Promise<string | undefined> {
  const onPath = await run('command', ['-v', probe.binary], { timeoutMs: 3_000 }).catch(() => undefined);
  const fromPath = firstLine(onPath?.code === 0 ? onPath.stdout : '');
  if (fromPath !== undefined) return fromPath;

  for (const dir of probe.extraDirs) {
    const candidate = join(where.home, dir, probe.binary);
    const runs = await run(candidate, ['--version'], { timeoutMs: 5_000 }).catch(() => undefined);
    if (runs?.code === 0) return candidate;
  }

  if (where.shell === undefined) return undefined;
  const viaShell = await run(where.shell, ['-ilc', `command -v ${probe.binary}`], {
    timeoutMs: 10_000,
  }).catch(() => undefined);
  return viaShell?.code === 0 ? firstLine(viaShell.stdout) : undefined;
}

async function readVersion(path: string, run: CommandRunner): Promise<string | undefined> {
  const result = await run(path, ['--version'], { timeoutMs: 5_000 }).catch(() => undefined);
  return result?.code === 0 ? parseVersion(result.stdout) : undefined;
}

/** `claude --version` prints `2.1.251 (Claude Code)`; we keep the number and drop the rest. */
export function parseVersion(stdout: string): string | undefined {
  return /\d+\.\d+\.\d+[^\s]*/.exec(stripAnsi(stdout))?.[0];
}

/**
 * `opencode auth list` prints two independent sections — `Credentials` from `auth.json` and
 * `Environment` from env var *names* (never values). Either counts as "something is there".
 */
export function parseOpencodeAuthList(stdout: string): boolean {
  const lines = stripAnsi(stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  let inSection = false;
  for (const line of lines) {
    const heading = /^(credentials|environment)\b/i.test(line);
    if (heading) {
      inSection = true;
      continue;
    }
    if (/^\d+\s+credentials?\b/i.test(line)) continue;
    if (inSection) return true;
  }
  return false;
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;?]*[A-Za-z]/g, '');
}

function firstLine(text: string): string | undefined {
  const line = stripAnsi(text).split('\n')[0]?.trim();
  return line === undefined || line === '' ? undefined : line;
}

const execRunner: CommandRunner = (command, args, options) =>
  new Promise((resolve) => {
    const done = (
      error: ExecFileException | null,
      stdout: string,
      stderr: string,
    ): void => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 127;
      resolve({ code, stdout, stderr });
    };
    const timeout = options?.timeoutMs ?? 10_000;
    // `command -v` is a shell builtin, so layer one runs through a shell; everything else is
    // a path we have already resolved and is spawned directly.
    const child =
      command === 'command'
        ? execFile('/bin/sh', ['-c', `command -v ${args[1] ?? ''}`], { timeout }, done)
        : execFile(command, [...args], { timeout }, done);
    child.on('error', () => resolve({ code: 127, stdout: '', stderr: '' }));
  });
