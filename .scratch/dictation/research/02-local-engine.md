# 02 — Which local engine (measured 2026-09-01)

Ticket: `.scratch/dictation/issues/02-which-local-engine.md`. Everything below was **run, not read**, on
this machine unless a line says *source:*. Primary sources are linked per claim.

**Machine.** Apple M4 Pro (12 cores), 24 GB, macOS 26.6.2 (25G83). Apple clang 21, no cmake (used
`uvx --from cmake`), ffmpeg 8.0.1, uv 0.11.17, Python 3.14 (harness venv on 3.12), Node 24. Nothing
speech-related was installed before this session; everything went into the session scratchpad, nothing
into `$HOME` by us (what the engines themselves wrote there is in §7).

## 0. Recommendation, in one paragraph

**whisper.cpp**, release `b4938`, run as a **one-shot child process over stdio** — WAV bytes on stdin
(`-f -`), JSON on stdout (`-oj -of -`), one process per utterance — with a **vocabulary hint on
`--prompt`** built from the roster and the repository, and a three-model catalog of **`base` →
`small-q5_1` → `large-v3-turbo-q5_0`** (148 MB / 190 MB / 574 MB on disk; 0.4 / 0.6 / 1.0 GB RAM
floors; 0.3 s / 0.6 s / 1.0 s to final text for a 10 s clip on Metal, 0.4 / 1.4 / 2.3 s CPU-only). It is
the only candidate that satisfies all four hard constraints at once: es + en **inside one sentence** with
identifiers, the same weights on every OS, a **prompt hint** (the one lever that fixed
`AgentRuntime` / `session/new` / `pnpm demo` on this clip — at `base`), and a real stdin → stdout
contract with no server and no wrapper. What it costs us: **blobot builds the macOS binary itself** (the
project publishes Linux and Windows CLIs but only a Swift XCFramework for macOS), and **true streaming
partials are not free** — Whisper encodes a fixed 30 s window, so every partial costs a whole encode
(40 ms on `base`, ~0.5 s on turbo, Metal). sherpa-onnx is the better *engine* (prebuilt on all three
OSes, Apache-2.0, true streaming) but the only streaming model that speaks Spanish *and* English is
NVIDIA's 0.6 B Nemotron 3.5 at **1.9 GB resident with no smaller size**, no prompt, hotwords refused by
its decoder, and it dropped the first word of the clip; and every sherpa CLI is wav-path-in, so a
process would talk to it over a websocket server or a wrapped C API, not stdio. Details and the numbers
follow.

## 1. Candidates and the shape

The shape (map Notes): one engine designed for macOS/Linux/Windows; multilingual es+en with
code-switching; **child process with a stdio protocol**; binaries and weights fetched from **pinned,
checksummable URLs**.

| Candidate | Prebuilt CLI mac / linux / win | es+en in one model | Streaming | Prompt / hotwords | stdio | Verdict |
|---|---|---|---|---|---|---|
| **whisper.cpp** `b4938` (MIT) | **no** / yes (CPU) / yes (CPU, BLAS, CUDA) | yes (Whisper) | re-decode window; measured below | `--prompt` (yes) | **yes**: `-f -` in, `-of -` out | **recommended** |
| **sherpa-onnx** `v1.13.6` (Apache-2.0) | yes / yes (+CUDA) / yes (+CUDA) | only Nemotron 3.5 (0.6 B, streaming) or Parakeet v3 / Canary / FastConformer (offline) | true streaming (Nemotron, Zipformer) | hotwords only on transducers with `modified_beam_search`; **refused by the NeMo streaming impl** (measured); Whisper recipe has no prompt | no: wav paths or websocket server | runner-up |
| parakeet-cli (ships *inside* whisper.cpp b4938) | same as whisper.cpp | yes (25 EU langs, CC-BY-4.0 weights) | offline | none | file only | measured; worse on identifiers |
| Moonshine | pip only | es-only models | streaming (Python) | — | no | fails distribution |
| Vosk | stale libs (2022–23), no CLI | es-only | streaming | grammar list | no | fails |
| WhisperKit | mac only | yes | — | — | — | fails *one engine* |
| faster-whisper / onnx-asr | Python | yes | no | prompt | no | fails distribution |
| Kyutai STT | GPU, en/fr | no | yes | — | — | fails |
| Voxtral Mini Realtime | 16 GB GPU officially | yes | yes | — | — | fails |

