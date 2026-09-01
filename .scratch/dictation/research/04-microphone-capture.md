# Capturing the microphone in Electron 44 — findings

Ticket: `.scratch/dictation/issues/04-capturing-the-microphone-in-electron.md`.
Measured 2026-09-01 on macOS (Apple Silicon) against the Electron the repo actually pins —
`apps/desktop/node_modules/electron/dist/version` → **44.0.0**, Chromium **152.0.7977.54**, Node
**24.18.1** (`Electron --version` and `process.versions`; the Electron 44 release post agrees:
<https://www.electronjs.org/blog/electron-44-0>). Linux and Windows are answered from documentation
and Chromium source only; the map's *not yet specified* list already says they are to be measured
by hand later.

## The repo as it is

- **No permission handler exists.** `grep setPermissionRequestHandler|setPermissionCheckHandler`
  over `apps/desktop/src` finds nothing. The one window is
  `apps/desktop/src/main/index.ts:833-843`: `new BrowserWindow({ ..., webPreferences: { preload,
  sandbox: false } })`, on `session.defaultSession`, nothing else configured.
- **The renderer is a secure context.** In production it is `window.loadFile(.../renderer/index.html)`
  (`index.ts:871-873`), so the origin is `file:///`; in dev it is `ELECTRON_RENDERER_URL`, which
  electron-vite serves on `http://localhost` (`index.ts:869-870`). Both are secure contexts, so
  `navigator.mediaDevices` exists. This matters: the first probe loaded a `data:` URL and
  `navigator.mediaDevices` was `undefined` there (`TypeError: Cannot read properties of undefined
  (reading 'getUserMedia')`). A dictation feature cannot be prototyped in a `data:` page.
- **The renderer never touches Node** (`apps/desktop/src/preload/index.ts:46-50`: "The only door
  between the renderer and the main process"); everything crosses `contextBridge` as
  `ipcRenderer.invoke` calls. A capture path has to follow the same door.
- **The app is not packaged.** No electron-builder, Forge or `@electron/packager` config anywhere
  outside `node_modules` (`apps/desktop/package.json:6-14` has only `electron-vite build|dev|preview`;
  `apps/desktop/` holds no `build/`, no `*.plist`, no entitlements). `pnpm dev` and the
  `--screenshot`/`--live-*` flows all run **`node_modules/electron/dist/Electron.app`** directly.
- **The house process pattern** is `packages/core/src/adapters/acp/child-transport.ts:49-52`:
  `write(line) { if (child.stdin.destroyed) return; child.stdin.write(line); }` — return value
  ignored, no `'drain'` — which is what `bounds.ts:70-78` describes. The PTY variant
  (`apps/desktop/src/main/runtime-step.ts:65,93`) is a terminal, not a byte pipe, and is the wrong
  shape for PCM.

## 1. `getUserMedia` under this app's session setup

**Electron's default, with no handler installed, is to grant.** From the security tutorial
(`docs/tutorial/security.md`, 44-x-y): *"By default, Electron will automatically approve all
permission requests unless the developer has manually configured a custom handler."*
<https://www.electronjs.org/docs/latest/tutorial/security#5-handle-session-permission-requests-from-remote-content>

Measured: the probe (`scratchpad/micprobe`, a `file://` page in the unpackaged Electron 44, with
`sandbox: true`) called `getUserMedia({audio:{channelCount:1, sampleRate:16000, ...}})` and got a
track in **278 ms** with **no handler at all** — *"gUM OK … label=Default - MacBook Pro Microphone
(Built-in)"*. So today, in this repo, a `getUserMedia({audio:true})` from the renderer already works
on this machine, and nothing in `index.ts` decides it.

**What the handlers see, if blobot installs them.** Run B of the probe, with both handlers
installed and logging:

```
permission CHECK   media  {embeddingOrigin:"file:///", isMainFrame:true, mediaType:"video"}   ← on load, before any call
permission CHECK   media  {embeddingOrigin:"file:///", isMainFrame:true, mediaType:"audio"}
permission REQUEST media  {isMainFrame:true, mediaTypes:["audio"], requestingUrl:"file:///…/index.html", securityOrigin:"file:///"}
permission CHECK   media  {mediaType:"audio", requestingUrl:"file:///…/index.html", securityOrigin:"file:///"}
permission CHECK   speaker-selection …
```

The permission string is **`media`**, with `details.mediaTypes` (an array) on the request and
`details.mediaType` (a string) on the check — documented at
<https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler>:
*"`media` - Request access to media devices such as camera, microphone and speakers"*; and on the
check handler, *"`mediaType` string (optional) - The type of media access being requested, can be
`video`, `audio` or `unknown`"*. The docs are explicit that one is not enough: *"you must also
implement `setPermissionCheckHandler` to get complete permission handling. Most web APIs do a
permission check and then make a permission request if the check is denied."*

**Recommendation for the build.** Install both handlers on `session.defaultSession` once, in
`createWindow`, and make them an **allowlist**: `media` with `audio` only, from the app's own origin
(`file:///` in production, the dev-server origin in dev), granted; everything else — including
`media` with `video`, `geolocation`, `notifications`, `display-capture`, all of which Chromium
asks about (see the CHECK lines above) — denied. That is the repo's own posture (a menu that fails
closed, ADR-0003) applied to the one place where Electron's default is the opposite, and it is a
change that stands on its own regardless of dictation. It is also the only way to express *the mic
is off unless dictation is configured*: the handler can consult the same state the composer's
button is gated on.

The Electron handler is not the OS prompt. It sits in front of Chromium; the OS's consent (macOS
TCC, Windows' desktop-app toggle) is asked by Chromium/AVFoundation on the far side and is a
separate gate, below.

## 2. macOS: `NSMicrophoneUsageDescription`, `askForMediaAccess`, the unpackaged app

**Apple's rule.** *"In iOS and macOS 10.14 and later, the user must explicitly grant permission for
each app to access the camera and microphone. Before your app can use a capture device for the
first time, the system presents an alert with an app-specific message that you specify"* … *"The
system remembers the user's response to each access alert, so subsequent uses of the corresponding
capture device don't cause the alert to appear again."*
<https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media>
The key is mandatory: *"This key is required if your app uses APIs that access the device's
microphone."* <https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription>
And on macOS the same article adds an entitlement: *"In macOS, you also need to enable the
following entitlements in Signing & Capabilities … If your app uses device microphones, enable the
Audio Input entitlement"* — `com.apple.security.device.audio-input`, *"A Boolean value that
indicates whether the app may record audio using the built-in microphone and access audio input
using Core Audio."* It is one of the Hardened Runtime's *resource access* entitlements
(<https://developer.apple.com/documentation/security/hardened-runtime>), so it is needed once the
app is signed with the hardened runtime, which notarization requires.

**The unpackaged dev app already carries the key.** `node_modules/electron/dist/Electron.app/
Contents/Info.plist` lines 69-70:

```
<key>NSMicrophoneUsageDescription</key>
<string>This app needs access to the microphone</string>
```

(alongside `NSAudioCaptureUsageDescription`, `NSCameraUsageDescription`, Bluetooth). Its identity
is `CFBundleIdentifier` **`com.github.Electron`**, ad-hoc signed (`codesign -dv`:
`Signature=adhoc`, `flags=0x20002(adhoc,linker-signed)`, `TeamIdentifier=not set`), **no hardened
runtime**, so no entitlement is needed in dev. Consequences, measured:

- `systemPreferences.getMediaAccessStatus('microphone')` returned **`granted`** before the probe
  ran. TCC keys consent on the bundle identifier, and `com.github.Electron` is every unpackaged
  Electron project on this machine — some earlier one was granted, and blobot inherits it. So on
  the author's machine **no prompt will appear in dev**, and a fresh machine gets the prompt with
  Apple's alert titled "Electron" and the generic string above. Neither is what a user of a
  packaged blobot sees; the dev experience does not measure the prompt.
- The prompt, when it fires, is raised by Chromium's AVFoundation capture on the first
  `getUserMedia`; nothing has to call `askForMediaAccess` for it to appear.

**`systemPreferences.askForMediaAccess('microphone')`** (macOS only) *"resolves with `true` if
consent was granted and `false` if it was denied … If an access request was denied and later is
changed through the System Preferences pane, a restart of the app will be required for the new
permissions to take effect. If access has already been requested and denied, it must be changed
through the preference pane; an alert will not pop up and the promise will resolve with the
existing access status."* <https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos>
Its value for blobot is **sequencing**: calling it from main before the renderer's
`getUserMedia` lets the app ask at a moment of its choosing (the Settings toggle, not the first
press of the button mid-sentence) and lets it read `denied` and say so in blobot's words instead
of surfacing Chromium's `NotAllowedError`. `getMediaAccessStatus` is the four-state readiness
probe here — `not-determined | granted | denied | restricted` — and ticket 08's readiness scan
should read it rather than trying a capture.

**A packaged blobot** needs, wherever packaging is eventually configured: the usage string with
blobot's own words (electron-builder `mac.extendInfo`, *"The extra entries for `Info.plist`"*,
`app-builder-lib/src/options/macOptions.ts:174-177`; `@electron/packager` `extendInfo`, *"Entries
from `extendInfo` override entries in the base `Info.plist` file supplied by `electron`"*,
`packager/src/types.ts:457-465`), and an entitlements file adding
`com.apple.security.device.audio-input`, because electron-builder's default
`entitlements.mac.plist` holds only `allow-jit`, `allow-unsigned-executable-memory` and
`disable-library-validation` (<https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/entitlements.mac.plist>)
and `hardenedRuntime` *"Defaults to `true` for `darwin` builds"* (`macOptions.ts:72-78`). Without
the entitlement under the hardened runtime the capture fails silently at the OS. That is a
packaging ticket, not this one; the fact recorded here is that **nothing about it can be verified
until the app is packaged and signed, and the dev app will never show the failure.**

## 3. Linux: PipeWire / PulseAudio through Chromium

Chromium picks its Linux audio backend at startup, in
`media/audio/linux/audio_manager_linux.cc` (tag 152.0.7977.54): try PulseAudio, else ALSA, else a
fake manager:

```cpp
#if defined(USE_PULSEAUDIO)
  if (pulse::InitPulse(&pa_mainloop, &pa_context)) {
    return std::make_unique<AudioManagerPulse>(...);
  }
  LOG(WARNING) << "Falling back to ALSA for audio output. PulseAudio is not available or could not be initialized.";
#endif
#if defined(USE_ALSA)
  return std::make_unique<AudioManagerAlsa>(...);
```

<https://chromium.googlesource.com/chromium/src/+/refs/tags/152.0.7977.54/media/audio/linux/audio_manager_linux.cc>
`libpulse` is loaded at runtime (`pulse_util.cc`: `DLOPEN_PULSEAUDIO`, `libpulse.so.0`,
`pa_context_connect(..., PA_CONTEXT_NOAUTOSPAWN, ...)`), so a machine without libpulse falls to
ALSA and no build flag is involved.

**PipeWire is reached through its PulseAudio server**, not natively: *"pipewire-pulse starts a
PulseAudio-compatible daemon that integrates with the PipeWire media server … This daemon is a
drop-in replacement for the PulseAudio daemon."*
<https://docs.pipewire.org/page_man_pipewire-pulse_1.html> Ubuntu (Alain's machine) has shipped
pipewire-pulse as the default since 22.10; Chromium neither knows nor cares. **No flags, no
portal**: the XDG desktop portal has no microphone portal and Chromium's `getUserMedia` does not
go through one; the only Linux-specific switches are `--alsa-input-device` / `--alsa-output-device`
(`media/base/media_switches.cc:299-302`), relevant only on the ALSA fallback. There is no per-app
consent on Linux — the Electron handler in §1 is the only gate — so a mic indicator on screen
(ticket 07) carries more weight there than on macOS, where the OS draws its own orange dot.

Two things to expect when it is measured: a sandboxed distribution (snap, flatpak) needs the
`pulseaudio`/`audio` socket granted at the package level, which is again packaging; and
`PULSE_LATENCY_MSEC` is the one client-side knob if the input latency turns out long.

## 4. Windows

Chromium captures via WASAPI; there is no Electron-side difference. The one OS gate is Windows'
privacy setting: *"Starting with Windows 10 version 1903, an additional setting is available on
camera and microphone settings pages that provides limited control over desktop apps … This
setting is called Let desktop apps access your camera or Let desktop apps access your microphone
in Windows 11 … Desktop apps cannot be individually toggled, but access for those apps can be
controlled using Let desktop apps access your microphone."*
<https://support.microsoft.com/en-us/windows/windows-camera-microphone-and-privacy-a83257bc-e990-d54a-d212-b5e41beba857>
Electron's `getMediaAccessStatus` reads exactly that: *"Windows 10 has a global setting controlling
`microphone` and `camera` access for all win32 applications."* So the same readiness probe as
macOS works on Windows (`askForMediaAccess` does not — macOS only), and when the toggle is off
`getUserMedia` rejects with `NotAllowedError` and no prompt; the remedy is a sentence pointing at
Settings › Privacy & security › Microphone, in the pattern of `detect/remedies.ts`. No manifest
capability is needed for an unpackaged win32 exe.

## 5. Transport: renderer → main → child stdin at 16 kHz mono

**The numbers.** 16 kHz × 1 channel × 16-bit = **32,000 bytes/s** (64,000 as `Float32`). This is
tiny; the whole design question is cadence and honesty, not throughput.

**Resampling is free and correct in the renderer.** Chromium hands the track out at the device
rate — the probe's `getSettings()` says `sampleRate: 48000, channelCount: 1` even though the
constraint asked for 16000 — but an `AudioContext({sampleRate: 16000})` constructs and runs
(`AudioContext sampleRate=16000 state=running baseLatency=0.008`), and the spec requires the
source node to follow it: *"If the sample rate of the MediaStreamTrack differs from the sample rate
of the associated AudioContext, then the output of the MediaStreamTrack is resampled to match the
context's sample rate."* <https://webaudio.github.io/web-audio-api/#MediaStreamAudioSourceNode>
Measured in the worklet: `sampleRate` **16000**, **128 frames per `process()` call, 125 calls/s,
16,000 frames/s** — the spec's render quantum (*"set the [[render quantum size]] private slot to
128"*, <https://webaudio.github.io/web-audio-api/#dom-audiocontext-audiocontext>) at exactly the
engine's rate, so no resampler is written in main and no third-party one is shipped. One
observation: the source node reported **2 channels** for a 1-channel track (Chromium up-mixes to
the node's default); take `inputs[0][0]` and ignore the rest, or set `channelCount: 1,
channelCountMode: 'explicit'` on the worklet node.

**AudioWorklet + IPC, not MediaRecorder.** Both work in this Electron (`MediaRecorder.isTypeSupported`:
`audio/webm;codecs=opus` true, `audio/webm;codecs=pcm` true, `audio/ogg;codecs=opus` false,
`audio/mp4` true), but MediaRecorder is the wrong shape for a stdin stream: its `timeslice` blobs are
container fragments, and the spec only promises the whole: *"When multiple Blobs are returned
(because of timeslice or requestData()), the individual Blobs need not be playable, but the
combination of all the Blobs from a completed recording MUST be playable."*
<https://w3c.github.io/mediacapture-record/#dom-mediarecorder-start> An engine reading stdin
wants raw frames, not WebM clusters to demux, and the ~3 MB/min of PCM that Opus would save is
not a cost on a local pipe. MediaRecorder only becomes interesting for ticket 03's remote lane
(one Opus file per utterance is what an HTTP transcription API wants), and even there it can be
encoded from the same PCM after the fact. Decide on one capture graph — worklet — and derive
both from it.

**Chunking.** The worklet's `process()` runs on the rendering thread and must return quickly;
posting 125 messages a second across two process boundaries (worklet → window via `port`,
renderer → main via IPC) is unnecessary. Accumulate in the worklet and `port.postMessage` one
`Int16Array` every **~100 ms (1,600 frames, 3,200 bytes)** — long enough that IPC overhead is
noise, short enough that ticket 06's streaming engine sees words as they are said and a stop
loses at most a tenth of a second. Convert to `Int16` in the worklet (clamp, ×32767): halves the
bytes and is the format every candidate in ticket 02 reads (`s16le`). Transfer the buffer
(`postMessage(buf, [buf.buffer])`) rather than copying it.

**Renderer → main.** `ipcRenderer.send`/`invoke` arguments *"will be serialized with the
Structured Clone Algorithm"* (<https://www.electronjs.org/docs/latest/api/ipc-renderer>), which
carries a `Uint8Array` fine; at 10 messages/s × 3.2 KB it is nothing. The alternative Electron
documents for streams is a `MessageChannel` handed to main once (*"Electron's built-in IPC methods
only support two modes: fire-and-forget (e.g. `send`), or request-response (e.g. `invoke`). Using
MessageChannels, you can implement a 'response stream'"*,
<https://www.electronjs.org/docs/latest/tutorial/message-ports>). A port is cleaner — one
`dictation:start` invoke that returns nothing and a `MessagePortMain` in main for the bytes — but
`send` on a named channel through the existing `preload/index.ts` door is the house pattern and
is adequate at this rate. Either way the renderer ships samples and **never** a device path or a
file, which is ADR-0004's rule kept.

**Main → child stdin, and the `bounds.ts` fact.** `child.stdin` is a `net.Socket` over a pipe with
`writableHighWaterMark` **65,536** (measured with `spawn('cat')` on Node 24). Node's contract:
*"The return value is `true` if the internal buffer is less than the `highWaterMark` … If `false`
is returned, further attempts to write data to the stream should stop until the `'drain'` event
is emitted."* and *"While calling `write()` on a stream that is not draining is allowed, Node.js
will buffer all written chunks until maximum memory usage occurs, at which point it will abort
unconditionally."* <https://nodejs.org/docs/latest-v22.x/api/stream.html#writablewritechunk-encoding-callback>
`child-transport.ts:51` ignores the return value, and for one JSON-RPC line per turn that is
harmless: the line is bounded (`bounds.ts:70-78` sizes an image attachment against exactly this)
and the process is reading. **A continuous PCM stream is the case that contract was written
for.** If the engine stalls — model loading, a slow decode, a GPU hiccup — 32 KB/s fills a 64 KB
window in **two seconds** and then grows in main's heap for as long as the user keeps talking,
with no signal to anyone. So the dictation writer must not reuse `childTransport.write`; it needs
its own small writer that (a) honours `false` and waits for `'drain'`, (b) **drops or bounds**
audio while stalled rather than queuing it — a transcriber that has fallen two seconds behind a
speaker is not going to catch up, and the transcript should say `listening paused` (ticket 07's
indicator has a state for this) rather than deliver a burst a minute later — and (c) surfaces the
stall as an event so the UI can show it. This is the one place the `bounds.ts` fact turns from a
comment into a requirement; ticket 11 should put backpressure in the `Transcriber` interface as a
first-class signal rather than leaving it to the adapter.

## 6. An input level signal (`AnalyserNode`)

`AnalyserNode` on the same `MediaStreamAudioSourceNode`, output unconnected, costs nothing until
read: the node *"effectively MUST keep around the last 32768 sample-frames"* and the analysis is
computed when a `get*` method is called. `fftSize` *"MUST be a power of two in the range 32 to
32768 … The default value is 2048. Note that large FFT sizes can be costly to compute."*
<https://webaudio.github.io/web-audio-api/#AnalyserNode> For a level, use the **time domain**
(`getFloatTimeDomainData` into a `Float32Array(fftSize)`, RMS or peak) with a small `fftSize`
(256 at 16 kHz = 16 ms of audio) — no FFT is run for the time-domain path, so `smoothingTimeConstant`
(default 0.8, frequency-domain only) does not apply and any smoothing is the caller's. Measured:
`fftSize=256`, `getFloatTimeDomainData` → RMS 0.04–0.07 at speaking level, with worklet peaks
0.05–0.95 across three seconds of speech. **Cadence:** read it inside `requestAnimationFrame`
while listening (60 Hz, one 256-float copy, negligible), and stop the loop when the mic is off.
The level never crosses IPC — it is a renderer concern for a renderer indicator — and the worklet
can also compute peak per chunk for free (the probe did), which is a second source if ticket 07
wants a value that arrives with the audio rather than sampled from it. DESIGN.md's motion
ceiling (`:632`, under 300 ms) is ticket 07's problem; the signal itself is cheap at any cadence.

## Facts that bear on other tickets

- **07:** on macOS the OS draws its own recording indicator; on Linux nothing does, so blobot's is
  the only one. `askForMediaAccess` returning `false` and `getMediaAccessStatus === 'denied'` are
  the two states the indicator/button must be able to say (the OS said no; go to System Settings;
  restart the app).
- **08 (readiness):** `getMediaAccessStatus('microphone')` is a zero-cost four-state probe on macOS
  and Windows, `unknown`/absent on Linux; a `getUserMedia` dry run is the Linux probe and costs a
  device open.
- **11 (interface):** the `Transcriber` should take `Int16` 16 kHz mono chunks and expose
  backpressure (`paused`/`resumed`) as events; the renderer's capture graph is one `AudioContext`
  per session, closed on stop (audio discarded, per the map).
- **12 (build):** installing `setPermissionRequestHandler`/`setPermissionCheckHandler` as an
  allowlist on `session.defaultSession` is a standalone change to `index.ts:createWindow`, worth
  making before any dictation code lands; the packaging items (Info.plist string, audio-input
  entitlement) go on whichever ticket first packages the app, and are unverifiable until then.

## Probe

`scratchpad/micprobe/{main.cjs,index.html}` (not in the repo): a hidden `BrowserWindow` with
`sandbox: true` loading a `file://` page that calls `getUserMedia`, builds an
`AudioContext({sampleRate:16000})` with a counting `AudioWorkletProcessor` and an `AnalyserNode`,
and reports for three seconds; run twice, without and with logging permission handlers, under
`apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`. No app source was
modified.
