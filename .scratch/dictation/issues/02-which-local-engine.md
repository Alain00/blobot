Type: research
Status: resolved

# Which local engine

## Question

One engine on macOS, Linux and Windows, multilingual (es + en, code-switching, English
identifiers inside Spanish sentences), run as a **child process over stdio**, with binaries and
weights blobot can fetch from pinned URLs. The two candidates named in charting are
**whisper.cpp** (Metal / CUDA / Vulkan; not designed for true streaming) and **sherpa-onnx**
(streaming Zipformer / Parakeet / Whisper models; prebuilt binaries for the three platforms).
Others are welcome if they meet the shape.

Answer, against primary sources and **measured on this machine** (M4 Pro, 24 GB, macOS 26; nothing
speech-related is installed yet, `ffmpeg` and `uv` are):

1. Distribution: per-platform prebuilt binaries or does blobot build? Exact download URLs and
   sizes, licence, and whether a CLI exists that speaks a usable stdio/JSON protocol or whether
   blobot would wrap a library.
2. Streaming: real partial results while speaking, or chunked batch? Measured latency of the first
   partial and of the final text on a ~10 s Spanish clip with code identifiers
   (`AgentRuntime`, `session/new`, `pnpm demo`).
3. Multilingual quality on that clip, per candidate model size, and whether the engine takes a
   **vocabulary / initial prompt** hint.
4. Real-time factor per model size, GPU on and CPU-only (the Linux-without-GPU case), and RAM.
5. The **model catalog** this implies: three sizes, each with its disk cost and its RAM floor —
   the raw material for tickets 08 and 09.
6. Any silent trap: telemetry, model auto-download to a home directory, a config file it writes.

Record findings in `.scratch/dictation/research/02-local-engine.md`, run not read, with the
harness described. Recommend one engine and say what it costs us.

## Answer

**whisper.cpp `b4938`**, as a one-shot child process over stdio — WAV on stdin (`-f -`), JSON on stdout
(`-oj -of -`), one process per utterance, **`--prompt`** carrying the roster's names and the
repository's identifiers. Measured on this machine (M4 Pro, Mónica reading the ticket's sentence, 9.8 s):
with the prompt, **`base` already gets `AgentRuntime`, `session/new`, `pnpm demo`, `waiting`, `idle`
exactly right**; without it only medium/turbo come close. Final text in 0.3 / 0.6 / 1.0 s on Metal and
0.45 / 1.5 / 2.3 s CPU-only for the three catalog sizes; end-to-end stdin→stdout on `base` 0.45 s
including load. No telemetry, no config file, no `$HOME` write (except the CoreML compile cache, which
we avoid by not shipping the CoreML encoders — measured gain nil and a 29 s first-run stall on turbo).

**Catalog** (ggml weights on `huggingface.co/ggerganov/whisper.cpp`, sha256 via the HF LFS API,
verified): `ggml-base.bin` 148 MB / 0.4 GB RAM floor → `ggml-small-q5_1.bin` 190 MB / 0.6 GB →
`ggml-large-v3-turbo-q5_0.bin` 574 MB / 1.0 GB.

**What it costs**: whisper.cpp publishes Linux (CPU) and Windows (CPU/BLAS/cuBLAS) CLIs but **no macOS
executable** — blobot builds that one in CI (cmake + Xcode clang, ~2 min, Metal embedded). Streaming is
re-decode-the-window: Whisper always encodes 30 s, so a partial costs a full run (0.2–0.3 s at `base`,
0.9 s turbo Metal, 2 s turbo CPU); partials are an optional `base` side-loop, not word-by-word.

**Why not sherpa-onnx**: better engine (prebuilt on all three OSes, Apache-2.0, true streaming) but the
only streaming es+en model is NVIDIA Nemotron 3.5 0.6 B — 1.9 GB resident with no smaller size, no
prompt, hotwords refused by its decoder (`Unsupported decoding method`), dropped "Hola," at the start of
every run, worse on the identifiers; its CLIs take wav paths, not stdio. Parakeet v3 (also shipped
inside whisper.cpp as `parakeet-cli`) is fast but writes "agent Room Team".

Full numbers, harness, URLs and traps: `.scratch/dictation/research/02-local-engine.md`.
