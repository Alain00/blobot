Type: task
Status: resolved

# Detection, `codex login`, and the auth method blobot must not take

## Problem

Ticket 11's four honest states and the runtime-readiness remedies both need a row for Codex, and
one of the ways in is a rule violation.

`codex-acp` "advertises ACP auth methods during initialization". Three of them:

- **ChatGPT login**, which opens a browser. `NO_BROWSER=1` hides the method.
- **An API key**, read from `CODEX_API_KEY` or `OPENAI_API_KEY`.
- **A custom OpenAI-compatible gateway**, when the client opts into the capability.

The API-key method is the one to refuse, and not as a preference. `CLAUDE.md`: *"No credential
storage. We do not build a credentials database and we do not persist API keys. The underlying
CLI owns its own login."* A blobot that offered an API key field would be collecting a provider
credential, putting it in a child process's environment, and becoming the thing that owns the
login. The gateway method is the same objection with an endpoint attached.

blobot's answer already exists and is better: `.scratch/runtime-readiness/` spawns the vendor's
own `auth login` on a real PTY, the CLI opens its own browser, and blobot reads none of it. Codex
has `codex login`, so nothing new needs inventing.

## What to do

- **A probe in `detect/runtimes.ts`**: binary `codex`, extra dirs to be found (npm global bin is
  not `~/.local/bin`, so the cascade needs checking against a real install rather than assumed).
  `codex login status` is the candidate signal; run it and record what it exits with in both
  states, the way the notes on `claude auth status` and `opencode auth list` do. Ticket 11's rule
  holds: a negative is reliable, a positive is not, and the word *authenticated* does not appear.
- **Two rows in `detect/remedies.ts`**: sign-in `codex login`, install the vendor's own published
  command. `npm install -g @openai/codex` is the documented one and lands in the npm global bin
  rather than `~/.local/bin`, which is the first remedy in that table whose install location the
  cascade does not already search. Verify the command live before writing it, as was done for the
  other two, and verify the resulting binary is findable afterwards -- an installer that exits 0
  having put a binary somewhere nothing looks is exactly the case that table's comment warns about.
- **Set `NO_BROWSER=1` on the bridge** so the ChatGPT method is hidden, and never populate
  `CODEX_API_KEY` or `OPENAI_API_KEY`. If the bridge still demands an auth method before it will
  open a session, the adapter fails the launch with a sentence naming `codex login`, the way a
  `not_installed` runtime is refused by name rather than surfacing as a spawn error.
- Check what `DEFAULT_AUTH_REQUEST` does. It is "ACP auth request JSON used when Codex requires
  authentication", and it may be the supported way to say *there is no method here, tell the user
  to run `codex login`*. That would be the clean answer to the paragraph above.

## Answer

Built 2026-08-30 against codex-cli 0.148.0. The probe is in `detect/runtimes.ts`, the two rows in
`detect/remedies.ts`.

**The signal is `codex login status`, and it has the shape ticket 11 already recorded twice.**
Measured in both directions:

- signed in: exit **0**, `Logged in using ChatGPT`
- signed out: exit **1**, `Not logged in`

The negative was produced by pointing `CODEX_HOME` at an empty directory, so the author's own
login was never touched to observe it. Anything else is `unknown` rather than signed out, and the
word *authenticated* does not appear. `codex --version` prints `codex-cli 0.148.0`, which
`parseVersion` already reduces to `0.148.0`.

**Where the binary lands.** The ticket expected npm's global bin not to be `~/.local/bin`. On this
machine it is: `npm prefix -g` answers `/home/alain/.local`. That is not general, so the cascade
is argued rather than assumed -- `/usr/local/bin` is a default install's location and is on every
default `PATH`, so layer one finds it; `~/.local/bin` and `~/.npm-global/bin` are in `extraDirs`;
anything stranger is layer three's, which knows a `PATH` this process does not.

**The install command is `npm install -g @openai/codex`**, verified the way the other two were --
they were checked as URLs returning 200, and this was checked with `npm install -g --dry-run`,
which resolves and reports `add @openai/codex 0.151.0`. The install itself has **not** been run,
and neither had either of the others.

One thing the dry run turned up: the published `latest` is **0.151.0** while the bridge bundles
`@openai/codex ^0.148.0`. A user's own install is therefore already a different version from the
bridge's bundled copy, which is ticket 03's argument for `CODEX_PATH` stated as a fact rather than
a worry.

**The auth method blobot must not take, refused by construction.** Bare `codex login` is the
ChatGPT browser flow and is the whole of the sign-in row. `codex login --with-api-key` and
`--with-access-token` read a credential from **stdin**, and the PTY's stdin is blobot's: passing
either would make blobot the thing that carries the credential. They are absent from the table,
and the table is the only place argv is built. `NO_BROWSER=1` on the bridge (ticket 03) hides the
ChatGPT method over ACP, and the `api-key` method that remains advertised there is never answered.

**`supported` is `false` until ticket 05.** Codex is detected honestly and offered as *no adapter
yet*, exactly as OpenCode was before its adapter landed, and `remediesFor` returns nothing for an
unsupported runtime -- offering to install a runtime blobot cannot drive would be a door to
nowhere. Ticket 05 flips one boolean and the two rows come alive.

**Not run live:** `codex login` itself, for the same reason `claude auth login` was not -- the
machine is already signed in and running it would re-authenticate the author's own account.
`DEFAULT_AUTH_REQUEST` was not needed: a signed-in Codex never demanded an auth method at any
point in tickets 01 or 02, so the paragraph it was insurance for did not arise. It stays
unexplored, and the adapter fails a launch by name if it ever does.
