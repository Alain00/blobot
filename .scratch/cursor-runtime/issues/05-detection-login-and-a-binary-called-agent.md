Type: task
Status: open

# Detection, `agent login`, and a binary called `agent`

## Problem

Ticket 11's probe table needs a row, and this runtime brings a problem the other three do not:
**the documented command is `agent`**. That is about the most collision-prone name a binary can
have on a developer's `PATH`, and blobot's detection cascade searches `PATH`, the login shell, and
a list of extra directories. A cascade that finds *an* `agent` and reports Cursor as ready would
be lying about the user's machine, which is the one thing ticket 11 exists not to do.

The installer is `curl https://cursor.com/install -fsS | bash` and lands in `~/.local/bin`, which
the cascade already searches -- the same shape as the Claude and OpenCode rows, and unlike Codex.

The API-key paths (`--api-key`, `CURSOR_API_KEY`, `--auth-token`, `CURSOR_AUTH_TOKEN`) are the
same refusal as Codex's: blobot does not collect a provider credential and does not become the
thing that owns the login. `agent login` on a PTY is the answer that already exists.

## What to do

- **Establish what the binary is actually called** after a real install. If it installs both
  `cursor-agent` and `agent`, probe for `cursor-agent` and never for the bare name. If it installs
  only `agent`, the probe must verify what it found before believing it -- `agent --version` and
  `agent about` both print product identity, and the probe should require the answer to look like
  Cursor rather than merely exit 0. Write down the string it matched on.
- **A probe in `detect/runtimes.ts`**: `agent status` or `agent whoami` for the sign-in state.
  Record exit codes and output in both states, the way the notes on `claude auth status` and
  `opencode auth list` do. Ticket 11's rule holds: a negative is reliable, a positive is not, and
  the word *authenticated* does not appear.
- **Two rows in `detect/remedies.ts`**: sign-in `agent login`, install the vendor's own published
  command, verified live before it is written down.
- **Never set `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN`** on the child, and never offer a field that
  would. If the ACP server demands `authenticate` with `cursor_login` before it will open a
  session, the adapter fails the launch with a sentence naming `agent login`, the way a
  `not_installed` runtime is refused by name rather than surfacing as a spawn error. The docs say
  pre-authenticating with `agent login` is supported, so this should be the ordinary path and the
  in-protocol flow should never be reached.
- **Do not let the CLI update itself underneath a running team.** Cursor "will try to auto-update
  by default". Find out whether that can happen mid-session and, if it can, whether it can be
  turned off for blobot's child processes only. A runtime that swaps its own binary between two
  turns is a new failure mode none of the other three have.
