Type: grilling
Status: resolved
Blocked by: 05 (resolved)

# The speech exception to two permanent rules

## Question

CLAUDE.md's permanent rules say *no hosted inference* and *no credential storage*. A remote
Transcriber is hosted inference and needs an API key. The author was shown the conflict and
directed that the rules **stay** and that this is an **exception** — which in this repo is an ADR:
hard to reverse, surprising without context, the result of a real trade-off.

Write the ADR's exact boundary. Settled in charting and to be restated, not reopened:
transcription only, never LLM inference; a service **blobot** calls, never an agent, so no
credential is ever proxied or handed to a runtime; the key lives in the **OS keychain** through
Electron's `safeStorage`, falling back to an **environment variable** blobot reads and never
writes when the OS has no backend (ticket 05 measures which backends exist and when Linux
degrades to `basic_text`); **never SQLite**, on `context_ceilings`' own argument.

To decide here: the ADR's title and wording; what the app **says** about where the key went and
what it says when the backend is plaintext; whether the env var is a fallback or always a door;
whether the exception names the provider list (ticket 03) or leaves it to a table; and the
`CLAUDE.md` sentence that points at the ADR from the rules themselves, so the next reader does
not find the contradiction the way this session did.

## From ticket 05 (resolved 2026-09-01)

Facts the ADR must take as given, from `../research/05-key-storage.md`: the honest sentence is
*encrypted with a key your OS keychain holds; the encrypted key is kept in blobot's data folder*;
`basic_text` on Linux is refused and blobot never calls `setUsePlainTextEncryption`; the env var is
`BLOBOT_<PROVIDER>_API_KEY` and **wins** over a saved key; and it is **stripped from every spawned
runtime's environment**, or the ADR's *never shown to a runtime* is false. The dev-build keychain
prompt on every `electron` bump is a cost the ADR names, not a bug.

## Answer (2026-09-01)

Written as **`docs/adr/0005-the-one-hosted-service-and-the-one-key.md`**, and both permanent
rules in `CLAUDE.md` now end with one sentence pointing at it. The rules stand as absolutes;
this is a conscious exception and says so, and it does not extend: a second hosted service or a
second kind of credential reopens the ADR.

The boundary, as decided in this round (Q1–Q7):

- **One ADR, named for its shape** (one class of service, one class of credential), with the
  functional sentence — dictation may call a hosted transcriber — as the first line of Context.
- **Criteria, not names.** The ADR fixes what a provider must satisfy (transcription-only API; a
  retention sentence blobot can make true per request; a plain key, no OAuth; no BYO endpoint)
  and cites OpenAI, Deepgram and Mistral as the state on 2026-09-01. Adding a provider that
  meets the criteria is table work in core; changing a criterion reopens the ADR.
- **The environment variable is always a door and always wins**, on every OS, never a fallback
  that is read only when encryption is missing. Settings names the source and offers no remove.
- **One file on every OS** — `dictation-keys.json` beside `runtime-options.json`, `0600`, never
  SQLite — with each value carrying its own form: `safeStorage`-encrypted where
  `isEncryptionAvailable()`, **plain text and stated** where not, `basic_text` never. This
  revised the charting answer (*fallback to env when the OS has no backend*) on the author's
  push: the CLIs blobot orchestrates already keep their logins as `0600` plain-text files
  (`~/.codex/auth.json` on this Mac, `gh`'s `hosts.yml`, Claude Code on Linux), so refusing the
  same for one key was theatre paid for by the Ubuntu user. A plain value is re-encrypted at the
  first launch where encryption is available; never the reverse.
- **Two sentences on screen**, under the field once a key is saved: the keychain one (*encrypted
  with a key your OS keychain holds; the encrypted key is kept in blobot's data folder*) or the
  plain one (*kept as plain text in blobot's data folder, readable by anything running as you —
  the same way your CLIs keep their own logins*). The dev-build keychain prompt is a Consequence
  in the ADR and not a sentence on screen.
- **One key per provider, each travelling only to its own provider**, the paste-time zero-spend
  validation included and named.
- **`CLAUDE.md`**: one sentence appended to each of the two rules rather than a line under the
  list, because the reader meets the contradiction on a rule.

Facts for downstream tickets: ticket 10 draws the field on every OS and picks the sentence by
`isEncryptionAvailable()`, and gains a **remove** per saved key (never for the env source) —
this sharpens the *revoking a key* fog. Ticket 11's Transcriber is main-process only. Ticket 12's
done-when gains: the env var stripped from every adapter's spawned env, with a test beside
`cursor/stdio.ts`'s; the plain-form write and the re-encrypt-on-launch migration; the file at
`0600`.
