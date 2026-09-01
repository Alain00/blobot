Type: grilling
Status: resolved
Blocked by: 01, 08 (both resolved)

# The Dictation section in Settings

## Question

`Settings.tsx` has two sections, both about the machine, added "when there is something true to
configure, never to fill the column out". Dictation is a third, and it is about the machine.
**Off by default.** The flow, settled: enable → readiness scan → a fit machine picks local
(download) or remote (paste a key); an unfit one picks only remote; the user overrides the
recommendation in the fit case and never in the unfit one.

Decide: the section's rows and words (the four readiness words, the model picker with disk cost,
the provider picker, the key field that never echoes the key back, the disclosure that says where
the key went and where the audio goes on remote — stated, not consented to, like the creation
flow's); **where the choice persists** — not a key-value table (`context_ceilings`' rule), so a
table with named columns, or a JSON file in userData like `runtime-options.json` but authoritative
this time; write the reason either way; what disabling does to a downloaded model (keeps it, says
so); what the composer shows when dictation is enabled but nothing is chosen yet (nothing — the
button does not exist); and how the composer learns the choice changed without a restart.

## Answer (2026-09-01)

**The choice persists in a `dictation` table in SQLite, one row, named columns**: `enabled`,
`transcriber` (`local` | `remote`), `model_id`, `provider_id`, `readiness`, `measured_rtf`, `at`.
This is what `context_ceilings`' own comment allows — columns that are the whole of what the
thing is, never a key-value bag — and it gains migrations and the snapshot the renderer already
reads. The key never goes here (ADR-0005 clause 5): durable-and-not-secret is the database's,
secret is `dictation-keys.json`'s.

**The section is the flow.** *Dictation*, third in the list, rows appearing by state, no wizard:

1. `Dictation · off / on` — the switch; off, it is the only row.
2. Readiness: word + figure + *check again* (`untested · 24 GB · Apple Silicon`;
   `unfit · 3.2 GB RAM · remote only`). The static scan runs when the switch goes on.
3. *Speech model* (absent when `unfit`): three `.listrow.pick` — name, size, and `download` /
   `downloading · 412 MB of 574 MB` / `remove · recovers about 574 MB`, the recommended one
   marked; choosing a downloaded one makes it the Transcriber. Under it, ticket 08's *say
   something* row with the transcription it produced.
4. *Remote*: provider picker (three `.listrow.pick`); the key field, which **never returns the
   key** — empty with *paste a key*; saved, `key saved · ` + ADR-0005's honest sentence for the
   form it took + *remove*; from the environment, `from BLOBOT_OPENAI_API_KEY · unset it in the
   shell that launched blobot to stop using it`, no *remove*; `checking…` / `key rejected` on
   paste (the zero-spend validation, named as the key's first trip out). Choosing a provider
   with a valid key makes it the Transcriber.
5. The disclosure at the foot, stated and never consented to, like the creation flow's.

**Turning it off deletes nothing implicitly.** The switch row says what it keeps —
`off · keeping 2 speech models and the engine · 780 MB` — with *remove all · recovers about
780 MB*, the delete-team treatment of pricing first. Keys stay too, said on the same line. The
engine binary goes with *remove all* and not with the switch, which corrects ticket 09's "falls
with disable dictation".

**The composer learns through the snapshot** main already pushes: a `dictation` field with
`off | unconfigured | ready`, and the mic button exists only in `ready`. No new channel; the
composer never learns which Transcriber is behind it. Enabled with nothing chosen is
`unconfigured`, and the composer shows nothing (settled).

**The disclosure**, two sentences by choice:
- local: *Your voice is transcribed on this machine. The audio is discarded once it is text; the
  text is what goes to an agent.*
- remote: *Your voice is sent to OpenAI to be transcribed, and to nobody else. The audio is
  discarded here once it is text.* + the provider's own retention sentence from core's table,
  the one ADR-0005 requires to be true per request. The provider is named because this is the
  one thing in the app that sends something of the user's off the machine.
