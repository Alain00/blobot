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
  /**
   * Other names to search after the primary misses. Cursor's installer also drops `agent`,
   * which is too collision-prone to believe without `looksLike`.
   */
  readonly alsoNamed?: readonly string[];
  /**
   * When set, a located binary is only accepted if this is true of `--version` / `about`
   * (or of the path itself). The collision-prone `agent` name is why this exists.
   */
  readonly looksLike?: (stdout: string, path: string) => boolean;
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
  supported: true,
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

/**
 * Codex, measured 2026-08-30 against codex-cli 0.148.0.
 *
 * `codex login status` is the signal, and it has the same asymmetric shape ticket 11 recorded
 * for the other two: exit 0 and *"Logged in using ChatGPT"* where a credential exists, exit 1
 * and *"Not logged in"* where none does. A negative is reliable, a positive is not, and the word
 * *authenticated* still does not appear. Both states were observed without touching the user's
 * own login: the negative was produced by pointing `CODEX_HOME` at an empty directory.
 *
 * `extraDirs` carries npm's user prefix as well as `~/.local/bin`, because Codex is installed
 * with `npm install -g` and npm's global bin is wherever `npm prefix -g` points. On this machine
 * that is `~/.local/bin`, which the cascade already searched; the common alternatives are
 * `/usr/local/bin`, which is on every default `PATH` and so is found by layer one, and a user
 * prefix, which is what `.npm-global/bin` is here for. Anything stranger is layer three's job:
 * the login shell knows a `PATH` this process does not.
 *
 * `supported` was false while ticket 04 was the whole of this, and is true now that ticket 05's
 * adapter exists: `runtimeFor` turns `codex` into a `CodexAgentRuntime`, so offering to install
 * and sign in is offering a door that leads somewhere.
 */
const CODEX: RuntimeProbe = {
  runtimeId: 'codex',
  label: 'Codex',
  binary: 'codex',
  supported: true,
  extraDirs: ['.local/bin', '.npm-global/bin'],
  probeAuth: async (path, run) => {
    const result = await run(path, ['login', 'status'], { timeoutMs: 5_000 });
    if (result.code === 0) return { readiness: 'ready', detail: 'Signed in on this machine' };
    if (result.code === 1) return { readiness: 'needs_sign_in', detail: 'Installed, not signed in' };
    return { readiness: 'unknown', detail: 'Installed; sign-in state could not be read' };
  },
};

/**
 * Cursor CLI. The documented command is `agent`; the installer also drops `cursor-agent`.
 * We probe the distinctive name first and only believe a bare `agent` when `--version` or
 * `about` looks like Cursor — a cascade that finds *an* `agent` and reports Cursor ready
 * would be lying about the user's machine, which is the one thing ticket 11 exists not to do.
 *
 * `agent status --format json` is the sign-in signal. A negative is reliable, a positive is
 * not, and the word *authenticated* does not appear.
 */
const CURSOR: RuntimeProbe = {
  runtimeId: 'cursor',
  label: 'Cursor',
  binary: 'cursor-agent',
  alsoNamed: ['agent'],
  looksLike: looksLikeCursor,
  supported: true,
  extraDirs: ['.local/bin'],
  probeAuth: async (path, run) => {
    const result = await run(path, ['status', '--format', 'json'], { timeoutMs: 5_000 });
    return parseCursorStatus(result.stdout, result.code, result.stderr);
  },
};

/** The runtimes the picker offers, in order. `supported` says which blobot can construct. */
export const RUNTIME_PROBES: readonly RuntimeProbe[] = [CLAUDE_CODE, OPENCODE, CODEX, CURSOR];

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
  const names = [probe.binary, ...(probe.alsoNamed ?? [])];
  for (const binary of names) {
    const found = await locateBinary(binary, probe.extraDirs, run, where);
    if (found === undefined) continue;
    if (probe.looksLike === undefined) return found;
    if (await confirmsIdentity(found, probe.looksLike, run)) return found;
  }
  return undefined;
}

async function locateBinary(
  binary: string,
  extraDirs: readonly string[],
  run: CommandRunner,
  where: { home: string; shell?: string },
): Promise<string | undefined> {
  const onPath = await run('command', ['-v', binary], { timeoutMs: 3_000 }).catch(() => undefined);
  const fromPath = firstLine(onPath?.code === 0 ? onPath.stdout : '');
  if (fromPath !== undefined) return fromPath;

  for (const dir of extraDirs) {
    const candidate = join(where.home, dir, binary);
    const runs = await run(candidate, ['--version'], { timeoutMs: 5_000 }).catch(() => undefined);
    if (runs?.code === 0) return candidate;
  }

  if (where.shell === undefined) return undefined;
  const viaShell = await run(where.shell, ['-ilc', `command -v ${binary}`], {
    timeoutMs: 10_000,
  }).catch(() => undefined);
  return viaShell?.code === 0 ? firstLine(viaShell.stdout) : undefined;
}

