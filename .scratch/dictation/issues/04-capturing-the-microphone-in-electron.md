Type: research
Status: resolved

# Capturing the microphone in Electron

## Question

The renderer never reads a file, and main owns every process. Where does audio capture sit, and
what does the OS demand? Answer against Electron 44's documentation and the repo as it is:

1. `getUserMedia` in the renderer under this app's session/permission setup: what
   `setPermissionRequestHandler` (if any) exists in `apps/desktop/src/main/index.ts`, and what
   is needed for a mic prompt to appear on macOS and Linux.
2. macOS: `NSMicrophoneUsageDescription`, `systemPreferences.askForMediaAccess('microphone')`,
   and what the **unpackaged** dev app (electron-vite, run from `node_modules/electron`) does —
   is the app packaged at all today (electron-builder / forge config present or not)?
3. Linux: PipeWire / PulseAudio through Chromium, and any flags or portals needed.
4. Windows: what the same path needs there.
5. Transport: PCM from the renderer to main (`AudioWorklet` → IPC chunks? `MediaRecorder` →
   Opus?) and from main to a child process over stdin, at 16 kHz mono, which is what every engine
   in ticket 02 wants. Size and cadence of chunks; backpressure; what `child.stdin.write` with
   the return value ignored (the `bounds.ts:70-78` fact) means for a continuous stream.
6. An input **level** signal for a listening indicator (ticket 07): `AnalyserNode` in the
   renderer, cost, cadence.

Record findings in `.scratch/dictation/research/04-microphone-capture.md`, with file:line
references into the repo where relevant.

## Answer

Findings: `.scratch/dictation/research/04-microphone-capture.md` (measured against the pinned
Electron 44.0.0 / Chromium 152, unpackaged, on macOS; Linux and Windows from documentation and
Chromium source).

- **The renderer can already capture.** `index.ts:833-843` installs no permission handler, and
  Electron's default with none is to *grant* (`tutorial/security.md`); a `getUserMedia({audio})`
  from the `file://` renderer returned a track in 278 ms with nothing decided by blobot. The build
  installs `setPermissionRequestHandler` **and** `setPermissionCheckHandler` (the docs say one is
  incomplete) as an allowlist: permission string `media`, `mediaTypes`/`mediaType` = `audio`, own
  origin only, everything else denied. That is a standalone change worth making first.
- **macOS.** The unpackaged `Electron.app` already carries `NSMicrophoneUsageDescription` ("This
  app needs access to the microphone") under bundle id `com.github.Electron`, ad-hoc signed, no
  hardened runtime — and TCC on this machine is already `granted` for that id, so **dev never
  shows the prompt** and cannot measure it. A packaged app needs blobot's own string via
  `extendInfo` and `com.apple.security.device.audio-input` in an entitlements file (electron-builder's
  default has only the three JIT/library entries, `hardenedRuntime` defaults true) — a packaging
  ticket, unverifiable until one exists. `askForMediaAccess('microphone')` is for sequencing the
  prompt (ask from Settings, not mid-sentence) and reading `denied`; `getMediaAccessStatus` is the
  four-state readiness probe (macOS + Windows).
- **Linux.** Chromium dlopens `libpulse.so.0` and falls back to ALSA; PipeWire is reached through
  `pipewire-pulse` (Ubuntu's default). No flags, no portal, and no per-app OS consent — the Electron
  handler is the only gate, so ticket 07's indicator carries more weight there.
- **Windows.** WASAPI; the one gate is *Let desktop apps access your microphone* (global for all
  win32 apps, per Microsoft), which `getMediaAccessStatus` reads; off means `NotAllowedError` with
  no prompt, remedied by a sentence pointing at Settings.
- **Transport.** `AudioContext({sampleRate:16000})` makes Chromium resample the 48 kHz track
  (measured: 128 frames per `process()`, 125 calls/s, exactly 16,000 frames/s), so no resampler is
  written or shipped. AudioWorklet → `Int16` chunks of ~100 ms (1,600 frames, 3,200 B) → IPC (`send`
  or a `MessagePort`) → main → child stdin, 32 KB/s. MediaRecorder is refused for the stream (its
  timeslice blobs "need not be playable" individually; an engine wants raw frames), kept in mind
  only for ticket 03's per-utterance Opus. **The `bounds.ts:70-78` fact becomes a requirement:**
  `child.stdin` is a 64 KiB-highWaterMark socket, a stalled engine fills it in two seconds and then
  Node buffers unboundedly; the dictation writer must not reuse `childTransport.write`, must honour
  `false`/`'drain'`, drop rather than queue while stalled, and surface the stall (ticket 11 puts it
  in the interface; ticket 07 shows it).
- **Level.** `AnalyserNode` on the same source, output unconnected, `fftSize` 256,
  `getFloatTimeDomainData` → RMS in `requestAnimationFrame` while listening; measured RMS
  0.04–0.07 at speaking level. Free until read, never crosses IPC; the worklet's per-chunk peak is
  a second source that arrives with the audio.
