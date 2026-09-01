# ADR-0005 — The one hosted service, and the one key

- **Status:** accepted
- **Date:** 2026-09-01
- **Decided by:** the author, grilled through `.scratch/dictation/` (ticket 01, on the
  measurements of tickets 03 and 05)
- **Touches:** `CLAUDE.md`'s permanent rules *no hosted inference* and *no credential storage*
  (both stand; each now points here), the dictation Transcriber (ticket 11), the Settings
  section (ticket 10), every adapter's spawned environment

## Context

Dictation may call a hosted transcriber. blobot's remote Transcriber sends the user's voice to a
speech-to-text service and needs that service's API key. Two of the repository's permanent
rules say, in as many words, that blobot never provides hosted inference and never persists an
API key. The conflict was raised while charting and the author's direction was explicit: **the
rules stay as written, and this is a conscious exception to them**, not a loosening. That is
the shape of an ADR — hard to reverse, surprising to the next reader, the result of a trade-off
that was actually weighed — so the boundary is written here once, exactly, and the rules point
at it.

What the two rules protect is not abstract. *No hosted inference* is what keeps blobot from
becoming a proxy that stands between the user and a model with the user's money in its hands.
*No credential storage* is what keeps blobot from being a database of secrets that every
AgentWorkspace on the machine can reach, because `Read` never prompts (ADR-0004). The exception
has to leave both of those protections intact, which is why it is drawn as narrowly as it is.

## Decision

**blobot may call exactly one class of hosted service — speech-to-text transcription for its own
composer — and may hold exactly one class of credential: the key for that service.** Nothing
else is covered, and the exception does not extend: a second hosted service or a second kind of
credential reopens this ADR rather than inheriting from it.

The boundary, clause by clause:

1. **Transcription only, never LLM inference.** The service turns the user's audio into text and
   the text becomes an ordinary prompt. No agent's turn, no summary, no completion of any kind
   travels this road, even where the same provider would sell one at the same endpoint.
2. **A service blobot calls, never an agent.** The Transcriber runs in blobot's main process. No
   runtime is told a provider exists, no key is proxied on a runtime's behalf, and the
   environment variable below is **stripped from every spawned runtime's environment**, the way
   `adapters/cursor/stdio.ts` strips `CURSOR_API_KEY`. *Never shown to a runtime* is a fact the
   adapters enforce, not a sentence.
3. **A closed provider list, chosen by criteria that live here.** A provider is offered only if:
   its API is transcription, not a general model endpoint; the retention sentence blobot draws
   can be made true by something blobot controls on every request (an opt-out parameter, a batch
   mode that keeps nothing); and it takes a plain API key, with no OAuth and no account blobot
   would have to hold. Bring-your-own endpoint is refused, because the closed list is what keeps
   a voice from being sent *anywhere*. As of 2026-09-01 the list is OpenAI, Deepgram and Mistral
   (`.scratch/dictation/research/03-remote-providers.md`); Groq, ElevenLabs and AssemblyAI were
   dropped on those criteria. **Adding a provider that meets them is ordinary work in core's
   table; changing a criterion reopens this ADR.**
4. **At most one key per provider, and each key travels to its own provider only** — including
   the zero-spend validation request made when it is pasted, which is the first time a key
   leaves the machine and is named as such in Settings.
5. **Two places a key may live, and only two.** One file, `dictation-keys.json`, beside
   `runtime-options.json` in blobot's data folder, mode `0600`, never SQLite (on
   `context_ceilings`' own argument: the database is the transcript's, not a settings store).
   And the environment variable `BLOBOT_<PROVIDER>_API_KEY` — blobot's own name, never the
   provider's, so a key set for some other tool is not silently picked up. **The environment is
   always a door and always wins**, on every OS, the way `gh` treats `GH_TOKEN`: Settings names
   the source, offers no *remove* for it, and says *unset it in the shell that launched blobot to
   stop using it*.
6. **Encrypted where the OS can, plain and stated where it cannot; obfuscated nowhere.** Each
   value in the file carries its own form. When `safeStorage.isEncryptionAvailable()` is `true`
   the value is `safeStorage`-encrypted and Settings says *encrypted with a key your OS keychain
   holds; the encrypted key is kept in blobot's data folder* — never "in the keychain", which is
   not where it is. When it is `false` (a Linux desktop with no secret service) the value is
   **plain text** and Settings says so: *kept as plain text in blobot's data folder, readable by
   anything running as you — the same way your CLIs keep their own logins*. blobot never calls
   `setUsePlainTextEncryption`: Chromium's `basic_text` is AES under a password printed in its
   source, protection from nobody with the word *encrypted* on it, and the one form this ADR
   forbids. A plain value found at launch on a machine where encryption has become available is
   re-encrypted in that launch; the reverse migration never happens.
7. **The rules point here.** Each of the two permanent rules in `CLAUDE.md` ends with one
   sentence naming this ADR, so the next reader meets the exception on the rule it excepts and
   not by finding the contradiction in the code.

## Consequences

- **The refusal that was theatre is gone.** A machine with no keyring keeps the key the way its
  own CLIs do: `~/.codex/auth.json` is plain text at `0600` on this very Mac, `gh` writes
  `hosts.yml` the same way, and Claude Code does the same on Linux. Refusing the same for one
  transcription key while orchestrating those CLIs would protect nothing and cost the Ubuntu
  user a paste into the shell on every launch. What makes the design safe is clauses 2, 3 and 4
  — where the key goes and who never sees it — and none of that depends on the file's form.
- **An agent could read the file, and that is not new.** blobot's data folder is outside every
  AgentWorkspace, but `Read` never prompts, so an agent that names the path gets it — exactly as
  it gets `~/.codex/auth.json` today. The exception adds one more file to a class of exposure
  the runtimes already have; it does not create the class. A per-agent restriction of what a
  runtime may read outside its worktree is a cross-runtime effort of its own and is not paid
  for here.
- **The dev build asks.** `safeStorage` binds the keychain item's ACL to the exact code hash, so
  an unsigned Electron binary prompts *"wants to use your confidential information"* after every
  `electron` bump or rebuild until the app is Developer-ID signed. A cost of how blobot is built
  today, named here and not on screen; packaging owns the fix.
- **Two rules now carry a footnote**, which is the price of keeping them as absolutes instead of
  rewriting them to "except for...". The alternative — softening the rules — was refused because
  a rule with a hole reads as a rule with more holes coming.
- **Validation spends the key once before any dictation.** The paste-time check is a network
  call to the provider with the key in it. It is the honest way to say *this key works* rather
  than a regex against a prefix no provider documents, and Settings says it happens.

## Alternatives rejected

- **Two ADRs, one per rule** — it is one decision with two consequences: without the service no
  key is needed, without the key there is no service.
- **Naming the three providers in the Decision** — the same split ADR-0003 makes between what the
  scope allows and what the palette offers: the ADR decides *what may be offered*, the table
  decides *who*.
- **Environment variable as a literal fallback**, read only when encryption is unavailable —
  leaves "a Mac with both" undefined, and the right answer there (*the environment wins*) is the
  always-a-door rule.
- **A session-only key held in memory** for machines without a backend — a third place for a key
  to live, and the kind of state nobody remembers having set.
- **Storing the key in SQLite** — the database is a transcript, and `context_ceilings` already
  made the argument against turning it into a settings table.