Sources for the non-measured rows are in the docs sweep the session kept at the scratchpad
(`docs-findings.md`, primary URLs per claim); the load-bearing ones are repeated inline below.

## 2. Distribution

### whisper.cpp

- Release **`b4938`**, 2026-08-20 (`https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest`).
  Assets: `whisper-bin-ubuntu-x64.tar.gz` **9,503,425 B**, `whisper-bin-ubuntu-arm64.tar.gz` 4,572,294 B,
  `whisper-bin-x64.zip` (Windows) 8,361,840 B, `whisper-blas-bin-x64.zip` 21,147,582 B,
  `whisper-cublas-12.4.0-bin-x64.zip` 671,045,732 B, `whisper-cublas-11.8.0-bin-x64.zip` 269,896,802 B,
  `whisper-b4938-xcframework.zip` 53,621,479 B. URL pattern
  `https://github.com/ggml-org/whisper.cpp/releases/download/b4938/<asset>`. Artifacts carry GitHub
  build-provenance attestations; no `.sha256` sidecars (source: `.github/workflows/release.yml`).
- **macOS has no prebuilt CLI** — the XCFramework is a library for Swift. The Linux tarball is CPU-only
  with runtime-selected CPU variants (`libggml-cpu-{sse42,haswell,zen4,...}.so`, listed live above) and
  contains `whisper-cli`, `whisper-server`, `parakeet-cli`, `libwhisper.so`, `LICENSE`; **no
  `whisper-stream`** (needs SDL2). No Vulkan or CUDA Linux asset.
- **Building it here** took `uvx --from cmake cmake -B build -DGGML_METAL=ON -DWHISPER_COREML=ON
  -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_SDL2=OFF` + `--build -j 12`: ~2 min on this machine, no
  dependencies beyond Xcode's clang. So the macOS cost is a CI job, not a toolchain.
- Licence MIT. Weights: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/<file>`; the HF API
  exposes a **sha256 per file** (`lfs.sha256`), verified here against the downloaded bytes:

| File | Bytes | sha256 (HF LFS = local) |
|---|---|---|
| `ggml-tiny.bin` | 77,691,713 | `be07e048…c6e1b21` |
| `ggml-base.bin` | 147,951,465 | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |
| `ggml-small.bin` | 487,601,967 | `1be3a9b2…fffea987b` |
| `ggml-small-q5_1.bin` | 190,085,487 | `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb` |
| `ggml-medium-q5_0.bin` | 539,212,467 | `19fea4b3…3b34220f` |
| `ggml-large-v3-turbo.bin` | 1,624,555,275 | `1fc70f77…8e2bc69` |
| `ggml-large-v3-turbo-q5_0.bin` | 574,041,195 | `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` |

  CoreML encoders (`ggml-<m>-encoder.mlmodelc.zip`): base 37.9 MB, small 163 MB, large-v3-turbo
  1,173 MB. **Not worth shipping** — see §4.

### sherpa-onnx

- Latest versioned release **`v1.13.6`**, 2026-08-18 (`releases/latest` points at a `tauri` demo tag,
  so a pinned URL must name the version). Licence Apache-2.0. Prebuilt, per OS, URL pattern
  `https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.6/<asset>`:
  `sherpa-onnx-v1.13.6-osx-arm64-shared-no-tts.tar.bz2` **17,881,475 B** (used here; sha256
  `a188765a80094f8505b7ba02b6b906b6bb0dd42d0281822e6c11cdeba4120b24`, 58 MB unpacked, 30 executables +
  `libonnxruntime.dylib`, `libsherpa-onnx-c-api.dylib`); `osx-universal2-shared` 42,842,839 B;
  `linux-x64-shared-no-tts` 24,503,640 B; `win-x64-shared-MD-Release` 20,110,636 B; CUDA builds
  `…cuda-12.x-cudnn-9.x-onnxruntime1.27.1-linux-x64-gpu` 238,970,704 B and `…win-x64-cuda`
  375,610,800 B. No DirectML prebuilt. No checksum sidecars.
- Models on the `asr-models` tag (499 assets, paginated through the API; full list kept at the
  scratchpad). The ones that matter, all `…/releases/download/asr-models/<name>`:
  `sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-{80,160,320,560,1120}ms-int8-2026-06-11.tar.bz2`
  **475,27x,xxx B** (653–667 MB unpacked: `encoder.int8.onnx` 657,601,518 B);
  `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` 487,170,055 B;
  `sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8.tar.bz2` 153,692,328 B;
  `sherpa-onnx-nemo-fast-conformer-transducer-en-de-es-fr-14288-int8.tar.bz2` 106,902,947 B;
  `sherpa-onnx-moonshine-base-es-quantized-2026-02-27.tar.bz2` 50,846,902 B (es only);
  `sherpa-onnx-whisper-{tiny,base,small,turbo,large-v3}.tar.bz2` 116 / 208 / 639 / 564 / 1,068 MB.
- **Streaming + Spanish + English in one model exists exactly once**: NVIDIA
  `nemotron-3.5-asr-streaming-0.6b` (HF card, 2026-06-04: "40 language-locales", Spanish `es-ES`/`es-US`
  in the *transcription-ready* tier, cache-aware FastConformer-RNNT, licence **OpenMDW-1.1** — a
  permissive grant "to deal in the Model Materials without restriction" with notice retention and a
  patent-retaliation clause; text read from `https://openmdw.ai/license/1-1/`). The docs sweep missed it
  because the sherpa docs page does not list it yet; the tarball is on the release. Every other
  streaming model on the tag is monolingual (`streaming-zipformer-es-kroko`, CC-BY-SA) or zh/en.
