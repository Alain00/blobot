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

## What bit

- **The screenshot harness steals focus.** A stray `y s` appeared in the composer on the first
  `--screen=dictation` capture: the Electron window comes to the front and a keystroke typed
  elsewhere landed in the field. Three re-runs were clean. Not a composer state.
- **The renderer paints at ~4 s on a cold launch**, so `--screenshot-at` for a listening state
  wants 7–9 s: the mock's clock starts when the hook starts, not when Electron does.
- `exactOptionalPropertyTypes`: a state object with `partial?: string` cannot be set to
  `undefined` with a spread; the hook's `View` says `| undefined` explicitly.

## Left

- Tramo 4: readiness (08) and download (09) — the `dictation` table, the fetcher, the CI
  workflow, the catalog.
- Tramo 5: the Settings section (10), `dictation-keys.json`, the env var and its stripping.
- Tramo 6: the whisper Transcriber, the three remote ones, the live done-when.
- DESIGN.md's download-figure sentence (ticket 09), beside `:32-36`.
- Q15 vocabulary into `CONTEXT.md`, once confirmed.
