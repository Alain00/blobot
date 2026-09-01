# Dictation — build log

What was decided while building ticket 12 that no ticket covers, what bit, and what is left.
Read `map.md` first; the reasons for everything the tickets decided live on the tickets.

## Built (2026-09-01, session 1)

**Tramo 1 — permissions (04).** `main/web-permissions.ts`: `setPermissionRequestHandler` and
`setPermissionCheckHandler` on `session.defaultSession`, installed in `createWindow` before the
page loads, as an allowlist: `media` with `audio` only, from blobot's own origin, while dictation
is not `off`. Camera, `speaker-selection`, geolocation, notifications — everything else — refused.
Tested pure (`permissionAllowed`).

**Tramo 2 — core.** `speech/domain.ts` (the `Transcriber` interface, the four events,
`PCM_16K_MONO_INT16`, `describeTranscriberFailure`), `speech/hint.ts` (`composeSpeechHint`),
`speech/ceiling.ts` (`withRecordingCeiling`), `speech/mock-transcriber.ts` (three scenarios:
`rewrites`, `stalls`, `dies`). Dictation's numbers appended to `orchestrator/bounds.ts`, every one
named provisional. Exported from `/domain` (types, constants, the sentence) and from the full
entry (the mock, the hint, the ceiling).

**Tramo 3 — capture and the composer.** `renderer/dictation/capture.ts` (getUserMedia →
`AudioContext({sampleRate:16000})` → AudioWorklet from a blob URL → 100 ms Int16 chunks;
`AnalyserNode` RMS for the wave), `renderer/dictation/segmenter.ts` (pure, tested: pre-roll,
silence cut, ceiling cut at the quietest chunk, stream mode), `renderer/useDictation.ts` (the
hook), `main/dictation.ts` (`DictationHost`: one recording, events back on `dictation:event`
leading with the team id). The prototype's simulation in `App.tsx` is gone; `--screen=dictation`
now starts a real recording against the mock with a simulated level and no microphone.

**Tramo 4 — readiness (08) and download (09).** `speech/catalog.ts` (three weights pinned with
HF's sha256; four engine builds under blobot's own release tag, **hashes unpinned until the
release exists**), `speech/readiness.ts` (the static stage and the measured word, pure),
`speech/download.ts` (`.part`, streaming sha256, `Range` resume, rename on match, tested against
a local HTTP server that drops the connection), `main/speech-files.ts` (the data dir, states,
footprint, machine facts), the `dictation` table (migration 0020, one row, named columns), and
`.github/workflows/whisper-cli.yml`, the repo's first workflow.

**Tramo 5 — Settings (10) and the key (ADR-0005).** `main/speech-keys.ts` (`dictation-keys.json`
at `0600`, `safeStorage` or plain-and-stated, env var wins, plain re-encrypted at launch),
`adapters/acp/child-env.ts` (`BLOBOT_*_API_KEY` stripped from every adapter's child, tested
beside Cursor's own stripping), `speech/providers.ts` (the closed list with each retention
sentence and the zero-spend probe), `main/dictation-settings.ts` (the section composed, the
composer's word derived), `components/Dictation.tsx` (the section as the flow, the *say
something* row). DESIGN.md's download-figure sentence is in place beside the progress-bar rule.

**Tramo 6 — the Transcribers.** `speech/whisper.ts` (one `whisper-cli` per segment, WAV on
stdin, JSON on stdout, `--prompt` from the hint; **measured live** against the research's
binary and clip: 1,849 ms on `base` for 10 s of audio, every identifier intact —
`BLOBOT_LIVE_WHISPER=1`), `speech/openai.ts` (Realtime socket, `gpt-live-transcribe`, 24 kHz
resampled from 16, `turn_detection: null` with `mark()` as the commit), `speech/deepgram.ts`
(Nova-3, `language=multi`, `endpointing=100`, **`mip_opt_out=true` on every request**, `keyterm`,
KeepAlive), `speech/mistral.ts` (Voxtral batch, one request per segment, `context_bias`). All
three tested against fake sockets and a fake fetch; none has met its provider yet.

## Decided while building

- **`Transcriber.takes: 'segments' | 'stream'`.** Ticket 06 assigned two feeding policies (whole
  segments to the local engine, the chunk stream to a streaming provider) and ticket 11's
  interface had no word for which one applies. A second capability beside `partials`, not an
  identity: the renderer learns what to send, never who is eating.
- **Committed text lands through `DictationView.committed`, not through `suggest`.** Ticket 06
  said "a change to `suggest`'s append rule", but `suggest` has a second caller (the Handbook's
  *add one*) whose rule — a new line, for the user to finish — is right for it. Two rules, two
  props. The insertion is at the caret, spaced against both neighbours, caret after it.
- **The ghost sits at the caret, except inside an `@mention`**, where it goes after the mention:
  half a name underlined is not a thing.
- **The level is a function, not a prop.** `DictationView.level: () => number`; the `Wave`
  reads it in its own `requestAnimationFrame` and sets `transform` directly. The prototype
  re-rendered the whole composer sixty times a second.
- **The keyboard gesture is ctrl/⌘ + shift + M**, a window listener like the navigator's ctrl+k.
  Nothing on the map named the key; the tooltip says it.