- CLI surface: `sherpa-onnx` (online) and `sherpa-onnx-offline` take **wav paths as arguments** and
  print JSON per file to stderr; there is no stdin audio path. The process-facing streaming door is
  `sherpa-onnx-online-websocket-server`, or the C API (`libsherpa-onnx-c-api`) behind a wrapper.
  `--provider` accepts `cpu, cuda, coreml` on this build.

## 3. The harness

- **Clip.** `say -v Mónica -r 160` (es_ES; Paulina es_MX and Eddy/Flo/Reed/Rocko/Sandy/Shelley/Grandma/
  Grandpa in es_ES/es_MX are also installed) reading:
  > Hola, quiero que revises el AgentRuntime y cómo se llama a session/new cuando arranca el equipo.
  > Después corré pnpm demo con el escenario por defecto y contame si el status pasa a waiting o a idle.

  → `ffmpeg -ar 16000 -ac 1 -c:a pcm_s16le` → **9.795 s**, 260,786 B. Also the first 3 s (`clip3s.wav`)
  as the "first partial" window. A TTS voice is cleaner than a laptop mic; treat the WER as a ceiling,
  the timings as representative.
- **whisper.cpp.** `whisper-cli -m <model> -f clip16k.wav -l es -t 8 -bs 5 -nt [-ng] [--prompt "…"]`
  under `/usr/bin/time -l`, **3 runs, min wall** reported (process start → exit, model load included);
  internal `whisper_print_timings` for encode/decode; max RSS from `time -l`. Prompt used:
  `AgentRuntime, session/new, pnpm demo, waiting, idle, blobot.` GPU = Metal (default build); CPU = `-ng`.
  CoreML runs had the `.mlmodelc` beside the `.bin`; Metal-only runs had it moved away (whisper.cpp
  loads it whenever it is there).
- **parakeet-cli** (same build): `-m ggml-parakeet-tdt-0.6b-v3-{q8_0,f16}.bin -f … -t 8 [-ng]`, 3 runs.
  Weights from `https://huggingface.co/ggml-org/parakeet-GGUF` (MIT card; q8_0 668,757,119 B, f16
  1,255,897,319 B; sha256 published on HF).
- **sherpa-onnx streaming.** Python 3.12 venv with `sherpa-onnx==1.13.6` (the pip wheel is the same
  C++ core; used because the `sherpa-onnx` CLI prints only the final), script `sherpa-stream-bench.py`
  in the scratchpad: 100 ms chunks, `OnlineRecognizer.from_transducer(model_type="nemo_transducer")`,
  `create_stream(language="es")`, records the wall time of the first non-empty partial and of the final
  after `input_finished()`. Two modes: `--realtime` (chunks paced at wall clock — what a user feels) and
  fast (as fast as it decodes — compute RTF). 4 threads unless noted; `--provider cpu|coreml`.
- **sherpa-onnx offline.** `sherpa-onnx-offline --provider=… --num-threads=4 <model flags> clip16k.wav`,
  3 runs, min wall; the binary's own `Elapsed`/`RTF` (decode only, excludes load).
- **RAM** = `maximum resident set size` from `/usr/bin/time -l` (or `ru_maxrss` in Python).