async function confirmsIdentity(
  path: string,
  looksLike: (stdout: string, path: string) => boolean,
  run: CommandRunner,
): Promise<boolean> {
  for (const args of [['--version'], ['about']] as const) {
    const result = await run(path, [...args], { timeoutMs: 5_000 }).catch(() => undefined);
    if (result !== undefined && looksLike(`${result.stdout}\n${result.stderr}`, path)) return true;
  }
  return looksLike('', path);
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
 * Whether a binary is Cursor's CLI rather than some other `agent`.
 *
 * The path is enough when it is the distinctive `cursor-agent` name. A bare `agent` has to
 * say Cursor in `--version` or `about` — otherwise this machine's `agent` is somebody else's.
 */
export function looksLikeCursor(stdout: string, path = ''): boolean {
  if (/(^|\/)cursor-agent$/.test(path)) return true;
  return /cursor/i.test(stripAnsi(stdout));
}

/**
 * `agent status --format json`, as documented. A negative is reliable; a positive is not.
 * The word *authenticated* does not appear, for the same reason it does not on the others.
 */
export function parseCursorStatus(
  stdout: string,
  code: number,
  stderr = '',
): Pick<RuntimeDetection, 'readiness' | 'detail'> {
  const text = stripAnsi(`${stdout}\n${stderr}`).trim();
  const fromJson = readCursorStatusJson(text);
  if (fromJson !== undefined) return fromJson;
  if (/not logged in|logged out|no account/i.test(text) || code === 1) {
    return { readiness: 'needs_sign_in', detail: 'Installed, not signed in' };
  }
  if (code === 0 && /logged in/i.test(text)) {
    return { readiness: 'ready', detail: 'Signed in on this machine' };
  }
  if (code === 0 && text.length > 0) {
    return { readiness: 'ready', detail: 'Signed in on this machine' };
  }
  return { readiness: 'unknown', detail: 'Installed; sign-in state could not be read' };
}

function readCursorStatusJson(
  text: string,
): Pick<RuntimeDetection, 'readiness' | 'detail'> | undefined {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  try {
    const json = JSON.parse(text.slice(start)) as Record<string, unknown>;
    const loggedIn = json['loggedIn'] ?? json['logged_in'];
    if (loggedIn === false) {
      return { readiness: 'needs_sign_in', detail: 'Installed, not signed in' };
    }
    if (loggedIn === true) return { readiness: 'ready', detail: 'Signed in on this machine' };
    if (typeof json['email'] === 'string' && json['email'].length > 0) {
      return { readiness: 'ready', detail: 'Signed in on this machine' };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * `opencode auth list` prints two independent sections — `Credentials` from `auth.json` and
 * `Environment` from env var *names* (never values). Either counts as "something is there".
 *
 * **Every line is drawn inside a box, and that is what this got wrong.** Observed against 1.18.4
 * on 2026-08-30, the real output is `┌  Credentials ~/.local/share/opencode/auth.json`, then
 * `●  GitHub Copilot oauth` per entry, closed by `└  4 credentials`. Ticket 11's research
 * recorded the section names and not the glyphs in front of them, so a heading test anchored at
 * `^credentials` matched nothing and this answered **false for every input**. It looked correct
 * for as long as the machine it was written on had no credentials, and it kept looking correct
 * after a login blobot had itself just run: the failure mode of failing closed is that it agrees
 * with you exactly until the moment it matters.
 *
 * So the box is stripped before anything is read: leading whitespace, box-drawing characters and
 * the filled or empty circles that mark an entry. Nothing else about the shape is assumed, and
 * the closing count is read as its own answer, so `0 credentials` is a negative in its own right
 * rather than an absence of entries.
 */
export function parseOpencodeAuthList(stdout: string): boolean {
  /** The frame, not the content: box drawing (U+2500..) and the geometric bullets (U+25A0..). */
  const frame = /^[\s\u2500-\u257F\u25A0-\u25FF\u2022\u00B7]+/u;
  let inSection = false;
  let counted: number | undefined;
  for (const raw of stripAnsi(stdout).split('\n')) {
    const line = raw.replace(frame, '').trim();
    if (line === '') continue;
    const summary = /^(\d+)\s+credentials?\b/i.exec(line);
    if (summary !== null) {
      counted = Number(summary[1]);
      continue;
    }
    if (/^(credentials|environment)\b/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection) return true;
  }
  return (counted ?? 0) > 0;
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
