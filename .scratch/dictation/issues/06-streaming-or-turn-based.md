Type: grilling
Status: resolved
Blocked by: 02, 03 (both resolved)

# Streaming or turn-based

## Question

The author wants text to appear **while speaking**, the way the CLIs do it, and said in the same
breath that if it is not worth its cost now, record-then-transcribe is acceptable and the
decision waits on facts. The facts are tickets 02 (does the chosen engine emit partials, at what
latency) and 03 (which providers stream).

Decide the shape: live partials, chunked pseudo-streaming (a segment every N seconds of silence),
or one transcription at stop — possibly a different answer for local and remote, if the
interface (ticket 11) can carry both honestly. Decide how text **lands** in the composer: the
`suggest` prop's rule (append, never replace; DESIGN.md `:652` — text arriving on its own
**snaps**), how a partial that is later corrected is drawn without moving what the user is
reading, where the caret is while dictating, and what happens to text the user types while a
recording is live. Never auto-send, settled. And decide the long-recording case: a ceiling on a
single recording, stated where it bites, refused rather than truncated, in the spirit of
`bounds.ts`.

## From tickets 02 and 03 (resolved 2026-09-01)

Local: whisper.cpp has **no true streaming** — a partial is a full re-decode of the window (0.2 s
on `base`, ~2 s on turbo CPU), so live text is at best a `base` side-loop with the chosen model
producing the final. Remote: OpenAI live and Deepgram stream real partials; Mistral batch is SSE.
So the honest shapes on the table are *segment on silence* (local) and *live partials* (two
providers), and the interface must carry both. **The vocabulary hint graduates from fog to this
ticket**: `--prompt` on whisper.cpp, `keywords[]` on OpenAI, `keyterm` on Deepgram — the roster's
names and the team's identifiers, composed by blobot per turn like `composeLeadBrief`; decide what
goes in and its ceiling.

## Answer (2026-09-01)

**One interface, two events, and each Transcriber emits what it can honestly.** `partial` (may
be revised) and `committed` (will not be). Local whisper.cpp emits only `committed`, one per
segment; OpenAI live and Deepgram emit both (`is_final` commits); Mistral emits one `committed`
at stop. No `base` side-loop to fabricate local partials: it doubles the CPU to show text the
final will correct, and a partial without the hint does not say what the final says. If local
feels dead at ~0.8 s per segment, reopen with a measurement.

**How text lands.** A `committed` is inserted **at the caret**, spaced as needed, caret after it —
so typing while dictating needs no rule of its own. A `partial` **never enters the field's
value**: it is drawn as a ghost (muted ink, same face) after the caret, replaced in place on each
revision, gone when its `committed` arrives. The field is never locked while listening. Never
auto-sent (settled in charting).

**Who cuts a local segment: the renderer**, from the RMS it already measures. 600 ms under the
threshold closes a segment; a segment is at least 1 s and at most **30 s** (Whisper's window),
cut at the lowest-energy 100 ms of the last 3 s when it hits the ceiling; a segment of pure
silence is never sent (Whisper hallucinates on silence). The three numbers are **provisional**,
named so in `bounds.ts`, waiting on the first real use.

**Long recording: 5 minutes per recording.** Nothing is ever truncated because segments land as
they come; what has a ceiling is *listening on*. At the ceiling it stops itself and the line
under the composer says `stopped · 5 min`; the text stays.

**The vocabulary hint**, composed per recording like `composeLeadBrief`, never persisted: the
current team's roster names and the team name, then identifier-shaped tokens (`/`, `_`, `.`,
camelCase, `@`) from the last 10 user messages of that team's transcript, most recent first;
ceiling **40 terms / ~200 tokens** in `bounds.ts` (the narrowest of `--prompt`, `keywords[]`,
`keyterm`, Mistral's 50), trimmed rather than refused because it is an aid and not content.
Branch names and touched files from `WORKSPACE` are deferred until the hint is measured against
the done-when sentence.

**Language: no setting.** whisper `-l auto`; Deepgram `language=multi` with `endpointing=100`;
OpenAI `languages: [app.getLocale(), "en"]` deduplicated, a hint list and not a restriction;
Mistral bare, measured in the first live session (research 03 §10). If auto fails the done-when
sentence, that is ticket 12 failing, and it reopens with the sentence that failed.

For ticket 11: the interface is `start(hint) → stream of {partial|committed} → stop()`, with the
backpressure rule from ticket 04, and the segment cutting is the renderer's, so the local
Transcriber receives whole segments and the remote ones receive the 100 ms chunk stream.