## 4. whisper.cpp — measured

Whole clip (9.8 s). *wall* = process lifetime incl. model load; *enc/dec* = internal timings; RTF = wall / 9.8.

| Model (disk) | Metal wall / RTF | Metal enc + dec | CPU (8 thr) wall / RTF | CPU enc + dec | RSS |
|---|---|---|---|---|---|
| tiny (78 MB) | 0.24 s / 0.025 | 20 + 63 ms | 0.33 s / 0.034 | 68 + 121 ms | 230 MiB |
| **base (148 MB)** | **0.31 s / 0.031** | 39 + 89 ms | **0.44 s / 0.045** | 119 + 169 ms | **340 MiB** |
| small (488 MB) | 0.58 s / 0.059 | 109 + 209 ms | 1.47 s / 0.150 | 435 + 705 ms | 811 MiB |
| **small-q5_1 (190 MB)** | **0.57 s / 0.058** | 120 + 236 ms | **1.47 s / 0.150** | 535 + 1082 ms | **485 MiB** (525 CPU) |
| medium-q5_0 (539 MB) | 1.21 s / 0.123 | 340 + 502 ms | 2.75 s / 0.280 | 1142 + 1293 ms | 1,129 MiB |
| **large-v3-turbo-q5_0 (574 MB)** | **1.03 s / 0.105** | 573 + 180 ms | **2.26 s / 0.231** | 1673 + 387 ms | **805 MiB** (881 CPU) |
| large-v3-turbo (1,625 MB) | 1.19 s / 0.121 | 519 + 156 ms | 2.44 s / 0.249 | 1968 + 323 ms | 1,883 MiB |

**Quality on the clip** (the identifiers are what matters; the Spanish is right in every row):

| Model | no prompt | with `--prompt` |
|---|---|---|
| tiny | "agent runtime … asesión nio … CorrePNPM democone … guaytino a Ideal" | "agentruntime … asesión nio/new … pnpm demo … guaytino a idle" |
| base | "Agent Runtime … Acesión New … PNPM Demo … Waitino Idol" | **"AgentRuntime … session/new … pnpm demo … waiting o a idle"** — all five right |
| small / small-q5_1 | "agente Runtime … Session New … PNPM demo … Waitin' or Idol" | **all five right** |
| medium-q5_0 | "agent runtime … session new … pnpm demo … waiting o a idle" | all five right |
| large-v3-turbo(-q5_0) | "Agent Runtime … Session New … PNPM Demo … Waiting o a Idle" | all five right |

Every model writes "arraca" for the TTS's "arranca" except tiny-with-prompt and medium; that is Mónica's
rendering, not the engine. **The prompt is the whole difference** between a transcript a developer has to
fix and one they can send: it is `--prompt` on `whisper-cli` and `whisper-server`, `max n_text_ctx/2`
tokens (224), and `--carry-initial-prompt` keeps it across windows. This is the vocabulary hint the map's
*Not yet specified* list asks about, and it works from the smallest usable size.

**Streaming.** whisper.cpp has no incremental decoder; `whisper-stream` (SDL2 mic capture, absent from
the Linux tarball and from this build) re-runs inference on a sliding window every `--step` ms. The cost
of a partial is therefore the cost of one full run, and **the encoder cost does not shrink with a shorter
window**: on a 3 s window encode was 28 / 38 / 112 / 337 / 573 ms (tiny/base/small/medium-q5/turbo-q5,
Metal) — the same as on 9.8 s, because Whisper pads to 30 s. Measured "first partial" = time to
transcribe the first 3 s after it has been captured:

| Model | Metal, 3 s window | CPU, 3 s window |
|---|---|---|
| base | 0.22 s | 0.30 s |
| small-q5_1 | 0.40 s | 0.89 s |
| large-v3-turbo-q5_0 | 0.89 s | 2.03 s |

So partials at `base` are cheap enough to run every second on any machine; at turbo on CPU each partial
costs two seconds and would lag speech. **Final latency** = the whole-clip wall above (0.3 / 0.6 / 1.0 s
Metal; 0.4 / 1.5 / 2.3 s CPU) *after* the user stops, since a one-shot decode of the whole utterance is the
same work as the last window.

