Type: task
Status: open

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
