Type: research
Status: resolved
Findings: ../research/11-agent-detection.md

# Detecting installed and authenticated agents

## Question

The zero-setup pitch depends on the app knowing what the user already has, without ever
asking for a credential.

Establish, for OpenCode and Claude Code specifically: how to detect presence and version
reliably across install methods (PATH, npm global, homebrew, standalone binaries, shell
aliases that a spawned process will not see); and how to determine *authenticated versus
merely installed* by observation only — config file locations, a cheap probe command, exit
codes — without reading, storing or transmitting any secret.

Report what is genuinely knowable and what is not; a false "authenticated ✓" is worse than
an honest unknown.

## Answer

**Presence is reliably detectable. "Authenticated" is not — and the word should not appear in
the UI.** Findings are observed on this Linux machine against `claude` 2.1.251 and
`opencode` 1.18.4, including adversarial runs (empty `HOME`, fake API keys, blackholed
proxies, simulated macOS-GUI PATH).

### Auth probes exist, and they are cheap

- `claude auth status` — JSON by default, **exit 0 when a credential exists, 1 when none**,
  ~0.24s, **no network call** (verified against a blackholed proxy), no directory-trust
  prompt. `codex login status` has the identical 0/1 contract.
- `opencode auth list` — **always exits 0**, so stdout must be parsed. Output is
  ANSI-coloured and **`NO_COLOR=1` does not suppress the escapes**. Two independent sections
  (`Credentials` from `auth.json`, `Environment` from env vars); env var *names* only, never
  values.
- **Gemini has no probe at all.** Auth is a TUI slash command; its only validator is a
  precondition to a *billed* call, and for OAuth it returns success unconditionally without
  checking whether credentials exist.

### The honesty boundary

These probes answer "is a credential present", never "does it work". Both observed:

- `ANTHROPIC_API_KEY=sk-ant-fake-not-a-real-key` → `{"loggedIn": true}`, exit 0.
- `CLAUDE_CODE_USE_BEDROCK=1` with zero AWS credentials → `{"loggedIn": true}`, exit 0.

The signal is **asymmetric — a negative is reliable, a positive is not.** Decision: drop
"Authenticated" for four honest states — **Not installed / Needs sign-in / Ready / Status
unknown** — and never gate team creation on detection. The user is always allowed to try.

### Presence must come from a runnable binary, never a config file

Live counterexample on this machine: `~/.codex/` exists with a `0600` `auth.json`, a
`config.toml` and a 93MB log DB — and **`codex` is not installed at all**. `~/.gemini/`
likewise. A config-existence detector shows a confident false ✓. It fails the other way on
macOS too, where Claude Code's credential lives in the Keychain and Codex can use the OS
keyring.

### PATH is the real engineering problem

Under the macOS-GUI PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) both installed CLIs return **exit
127** here — neither `~/.local/bin` nor `~/.opencode/bin` is in any system default. Login-shell
hydration costs **1.8s** on this machine and still cannot see shell aliases. The findings doc
specs a three-layer cascade that pays that cost once and only falls back to `$SHELL -ilc`
alias resolution for agents that would otherwise show as missing.

Two free wins: Claude Code's docs name the exact rc files it scans for a stale alias, and
OpenCode's binary contains its own equivalent list — both reusable verbatim. `opencode debug
paths` and `claude doctor` return resolved paths and install method without guessing at XDG
semantics.

### Unverified

Nothing here was tested on macOS or Windows — the GUI-PATH cascade and Homebrew paths need a
real Mac before shipping.

Full findings: `../research/11-agent-detection.md`
