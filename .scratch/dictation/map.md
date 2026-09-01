# Dictation — wayfinder map

## Destination

**Reached 2026-09-01.** Eleven of twelve tickets resolved; the frontier is
[Dictation, built](issues/12-dictation-built.md), the handoff, which carries the inherited
done-when. Nothing is left to decide before the build; what is left in *Not yet specified* is
measured on the build or belongs to another effort.

Every decision needed to build **dictation** — speaking into the composer and getting text there,
through a local speech model when the machine can carry one and a remote one when it cannot or
when the user prefers it — is made and recorded on its ticket, so a later session can take the
build ticket as pure execution: no measurement left to run, no question left open. The build
itself is out of this map's hands; the last ticket stays open as the handoff.

## Notes

- Charted 2026-09-01 from two grilling rounds (Q1–Q16). Settled there, binding for every ticket:
  - **Voice becomes text, and text becomes the ordinary prompt.** No runtime advertises
    `promptCapabilities.audio` (all five say `false`), so an agent never sees audio bytes. This is
    a **composer input method**, not a fourth attachment kind: ADR-0004, `AttachmentSupport` and
    `bounds.ts`'s ceilings are untouched.
  - **The remote lane is an exception to two permanent rules** (*no hosted inference*, *no
    credential storage*), taken at the author's direction after the conflict was raised. It is an
    ADR (ticket 01) and it is narrow: transcription only, a service blobot calls itself and never
    an agent, the key in the OS keychain via `safeStorage` with an environment variable as the
    fallback when the OS has no backend, never SQLite, never shown to a runtime.
  - **Local first.** Off by default. Enabling it in Settings runs a readiness scan; a fit machine
    may choose a local model (three sizes, downloaded and installed in-app) or a remote one; an
    unfit machine may choose only remote. The user's choice is never overridden by the scan.
  - **One engine on every OS**, designed for macOS, Linux and Windows, measured here on macOS
    Apple Silicon (M4 Pro, 24 GB). Alain runs Ubuntu against the repo and tests the PR when it is
    ready; that is not a ticket. The OS's own dictation is not a blobot path.
  - **Multilingual**, es + en at minimum, and the done-when includes a real sentence with code
    identifiers in it.
  - The audio is **discarded** once transcribed. The text is the record.
  - The engine runs as a **child process with a stdio protocol** (the house pattern; no new
    native module), with binaries and weights fetched from URLs pinned in core, checksummed,
    under `~/.local/share/blobot/`.
  - The gesture is **toggle + keyboard shortcut**; the mic button exists only once dictation is
    enabled and configured. Transcribed text lands in the composer and is **never auto-sent**.
  - The author wants a **wave indicator that reacts to the incoming audio** while listening, and
    it goes in: ticket 07 prototypes it and writes the DESIGN.md amendment that admits it (it is
    the user's own voice, not ambient). **No morph**: a "morphicons" transition between mic and
    stop was proposed and withdrawn the same day; DESIGN.md `:527` (Lucide only) stands and the
    glyph simply swaps.
- Vocabulary, provisional until the author confirms Q15 (then it goes into `CONTEXT.md`):
  **Dictation** (the input method), **Transcriber** (what turns speech into text, local or remote,
  behind one interface), **Speech model** (the weights a local Transcriber loads), and
  **Readiness** reused from ticket 11 for the scan — measured, never promised, never *supported*.
- Repo facts the tickets lean on: `Composer.tsx`'s `suggest` prop appends text to the field and
  never replaces it; `runtime-step.ts` runs arbitrary argv on a PTY from `$HOME` (one live session
  globally); there is deliberately **no settings table** (`context_ceilings`' comment) and the one
  userData JSON is a cache; DESIGN.md has **no progress-bar primitive** and forbids one that
  claims progress toward an end.
- Skills for sessions here: grilling + domain-modeling for HITL tickets; research for AFK ones;
  prototype for ticket 07. DESIGN.md is binding: a contradiction is a ticket, never a workaround.

## Decisions so far

- [The speech exception to two permanent rules](issues/01-the-speech-exception-to-two-permanent-rules.md):
  **ADR-0005, *The one hosted service, and the one key*** (`docs/adr/0005-...`), and both rules
  in `CLAUDE.md` now point at it. The rules stand; this is a conscious exception that does not
  extend. Criteria over names (transcription-only, retention made true per request, plain key,
  no BYO endpoint; OpenAI/Deepgram/Mistral as of today). Env var **always a door, always wins**.
  **One file on every OS**, `dictation-keys.json` at `0600`: `safeStorage` where available,
  **plain text and stated** where not — revised from charting's env-only fallback because the
  CLIs blobot runs already keep `0600` plain-text logins — `basic_text` never, re-encrypted at
  the first launch that can. One key per provider, each to its own provider only. Two honest
  sentences under the field; the dev-build prompt is an ADR consequence, not screen copy.
- [Which local engine](issues/02-which-local-engine.md):
  Measured on this machine. **whisper.cpp `b4938`** (MIT), one-shot child process per
  utterance: WAV on stdin, JSON on stdout, 0.45 s end-to-end on `base` including model load, no
  server and no native module. **The vocabulary hint is the whole game**: with
  `--prompt "AgentRuntime, session/new, pnpm demo"` even `base` got every identifier exactly
  inside the Spanish sentence; without it only medium/turbo came close. Catalog from HF with
  sha256: `base` 148 MB / 0.4 GB RAM, `small-q5_1` 190 MB / 0.6 GB, `large-v3-turbo-q5_0` 574 MB /
  1.0 GB; final text 0.3 / 0.6 / 1.0 s on Metal, 0.45 / 1.5 / 2.3 s CPU-only. **Streaming is
  re-decode-the-window** — Whisper always encodes 30 s, so a partial costs a full run; partials
  are an optional `base` side-loop, never word-by-word. **No macOS prebuilt executable**: blobot
  builds it in CI (cmake, ~2 min, Metal embedded); Linux and Windows CPU CLIs are published.
  sherpa-onnx loses on the model: the one streaming es+en model is 1.9 GB resident with no
  smaller size, no prompt, and dropped "Hola," every run. Do not ship CoreML (29 s first-run
  compile, zero gain over Metal).
- [The remote providers](issues/03-the-remote-providers.md):
  Documentation only, 2026-09-01. Ship **OpenAI** (`gpt-transcribe` batch, `gpt-live-transcribe`
  WebSocket at 24 kHz; `languages: ["es","en"]` + `keywords[]`; batch keeps nothing), **Deepgram
  Nova-3** (`language=multi` with per-word tags, best streaming partials; `mip_opt_out=true` on
  every request or the retention sentence is false) and **Mistral Voxtral** (cheapest, native
  16 kHz realtime; code-switching undocumented, and a Free-mode account trains by default, which
  blobot cannot detect from the key). Dropped: Groq (no streaming, same Whisper weights as the
  local engine), ElevenLabs and AssemblyAI (both fall on the disclosure sentence, not quality).
  The ticket's model names were **stale**: `whisper-1` and the `gpt-4o-transcribe` family were
  deprecated 2026-08-26. No provider documents a key prefix, so a key is validated with a
  zero-spend GET on paste, never a regex. Cost is 0.3–1.7 cents a minute everywhere; two of the
  three stream real partials. §10 of the research lists what the first live session must confirm.
- [Where a key can live](issues/05-where-a-key-can-live.md):
  Measured live on Electron 44 (dev binary, macOS): `safeStorage` creates the keychain item with
  **no dialog**, but the ACL is bound to the exact cdhash, so every `electron` bump or rebuild
  triggers the *"wants to use your confidential information"* prompt until the app is
  Developer-ID signed. **The honest sentence**: *encrypted with a key your OS keychain holds; the
  encrypted key is kept in blobot's data folder* — never "in the keychain". One JSON beside
  `runtime-options.json`, never SQLite. Linux: `basic_text` (a hardcoded-password cipher) is
  **refused by default** and blobot never calls `setUsePlainTextEncryption`; gate on
  `isEncryptionAvailable()`, not the backend name, which can lie. Env var
  `BLOBOT_<PROVIDER>_API_KEY` (never the provider's own name), **environment wins**, Settings
  names the source and offers no remove control — and it must be **stripped from every spawned
  runtime's env**, the way `cursor/stdio.ts` strips `CURSOR_API_KEY`, or *never shown to a
  runtime* is false. Precedents: Signal, VS Code, Cherry Studio.
- [Capturing the microphone in Electron](issues/04-capturing-the-microphone-in-electron.md):
  Measured on Electron 44 / Chromium 152, unpackaged. **blobot has no permission handler** and the
  default grants everything, so `getUserMedia` returned a track with nothing decided — install
  `setPermissionRequestHandler` + `setPermissionCheckHandler` as an allowlist first. Dev macOS
  never shows the TCC prompt (Electron.app's own bundle id is already granted); a packaged build
  needs `extendInfo` + the audio-input entitlement, and **the app is not packaged at all today**.
  Linux: PulseAudio/`pipewire-pulse`, no OS consent, the Electron handler is the only gate.
  Transport: `AudioContext({sampleRate:16000})` resamples for free; AudioWorklet → Int16 100 ms
  chunks → IPC → child stdin at 32 KB/s. **`child.stdin` is a 64 KB socket**: a stalled engine
  fills it in two seconds, so the writer must honour `drain`, drop rather than queue, and never
  reuse `childTransport.write` — backpressure belongs in the `Transcriber` interface (ticket 11).
  Level: `AnalyserNode` RMS in the renderer, never crossing IPC.

- [Streaming or turn-based](issues/06-streaming-or-turn-based.md):
  One interface, two events — `partial` (revisable) and `committed` — and each Transcriber emits
  what it honestly can: local `committed` per segment only (no `base` side-loop), OpenAI live and
  Deepgram both, Mistral one at stop. A `committed` inserts **at the caret**; a `partial` is a
  **ghost after the caret** and never enters the field's value; the field is never locked. The
  **renderer cuts local segments** from the RMS it already has: 600 ms silence, 1 s min, 30 s
  max, silence never sent — provisional numbers in `bounds.ts`. **5 min per recording**, then
  `stopped · 5 min`, text kept. Hint per recording: roster + team name + identifier-shaped
  tokens from the last 10 user messages, 40 terms / ~200 tokens, trimmed not refused. **No
  language setting**: `-l auto` / `language=multi` / `languages: [locale, "en"]`.

- [Readiness for a local Transcriber](issues/08-readiness-for-a-local-transcriber.md):
  Static stage reads RAM, arch and free disk from Node, no GPU probe (binaries are Metal on
  Apple Silicon, CPU elsewhere, and CPU reaches turbo). ≥ 8 GB → turbo, ≥ 4 → small, ≥ 2 →
  base, else `unfit`; disk ≥ 2× the download. Four words: `unfit` (remote only, figure named),
  `untested`, `fit`, `slow` (still eligible, offers stepping down). **No shipped clip: the
  measured stage is a *say something* step in Settings** — real mic, real voice, transcription
  shown — which also exercises the permission. `fit` at RTF ≤ 0.3, provisional; the measurement
  wins over the static word. Re-run only on *check again*, after a download, or on a binary
  change; a size change returns to `untested`.

- [Downloading a speech model](issues/09-downloading-a-speech-model.md):
  **blobot builds `whisper-cli` for all three OSes in its own CI** (the repo's first workflow,
  pinned `b4938`, Metal on arm64 macOS, CPU elsewhere, no Linux GPU) and publishes a GitHub
  release under its own tag; core pins URL + sha256 per OS/arch, upstream assets unused. Main
  fetches to `.part`, hashes as it writes, resumes with `Range`, renames on match; a hash
  failure deletes and says so; no PTY. DESIGN.md gains the sentence admitting
  `downloading · 412 MB of 574 MB` as a figure that knows its end. Cancel deletes, retry
  resumes, quitting pauses (`paused · … · resume`, never auto). Removing the chosen model leaves
  dictation without a Transcriber and the mic leaves the composer. Binary fetched like a weight
  (no npm, `allowBuilds` unchanged); Metal warm-up lands inside the *say something* step.

- [The button and the wave](issues/07-the-button-and-the-wave.md):
  Prototyped in the real composer (`--demo --screen=dictation`), reviewed by the author. **Mic
  at the head beside `+`** (same kind of door; at the tail it reads as *send my voice*), glyph
  swap to a filled `Square`, no morph. **Four 2px ink bars** driven by `transform` from the
  voice level, no keyframe, four dots in silence, still under reduced motion. Word above the
  pill, `LISTENING · 0:05`, mono. Partial as a `--muted` ghost after the caret in the mirror
  layer. DESIGN.md amended under *Ambient motion*: the wave answers to the second budget, like
  the gaze. Screenshots in `research/07-*.png`; the prototype stays behind the flag for ticket 12.

- [The Dictation section in Settings](issues/10-the-dictation-section-in-settings.md):
  A **`dictation` table in SQLite, one row, named columns** (`context_ceilings`' own allowance;
  the key never here). **The section is the flow**, third in Settings, rows by state, no wizard:
  the switch; readiness word + figure + *check again*; *Speech model* rows with size and
  download / downloading figure / remove-with-recovery, absent when `unfit`, plus the *say
  something* row; *Remote* with a provider picker and a key field that never echoes the key
  (saved → the honest sentence + remove; environment → named, no remove; `key rejected` on
  paste). Turning off deletes nothing and prices *remove all*; the binary goes with that, not
  with the switch (corrects 09). The composer learns via the snapshot (`off | unconfigured |
  ready`) and draws the mic only in `ready`. Disclosure stated, two sentences, the remote one
  naming the provider plus its retention sentence from core's table.

- [The Transcriber interface](issues/11-the-transcriber-interface.md):
  **One interface for both classes** — `start(hint)`, `feed(pcm) → taken | dropped`, `mark()`,
  `stop()`, `events` — types in `domain`, implementations in `speech/`; local runs one
  `whisper-cli` per segment between marks, remote streams and treats a mark as a finalisation
  hint. Four events: `partial`, `committed`, `ended {user | ceiling}`, `failed {no_model |
  engine_exited | key_rejected | network | no_credit}`; the level is not one. PCM crosses IPC
  once, renderer → main; core knows the format and processes no audio. `MockTranscriber` with
  three ugly scenarios, `ready` in demo. No resident local process, zero retries inside a
  recording, nothing starts with the app. `composeSpeechHint` pure in core, called from main.

## Not yet specified

- **Linux and Windows measured**, not just designed: mic capture through PipeWire/PulseAudio,
  `safeStorage` with and without a backend, the engine on CPU without a GPU. Sharpens once the
  engine (02) and the capture path (04) are known.
- **Push-to-talk** as a second gesture beside toggle; deferred, not refused.
- **Input device selection** (which microphone) and what happens when the device disappears
  mid-recording.
- **What a recording does across a team switch, a pane switch and an app quit**, and what the
  shortcut does when the window is not focused.
- **Remote cost on screen**: whether minutes sent to a provider are shown, and where — the gauge
  answers per-turn spend and this is not per-turn.
- **Packaging** (from ticket 04): the app is not packaged, so blobot's own mic usage string and
  the audio-input entitlement cannot be measured here. Not this effort's to decide, but the
  packaged mic prompt is unverifiable until someone owns it.

## Out of scope

- **Audio as an attachment to an agent.** No runtime takes it, and `composer-attachments` already
  left it out; if one ever advertises `audio: true`, that is a fresh effort.
- **The OS's own dictation as a blobot path** (macOS `SFSpeechRecognizer`, Fn Fn): the user
  already has it in every text field without blobot doing anything, and Linux has none, which
  breaks *one engine on every OS*.
- **A microphone on any field other than the composer.**
- **Bring-your-own endpoint URL** for remote transcription: the closed provider list is what keeps
  a user's voice from being sent anywhere at all.
- **Keeping the audio** for later re-transcription.
- **Text-to-speech** in any form.
