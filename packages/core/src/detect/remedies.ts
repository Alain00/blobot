import { RUNTIME_PROBES, type RuntimeDetection } from './runtimes.js';

/**
 * What blobot can offer to do about a runtime that is not ready.
 *
 * Ticket 11 stopped at an honest state and no way out of it: the picker said *not installed*
 * and the user was left to go and find the vendor's docs. This is the other half, and it is
 * deliberately **the user's own CLI doing its own job** — blobot spawns the vendor's login and
 * the vendor's installer in a terminal and watches, it does not reimplement either.
 *
 * The two rules that shape every field here:
 *
 * - **No credential ever reaches blobot.** The login runs in a PTY, talks to its own browser
 *   flow, and writes wherever that CLI keeps its credentials. There is no token in this
 *   process, which is the `CLAUDE.md` rule, and running the real `auth login` is the only way
 *   to honour it while still helping.
 * - **argv is ours, never the renderer's.** A remedy is looked up by `runtimeId` and `kind`
 *   from this table. Nothing a user types becomes part of a command line, and the install
 *   script is the vendor's published URL written here rather than anything resolved at runtime.
 */
export type RemedyKind = 'sign_in' | 'install';

export interface RuntimeRemedy {
  readonly kind: RemedyKind;
  readonly runtimeId: string;
  /** Spawned exactly as written, in a PTY, with no shell in front of it unless it says so. */
  readonly argv: readonly string[];
  /** The same command as a person reads it. The install confirm shows this before it runs. */
  readonly shown: string;
  /** One line saying what is about to happen. Shown under the command. */
  readonly note: string;
}

/**
 * The vendors' own install commands, verified live 2026-08-30 (both return 200).
 *
 * A piped shell script is what each vendor's documentation tells a user to run, and blobot
 * running something *else* would install a build the vendor does not support and put a binary
 * somewhere its own updater will not find. It is shown in full and confirmed before it runs:
 * the user is agreeing to the command they would have pasted themselves.
 *
 * The first two land in `~/.local/bin`, which is already in the cascade `detectRuntimes`
 * searches when `PATH` misses it, so a fresh install is found without the app being restarted.
 *
 * Codex is the odd one: its published command is npm's, so where the binary lands is wherever
 * `npm prefix -g` points, which is `~/.local/bin` on the machine this was written on and
 * `/usr/local/bin` on a default install. The probe searches the first and layer one of the
 * cascade finds the second, since `/usr/local/bin` is on every default `PATH`.
 */
const INSTALL_SCRIPTS: Readonly<Record<string, string>> = {
  'claude-code': 'curl -fsSL https://claude.ai/install.sh | bash',
  opencode: 'curl -fsSL https://opencode.ai/install | bash',
  codex: 'npm install -g @openai/codex',
};

/**
 * The subcommand that signs a runtime in. Both are a real subcommand rather than a slash
 * command typed into a REPL, which is what makes them watchable: the process exits when the
 * user is done, and its exit is the moment to ask the machine again.
 */
const SIGN_IN_ARGS: Readonly<Record<string, readonly string[]>> = {
  'claude-code': ['auth', 'login'],
  opencode: ['auth', 'login'],
  // Bare `codex login` is the ChatGPT browser flow, which is the one of Codex's three auth
  // methods blobot will take. `--with-api-key` and `--with-access-token` read a credential from
  // stdin, and this is a PTY blobot owns: passing either would make blobot the thing that
  // carries the credential, which `CLAUDE.md` forbids outright. They are absent by construction
  // and this table is the only place argv is built.
  codex: ['login'],
};

/**
 * What to offer for one detected runtime, which is at most one thing.
 *
 * `ready` offers nothing: a credential is present, and a second door labelled *sign in* beside
 * a runtime that is working reads as blobot doubting its own answer. `unknown` offers the
 * sign-in, because a state we could not read is still a state the login fixes.
 *
 * Windows gets nothing, and says so by absence rather than by a button that fails: the ticket
 * 11 research covers no Windows at all, and neither install script is a Windows command.
 */
export function remediesFor(
  detection: RuntimeDetection,
  platform: NodeJS.Platform = process.platform,
): RuntimeRemedy[] {
  if (platform === 'win32') return [];
  const probe = RUNTIME_PROBES.find((entry) => entry.runtimeId === detection.runtimeId);
  if (probe === undefined || !probe.supported) return [];

  if (detection.readiness === 'not_installed') {
    const script = INSTALL_SCRIPTS[detection.runtimeId];
    if (script === undefined) return [];
    return [
      {
        kind: 'install',
        runtimeId: detection.runtimeId,
        // `-l` so the script sees the login shell's environment, which is where a user's
        // `~/.local/bin` and any proxy settings live. It is the shell they would have run it in.
        argv: ['/bin/sh', '-lc', script],
        shown: script,
        note: `This is ${probe.label}'s own install command. blobot runs it as you, in the terminal below.`,
      },
    ];
  }

  if (detection.readiness === 'ready') return [];

  const args = SIGN_IN_ARGS[detection.runtimeId];
  // The detected binary rather than the name: `locate` may have found it somewhere no `PATH`
  // this process has would reach, which is the whole point of the cascade that found it.
  const executable = detection.executablePath;
  if (args === undefined || executable === undefined) return [];
  return [
    {
      kind: 'sign_in',
      runtimeId: detection.runtimeId,
      argv: [executable, ...args],
      shown: `${probe.binary} ${args.join(' ')}`,
      note: `${probe.label} signs you in itself and may open a browser. Nothing you type here reaches blobot.`,
    },
  ];
}

/** The one remedy a caller asked for, by the two ids the renderer is allowed to send. */
export function remedyFor(
  detection: RuntimeDetection,
  kind: RemedyKind,
  platform: NodeJS.Platform = process.platform,
): RuntimeRemedy | undefined {
  return remediesFor(detection, platform).find((remedy) => remedy.kind === kind);
}
