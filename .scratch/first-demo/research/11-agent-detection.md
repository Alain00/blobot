# Detecting installed and authenticated agents

Findings for `.scratch/first-demo/issues/11-detecting-installed-and-authenticated-agents.md`.

**Evidence labels used throughout:**

- **OBSERVED** — I ran it on this machine (Linux x86_64, zsh, `claude` 2.1.251, `opencode` 1.18.4) on 2026-08-29.
- **BINARY** — read out of the shipped `opencode` 1.18.4 executable's bundled JavaScript. Strong, but version-specific.
- **DOCUMENTED** — stated by first-party docs; URL cited.
- **INFERRED** — my reasoning, not verified anywhere.

Anything macOS- or Windows-specific is **not verified** — this is a Linux box. Those are flagged inline.

---

## 0. TL;DR — the recommendation

| CLI | Presence + version | Auth state | What the UI may claim |
| --- | --- | --- | --- |
| **Claude Code** | `claude --version` → `2.1.251 (Claude Code)`; `claude doctor` for install method | `claude auth status --json` — **exit 0 = a credential exists, exit 1 = none**, JSON body names the method | "Ready" / "Not signed in" — but see §4.1, `loggedIn: true` does **not** mean the credential is *valid* |
| **OpenCode** | `opencode --version` → bare `1.18.4` | `opencode auth list` (always exit 0) — parse section footers; supplement with `opencode models` | "Ready" / "No provider configured". Never claim "authenticated" |
| **Codex CLI** | `codex --version` → `codex-cli 0.114.0` (note the *prefix*) | `codex login status` — **exit 0 = logged in, exit 1 = `Not logged in`** (on stderr), fully local | Same as Claude Code. The best-behaved of the four |
| **Gemini CLI** | `gemini --version` → bare semver, or the literal `unknown` | **no probe exists.** No `gemini auth status`; auth is a TUI slash command only | **"Status unknown".** Do not claim either way |

The single most important structural finding: **every probe available to us answers "is a credential present and a mechanism selected", never "will a prompt actually succeed".** That gap is unbridgeable without spending money. §4 says what to do about it.

---

## 1. The PATH problem

### 1.1 What a spawned Electron process actually sees

An Electron main process launched from a **GUI** (Dock, Finder, Start Menu, `.desktop` entry) does **not** inherit a shell. It inherits the environment of the launching service manager. Concretely, on macOS a GUI-launched app gets the `launchd` environment, whose `PATH` is whatever `/usr/libexec/path_helper` produced — in practice `/usr/bin:/bin:/usr/sbin:/sbin`, plus `/etc/paths.d` entries. Nothing from `~/.zshrc`, `~/.zprofile`, `~/.bash_profile`, nvm, pyenv, Homebrew's `shellenv`, or a `~/.local/bin` line.

**OBSERVED** — simulating exactly that PATH on this machine:

```
$ env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin sh -c 'command -v claude'
exit=127
$ env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin sh -c 'command -v opencode'
exit=127
```

Both CLIs are installed and working on this machine. Under the macOS-GUI-shaped PATH, **both are invisible.** This is not an edge case: it is the default outcome for a double-clicked Electron app on macOS, and blobot's entire pitch dies on it.

The interactive PATH on this machine, for contrast (**OBSERVED**):

```
/home/alain/.local/bin : /home/linuxbrew/.linuxbrew/bin : /home/linuxbrew/.linuxbrew/sbin
: /home/alain/.openfang/bin : /home/alain/.opencode/bin : /home/alain/.fly/bin
: /home/alain/.pyenv/shims : ... : /home/alain/.local/share/pnpm
: /home/alain/.config/nvm/versions/node/v26.7.0/bin : /home/alain/.cargo/bin : ...
```

`claude` lives in `~/.local/bin` and `opencode` in `~/.opencode/bin`. **Neither directory is in any system default PATH on any platform.** They exist only because a shell rc file put them there.

### 1.2 The alias / shell-function problem

A `claude` that is an **alias** or a **shell function** is not a file on disk and cannot be spawned by `child_process` at all. `execve` resolves files; aliases live inside a shell's symbol table.

**OBSERVED** — with a `.zshrc` containing `alias faketool="echo hi"` and `export PATH="$PATH:/opt/fake/bin"`:

```
# non-interactive, non-login zsh -c   (equivalent to what a spawn sees)
NOT FOUND
PATH missing /opt/fake/bin

# interactive login zsh -ilc
alias faketool='echo hi'
PATH has /opt/fake/bin
```

So even *harvesting a login shell's PATH* does not recover an alias — you have to ask the shell to resolve the name, not just report its PATH.

This is a real installed-base problem, not a hypothetical. Anthropic's own docs call it out: uninstalling Claude Code may leave you with "a second installation or **a leftover shell alias from an older installer**" ([Advanced setup → Uninstall](https://code.claude.com/docs/en/setup)). And Claude Code itself scans specific rc files looking for exactly this — **DOCUMENTED**:

