Type: task
Status: open
Blocked by: 01, 04, 06, 07, 08, 09, 10, 11 (all resolved)

# Dictation, built

## Question

The handoff. Every decision above recorded; this ticket is pure execution and stays open until
the done-when is spent:

- Enabled in Settings on this machine, the scan run, a local model downloaded with the figure
  showing, and a **real Spanish sentence with English code identifiers** dictated into the
  composer and sent to a real agent, who acts on it correctly.
- The same sentence through one remote provider with a key from the keychain, and once with the
  key from the environment variable.
- A `setPermissionRequestHandler` + `setPermissionCheckHandler` allowlist installed before any
  capture code (ticket 04: today nothing is decided and everything is granted).
- The composer with dictation off shows no button; with it on and nothing chosen, no button.
- The mock Transcriber's ugly cases drawn correctly in demo mode.
- Typecheck, tests and build pass; `build.md` written with what was decided while building that
  no ticket covers; the vocabulary in `CONTEXT.md`; the ADR in `docs/adr/`; the DESIGN.md
  sentences ticket 07 and 09 wrote, in place.
- The PR handed to Alain for the Ubuntu pass, with the Linux items from *Not yet specified*
  listed for him.

## Inherited done-when (from the resolutions, 2026-09-01)

Everything below is decided on its ticket; this is the checklist, not the reasons.

- **ADR-0005** (01): `BLOBOT_<PROVIDER>_API_KEY` stripped from every adapter's spawned env, with
  a test beside `cursor/stdio.ts`'s; `dictation-keys.json` at `0600` beside
  `runtime-options.json`, each value `safeStorage`-encrypted or plain by
  `isEncryptionAvailable()`, `basic_text` never, plain re-encrypted at the first launch that can;
  one key per provider; the paste-time zero-spend validation named in Settings.
- **Capture** (04): `setPermissionRequestHandler` + `setPermissionCheckHandler` allowlist first;
  `AudioContext({sampleRate: 16000})`, AudioWorklet → Int16 100 ms chunks → `dictation:feed`;
  RMS from an `AnalyserNode` in the renderer, never over IPC.
- **Shape** (06): `partial` as a ghost after the caret in the mirror layer, `committed`
  inserted at the caret (a change to `suggest`'s append rule), the field never locked; the
  renderer cuts segments at 600 ms silence / 1 s min / 30 s max, silence never sent; 5 min per
  recording then `stopped · 5 min`; `composeSpeechHint` at 40 terms / ~200 tokens; `-l auto`,
  `language=multi` + `endpointing=100`, `languages: [locale, "en"]`. All numbers provisional in
  `bounds.ts`.
- **Composer** (07): the prototype behind `--screen=dictation` becomes the real thing — `Wave`
  takes the RMS, the ghost takes `partial`, `Mic`/`Square` at the head; DESIGN.md's amendment is
  already in place.
- **Readiness** (08): static from `os.totalmem`/`os.arch`/`fs.statfs`, floors 8/4/2 GB and
  2× the download; `unfit`/`untested`/`fit`/`slow`; the *say something* row showing its
  transcription, `warming up` first; `fit` at RTF ≤ 0.3; re-run on *check again*, after a
  download, on a binary change.
- **Download** (09): the repo's first CI workflow building `whisper-cli` for macOS arm64
  (Metal), Linux x64/arm64 and Windows x64 from pinned `b4938`, published as a blobot GitHub
  release; core pins URL + sha256 per OS/arch for the binary and the three weights; `.part` +
  streaming sha256 + `Range` resume + rename on match; `paused · … · resume` after a quit;
  `remove · recovers about …`; DESIGN.md's download-figure sentence beside `:32-36`.
- **Settings** (10): the `dictation` table (one row, named columns) and its migration; the
  section as the flow; `off · keeping … · remove all`; `dictation: off | unconfigured | ready`
  in the snapshot; the two disclosure sentences with the provider's retention sentence from
  core's table.
- **Interface** (11): `Transcriber` and `TranscriberEvent` in `domain`, implementations in
  `speech/` (whisper, openai, deepgram, mistral, mock), `feed` honouring `drain`, zero retries in
  a recording, `MockTranscriber`'s three ugly scenarios drawn in demo mode.
- **Vocabulary**: *Dictation*, *Transcriber*, *Speech model*, *Readiness* into `CONTEXT.md` once
  the author confirms them (Q15, still unanswered).
- **Live** (03 §10, 08): the first live session confirms per provider what the docs alone
  could not — Mistral's code-switching, Deepgram's `mip_opt_out` on the socket, OpenAI's
  `gpt-live-transcribe` at 24 kHz resampled from 16 — and the author judges the audio and the
  visual by hand.

## Progress (2026-09-01)

Built in one session, `.scratch/dictation/build.md` has the detail: the permission allowlist,
the Transcriber vocabulary and mock, the microphone through an AudioWorklet and the renderer's
segmenter, the composer's mic/wave/ghost/caret insertion, the `dictation` table, readiness, the
verified downloader, the CI workflow, `dictation-keys.json` with `safeStorage`, the env var and
its stripping from every adapter, the closed provider table with the retention sentences, the
Settings section as the flow with *say something*, and four Transcribers — whisper (measured
live against the research's binary and clip), OpenAI live, Deepgram, Mistral. Typecheck, tests
and build pass. DESIGN.md carries both sentences.

Still open on the done-when: the engine's hashes (the workflow has not run), the live sentence
into a real agent, the remote lane live with a key from the file and from the environment, the
vocabulary in `CONTEXT.md`, and the PR to Alain.
