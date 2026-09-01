Type: research
Status: resolved

# The remote providers

## Question

A **closed list** of remote Transcribers, written in core the way `INSTALL_SCRIPTS` is, each
entry declaring whether it streams. Candidates from charting: OpenAI (`gpt-4o-transcribe`,
`whisper-1`, the realtime transcription WebSocket), Deepgram (Nova), Groq (whisper, batch),
Mistral Voxtral; add others only if first-party and multilingual.

Answer from primary documentation, current as of today:

1. Per provider: batch and/or streaming endpoint, wire protocol (HTTP multipart, WebSocket,
   SSE), audio formats and sample rates accepted, maximum clip length and file size, languages
   and code-switching support, whether a prompt/vocabulary hint is taken.
2. Auth shape (header, key format, any org id), and whether a key can be validated cheaply
   without sending audio.
3. Price per minute, and what one minute of dictation costs on each.
4. Data retention and training-use terms for audio sent — the sentence the Settings disclosure
   will need.
5. Which two or three to ship first and why, and which are dropped and why.

Record findings in `.scratch/dictation/research/03-remote-providers.md`. Do not call any API
with a credential; documentation only.

## Answer

Ship **three**, in this order, each a closed-list entry with `streams` declared:

1. **OpenAI** — `gpt-transcribe` (batch, multipart, $0.0045/min) and `gpt-live-transcribe`
   (WebSocket, **24 kHz PCM only**, $0.017/min). `languages: ["es","en"]` + `keywords[]` is
   the documented answer to code-switching and the identifier hint. `/v1/audio/transcriptions`
   keeps **nothing**, not even an abuse log; realtime keeps one for 30 days; neither is trained
   on. **The ticket's names are stale**: `whisper-1` and the `gpt-4o-transcribe` family were
   deprecated 2026-08-26, shutdown 2027-02-26.
2. **Deepgram Nova-3** — raw-body POST and WebSocket at any PCM rate; `language=multi` is a
   first-class documented mode with a **per-word language tag**, `keyterm` says *match
   capitalization*; `interim_results` / `is_final` / `speech_final` are the best partials for
   ticket 06. $0.0052/min batch, $0.0092/min streaming, +$0.0013 for keyterms. **Every request
   must carry `mip_opt_out=true`** or the retention sentence is false.
3. **Mistral Voxtral Transcribe 2** — `voxtral-mini-latest` (SSE on the batch endpoint,
   $0.003/min) and the realtime socket at native **16 kHz** ($0.006/min). Cheapest and
   European, but code-switching is undocumented, `context_bias` is English-only in practice,
   and a Free-mode account trains by default — undetectable from the key, so the disclosure
   carries an *if*. (`voxtral-mini-2507` is retired.)

**Dropped**: Groq (no streaming; the model is the same Whisper large-v3 the local engine runs,
so it adds a GPU and not a capability — trivial to add later, OpenAI-shaped), ElevenLabs Scribe
(self-serve keys train by default, zero retention is Enterprise-only) and AssemblyAI ("Free
users cannot opt out of the model improvement program", transcripts kept indefinitely without a
paid TTL). The last two fall on the retention sentence, not on quality.

Common to all: one auth header; a zero-spend GET to validate a key on paste (`/v1/models`,
`/v1/projects`); no key prefix is documented anywhere, so validate with the probe and never a
regex. Capture at 16 kHz mono serves the local engine, Deepgram and Mistral raw; OpenAI live is
the one resample. Documentation only — nothing was called; §10 of the note is what the first live
session must confirm.

Findings, source URLs and the three disclosure sentences:
`.scratch/dictation/research/03-remote-providers.md`.