> `claude update` and `claude doctor` scan your shell configuration files for an outdated `claude` alias: `~/.zshrc`, `~/.bashrc`, and `~/.config/fish/config.fish`, plus on macOS the first of `~/.bash_profile`, `~/.bash_login`, or `~/.profile` that exists. If you set `ZDOTDIR`, the Zsh file is `$ZDOTDIR/.zshrc` instead.
> — [Troubleshoot installation and login](https://code.claude.com/docs/en/troubleshoot-install)

That list is a free, first-party-vetted answer to "which rc files matter", and blobot should reuse it verbatim.

OpenCode maintains its own equivalent list. **BINARY** — from the uninstall routine in `opencode` 1.18.4, keyed on `basename($SHELL)`:

```js
fish: [ $XDG_CONFIG_HOME/fish/config.fish ]
zsh:  [ ~/.zshrc, ~/.zshenv, $XDG_CONFIG_HOME/zsh/.zshrc, $XDG_CONFIG_HOME/zsh/.zshenv ]
bash: [ ~/.bashrc, ~/.bash_profile, ~/.profile,
        $XDG_CONFIG_HOME/bash/.bashrc, $XDG_CONFIG_HOME/bash/.bash_profile ]
ash:  [ ~/.ashrc, ~/.profile ]
sh:   [ ~/.profile ]
```

(It then looks for a line containing `# opencode` or `.opencode/bin`.)

### 1.3 The mitigation, in the order blobot should apply it

A three-layer cascade. Each layer is cheap and each catches what the previous one missed.

**Layer 1 — hydrate PATH from the user's login shell, once, at app start.**

The canonical approach is Sindre Sorhus's `shell-env` / `fix-path` pair, which Electron apps have used for a decade. The mechanic is: spawn `$SHELL` as an *interactive login* shell, have it print its environment between two random marker strings (so rc-file noise — banners, `fortune`, motd — can be discarded), parse what's between the markers, and assign `process.env.PATH`.

**OBSERVED** — the equivalent by hand on this machine, and its cost:

```
$ time /usr/bin/zsh -ilc 'echo "PATH_MARKER:$PATH"'
PATH_MARKER:/home/alain/.local/bin:/home/linuxbrew/.linuxbrew/bin:...
1.80s total
```

**1.8 seconds.** That is not free, and it is entirely rc-file-dependent — a user with a heavy `oh-my-zsh` + `nvm` + `pyenv` setup can be much slower. Consequences for blobot:

- Do it **once** at main-process startup, cache the result for the session, and never do it per-detection.
- **Time it out** (2–5s) and fall back to the raw `process.env.PATH` plus Layer 2. `-i` runs rc files that can prompt, `read`, or block on a network call; an unbounded wait will hang first-run forever.
- Discard stdout noise with markers. Do not `echo $PATH` alone and parse the whole stream.
- **Do not use the login shell for anything but reading environment.** We are harvesting `PATH`, not executing user intent.

What `fix-path` actually does (**DOCUMENTED**, [sindresorhus/fix-path `index.js`](https://github.com/sindresorhus/fix-path)) is worth copying rather than depending on, because it is fourteen lines:

```js
export default function fixPath() {
  if (process.platform === 'win32') return;
  const shellPath = shellPathSync();
  process.env.PATH = (shellPath ? stripAnsi(shellPath) : undefined) || [
    './node_modules/.bin', '/.nodebrew/current/bin', '/usr/local/bin', process.env.PATH,
  ].join(':');
}
```

Two details there matter to us: it **strips ANSI** (rc files that print coloured banners will otherwise poison the parsed PATH), and it **has a hardcoded fallback** for when the shell probe fails or returns empty. Both are non-obvious and both are necessary. Its README also flags an Electron interaction: "Packaged Electron apps launched from Finder may not quit properly."

The underlying `shell-env` (**DOCUMENTED**, [sindresorhus/shell-env](https://github.com/sindresorhus/shell-env)) contributes several hard-won details:

- It invokes the shell's **`command` builtin** so that a user alias or function named `env` cannot hijack the probe. Do the same.
- It delimits the env dump with a sentinel (`_SHELL_ENV_DELIMITER_`) to separate startup noise from the payload — this is the marker technique described above.
- On Windows it returns `process.env` unchanged, no spawn.
- If `$SHELL` is a non-POSIX shell (nushell, and by extension fish's differing flag semantics), it **falls back to `/bin/zsh` or `/bin/bash`**.
- It sets `ZSH_TMUX_AUTOSTARTED=1` / `ZSH_TMUX_AUTOSTART=false` in the child, because Oh-My-Zsh's tmux plugin will otherwise spawn a **nested tmux session** from your detection probe. This is the kind of thing you only learn by shipping.
- **Timeout behaviour could not be confirmed from primary source.** Do not assume the library protects you — impose your own timeout at the `child_process` level regardless.

Caveats worth writing down:

- `process.env.SHELL` is often **absent** in a GUI-launched macOS app, precisely because there was no shell. Fall back to the user database (`dscl . -read /Users/$USER UserShell` on macOS, `getent passwd $USER` on Linux), then `/bin/bash`. **INFERRED for the exact command shape** — verify the `dscl` invocation on macOS before shipping.
- Even when `$SHELL` *is* set, it reflects the account's **configured login shell** from Directory Services (what `chsh` writes), not whichever shell the user actually lives in. Someone who runs bash daily but never ran `chsh` still has `UserShell=/bin/zsh`, so we probe the wrong dotfiles. **Unfixable; accept it and rely on Layer 2 to cover the miss.**
- macOS + bash specifically: a login shell reads `.bash_profile`, **not `.bashrc`**. A user who put their PATH in `.bashrc` under bash is invisible to a login-shell probe. zsh is more forgiving because macOS's default `zprofile`/`zshrc` chaining sources `.zshrc` for login shells too.
- `fish` and `nushell` do not accept `-ilc` with POSIX semantics. Detect the shell basename and branch, or let these users fall through to Layer 2.
- On **Windows** none of this applies and the mitigation is unnecessary. **Not verified.**

**Layer 2 — probe a fixed list of known install locations directly.**

Independent of PATH, `stat` these. This is instant, cannot hang, and covers the GUI-launch case even if Layer 1 times out.

*Claude Code* (**DOCUMENTED** unless noted, [setup](https://code.claude.com/docs/en/setup) / [troubleshoot-install](https://code.claude.com/docs/en/troubleshoot-install)):

| Path | Install method |
| --- | --- |
| `~/.local/bin/claude` | native installer (`curl -fsSL https://claude.ai/install.sh \| bash`). **OBSERVED here:** a symlink → `~/.local/share/claude/versions/2.1.251` |
| `~/.local/share/claude/versions/<version>` | where the native binaries actually live |
| `~/.claude/local/claude` | **legacy** local npm install created by older Claude Code versions |
| `$(npm root -g)/@anthropic-ai/claude-code` | `npm install -g @anthropic-ai/claude-code` |
| `/opt/homebrew/bin/claude` (Apple Silicon), `/usr/local/bin/claude` (Intel) | `brew install --cask claude-code` or `claude-code@latest`. **Paths INFERRED** from standard Homebrew prefixes; the cask names are DOCUMENTED |
| `/usr/bin/claude` | apt / dnf / apk package `claude-code` |
| `%USERPROFILE%\.local\bin\claude.exe` | native Windows installer / WinGet `Anthropic.ClaudeCode`. **Not verified** |

*OpenCode* (install methods **DOCUMENTED** at [opencode.ai/docs](https://opencode.ai/docs/): curl script, npm/bun/pnpm/yarn, `brew install anomalyco/tap/opencode`, pacman/paru, choco/scoop/mise on Windows, GitHub Releases binaries):

| Path | Install method |
| --- | --- |
| `~/.opencode/bin/opencode` | curl installer. **OBSERVED here** — a 179 MB self-contained ELF, not a script |
| `/opt/homebrew/bin/opencode`, `/home/linuxbrew/.linuxbrew/bin/opencode`, `/usr/local/bin/opencode` | Homebrew. **INFERRED** paths |
| `$(npm root -g)/opencode-ai/…`, `~/.local/share/pnpm/opencode`, `~/.bun/bin/opencode` | node package managers. **INFERRED** |
| `/usr/bin/opencode` | pacman |

Useful corroboration that these are the real install-method buckets: `opencode upgrade --method` accepts exactly `curl | npm | pnpm | bun | brew | choco | scoop` (**OBSERVED**). Those are the seven shapes to plan for.

**Layer 3 — for aliases only, ask the login shell to resolve the name.**

```
$SHELL -ilc 'command -v claude'
```

This is the *only* thing that finds an alias or shell function. It is also the most expensive and the most dangerous (arbitrary rc code, per name). My recommendation: **do not run this on the happy path.** Run it only as a last resort when Layers 1 and 2 both came up empty for a given agent, so the cost is paid only by users who would otherwise see a false "not installed". If it resolves to an alias rather than a file, blobot still cannot spawn it — the correct UI outcome is "found as a shell alias; blobot needs the real binary path", not "installed ✓".

### 1.4 Version parsing

**OBSERVED:**

| Command | stdout | exit | wall time |
| --- | --- | --- | --- |
| `claude --version` | `2.1.251 (Claude Code)` | 0 | 0.006 s |
| `opencode --version` | `1.18.4` | 0 | 0.38 s |

- Claude Code: `/^(\d+\.\d+\.\d+)\s+\(Claude Code\)$/`. The `(Claude Code)` suffix is **DOCUMENTED** ("prints a version number such as `2.1.211 (Claude Code)`", [setup](https://code.claude.com/docs/en/setup)) — parse the leading semver and ignore the rest rather than requiring the suffix.
- OpenCode: bare semver on stdout, no adornment. `/^\d+\.\d+\.\d+/`.
- Both are fast enough to run synchronously at startup. `claude --version` at 6 ms is essentially free; `opencode --version` at 380 ms is a self-extracting 179 MB binary paying its startup cost, so run detections in parallel, not serially.
- Treat exit ≠ 0 or unparseable stdout as *present-but-broken*, distinct from *absent*. A broken install is a real state (wrong-arch binary, missing `libstdc++` on musl) and deserves different UI copy than "not installed".

**`claude doctor` is a genuinely good second-tier presence probe** (**OBSERVED**, exit 0, no network required, no session started):

```
Running: native (2.1.251)
Commit: 37534ac596d8
Platform: linux-x64
Path: /home/alain/.local/share/claude/versions/2.1.251
Config install method: native
Auto-updates: enabled
No installation issues found.
```

**DOCUMENTED** as "read-only installation and settings diagnostics without starting a session". It hands us install method and resolved path for free. Its one hazard is documented too: on versions **before 2.1.214** it *hangs indefinitely* if any of the scanned rc paths is a directory. Always run it with a timeout.

OpenCode's counterpart is `opencode debug paths` (**OBSERVED**, exit 0, ~instant), which is better than guessing at XDG semantics — see §3.2.

---

## 2. Claude Code — authentication state

### 2.1 The probe

`claude auth status` exists and is exactly what we want. **OBSERVED:**

```
$ claude auth status --help
Usage: claude auth [options] [command]
Options:
  --json      Output as JSON (default)
  --text      Output as human-readable text
```

JSON is the **default**, which is unusual and welcome. Signed in on this machine:

```json
{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projectsDirectory": "/home/alain/.claude/projects",
  "email": "…",
  "orgId": "…",
  "orgName": "…",
  "subscriptionType": "max"
}
```
exit **0**, 0.24 s.

Signed out (run with `HOME` pointed at an empty directory):

```json
{
  "loggedIn": false,
  "authMethod": "none",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projectsDirectory": "…/.claude/projects"
}
```
exit **1**.

**The exit code alone is the answer: 0 = a credential is present, 1 = none.** blobot does not have to parse JSON at all if it does not want to — though parsing `loggedIn` is more explicit and less likely to collide with a future non-auth failure exit.

Observed `authMethod` / `apiProvider` values:

| Condition | `authMethod` | `apiProvider` | exit |
| --- | --- | --- | --- |
| OAuth login to a Claude subscription | `claude.ai` | `firstParty` | 0 |
| `ANTHROPIC_API_KEY` set | `api_key` (+ `"apiKeySource": "ANTHROPIC_API_KEY"`) | `firstParty` | 0 |
| `CLAUDE_CODE_USE_BEDROCK=1` | `third_party` | `bedrock` | 0 |
| `CLAUDE_CODE_USE_VERTEX=1` | `third_party` | `vertex` | 0 |
| nothing | `none` | `firstParty` | 1 |

All **OBSERVED**.

### 2.2 It is local-only and cheap — verified

Three things I checked deliberately, because they determine whether this is safe to run at app startup:

1. **No network call.** Re-run with every proxy env var pointed at a closed port (`HTTPS_PROXY=http://127.0.0.1:1`, likewise `HTTP_PROXY`, `ALL_PROXY`): **identical output, exit 0, no delay.** It reads local state only.
2. **No model call, no cost.** Nothing in the output requires inference; `email`/`orgId`/`subscriptionType` come from the stored credential.
3. **No directory trust prompt.** Run in a fresh `mktemp -d` the CLI has never seen: same output, exit 0, no prompt. (Consistent with the docs' note that `claude doctor` "reads settings files in the current directory without a trust prompt".)

It is also fast — 0.24 s — and safe to run on every window focus if we want live status.

### 2.3 Privacy note — this returns PII, and we must not keep it

`claude auth status` volunteers **`email`, `orgId`, `orgName`, `subscriptionType`**. None of these is a secret, but blobot has a "store nothing" posture and this is user-identifying data. **Read `loggedIn` (or the exit code) and `authMethod`; discard the rest of the object immediately; never write any of it to the SQLite store or a log line.** If we later want to show "signed in as …", that is a deliberate product decision and a separate ticket, not a side effect of detection.

### 2.4 Config and credential paths — existence only

**OBSERVED** on this machine (I checked `stat`, never contents):

| Path | Present | What it is |
| --- | --- | --- |
| `~/.claude/` | yes | user state directory |
| `~/.claude/.credentials.json` | yes, mode `0600` | **the OAuth credential. Never open this file.** |
| `~/.claude.json` | yes | global config (116 KB — includes project history) |
| `~/.claude/settings.json` | yes | user settings |
| `~/.local/share/claude/versions/` | yes | installed binaries |
| `~/.claude/local/` | no | legacy npm install (absent here) |

**DOCUMENTED** ([setup → uninstall](https://code.claude.com/docs/en/setup)): the complete user-state footprint is `~/.claude` + `~/.claude.json`, plus per-project `.claude/` and `.mcp.json`.

**On macOS the OAuth credential is in the login Keychain, not `~/.claude/.credentials.json`.** This is strongly implied by the `--bare` flag's own help text (**OBSERVED**): `--bare` skips "keychain reads" and states "Anthropic auth is strictly `ANTHROPIC_API_KEY` or `apiKeyHelper` … (OAuth and keychain are never read)". **Not verified on macOS.** The practical consequence is important: **file-existence checks for Claude Code auth do not work on macOS.** Use `claude auth status`, which abstracts over both.

`CLAUDE_CONFIG_DIR` is referenced in the ecosystem as an override for `~/.claude`, but I could **not** find it on the setup or troubleshoot pages. Treat as **unverified**; if blobot probes paths, honour it defensively but do not depend on it.

---

## 3. OpenCode — authentication state

### 3.1 The probe

`opencode auth list` (alias of `opencode providers list`; `ls` also works). **OBSERVED**, ~0.63 s, and — importantly — **exit 0 in every state I could produce**. The exit code carries no information. You must parse stdout.

Signed in:

```
┌  Credentials ~/.local/share/opencode/auth.json
│
●  GitHub Copilot oauth
│
●  OpenAI oauth
│
●  Anthropic oauth
│
└  3 credentials
```

Empty (`HOME`/`XDG_*` pointed at an empty directory):

```
┌  Credentials ~/.local/share/opencode/auth.json
│
└  0 credentials
```

With `ANTHROPIC_API_KEY` set as well, a **second section** appears:

```
┌  Credentials ~/.local/share/opencode/auth.json
│  … 3 credentials
└  3 credentials

┌  Environment
│
●  Anthropic ANTHROPIC_API_KEY
│
└  1 environment variable
```

Parsing notes, all **OBSERVED**:

- **Output is ANSI-coloured and `NO_COLOR=1` does not suppress it.** Verified with `cat -A`: `\x1b[90m` sequences survive. You must strip `\x1b\[[0-9;]*m` yourself.
- There is **no `--json` flag** on this subcommand.
- Two independent sections: `Credentials` (from `auth.json`) and `Environment` (from env vars). Either may be absent. Do not assume the header.
- Footers are pluralised prose: `0 credentials` / `3 credentials` / `1 environment variable` / `2 environment variables`. Parsing the footer count is brittle across releases; **prefer counting `●` bullet lines within each section**.
- **The `Environment` section prints only the env var's NAME, never its value.** Safe to read and safe to log.
- Because opencode picks up `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` from the environment, and blobot will be spawning opencode with *its own* environment, **blobot's detection must run with the same env it will later spawn the agent with**, or the answer is wrong in both directions.

### 3.2 A better signal: `opencode models`

`opencode auth list` reports *credentials*, which is narrower than *usable*. `opencode models` reports the resolved model catalogue and turns out to be a sharp discriminator. **OBSERVED:**

| Environment | Output |
| --- | --- |
| Real home, 3 oauth credentials | **35** lines: `opencode/*`, `anthropic/*`, `openai/*`, `github-copilot/*` |
| Empty home, no env keys | **7** lines, all `opencode/*-free` (the OpenCode Zen free tier) |
| Empty home + `ANTHROPIC_API_KEY` | `opencode/*` **plus** the full `anthropic/*` list |

So: **if `opencode models` emits any line whose provider prefix is not `opencode/`, at least one real provider is configured.** Cost: 1.35 s, and it *may* touch the network (models.dev catalogue) — I could not isolate that, so treat it as the slower, second-tier probe and always time it out.

Note the honesty wrinkle this exposes: with *zero* credentials, opencode still offers 7 free models. An OpenCode install with no login is arguably still *runnable*. Whether blobot wants to present that as "ready" is a product call — but it means "0 credentials" ≠ "cannot run a prompt".

`opencode debug paths` (**OBSERVED**, exit 0, instant) resolves every directory for us, cross-platform, so we never have to reimplement XDG:

```
home    /home/alain
data    /home/alain/.local/share/opencode
bin     /home/alain/.cache/opencode/bin
log     /home/alain/.local/share/opencode/log
cache   /home/alain/.cache/opencode
config  /home/alain/.config/opencode
state   /home/alain/.local/state/opencode
tmp     /tmp/opencode
```

### 3.3 Config and credential paths — existence only

**OBSERVED** (`stat` only):

| Path | Present | Notes |
| --- | --- | --- |
| `~/.local/share/opencode/auth.json` | yes, mode `0600` | **the credential store. Never open this file.** |
| `~/.config/opencode/opencode.json` | yes | global config |
| `~/.local/state/opencode/`, `~/.cache/opencode/` | yes | state / cache |
| `~/.opencode/bin/opencode` | yes | curl-installed binary |

**BINARY** — the auth.json resolver, lifted from the 1.18.4 bundle:

```js
function () {
  const home = os.homedir();
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return path.join(xdg, "opencode", "auth.json");
  return path.join(home, ".local", "share", "opencode", "auth.json");
}
```

**This has no `darwin` branch.** On macOS, opencode's `auth.json` is at `~/.local/share/opencode/auth.json` too — *not* `~/Library/Application Support`. (The binary does contain a `Library/Application Support` branch, but it belongs to bundled third-party libraries and to the *managed* config lookup, which is `/Library/Application Support/opencode` on darwin, `/etc/opencode` on Linux, `%ProgramData%\opencode` on Windows — a system-wide admin path, not the user credential.) **Version-specific; re-confirm with `opencode debug paths` at runtime rather than hardcoding.**

Docs corroborate the config side ([opencode.ai/docs/config](https://opencode.ai/docs/config/)): global `~/.config/opencode/opencode.json`, project `opencode.json`, and `OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` / `OPENCODE_CONFIG_CONTENT` overrides. The docs **do not** document the `auth.json` path — hence reading it from the binary.

---

## 4. The honesty boundary

### 4.1 The core finding: "authenticated" is not observable. "A credential is present" is.

Two experiments, both **OBSERVED**, that settle this:

```
# a syntactically valid but entirely fabricated key, empty HOME
$ HOME=<empty> ANTHROPIC_API_KEY=sk-ant-fake-not-a-real-key claude auth status
{ "loggedIn": true, "authMethod": "api_key", "apiKeySource": "ANTHROPIC_API_KEY" }
exit=0
```

```
# Bedrock selected, no AWS credentials anywhere
$ HOME=<empty> CLAUDE_CODE_USE_BEDROCK=1 claude auth status
{ "loggedIn": true, "authMethod": "third_party", "apiProvider": "bedrock" }
exit=0
```

In both cases `claude auth status` reports **`loggedIn: true`** for a configuration that **cannot complete a single request.** The command answers "has an auth mechanism been selected and is a credential-shaped thing present", not "does that credential work".

The same holds for OpenCode, for the same reason plus one more: `auth list` reports what is written in `auth.json`, and an OAuth token there may be **expired or revoked**. Nothing in the output distinguishes a live token from a dead one.

There is **no free way to close this gap.** The only proof that an agent can run a prompt is running a prompt, and for both CLIs that is a billed model call. Neither offers a no-op / dry-run / token-count round trip we could abuse as a liveness check.

### 4.2 Per-CLI verdict

| CLI | Presence | Version | Auth state | Verdict |
| --- | --- | --- | --- | --- |
| **Claude Code** | reliable | reliable | **heuristic, high confidence** — `claude auth status` exit code is a first-party, purpose-built, local, free signal. Negative (`exit 1`) is *reliable*: no credential means it definitely cannot run. Positive is *heuristic*: credential present, validity unknown | **Asymmetric.** Trust "no" completely; treat "yes" as "configured" |
| **OpenCode** | reliable | reliable | **heuristic, medium confidence** — no exit-code signal, prose+ANSI parsing, and the free-tier models muddy what "no credentials" even means | **Weakest claim.** Say "provider configured", never "authenticated" |
| **Codex CLI** | reliable | reliable | **heuristic, high confidence** — `codex login status` is local, free, and carries an exit code. Same asymmetry as Claude Code | Trust "no"; treat "yes" as "configured" |
| **Gemini CLI** | reliable | reliable (allow for the literal `unknown`) | **not detectable.** No headless probe; the only validator is a precondition to a *billed* call, and it does not even check OAuth credentials | **Say "unknown".** Any ✓ here would be fabricated |

### 4.3 What the UI should say

Drop the word **"Authenticated"**. It is a claim we cannot substantiate, and the ticket is explicit that a false ✓ is the worst outcome. Four honest states:

| State | How we get there | UI |
| --- | --- | --- |
| **Not installed** | Layers 1–3 all failed | `Gemini CLI  ✕  Not found` — with a link to its install docs |
| **Installed, needs sign-in** | binary found, probe says *no credential* | `OpenCode  ✓ 1.18.4  Needs sign-in` — with the exact command to run (`opencode auth login`, `claude auth login`) |
| **Ready** | binary found, probe says *credential present* | `Claude Code  ✓ 2.1.251  Ready` |
| **Unknown** | binary found, probe timed out / crashed / output unparseable | `Codex  ✓ 0.5.1  Status unknown` — **still selectable.** Never block the user on our own uncertainty |

"Ready" is the honest word. It says *we found everything we can check* without asserting a server-side fact we never observed. Reserve any stronger claim for after a turn has actually succeeded — at which point the agent has *demonstrated* it works, and blobot may upgrade the badge from evidence rather than inference.

Two corollaries:

- **Never gate team creation on detection.** If a user insists an agent works, let them add it; surface the failure when the real turn fails, with the CLI's own stderr. Our detector being wrong must not be able to lock someone out of their own tools.
- **First real failure beats every probe.** When a spawn returns an auth error, that observation is worth more than anything in this document — flip the badge to "Needs sign-in" and show the CLI's message verbatim.

### 4.4 What we must never do

- Open `~/.claude/.credentials.json`, `~/.local/share/opencode/auth.json`, `~/.codex/auth.json`, or `~/.gemini/oauth_creds.json`. `stat` only. On macOS, never touch the Keychain.
- Log or persist `email` / `orgId` / `orgName` / `subscriptionType` from `claude auth status`.
- Read the *value* of any `*_API_KEY` env var. Reading the *name* (as `opencode auth list` prints) is fine.
- Make a billed model call to test liveness.

### 4.5 A trap: config-directory existence is a **bad** presence proxy

**OBSERVED on this machine**, and it is a clean counterexample:

```
~/.codex/     EXISTS  — auth.json (0600), config.toml, history.jsonl,
                        93 MB logs_2.sqlite, installation_id, memories/, …
~/.gemini/    EXISTS  — installation_id, antigravity/, skills/, tmp/
```

**Neither `codex` nor `gemini` is installed.** `which -a codex gemini` returns nothing; neither is in npm global, pnpm global, or Homebrew. These are the residue of tools that were installed once, plus a sibling product (Antigravity) writing into `~/.gemini`.

If blobot had used "config directory exists" as its detector, it would confidently show Codex as **installed and authenticated** — a `0600` `auth.json` and all — for a CLI that is not on this machine at all. That is precisely the false ✓ the ticket forbids.

**Rule: config/credential file existence may only ever *downgrade* or *corroborate* a result. Presence is decided by a runnable binary, and nothing else.** And note the asymmetry that makes even corroboration weak: a *missing* auth file is decent evidence of "not signed in", but a *present* one is nearly worthless — it survives uninstall indefinitely.

---

## 5. Recommended detection algorithm

```
ONCE, at main-process start:
  1. Hydrate PATH from the login shell (marker-delimited, 3s timeout).
     On failure keep process.env.PATH. Cache for the session.

PER AGENT, in parallel, each step timed out:
  2. Resolve the binary:
       a. which/where on the hydrated PATH
       b. else stat the known-locations list (§1.3 Layer 2)
       c. else, ONLY if a and b failed: $SHELL -ilc 'command -v <name>'
             → resolves to a file?  use it
             → resolves to an alias? report "found as shell alias, unusable"
       d. else → NOT INSTALLED. done.
  3. Version:  <bin> --version, 3s timeout, parse leading semver.
       nonzero exit or unparseable → PRESENT BUT BROKEN. done.
  4. Auth probe, with the exact env blobot will spawn agents with:
       claude   → claude auth status --json        exit 0/1 + loggedIn
       codex    → codex login status               exit 0/1 (label on stderr)
       opencode → opencode auth list               strip ANSI, count ● per section
                  (optional 2nd tier: opencode models → any non-"opencode/" prefix)
       gemini   → NO PROBE. report UNKNOWN.
       timeout/crash/unparseable → UNKNOWN, not NOT-AUTHENTICATED
  5. Never consult ~/.codex, ~/.gemini, ~/.claude, ~/.local/share/opencode
     to establish presence. Existence-only, and only to corroborate step 4.
```

Cost on this machine, run in parallel: bounded by the ~1.8 s login-shell hydration, then ~0.6 s for the slowest agent probe. Under 3 s for a first run, and the hydration is cacheable across app launches if we key it on the rc files' mtimes.

Always spawn with `shell: false` and an argv array. Never build a command string.

---

## 6. Codex CLI (secondary — not installed here)

Everything below is **DOCUMENTED**, read from the `openai/codex` source. **Nothing in this section was executed** — `codex` is not on this machine.

### 6.1 Presence and version

`codex --version` prints **`codex-cli <semver>`** — note the `codex-cli` prefix, unlike Claude Code's suffix and OpenCode's bare number. The CLI derives `--version` from clap on `MultitoolCli` ([`codex-rs/cli/src/main.rs`](https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs)); clap uses the *crate* name (`codex-cli` per [`codex-rs/cli/Cargo.toml`](https://github.com/openai/codex/blob/main/codex-rs/cli/Cargo.toml)), not the `bin_name = "codex"` override, which only affects usage lines. Corroborated by a user report in [openai/codex#19110](https://github.com/openai/codex/issues/19110): "codex --version reports codex-cli 0.114.0". Parse `/codex-cli\s+(\S+)/`.

Codex enumerates its own install methods in [`codex-rs/install-context/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/install-context/src/lib.rs) — `enum InstallMethod { Standalone, Npm, Bun, Pnpm, Brew, Other }` — which is a ready-made list of what to probe:

| Location | Method |
| --- | --- |
| `$CODEX_HOME/packages/standalone/releases/<version>-<target-triple>/bin/codex` | standalone (source's own example: `~/.codex/packages/standalone/releases/0.111.0-x86_64-unknown-linux-musl`) |
| `$(npm root -g)/@openai/codex/bin/codex.js` → spawns `@openai/codex-{linux,darwin,win32}-{x64,arm64}/vendor/<triple>/bin/codex` | npm / pnpm / bun. The shim sets `CODEX_MANAGED_BY_NPM` / `_PNPM` / `_BUN` |
| `/opt/homebrew/bin/codex` (Apple Silicon), `/usr/local/bin/codex` (Intel) | `brew install --cask codex` — it is a **cask**, not a formula. Codex's own detector is literally `exe_path.starts_with("/opt/homebrew") \|\| exe_path.starts_with("/usr/local")` on macOS |

`CODEX_HOME` = the env var if set and it is an existing directory, else `~/.codex` ([`codex-rs/utils/home-dir/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/utils/home-dir/src/lib.rs)). Honour it.

### 6.2 Auth state — the best of the four

**`codex login status` is a local, offline, free check** that only reads `auth.json` and makes no network call ([`codex-rs/cli/src/login.rs`, `run_login_status`](https://github.com/openai/codex/blob/main/codex-rs/cli/src/login.rs)). It writes to **stderr**, not stdout:

| Condition | stderr | exit |
| --- | --- | --- |
| API key | `Logged in using an API key - <redacted>` | **0** |
| ChatGPT | `Logged in using ChatGPT` | **0** |
| access token | `Logged in using access token` | **0** |
| personal access token | `Logged in using personal access token` | **0** |
| Bedrock API key | `Logged in using Amazon Bedrock API key` | **0** |
| Bedrock AWS keys | `Logged in using Amazon Bedrock AWS access keys` | **0** |
| workload identity | `Logged in using workload identity` | **0** |
| **not logged in** | **`Not logged in`** | **1** |
| corrupt/unreadable `auth.json` | `Error checking login status: <err>` | **1** |

Same clean 0/1 contract as Claude Code. **Use the exit code; read stderr only for the method label.** The API-key line is redacted at the source, but blobot should still not persist it.

There is also `codex doctor` ([`codex-rs/cli/src/doctor.rs`](https://github.com/openai/codex/blob/main/codex-rs/cli/src/doctor.rs)), read-only but it performs "bounded reachability probes" — i.e. it touches the network. `login status` is the cheaper and purely local choice; prefer it.

### 6.3 Paths (existence only) and env vars

From [`codex-rs/login/src/auth/storage.rs`](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs):

- `$CODEX_HOME/auth.json` — **the credential. Never open it.** (Fields include `auth_mode`, `OPENAI_API_KEY`, OAuth `tokens`, `personal_access_token`, `bedrock_api_key`, `bedrock_access_keys`.)
- `$CODEX_HOME/config.toml` — config, including `cli_auth_credentials_store`.

**Codex can store credentials in the OS keyring instead of `auth.json`** (`AuthKeyringBackendKind`, selected by `cli_auth_credentials_store` in `config.toml`). So — exactly as with Claude Code on macOS — **`auth.json` existence is not a valid auth check.** `codex login status` abstracts over both backends; use it.

Env vars: `OPENAI_API_KEY`, plus `CODEX_API_KEY` and `CODEX_ACCESS_TOKEN` (all named in `doctor.rs`).

### 6.4 Verdict

**Presence reliable, version reliable, auth heuristically detectable at the same high confidence as Claude Code** — a purpose-built, local, free, exit-code-carrying probe. Same asymmetry applies: exit 1 reliably means "cannot run"; exit 0 means "a credential is present", not "it works".

---

## 7. Gemini CLI (secondary — not installed here)

**DOCUMENTED** from the `google-gemini/gemini-cli` source. **Nothing executed.** This is the weakest of the four, and the one where blobot must be most careful.

### 7.1 Presence and version

`gemini --version` prints a **bare semver** with no program-name prefix — yargs' `.version()` emits only the string it was given ([`packages/cli/src/gemini.tsx`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/gemini.tsx) wires `.version(await getVersion()).alias('v','version')`; [`packages/core/src/utils/version.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/version.ts) returns `process.env['CLI_VERSION'] || pkgJson?.version || 'unknown'`).

Two consequences: the parse is the same as OpenCode's, **and `'unknown'` is a legitimate output** that will not match a semver regex — handle it as "installed, version unknown" rather than "broken".

Install: `npm install -g @google/gemini-cli` → the usual npm-global bin. **No Homebrew formula or cask could be confirmed from a primary source** — do not ship brew-path probing for Gemini on the strength of a guess.

### 7.2 Auth state — not reliably detectable

**There is no `gemini auth status` subcommand.** Auth is exposed only as *slash commands inside the TUI* — `/auth`, `/auth signin` (`/login`), `/auth signout` (`/logout`) — and `/auth signin` opens an interactive dialog ([`packages/cli/src/ui/commands/authCommand.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/commands/authCommand.ts)). None of it is scriptable headlessly.

The only programmatic path is `validateNonInteractiveAuth()` ([`packages/cli/src/validateNonInterActiveAuth.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/validateNonInterActiveAuth.ts)), which runs implicitly on any non-interactive invocation such as `gemini -p "…"`. With nothing configured it fails with:

```
Please set an Auth method in your <settings path> or specify one of the following
environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI,
GOOGLE_GENAI_USE_GCA
```

and **exit code 41** — `ExitCodes.FATAL_AUTHENTICATION_ERROR` ([`packages/core/src/utils/exitCodes.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/exitCodes.ts); the table is `SUCCESS=0, FATAL_AUTHENTICATION_ERROR=41, FATAL_INPUT_ERROR=42, FATAL_CONFIG_ERROR=52, FATAL_CANCELLATION_ERROR=130`).

**Two reasons this is not usable as a probe:**

1. **It is not free.** The check runs as a *precondition* to a real turn. If auth *is* configured, `gemini -p …` proceeds to a billed model call. There is no way to run the validation and stop. Blobot must not do this.
2. **It does not actually validate OAuth.** For `AuthType.LOGIN_WITH_GOOGLE` and `AuthType.COMPUTE_ADC`, `validateAuthMethod()` ([`packages/cli/src/config/auth.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/auth.ts)) returns `null` (success) **unconditionally** — it never checks whether `oauth_creds.json` exists or has expired. A user with OAuth selected and no credentials at all passes this check and only fails later, on the network.

`gemini mcp list` is about MCP servers, not account state. Not useful.

### 7.3 Paths (existence only) and env vars

From [`packages/core/src/config/storage.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/storage.ts) and [`packages/core/src/utils/paths.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/paths.ts) (`GEMINI_DIR = '.gemini'`):

| Path | Meaning |
| --- | --- |
| `~/.gemini/settings.json` | global settings, incl. `security.auth.selectedType` |
| `~/.gemini/oauth_creds.json` | **the OAuth credential. Never open it.** |
| `~/.gemini/google_accounts.json` | signed-in account record |
| `~/.gemini/installation_id` | install marker — **note this exists here without the CLI, see §4.5** |
| `/Library/Application Support/GeminiCli/settings.json` (macOS), `/etc/gemini-cli/settings.json` (Linux) | system-wide settings |

Env vars, checked in this exact precedence order by `getAuthTypeFromEnv()` ([`packages/core/src/core/contentGenerator.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/core/contentGenerator.ts)):

1. `GOOGLE_GENAI_USE_GCA === 'true'` → OAuth
2. `GOOGLE_GENAI_USE_VERTEXAI === 'true'` → Vertex AI
3. `GOOGLE_GEMINI_BASE_URL` set → Gateway
4. `GEMINI_API_KEY` set → API key
5. `CLOUD_SHELL === 'true'` or `GEMINI_CLI_USE_COMPUTE_ADC === 'true'` → Compute ADC
6. else → no auth configured

`GOOGLE_API_KEY` / `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` are consumed by `validateAuthMethod` on the Vertex path only.

### 7.4 Verdict — and the one place I'd break my own rule

**Presence reliable, version reliable, auth state NOT reliably detectable.** No free probe exists.

The best available signal is a reimplementation of `getAuthTypeFromEnv()` in blobot — env vars 1–5 above, falling back to reading `security.auth.selectedType` from `~/.gemini/settings.json` — combined with the *existence* of `~/.gemini/oauth_creds.json` when the selected type is OAuth. That last part is the one case where a file-existence check adds real value, precisely because the CLI's own validator skips it.

Even so, this is **inference, not observation**, and it reimplements someone else's private logic that will drift. My recommendation for the first demo: **Gemini shows "Status unknown" whenever it is installed.** Codex and Gemini are already out of scope per the map; when they come back in scope, Codex gets a real probe and Gemini gets an honest shrug plus a "try it and see" affordance.

Explicitly do **not** read `~/.gemini/settings.json` for anything beyond `security.auth.selectedType`, and never read `oauth_creds.json`, `google_accounts.json`, or any `*-oauth-tokens.json`.

---

## Sources

- Claude Code — Advanced setup: https://code.claude.com/docs/en/setup
- Claude Code — Troubleshoot installation and login: https://code.claude.com/docs/en/troubleshoot-install
- OpenCode docs — install: https://opencode.ai/docs/
- OpenCode docs — config: https://opencode.ai/docs/config/
- Codex — `run_login_status`: https://github.com/openai/codex/blob/main/codex-rs/cli/src/login.rs
- Codex — install method detection: https://github.com/openai/codex/blob/main/codex-rs/install-context/src/lib.rs
- Codex — auth storage: https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs
- Codex — `CODEX_HOME` resolution: https://github.com/openai/codex/blob/main/codex-rs/utils/home-dir/src/lib.rs
- Codex — `doctor`: https://github.com/openai/codex/blob/main/codex-rs/cli/src/doctor.rs
- Codex — version format corroboration: https://github.com/openai/codex/issues/19110
- Gemini CLI — storage paths: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/storage.ts
- Gemini CLI — `getAuthTypeFromEnv`: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/core/contentGenerator.ts
- Gemini CLI — `validateAuthMethod`: https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/auth.ts
- Gemini CLI — non-interactive auth validation: https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/validateNonInterActiveAuth.ts
- Gemini CLI — exit codes: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/exitCodes.ts
- Gemini CLI — `/auth` slash command: https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/commands/authCommand.ts
- Gemini CLI — version: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/version.ts
- sindresorhus/fix-path: https://github.com/sindresorhus/fix-path
- sindresorhus/shell-env: https://github.com/sindresorhus/shell-env
- Direct observation of `claude` 2.1.251 and `opencode` 1.18.4 on Linux x86_64, 2026-08-29.

## Open questions for implementation

1. **macOS verification pass.** Confirm on a real Mac: the GUI-launch PATH, Claude Code's Keychain-backed credential (so `claude auth status` is genuinely the only workable probe there), `opencode debug paths` output, the Homebrew binary paths for all four, and the `dscl` login-shell fallback.
2. **Does `opencode models` hit the network?** It costs 1.35 s and may query the models.dev catalogue. If it does, it must be optional and offline-tolerant.
3. **Login-shell hydration caching.** Key on the mtimes of the rc files Claude Code itself scans (§1.2) and skip the 1.8 s probe when nothing changed.
4. **Where "Status unknown" lives in the state machine.** Ticket 09 owns agent status; detection produces a fourth state (`unknown`) that must not be collapsed into `error`.