**The stdio contract, verified live**: `cat clip16k.wav | whisper-cli -m ggml-base.bin -f - -l es -t 8
-np -nt -oj -of - --prompt "…"` → stderr `read_audio_data: read 313518 bytes from stdin`, stdout a
single JSON document (`model`, `params`, `result.language`, `transcription[].text`), **0.445 s wall**
including load. No server, no temp file, no wrapper. `whisper-server` (`--host 127.0.0.1 --port …`,
`POST /inference` multipart, `--prompt`) exists as the keep-the-model-warm alternative; it is whole-file
too.

**CoreML (ANE encoder)** — measured and not recommended: first run compiles the model on-device
(**0.4 s base, 3.5 s small, 29.4 s large-v3-turbo**), writes `~/Library/Caches/whisper-cli/
com.apple.e5rt.e5bundlecache` (36 KB here; the compiled blob itself is held by the OS's ANE service), and
the warm result is no better than Metal: encode 44 ms vs 39 (base), 115 vs 109 (small), 471 vs 519 ms
(turbo); RSS unchanged. 1.2 GB more download for the turbo encoder buys nothing on M4 Pro. Ship Metal
only (`GGML_METAL_EMBED_LIBRARY` embeds the metallib in the binary; nothing else to install).

**Metal first launch**: the very first `whisper-cli` on this machine took 9.1 s wall for a run whose
internal total was 0.72 s — shader compilation into the system Metal cache; every later launch was
0.2–0.4 s. Observed once, before the marker; worth a warm-up on install.

### parakeet-cli inside the same build

`ggml-parakeet-tdt-0.6b-v3-q8_0` (669 MB): Metal 0.37 s (RTF 0.038), CPU 0.55 s, RSS 710–776 MiB; f16
(1.26 GB): 0.51 / 0.59 s, 1.28–1.34 GiB. Text: "el **agent Room Team** y cómo se llama **Assession New**
… **PNPM demo** … pasa a **Wait y no hay de él**". Fast and Spanish-fluent, but no prompt and the
identifiers are gone. Same answer from sherpa's Parakeet v3 int8 (§5) — it is the model, not the runtime.

## 5. sherpa-onnx — measured

**Nemotron 3.5 ASR streaming 0.6 B int8** (the one streaming es+en model), 100 ms chunks, `language="es"`:

| Variant | Mode | Load | First partial (wall from audio start) | Final | Compute RTF | RSS |
|---|---|---|---|---|---|---|
| 320 ms, cpu ×4 | realtime | 0.76 s | **1.05 s** ("Quiero que") | audio end − 0.05 s | — | 1,944 MiB |
| 320 ms, cpu ×4 | fast | 0.69 s | 0.09 s | 0.86 s | **0.088** | 1,935 MiB |
| 320 ms, cpu ×1 | fast | 0.67 s | 0.20 s | 1.86 s | 0.190 | 1,933 MiB |
| 320 ms, coreml | realtime | 2.53 s | 1.07 s | audio end − 0.03 s | — | 1,936 MiB |
| 320 ms, coreml | fast | 2.54 s | 0.19 s | 1.45 s | 0.148 | 1,934 MiB |
| 80 ms, cpu ×4 | realtime | 0.71 s | 0.96 s ("Qui") | audio end − 0.04 s | — | 1,942 MiB |
| 80 ms, cpu ×4 | fast | 0.68 s | 0.26 s | 2.95 s | 0.301 | 1,938 MiB |
| 80 ms, cpu ×1 | fast | 0.68 s | 0.59 s | 6.36 s | 0.649 | 1,938 MiB |
| 80 ms, coreml | fast | 2.44 s | 0.47 s | 4.75 s | 0.484 | 1,931 MiB |

This is real streaming: 27 (320 ms) / 56 (80 ms) distinct partials across the clip, the text grows word
by word, and the final is ready the moment the audio ends. Two facts weigh against it for blobot:

- **Text**: "**Quiero que** revises el **agente un time** y cómo se llama **Assession New** cuando arraca
  el equipo. Después corre **PNPM demo** con el escenario por defecto y contame si el status pasa a
  **Waiting**" — the leading "Hola," is dropped in every run (realtime and fast, both chunk sizes), the
  trailing "o a idle" is dropped, and the identifiers are worse than `base`-with-prompt. `language=auto`
  gives the identical text. The 80 ms variant is worse again ("Rumtime", "way in").
- **No hint**: `--hotwords-file` with `modified_beam_search` → `OnlineRecognizerTransducerNeMoImpl:
  Unsupported decoding method: modified_beam_search` (greedy only for NeMo transducers). No prompt.
- **One size**: 475 MB download, 653 MB on disk, **1.9 GB resident**, and nothing smaller speaks both
  languages while streaming. A three-size catalog cannot be built from it.
- CoreML is slower than CPU here (ORT partitions the graph and pays for the crossings) and triples load.

**Offline multilingual models** (whole clip, `sherpa-onnx-offline`, 4 threads; RTF is the binary's own,
decode only):

| Model (disk) | Provider | wall (min) | decode RTF | RSS | Text (identifiers) |
|---|---|---|---|---|---|
| Parakeet TDT 0.6B v3 int8 (642 MB) | cpu | 1.38 s | 0.070 | 1,134 MiB | "agent Room Team … Session New … PNPM demo … Wait y no hay de él" |
| same | coreml | 5.63 s | 0.139 | 3,053 MiB | same |
| Canary 180M flash int8 (210 MB) | cpu | 0.67 s | 0.025 | 495 MiB | **empty string, reproducibly** (a sherpa/ORT int8 CPU bug on this build) |
| same | coreml | 6.44 s | 0.257 | 1,741 MiB | "revise la gente rumpime … Session Mill … p n p m demo … Waití no hay de él" |
| FastConformer transducer en/de/es/fr int8 (136 MB) | cpu | 0.54 s | 0.018 | 379 MiB | "la gente reúntime … sesión mil … N M demo … Waitin" |
| Moonshine base **es** (63 MB, es-only) | cpu | 1.20 s | 0.093 | 623 MiB | "agente Runtime … Asesion New … PNPM demo … Waiting o a Eidel" |
| Whisper base int8 via ONNX (447 MB dir) | cpu | 0.73 s | 0.047 | 572 MiB | "agente runtime … sesión nir … pnpm demo … weighty no hay del" |
| same | coreml | 3.68 s | 0.183 | 1,910 MiB | "agentrum team … sesión nir … pnpm demo … waiting or ideal" |

Hotwords on Parakeet v3 (`--decoding-method=modified_beam_search --hotwords-file … --modeling-unit=bpe`)
→ `bpe_vocab: '' does not exist`: the tarball ships no `bpe.vocab`, so the one biasing mechanism sherpa
has is unusable on the one offline multilingual model that is any good. The NeMo family is fast and
memory-light on CPU (FastConformer: 0.5 s, 379 MiB — the cheapest transcription in this file) but every
one of them mangles `AgentRuntime` and `session/new` with nothing to correct it.

## 6. The model catalog (ticket 08 / 09 raw material)

whisper.cpp ggml weights, one URL each, sha256 from the HF LFS API and verified locally:

| Size | File | Disk | Download URL | RAM floor (measured peak RSS, worst of Metal/CPU) | Final on 10 s, Metal / CPU | Clip quality with prompt |
|---|---|---|---|---|---|---|
| **small** | `ggml-base.bin` | 148 MB | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin` | **0.4 GB** (342 MiB) | 0.3 s / 0.45 s | all identifiers right; occasional accent slips ("como") |
| **medium** | `ggml-small-q5_1.bin` | 190 MB | `…/resolve/main/ggml-small-q5_1.bin` | **0.6 GB** (533 MiB) | 0.6 s / 1.5 s | all right; better Spanish punctuation |
| **large** | `ggml-large-v3-turbo-q5_0.bin` | 574 MB | `…/resolve/main/ggml-large-v3-turbo-q5_0.bin` | **1.0 GB** (882 MiB) | 1.0 s / 2.3 s | best; right without a prompt except casing/spacing |

Why these three and not others: `tiny` is not good enough even with a prompt ("guaytino"); `small`
(f16) costs 3.2× the disk of `small-q5_1` for the same text and the same speed; `medium-q5_0` is slower,
larger in RAM and no better than `turbo-q5_0`; `large-v3-turbo` f16 is 1.6 GB and 1.9 GB resident for a
transcript identical to its q5_0. CPU-only RTF on this 12-core part is 0.045 / 0.15 / 0.23; a readiness
scan for the Linux-without-GPU case should assume a 4-core laptop is 2–3× slower (the encoder is
compute-bound, `-t` scales) and treat `large` as fit only where a 10 s utterance finishes in under ~5 s.
The floor figures already contain the 30 s Metal/CPU scratch buffers; add nothing for the audio.

## 7. Silent traps

- **CoreML compile cache**: with a `.mlmodelc` beside the model, whisper.cpp compiles on first run and the
  OS caches it under `~/Library/Caches/<process name>/com.apple.e5rt.e5bundlecache`. Not shipping the
  CoreML encoders avoids the write, the 29 s first-run stall and 1.2 GB of download; measured gain nil.
- **Metal shader cache** on first launch (9 s once), owned by the OS. Warm up after install.
- **whisper.cpp writes nothing else**: no config, no `$HOME` file, no network — `strings` on
  `whisper-cli` and the ggml dylibs shows no `http(s)://`; the source has no socket code. `-oj` writes
  `<input>.json` beside the input unless `-of -`; with stdin there is no input file, so use `-of -`.
- **sherpa-onnx writes nothing** we could find (`find` newer than a marker over Caches, .cache, .config,
  Application Support, Preferences: only unrelated system files); no URLs in its binaries beyond
  vendor-doc strings; no telemetry. ONNX Runtime's CoreML EP may compile into a temp dir per session —
  not in `$HOME`.
- **`releases/latest` lies on sherpa-onnx** (a demo tag); pin `v1.13.6` by name. whisper.cpp's `latest`
  is a real build tag but tags are numbered builds (`b4938`), not semver; pin the tag.
- **Canary int8 on CPU returns empty text** on this sherpa build; anyone who picks sherpa must not pick
  Canary.
- **Whisper hallucination on silence** is a known trap not exercised by this clip (the TTS has no dead
  air); `--no-speech-thold`, `--vad` with the bundled Silero model (`whisper-vad-speech-segments` is in
  the build) and an empty-result check belong in ticket 04/05's capture path.
- **`--prompt` is also a steering channel**: text in the prompt can bias the transcript toward it. A
  roster of names and repository identifiers is what we want in there; nothing a peer wrote should reach
  it.

## 8. What it costs blobot

1. **A macOS build in CI.** whisper.cpp publishes Linux x64/arm64 (CPU) and Windows x64 (CPU / BLAS /
   cuBLAS) but no macOS executable. Ticket 08 pins three archives: two from GitHub releases and one built
   by us (`cmake -DGGML_METAL=ON -DWHISPER_BUILD_EXAMPLES=ON`, ~2 min, Xcode clang only), checksummed and
   hosted with the app's other release assets. Same source tag on every OS.
2. **No wrapper, no server, no native module.** One `whisper-cli` process per utterance, WAV on stdin,
   JSON on stdout — measured 0.45 s end-to-end on `base` with a prompt. The Transcriber interface is
   `spawn → write → parse → exit`, with model load (37–150 ms; 400 ms turbo) paid per utterance, which
   is inside the numbers above. `whisper-server` on `127.0.0.1` is the keep-warm upgrade if per-utterance
   load ever matters; it is the same binary family and the same flags.
3. **Partials are optional and priced.** If ticket 07 wants text appearing while speaking, re-run the
   same process on the accumulated audio every ~1 s with `base` (0.2–0.3 s per partial) and decode the
   final with the chosen model on stop. Do not promise word-by-word streaming: that is what
   sherpa+Nemotron does and it costs 1.9 GB and the prompt.
4. **GPU on Linux/Windows is not in the prebuilt path.** Linux release = CPU (RTF 0.05–0.23 here); the
   Windows cuBLAS zip is 270–671 MB. The catalog's *small* size runs everywhere; *large* is a
   readiness-scan question.
5. **Licences**: MIT engine, OpenAI Whisper weights MIT (per the HF repo's `.bin` provenance from
   `openai/whisper`, MIT). Nothing to display beyond the notice.

## 9. Files

Scratchpad (session-local, not committed): `clip/clip16k.wav` + `clip.txt`; `whisper/src` (b4938
build), `whisper/models/*`; `sherpa/sherpa-onnx-v1.13.6-osx-arm64-shared-no-tts`, `sherpa/models/*`,
`sherpa/asr-models-assets.txt` (all 499 assets with sizes and URLs); harnesses `whisper-bench2.sh`,
`run-whisper-batch.sh`, `sherpa-stream-bench.py`, `run-rest.sh`; raw results under `results/`
(`whisper-batch-metal.txt`, `whisper-coreml.txt`, `parakeet-ggml.txt`, `sherpa.txt`, per-run `.err`
with `time -l` output); `docs-findings.md` (the primary-source sweep with a URL per claim).
