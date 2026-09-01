Type: grilling
Status: resolved
Blocked by: 02 (resolved)

# Readiness for a local Transcriber

## Question

The scan, in two stages, settled in charting: a **static** read recommends a model size or says
the machine does not reach one; a **measured** run after download (a bundled clip, the real-time
factor) confirms or steps down. Never *supported*; four words of blobot's own, the way ticket 11
has four.

Decide: what the static stage reads on each OS (RAM, architecture, Metal / CUDA / Vulkan
presence, free disk) and how — `os` module, `system_profiler`, `nvidia-smi`, `/proc`; the floors
per model size from ticket 02's measurements; the four words and what each unlocks in the picker
(an unfit machine sees only remote); the clip that ships for the measured stage (length,
language, licence — record it or generate it) and the RTF threshold that counts as *stable*;
what the screen says when the measured stage disagrees with the static one; and whether the
scan is re-run on its own (never — nothing here runs on a timer) or only on the user's *check
again*, like detection.

## From ticket 02 (resolved 2026-09-01)

Floors from measurement: `base` 0.4 GB RAM, `small-q5_1` 0.6 GB, `large-v3-turbo-q5_0` 1.0 GB;
final-text times on a 9.8 s clip 0.3 / 0.6 / 1.0 s (Metal) and 0.45 / 1.5 / 2.3 s (CPU-only).
Even a CPU-only machine reaches turbo at ~0.25 RTF, so the static stage's job is mostly disk and
RAM, and the measured stage decides *responsive* rather than *possible*. The 9.8 s `say -v Mónica`
clip with the three identifiers is a candidate for the shipped clip (licence of a synthesized
voice to check).

## Answer (2026-09-01)

**The static stage reads three things, all from Node, no subprocess**: total RAM (`os.totalmem`),
architecture (`os.arch` + `process.platform`), free disk under `~/.local/share/blobot/`
(`fs.statfs`). No GPU probe: the shipped binaries are Metal on Apple Silicon and CPU elsewhere,
and even CPU reaches turbo at ~0.25 RTF, so speed is the measured stage's answer.

**Floors and the recommendation**: total RAM ≥ 8 GB → `large-v3-turbo-q5_0`; ≥ 4 GB →
`small-q5_1`; ≥ 2 GB → `base`; below → `unfit`. Free disk ≥ 2× the recommended size's download.
Always recommend the largest that fits, because quality is what is being bought.

**Four words**, monochrome, blobot's own, like detection's four: **`unfit`** (static fails; the
picker offers remote only, with the figure that failed, `unfit · 3.2 GB RAM`), **`untested`**
(static passes, nothing measured; sizes offered, recommended one marked), **`fit`** (measured,
responsive), **`slow`** (measured, over the threshold; still eligible, the line offers stepping
down a size). `slow` earns its word because it is the only one that changes what the screen
offers.

**No shipped clip. The measured stage is a *say something* step in Settings** after a download:
real microphone, real voice, real RTF, and the transcription **is shown**, so the user sees the
quality and not only the speed — and it exercises the microphone and its permission (ticket 04)
at the one moment a person is watching. Nothing said within 15 s leaves it `untested`, returnable.
The `say -v Mónica` clip stays a test fixture for the live suite, never a shipped asset, on its
licence. The author tests the audio and visual quality by hand; the agent measures the numbers.

**Threshold: `fit` if RTF ≤ 0.3** (a 10 s segment answers within 3 s; turbo here measures ~0.1),
`slow` above — provisional, in `bounds.ts`. **The measurement wins**: the word is the measured
one, the line reads `measured · 0.4× real time · slow` and offers *try small*; the static
recommendation is not named again.

**Re-run: never on its own.** The static stage on *check again* and after every model download;
the measured word is per model, so a size change returns to `untested` until the next *say
something*; a binary version change (a blobot update) does the same.

For ticket 10: the section draws the word, the figure and the remedy in detection's own shape.
For ticket 12's done-when: the three floors, the threshold and the 15 s wait are the provisional
numbers, and the *say something* step must show the transcription it produced.
