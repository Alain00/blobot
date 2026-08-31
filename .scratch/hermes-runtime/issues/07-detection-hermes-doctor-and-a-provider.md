Type: task
Status: open

# Detection, `hermes doctor`, and a provider blobot must not choose

## Problem

Ticket 11's four states have to mean something for a runtime that is not a coding CLI, and the
remedies table in `detect/remedies.ts` has to gain a row. Most of it is straightforward and one
part is not.

**The probe.** `hermes-acp` is a console script on `PATH`; on this machine it is at
`~/.local/bin/hermes-acp`, which is layer one of the cascade `detectRuntimes` already searches.
`hermes` is beside it. Prefer probing `hermes-acp` specifically, because that is the binary the
adapter spawns and a `hermes` without it is a partial install.

**The install remedy.** The vendor's own published command, shown in full before it runs, exactly
as the other three rows do:

    curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

**The sign-in remedy is where this differs.** The other three runtimes have an `auth login`
subcommand that opens the vendor's own browser flow and exits. Hermes does not have a login,
because Hermes has no account: it has a *provider*, chosen from many, with a key the user supplies.
`hermes setup` is the interactive wizard and `hermes model` is the picker. Both are real
subcommands, both run in a PTY, and blobot reads none of the keystrokes -- which is how the
no-credential-storage rule is kept while still helping, the same as the other three.

But the state is different in kind. On Claude, *not signed in* is a fact about an account. On
Hermes it is *no provider is configured in this `HERMES_HOME`*, and which home that is depends
entirely on ticket 01. If every agent gets its own profile, then a freshly hired agent is
**always** in that state and the hire flow has a terminal in it every single time. That is worth
knowing before the flow is drawn, not after.

**What blobot must not do.** `--api-key`, `HERMES_ACP_AUTH_METHOD`, and anything that puts a
provider key on a command line or in an environment blobot composes. Same refusal as Codex's two
flags, same reason: the app never proxies provider credentials.

## What to build

- A `hermes` row in `detect/runtimes.ts` and `detect/remedies.ts`, with `kind: 'sign_in'` pointing
  at Hermes' own setup and `kind: 'install'` at the URL above.
- The auth handshake answered honestly. `build_auth_methods()` advertises an `AuthMethodAgent` when
  a provider resolves and always advertises a `TerminalAuthMethod` with `args: ["--setup"]`. blobot
  answers `authenticate` with the advertised provider id when one is there, and treats the
  terminal method as *not ready* rather than as something to invoke through ACP -- blobot already
  has a PTY screen and it is the one place a terminal belongs.
- A launch whose agent's runtime is `not_installed` refused by name, which the existing rule
  already covers.
- **Do not conclude from an exit code.** `hermes setup` can exit 0 having configured nothing, the
  same trap `runtime-readiness` already wrote down. End on detection asked again in the same four
  words.