- **A recording belongs to the team it started on.** Switching teams stops it; so does dictation
  going `off` under it. The map lists *what a recording does across a team switch* as fog; this
  is the smallest honest answer and it is not final.
- **Backpressure is drawn as `listening · 0:12 · paused`** while a chunk was dropped in the last
  1.5 s — ticket 04's "listening paused". The note after a recording (`stopped · 5 min`, a
  failure by cause) stays for 12 s or until the next press.
- **300 ms of pre-roll** ahead of a segment's first voiced chunk, so the first word is not
  clipped. Provisional, in `bounds.ts` with the rest.
- **The mock plays regardless of audio** — real microphone in, scripted words out — and
  `--demo-speech=<name>` picks the scenario. It counts bytes and marks so a test can prove the
  microphone was really fed.
- **The demo says `ready`; everything else says `off`** until the Settings row exists (tramo 5).
  `installWebPermissions` gates the microphone on the same word.

- **Memory is GiB.** `os.totalmem()` on the 24 GB machine is 25.77e9 bytes, and dividing by
  10⁹ drew `26 GB` on the readiness row. RAM is sold and spoken of in GiB; disk in GB. The
  floors are GiB too.
- **The engine's hash cannot be pinned before the release exists**, so `ENGINE_BUILDS` carries
  `sha256?: string` and an unpinned build is a *refusal on screen* (`the engine for this machine
  is not pinned yet`), never a fetch. Running the workflow and pasting the four hashes from
  `SHA256SUMS` into the catalog is the step that turns local dictation on for everybody.
- **Mistral takes segments, one request each**, rather than ticket 06's "one committed at
  stop": the same batch endpoint, called per segment as the local engine is, so text lands as
  the pauses come and the bill is the same audio-minutes either way. The renderer never sends
  it silence.
- **`DictationSettingsHost` derives the composer's word and stores nothing derived.** `ready` is
  the row saying *on* and the chosen Transcriber actually being there — a model beside an
  engine on disk, or a provider whose key is held — read from a cache of the disk that main
  refreshes on every file change, because `snapshot()` is synchronous.
- **The measured stage is timed in main**, generically: `DictationHost` on a tryout remembers
  the audio fed before the first `mark()` and the moment of it, and the first `committed` gives
  the real-time factor. No timing crosses the `Transcriber` interface.
- **`--demo-dictation=on`** switches the section on in the demo's throwaway store, so the rows
  past the switch are reviewable by a screenshot; the demo's *say something* runs the mock.
- **The Deepgram socket cannot tell a rejected key from a dead network** at the upgrade — the
  WHATWG `WebSocket` exposes no status — so a failure there is `network`, and the paste-time
  probe is where a key is refused by name. A close reason naming payment is `no_credit`.

## What bit

- **The screenshot harness steals focus.** A stray `y s` appeared in the composer on the first
  `--screen=dictation` capture: the Electron window comes to the front and a keystroke typed
  elsewhere landed in the field. Three re-runs were clean. Not a composer state.
- **The renderer paints at ~4 s on a cold launch**, so `--screenshot-at` for a listening state
  wants 7–9 s: the mock's clock starts when the hook starts, not when Electron does.
- `exactOptionalPropertyTypes`: a state object with `partial?: string` cannot be set to
  `undefined` with a spread; the hook's `View` says `| undefined` explicitly.

- **Async iterators are a few microtasks behind a resolved promise.** A test that awaited
  `stop()` and then read the collected events saw none; every such test now yields a macrotask
  first (`settle()`).
- **A 30 ms server drop in the download test** — the test server has to flush the partial body
  before destroying the socket, or the client sees a reset before any byte and no `.part` exists.

## Left

- **The repository is private, and the engine's release URL is therefore private too.** Found
  2026-09-01, the day the workflow first ran: `gh release download` works and a plain `fetch`
  of the same URL answers `Not Found`, and the app downloads with a plain `fetch` and no token
  — ADR-0005 would refuse one anyway. The workflow, the release and the pinned hashes are all
  real and verified; what does not work yet is the *in-app* engine download for anyone, until
  the author decides between making the repo public, a small public releases-only repo (one URL
  changes in `catalog.ts`), or another public host. **The author's call, deliberately not made
  here.** Weights are unaffected — Hugging Face is public.
- ~~Run the workflow and pin the hashes~~ — done 2026-09-01: `whisper-b4938-1` built all four
  binaries, the hashes are pinned in `ENGINE_BUILDS`, and the darwin-arm64 asset was verified
  live through the adapter: 8.2 s cold (Metal's first-run shader cache), **325 ms warm** for
  the 10 s clip, identifiers intact. The binary is placed at
  `~/.local/share/blobot/speech/bin/whisper-b4938-1/` on this machine, exactly where the app's
  own download would put it.
- **The live done-when, by hand**: enable, download, *say something*, the Spanish sentence with
  identifiers into a real agent; the same through one provider with a key from the file and one
  from the environment. The author judges the audio and the visual.
- **The remote adapters' first live session** (research 03 §10): OpenAI's session shape and
  401 body; Deepgram's `dg-error` on a bad key; Mistral's `Bearer` on batch and its code-switching.
- Q15 vocabulary into `CONTEXT.md`, once confirmed.
- The PR to Alain for the Ubuntu pass, with the Linux items from *Not yet specified*.
