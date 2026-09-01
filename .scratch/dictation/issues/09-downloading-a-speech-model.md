Type: grilling
Status: resolved
Blocked by: 02 (resolved)

# Downloading a speech model

## Question

Binaries and weights fetched from URLs **pinned in core** with checksums, into
`~/.local/share/blobot/speech/` beside worktrees and handoffs, never userData and never a
workspace. Settled. Decide the rest:

- The **figure instead of a bar**: DESIGN.md forbids a bar that claims progress toward an end and
  has no primitive for one. A mono figure — `downloading · 412 MB of 1.5 GB` — is a number, not a
  shape; write the sentence for DESIGN.md that admits it and says why this one place knows the
  end when a turn does not.
- Who fetches: main with Node's `fetch` / a stream to disk, resumable or not, verified against
  the checksum before it is ever run, and what a checksum failure says.
- Cancel, retry, and a download that outlives the app's window closing.
- Three catalog entries (ticket 02) with disk cost beside each, and **deleting** one: the
  `recovers about 1.5 GB` sentence, and what the picker shows once its model is gone.
- The engine binary itself: fetched the same way, or does ticket 02's answer make it an npm
  dependency with prebuilds, and what that does to `pnpm-workspace.yaml`'s `allowBuilds` list.
- Whether the PTY (`runtime-step.ts`) is involved at all. Charting says no: nothing here is a
  vendor's installer drawing its own bar, and one live PTY globally would let a download kill a
  sign-in.

## From ticket 02 (resolved 2026-09-01)

Weights: three `ggml-*.bin` files from HF `ggerganov/whisper.cpp` with sha256 from the LFS API
(148 / 190 / 574 MB). **The binary is the open question**: whisper.cpp publishes Linux and Windows
CPU CLIs but **no macOS executable**, so blobot must build `whisper-cli` with Metal in CI and host
it (a blobot GitHub release? bundled in the app?) — decide where a pinned URL to our own build
lives, and whether Linux GPU is offered at all (it is not in the prebuilt path). Metal's shader
cache costs ~9 s on first launch and CoreML is not shipped.

## Answer (2026-09-01)

**blobot builds the engine for all three OSes in its own CI** — a workflow in `Alain00/blobot`
(the repo's first), `cmake` from the pinned `b4938` tag, Metal on macOS arm64, CPU on Linux
x64/arm64 and Windows x64 — published as a **GitHub release with blobot's own tag**
(`whisper-b4938-1`); core pins one URL and one sha256 per OS/arch. Upstream's Linux and Windows
assets are not used at runtime even though they exist: one provenance, one URL pattern, one
checksum flow. **Linux GPU is not offered**; the CPU binary reaches turbo. Bundling was refused
(7–20 MB per OS in a package most users will never dictate from, and the app is not packaged).

**Main downloads**, Node `fetch` streamed to `<file>.part` under `~/.local/share/blobot/speech/`,
sha256 computed as it writes, resumable with `Range` from the `.part`, renamed only when the
hash matches; nothing is run or loaded unverified. A hash failure deletes the `.part` and the
line says `checksum did not match · deleted · try again`. **No PTY**.

**The DESIGN.md sentence** (goes beside `:32-36`): *A download is the one thing on screen that
knows its end: the size is in the response before the first byte, so `downloading · 412 MB of
574 MB` states a fact where a bar toward a finish would claim one. It is a figure in the mono
voice beside the word, and still not a bar.* The in-flight hairline applies as it does to any
in-flight word.

**Cancel deletes the `.part`; retry resumes from it.** The download lives in main, so it
survives the window closing while the app is alive; **quitting cuts it**, and on return the
section says `paused · 412 MB of 574 MB` with *resume* — never resumed on its own. An orphan
`.part` counts in *recovers about*.

**Removing a model**: each catalog entry carries its size, and a downloaded one carries *remove*
with `recovers about 574 MB`. Removing the chosen one leaves dictation **without a Transcriber**:
the section says `no speech model · choose one` and the mic button leaves the composer until one
is chosen — never a silent fall-through to another size. The binary is not removed here; it goes
with *disable dictation* (ticket 10).

**The binary is fetched like a weight, not an npm dependency**: `speech/bin/<tag>/whisper-cli`,
`chmod 755`, same hash flow; `allowBuilds` unchanged, no native module. Facts for the done-when:
a binary written by `fs` carries no quarantine xattr (only LaunchServices downloads set it), so
Gatekeeper does not block it; arm64 requires a signature and Apple's linker ad-hoc signs in CI;
and Metal's ~9 s first-run shader cache falls **inside ticket 08's *say something* step**, which
is the first run after a download, so that step says `warming up` before it listens.
