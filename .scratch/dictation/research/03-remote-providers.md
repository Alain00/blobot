# The remote providers

Findings for `.scratch/dictation/issues/03-the-remote-providers.md`. Documentation only, read
2026-09-01; **no API was called and no credential was used**, so everything here is
**DOCUMENTED** (first-party page, URL cited) or **UNVERIFIED** (flagged inline). Nothing is
OBSERVED. The build ticket should treat every wire detail as a claim to be confirmed by the first
live test, and the unverified list at the end is the list of what that test has to touch.

Six providers were read: the four named in charting (OpenAI, Deepgram, Groq, Mistral) and two
first-party multilingual candidates added by the ticket's own rule (ElevenLabs Scribe,
AssemblyAI). Per-provider detail is in §2–§7; the comparison and the recommendation are in §1 and
§8, and the sentences the Settings disclosure needs are in §9.

---

## 0. TL;DR

| Provider | Ship? | Streams | Batch $/min | Stream $/min | es+en in one clip | Vocabulary hint | Audio retention (default) | Trained on (default) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **OpenAI** | **yes, first** | yes (WS, 24 kHz) | 0.0045 (`gpt-transcribe`) | 0.017 (`gpt-live-transcribe`) | `languages: ["es","en"]`, documented | `keywords[]` + `prompt` | batch: **none**; realtime: 30 d abuse log | no |
| **Deepgram** | **yes, second** | yes (WS, any PCM rate) | 0.0052 (Nova-3 multi) | 0.0092 (Nova-3 multi) | `language=multi`, per-word tag, documented | `keyterm` (+0.0013/min) | none with `mip_opt_out=true` | no with `mip_opt_out=true` |
| **Mistral Voxtral** | **yes, third** | yes (SSE on batch; WS realtime, 16 kHz) | 0.003 | 0.006 | auto-detect; code-switching **not documented** | `context_bias` (English-optimised) | 30 d abuse log | paid: no; **Free mode: yes by default** |
| Groq | no | **no** | 0.00067 (10 s minimum) | — | Whisper auto-detect, one language per window | `prompt` 224 tokens | none by default | no |
| ElevenLabs Scribe | no | yes (WS, base64 in JSON) | 0.0037 | 0.0065 | documented (blog) | `keyterms` ≤1,000 (+20%) | logged; zero-retention **Enterprise only** | **yes** unless account toggle off |
| AssemblyAI | no | yes (WS) | 0.0035 async / 0.0075 sync | 0.0075 | documented, native | `keyterms_prompt` + `prompt` | audio 24–48 h; transcript **indefinite** without paid TTL | **yes**; opt-out **paid plans only** |

One minute of dictation costs between a tenth of a cent (Groq) and 1.7 cents (OpenAI live).
At any realistic rate of speaking into a composer this is noise; what separates the providers is
the retention sentence, whether they stream, and whether code-switching is a documented feature
or a hope.

---

## 1. What the six have in common, and what the table in core needs

- **Auth is one header on every one of them**, and every one has a cheap GET that answers
  *"is this key accepted"* without sending audio and without spend. The `Transcriber` entry
  can carry `{ header, probe }` and the Settings section can validate on paste.
- **The batch shape is HTTP multipart with a `file` part** on OpenAI, Groq, Mistral,
  ElevenLabs and AssemblyAI-sync, all near-clones of OpenAI's `/v1/audio/transcriptions`;
  Deepgram alone takes the raw bytes as the body with a `Content-Type: audio/*`. One `fetch`
  with a `FormData` covers five of six.
- **Streaming is a WebSocket** on OpenAI, Deepgram, Mistral, ElevenLabs and AssemblyAI, each with
  its own JSON envelope; Mistral also has **SSE on the batch endpoint** (`stream=true`), which
  is the cheapest form of "text while it works" and needs no second protocol. Groq has none.
- **Sample rate is the one place the providers disagree about the microphone.** OpenAI's
  realtime path accepts **only 24 kHz** PCM; Deepgram takes whatever `sample_rate` says;
  Mistral realtime defaults to 16 kHz (8k/16k/22.05k/44.1k/48k allowed); ElevenLabs and
  AssemblyAI default to 16 kHz. Ticket 04's capture rate and ticket 02's local engine (Whisper
  family wants 16 kHz) should be chosen knowing that OpenAI live will need a resample or a
  second capture rate.
- **Every provider takes a vocabulary hint**, which is what the map's *not yet specified*
  entry on roster names and identifiers was waiting on. The shape differs: a literal list
  (OpenAI `keywords`, Deepgram `keyterm`, Mistral `context_bias`, ElevenLabs `keyterms`,
  AssemblyAI `keyterms_prompt`) or a Whisper-style free-text `prompt` (Groq, `whisper-1`).
  Deepgram and ElevenLabs **charge** for it.
- **Retention is where they part**, and it is not the same axis as price. Two of the six
  (ElevenLabs, AssemblyAI) train on a self-serve user's audio by default and gate the way out
  behind a plan; one (Mistral) does so only in its no-card Free mode; three (OpenAI, Deepgram,
  Groq) do not train, and OpenAI's batch endpoint is the only one that keeps **nothing** even
  for abuse monitoring.

So the closed list's entry shape, in the spirit of `INSTALL_SCRIPTS`:

```ts
interface RemoteTranscriberSpec {
  readonly id: 'openai' | 'deepgram' | 'mistral';
  readonly streams: boolean;                 // live partials over a socket
  readonly batch: { url: string; body: 'multipart' | 'raw' };
  readonly stream?: { url: string; pcmRate: number };
  readonly auth: { header: string; scheme: 'Bearer' | 'Token' };
  readonly probe: { method: 'GET'; url: string };   // key validation, zero spend
  readonly disclosure: string;               // the retention sentence, §9
}
```

---

## 2. OpenAI

**The landscape moved this summer, and the ticket's candidate names are the old ones.**
Per the platform changelog and deprecations page (note: `platform.openai.com/docs/*` now
redirects to `developers.openai.com/api/docs/*`):

- 2026-07-28: `gpt-transcribe` (file transcription) and `gpt-live-transcribe` (low-latency
  streaming "with context and language support") launched.
  https://developers.openai.com/api/docs/changelog
- 2026-08-26: `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`,
  `gpt-4o-transcribe-diarize` **deprecated, shutdown 2027-02-26**, replacement
  "`gpt-live-transcribe` or `gpt-transcribe`".
  https://developers.openai.com/api/docs/deprecations
- The transcription guide calls the 4o family and `gpt-realtime-whisper` "not recommended for
  new implementations". https://developers.openai.com/api/docs/guides/transcription

The table should name `gpt-transcribe` and `gpt-live-transcribe`, not `gpt-4o-transcribe`.

### Batch — `POST https://api.openai.com/v1/audio/transcriptions`

- Multipart. "Files can be up to 25 MB. Supported input formats are mp3, mp4, mpeg, mpga, m4a,
  wav, and webm." No maximum duration is stated, only bytes; no accepted sample-rate list for
  uploads. https://developers.openai.com/api/docs/guides/speech-to-text
- `response_format` for `gpt-transcribe`: `json`, `text`. **No timestamps** on the new models;
  `whisper-1` is the one with `verbose_json`/`srt`/`vtt` and `timestamp_granularities`.
- `stream=true` emits `transcript.text.delta` then `transcript.text.done` (the reference calls
  it "a stream of transcript events"; the framing name is not spelled out — SSE by the
  shape, UNVERIFIED). `whisper-1` does not stream.
  https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
- **Hints, three fields on `gpt-transcribe`**: "Use `prompt` for unstructured context about the
  recording. Use `keywords` for literal terms you expect to hear. Use `languages` for the
  expected input languages." Keywords "are hints, not required output"; the API rejects
  keywords containing `<`, `>`, CR or LF. `whisper-1`'s `prompt` is ≤224 tokens and does not
  follow instructions. https://developers.openai.com/api/docs/guides/transcription
- **Languages / code-switching**: `languages` takes ISO 639-1 (`en`, `es`), selected ISO 639-3
  and `zh` locales; "The API rejects unsupported or incorrectly formatted language codes." The
  response "identifies any languages that the model can reliably detect" and returns
  `"languages": []` when it cannot. The model page says it "supports … multiple language hints
  to improve transcription of domain terms, multilingual audio, and code-switching".
  https://developers.openai.com/api/docs/models/gpt-transcribe
  The old 57-language table is gone from the current guide; `whisper-1` still points at
  Whisper's 98. UNVERIFIED: an enumerated list for `gpt-transcribe`.
- Response `usage` is `type: "duration"` (seconds) for the per-minute models and
  `type: "tokens"` for the 4o family — the adapter can read spend off it.

### Streaming — Realtime WebSocket

- URL documented: `wss://api.openai.com/v1/realtime` (guide shows `?model=gpt-realtime-2.1`);
  a transcription-only session is made with `session.update` `{"type":"transcription", ...}`.
  The pre-GA `?intent=transcription` form **no longer appears** in the guide — UNVERIFIED
  whether it still works. https://developers.openai.com/api/docs/guides/realtime-transcription
- Headers: `Authorization: Bearer <key>`; "Remove the `OpenAI-Beta: realtime=v1` header when
  calling the GA interface." A desktop app holding the user's own key does not need the
  `client_secrets` ephemeral-token dance (`ek_…`, 10–7200 s).
  https://developers.openai.com/api/docs/guides/realtime-websocket
- Session config, verbatim from the guide:
  ```json
  {"type":"session.update","session":{"type":"transcription","audio":{"input":{
    "format":{"type":"audio/pcm","rate":24000},
    "transcription":{"model":"gpt-live-transcribe"},
    "turn_detection":null}}}}
  ```
  "The PCM audio format. Only a 24kHz sample rate is supported." (also `audio/pcmu`,
  `audio/pcma`). Audio goes up as base64 in `input_audio_buffer.append`; with
  `turn_detection: null` the client ends a turn with `input_audio_buffer.commit`; or
  `server_vad` (`silence_duration_ms` default 500) / `semantic_vad`.
  https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create
- `gpt-live-transcribe` takes `prompt`, `keywords`, `languages` and a `delay`
  (`minimal|low|medium|high|xhigh`): "Lower delay settings can produce earlier partial text.
  Higher delay settings … can improve word error rate." Optional
  `noise_reduction: near_field | far_field`.
- Events: `conversation.item.input_audio_transcription.delta` / `.completed` (with
  `transcript`, `usage`, `languages`) / `.failed`. "Ordering between completion events from
  different speech turns isn't guaranteed. Use `item_id`."
  https://developers.openai.com/api/docs/api-reference/realtime-server-events/conversation/item/input_audio_transcription/completed
- "`gpt-live-transcribe` doesn't return word-level timestamps, speaker labels, or transcription
  confidence scores." Realtime session maximum: 60 minutes.
  https://developers.openai.com/api/docs/guides/realtime-conversations

### Auth and validation

- `Authorization: Bearer <key>`; optional `OpenAI-Organization`, `OpenAI-Project`. "Revocations
  of an API key take effect within a few seconds."
  https://developers.openai.com/api/reference (Authentication)
- Key prefix (`sk-`, `sk-proj-`) is **not documented** — do not validate on it. UNVERIFIED.
- Probe: `GET /v1/models`, zero cost; each row has a `shutdown_date`, which is how the app
  can notice 2027-02-26 without a release.
  https://developers.openai.com/api/docs/api-reference/models/list
- Bad key: `401 - Incorrect API key provided`. The JSON body shape (`error.code:
  "invalid_api_key"`) is not on the current errors page — UNVERIFIED, branch on status.
  https://developers.openai.com/api/docs/guides/error-codes

### Price (https://developers.openai.com/api/docs/pricing)

| Model | Per minute |
| --- | --- |
| `gpt-transcribe` | **$0.0045** |
| `gpt-live-transcribe` | **$0.017** |
| `gpt-4o-mini-transcribe` (deprecated) | $0.003 |
| `gpt-4o-transcribe`, `whisper-1` (deprecated) | $0.006 |

Rate limits at Tier 1: 500 RPM on both new models; irrelevant to one person dictating.
https://developers.openai.com/api/docs/guides/rate-limits

### Retention and training (https://developers.openai.com/api/docs/guides/your-data)

- "As of March 1, 2023, data sent to the OpenAI API is not used to train or improve OpenAI
  models (unless you explicitly opt in to share data with us)."
- "By default, abuse monitoring logs are generated for all API feature usage and retained for
  up to 30 days, unless longer retention is required by law."
- Endpoint table: `/v1/audio/transcriptions` — used for training **No**, abuse-monitoring
  retention **None**; `/v1/realtime` — **No**, **30 days**. Both ZDR-eligible.

So batch and live carry **different** sentences. `openai.com/policies/*` returned 403 to the
fetcher; the quotes are from the platform's own *Your data* page.

---

## 3. Deepgram

Models today: **Nova-3** (`nova-3`), Nova-2 ("for languages not yet supported by nova-3"),
and **Flux** (`flux-general-en|multi`), a streaming-only turn-taking model for voice agents.
No Nova-4. https://developers.deepgram.com/docs/models-languages-overview

### Batch — `POST https://api.deepgram.com/v1/listen`

- **Raw binary body** (`--data-binary @audio.wav`, `Content-Type: audio/wav`) or JSON
  `{"url": ...}`. **No multipart form is documented.**
  https://developers.deepgram.com/docs/pre-recorded-audio
- "Maximum 2 GB." 100+ formats (MP3, MP4, AAC, WAV, FLAC, PCM, M4A, Ogg, Opus, WebM).
  `encoding` + `sample_rate` only for headerless raw audio.
  https://developers.deepgram.com/docs/supported-audio-formats ,
  https://developers.deepgram.com/docs/encoding
- Params: `model` (default is `base-general` — **always pass it**), `language`,
  `detect_language` (bool, or a candidate list: `detect_language=en&detect_language=es`;
  **pre-recorded only**, "not currently supported for streaming"), `smart_format=true`
  (implies punctuation), `keyterm`, `mip_opt_out`.
  https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded.md ,
  https://developers.deepgram.com/docs/language-detection
- **Code-switching, documented as a feature**: `language=multi`, "available on Nova-2, Nova-3,
  and Flux Multilingual", pre-recorded and streaming, **each word carries a `language`
  field**; "We recommend using an endpointing value of 100 ms for code-switching,
  `endpointing=100`." Nova-3 multi set: English, Spanish, French, German, Hindi, Russian,
  Portuguese, Japanese, Italian, Dutch. Nova-2's `multi` is Spanish + English only.
  https://developers.deepgram.com/docs/multilingual-code-switching
- **`keyterm`** (Nova-3 and Flux; the older `keywords` is Nova-2 and down): repeat the param,
  plain terms, no weights, "limited to 500 tokens per request; anything beyond that will
  return an error", guidance 20–50 terms, **match desired capitalization** — which is exactly
  what `camelCase` identifiers need. Works in streaming ("Streaming: Nova").
  https://developers.deepgram.com/docs/keyterm
- "Deepgram does not store transcripts, so the API response is the only opportunity to
  retrieve the transcript."

### Streaming — `wss://api.deepgram.com/v1/listen`

- Auth: `Authorization: Token <key>` header; where headers are impossible,
  `Sec-WebSocket-Protocol: token, <key>`. Main-process Node can send the header.
  https://developers.deepgram.com/docs/using-the-sec-websocket-protocol
- Params: `encoding=linear16&sample_rate=16000&channels=1`, `interim_results=true`,
  `endpointing` (ms, default 10), `utterance_end_ms` (≥1000, needs interim results),
  `vad_events`, `keyterm`, `language=multi`, `smart_format`.
  https://developers.deepgram.com/reference/speech-to-text-api/listen-streaming
- Control frames: `{"type":"KeepAlive"}` every 3–5 s (silence over 10 s closes with
  `NET-0001`), `{"type":"Finalize"}`, `{"type":"CloseStream"}` (server flushes, sends final
  `Results` + `Metadata`, closes). https://developers.deepgram.com/docs/close-stream
- `Results` carry `is_final` (segment will not be revised) and `speech_final` (endpoint
  detected) — the two flags ticket 06 needs to draw a partial that later settles.
  https://developers.deepgram.com/docs/interim-results
- A bad key fails the HTTP upgrade with a `dg-error` header.
  https://developers.deepgram.com/docs/stt-troubleshooting-websocket-data-and-net-errors

### Auth and validation

- `Authorization: Token <key>`. Keys belong to a Project, can expire. Key string format is
  **not documented** — UNVERIFIED. https://developers.deepgram.com/docs/authenticating
- Probe: the guide says to test a key against `/auth/token` ("either an 'invalid credentials'
  error or JSON details confirming the key's validity"); that reference page 404s today, so
  the success body is UNVERIFIED. Documented alternative: `GET /v1/projects` →
  `{"projects":[{"project_id","name"}]}`.
  https://developers.deepgram.com/guides/fundamentals/authenticating ,
  https://developers.deepgram.com/reference/manage/projects/list
- 401 body: `{"err_code":"INVALID_AUTH","err_msg":"Invalid credentials.","request_id":"…"}`.
  Also 402 `ASR_PAYMENT_REQUIRED` — a state the UI can name.
  https://developers.deepgram.com/docs/errors
- Temporary tokens exist (`POST /v1/auth/grant`, ≤3600 s, `Bearer <jwt>`) — not needed when
  main holds the key.

### Price (https://deepgram.com/pricing, pay-as-you-go)

| | Monolingual | Multilingual (`multi`) |
| --- | --- | --- |
| Nova-3 pre-recorded | $0.0043/min | $0.0052/min |
| Nova-3 streaming | $0.0077/min | $0.0092/min |
| `keyterm` add-on | +$0.0013/min | +$0.0013/min |

"Free $200 Credit" on signup. Per-second billing is claimed on a Deepgram blog, not the pricing
page — UNVERIFIED. Nova-2 is not on the pricing page.

### Retention and training

- The Model Improvement Program is **opt-out**: "Add `mip_opt_out=true` as a query parameter of
  all API requests that you want to be excluded from the Model Improvement Program." "Data
  from opted-out requests is retained only for the duration necessary to process the
  request." No price change for opting out is documented.
  https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program
- Regional endpoints `api.eu.deepgram.com`, `api.au.deepgram.com`.
  https://developers.deepgram.com/trust-security/data-privacy-compliance
- `deepgram.com/dpa` 404s; the Business TOS PDF could not be parsed — UNVERIFIED.

**The adapter must send `mip_opt_out=true` on every request, unconditionally.** That is the
one query parameter the disclosure sentence depends on.

---

## 4. Mistral Voxtral

**The ticket's candidate is retired.** `voxtral-mini-2507` was deprecated 2026-02-27 and
retired 2026-05-31. The current generation is **Voxtral Transcribe 2** (2026-02-04):
`voxtral-mini-latest` (= `voxtral-mini-2602`, batch) and
`voxtral-mini-transcribe-realtime-2602` (streaming). Both open-weight, Apache-2.0.
https://mistral.ai/news/voxtral-transcribe-2/ ,
https://docs.mistral.ai/getting-started/models/models_overview/

### Batch — `POST https://api.mistral.ai/v1/audio/transcriptions`

- Multipart: `file` | `file_url` | `file_id`, `model`, `language` ("Providing the language can
  boost accuracy"), `temperature`, `stream`, `timestamp_granularities` (`segment|word`),
  `diarize`, `context_bias` (array of strings).
  https://docs.mistral.ai/api/endpoint/audio/transcriptions
- `context_bias`: "up to 100 words/phrases", **"optimized for English; support for other
  languages is experimental"**. And: "`timestamp_granularities` is currently not compatible
  with `language`."
  https://docs.mistral.ai/studio-api/audio/speech_to_text/offline_transcription
- Auto-detect when `language` is omitted; response carries `language`. **Code-switching
  inside one clip is not documented anywhere** — UNVERIFIED. Languages: English, Chinese,
  Hindi, Spanish, Arabic, French, Portuguese, Russian, German, Japanese, Korean, Italian,
  Dutch (13).
- Limits **conflict**: the news post says "up to 3 hours in a single request"; the
  known-limitations page says formats WAV, MP3, FLAC, OGG, WEBM, max **60 minutes**, **500
  MB**. Irrelevant to a clip, but note M4A is not on the list.
  https://docs.mistral.ai/resources/known-limitations
- **SSE streaming on batch**: `stream=true` → events `transcription.language`,
  `transcription.segment`, `transcription.text.delta`, `transcription.done`.
  https://raw.githubusercontent.com/mistralai/client-python/main/docs/models/transcriptionstreameventtypes.md
- Response `usage.prompt_audio_seconds` — spend can be read off the response.

### Streaming — `wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=…`

- Server-side auth: the SDK's normal security headers, i.e. `Authorization: Bearer` —
  inferred from the SDK, UNVERIFIED on the wire. Browser path mints an `rt_*` token via
  `POST /v1/client/sessions` and passes it as a WebSocket subprotocol.
  https://docs.mistral.ai/studio-api/audio/speech_to_text/realtime_transcription/client_auth
- Client: `session.update {session:{audio_format:{encoding,sample_rate},
  target_streaming_delay_ms}}`, `input_audio.append {audio: base64}`, `input_audio.flush`,
  `input_audio.end`. Server: `session.created|updated`, `transcription.language|segment|
  text.delta|done`, `error`.
  https://raw.githubusercontent.com/mistralai/client-python/main/src/mistralai/extra/realtime/connection.py
- Audio `pcm_s16le`, sample rates 8000 / **16000 (default)** / 22050 / 44100 / 48000. Delay
  "from 80ms to 2.4s", recommended 480 ms. **No `language`, `context_bias` or `diarize` on
  realtime.** https://docs.mistral.ai/studio-api/audio/speech_to_text/realtime_transcription

### Auth and validation

- `Authorization: Bearer <key>`; keys shown once, optional expiry; "API access is enabled by
  default with no credit card required." No prefix documented — UNVERIFIED.
  https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key
- Probe: `GET /v1/models`. https://docs.mistral.ai/api/endpoint/models
- 401 body: no example in the error glossary; shapes seen in the wild differ. Branch on
  status. https://docs.mistral.ai/resources/error-glossary

### Price (https://mistral.ai/pricing/api , https://docs.mistral.ai/inference/pricing)

Batch **$0.003/min**; realtime **$0.006/min**. Rounding / minimum billing unit is not
published — UNVERIFIED.

### Retention and training

- "Except for specific APIs, we keep your Input and Output for the period necessary to
  generate the Output and then for thirty (30) rolling days to monitor abuse (unless zero data
  retention is activated)." https://legal.mistral.ai/terms/privacy-policy §5
- Commercial ToS §4.2: no training "except (a) when you (i) opted-in to training on a Mistral
  AI Product set to opt-out by default or (ii) have not opted-out of training on a Mistral AI
  Product set to opt-in by default". https://legal.mistral.ai/terms/commercial-terms-of-service
- **Which is which**: Studio **Free mode** — "we may use your data (input and output) to train
  our artificial intelligence models" (opt-in by default, can be turned off);
  **pay-as-you-go** — "Customers retain full control … right to opt out at any time." The
  docs' privacy page says flatly "API: data sent through the API isn't used for model
  training" — a **conflict** for Free mode; read the help-center article as governing.
  https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models ,
  https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls
- ZDR: paid plans, per request to support, covers "Speech transcription".
  https://docs.mistral.ai/admin/monitor-comply/zero-data-retention

blobot cannot tell from a key whether the account is Free or paid, so the disclosure has to say
both halves (§9).

---

## 5. Groq

- Models now: `whisper-large-v3-turbo` ($0.04/h, 216×) and `whisper-large-v3` ($0.111/h).
  `distil-whisper-large-v3-en` shut down 2025-08-23. No newer STT model.
  https://console.groq.com/docs/speech-to-text , https://console.groq.com/docs/deprecations
- `POST https://api.groq.com/openai/v1/audio/transcriptions`, OpenAI-compatible multipart;
  formats flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm; "will downsample audio to 16KHz mono
  before transcribing"; 25 MB multipart; **"Minimum Billed Length: 10 seconds"**; `prompt`
  "limited to 224 tokens"; `language` ISO-639-1; `response_format` json/text/verbose_json.
  https://console.groq.com/docs/api-reference
- **No streaming**: no `stream` parameter, no socket; the "real-time" pages are LiveKit
  integrations chunking into the batch endpoint. https://console.groq.com/docs/livekit
- Auth `Authorization: Bearer gsk_…`; probe `GET /openai/v1/models`; 401 body
  `{"error":{"message","type":"invalid_request_error"}}`. https://console.groq.com/docs/errors
- Price: turbo **$0.00067/min**, v3 $0.00185/min, 10 s minimum per request.
- Retention: "By default, Groq does not retain customer data for inference requests." Abuse /
  troubleshooting logs "up to 30 days"; ZDR toggle in Data Controls.
  https://console.groq.com/docs/your-data . Services Agreement §4.2: "Groq is not permitted to
  use Inputs or Outputs for training or fine-tuning any AI Model Services or other models,
  unless explicitly granted permission or instructed by Customer."
  https://console.groq.com/docs/legal/services-agreement
- Rate limits: the docs table shows **20 RPM / 2K RPD / 7.2K audio-seconds per hour** for
  Whisper — which tier that table is (Free vs Developer) is ambiguous on the page, UNVERIFIED.
  https://console.groq.com/docs/rate-limits

---

## 6. ElevenLabs Scribe

- `POST https://api.elevenlabs.io/v1/speech-to-text`, multipart, **synchronous** response;
  `model_id=scribe_v2` (`scribe_v1` deprecated); `language_code` optional, auto-detect
  returns `language_code` + `language_probability`; `keyterms` "Max 1,000 terms", "Keyterm
  biasing: 20% surcharge", and with >100 keyterms "minimum billable duration of 20 seconds".
  `file_format: pcm_s16le_16` for raw PCM. https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- Code-switching in one file is claimed on the launch blog, not in the API reference;
  realtime has a `secondary_languages[]` param. https://elevenlabs.io/blog/introducing-scribe-v2
- Realtime: WebSocket, `model_id=scribe_v2_realtime`, `audio_format=pcm_16000` default,
  audio as **base64 inside JSON** (`input_audio_chunk`), messages `partial_transcript` /
  `committed_transcript`, `commit_strategy manual|vad`, ≤50 keyterms. Exact path not surfaced
  by the fetch — UNVERIFIED.
  https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
- Auth `xi-api-key`; probe `GET /v1/user`; 401
  `{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}`.
  https://elevenlabs.io/docs/api-reference/user/get
- Price: batch $0.22/h (**$0.0037/min**), realtime $0.39/h (**$0.0065/min**), keyterms
  +$0.05/h. https://elevenlabs.io/pricing/api
- Retention and training: "ElevenLabs uses certain data you provide to us to improve the
  quality of our audio models for everyone" (opt-out is an account toggle, not a request
  flag); "Zero retention mode may only be used by enterprise customers"
  (`enable_logging=false`). The STT terms also oblige the integrator to "clearly and
  prominently inform end users … conversations are being recorded and may be shared with
  ElevenLabs".
  https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models ,
  https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode ,
  https://elevenlabs.io/speech-to-text-terms

---

## 7. AssemblyAI

- Classic path is upload → `POST /v2/transcript` → **poll every 3 s** — the wrong shape for a
  composer. A **Sync STT** endpoint now exists: `POST https://sync.assemblyai.com/transcribe`,
  multipart `audio` part (WAV or PCM S16LE + `config`), header `X-AAI-Model:
  universal-3-5-pro`, 80 ms–120 s, 40 MB, `language_code` single or **array** ("For
  multilingual or code-switching audio, pass an array of codes"), `prompt` ≤4096 chars,
  `keyterms_prompt` ≤2048 chars, response in the HTTP reply (`request_time_ms: 243.7` in the
  sample). https://www.assemblyai.com/docs/sync-stt/getting-started/transcribe-a-short-audio-file
- Streaming `wss://streaming.assemblyai.com/v3/ws`, `speech_model=universal-3-5-pro`, 18
  languages "with native mid-sentence code switching", `pcm_s16le` 16 kHz default, binary
  frames, `Turn` messages with `end_of_turn`. Auth header `Authorization: <key>` **without
  Bearer**. https://www.assemblyai.com/docs/api-reference/streaming-api/streaming-api
- Probe: `GET /v2/transcript?limit=1`; 401 `{"error":"Authentication error, API token
  missing/invalid"}`. https://www.assemblyai.com/docs/api-reference/transcripts/list
- Price: async U3.5 Pro $0.21/h (**$0.0035/min**), sync and streaming $0.45/h
  (**$0.0075/min**), streaming billed on session time. https://www.assemblyai.com/pricing
- Retention and training: audio deleted in 24–48 h; transcripts "Indefinite" without a TTL
  (another page says 30 days — conflict); ToS §4.3 grants the right to train on Customer Data
  with opt-out "to the extent applicable to Customer's pricing plan"; **"Free users cannot opt
  out of the model improvement program, set a TTL, or sign a BAA."** Sync STT retention is not
  stated anywhere — UNVERIFIED.
  https://www.assemblyai.com/docs/data-controls ,
  https://www.assemblyai.com/docs/data-retention-and-model-training ,
  https://www.assemblyai.com/legal/terms-of-service

---

## 8. Recommendation

The map settled that the remote lane is a narrow exception to *no hosted inference* and *no
credential storage*, and that the closed list is "what keeps a user's voice from being sent
anywhere at all". A provider earns a place on it by making that exception small: no training,
short or no retention, a sentence blobot can print truthfully, and streaming if ticket 06 wants
partials. Price does not separate them.

### Ship first: OpenAI (`gpt-transcribe` batch, `gpt-live-transcribe` live)

- The key most users already have, and the one whose `/v1/audio/transcriptions` keeps
  **nothing** — no abuse log — which is the strongest retention sentence available.
- `languages: ["es","en"]` + `keywords` is the documented answer to the map's two open
  items (code-switching, the roster-and-identifiers hint), on the batch and the live path
  alike.
- Costs: the live path is the most expensive on the table ($0.017/min) and wants **24 kHz**
  PCM; the batch path is cheap and format-agnostic. The model ids changed six weeks ago and
  the old ones die 2027-02-26; `GET /v1/models` exposes `shutdown_date`, so the app can notice.

### Ship second: Deepgram (Nova-3)

- The only provider whose code-switching is a first-class documented mode with a **per-word
  language tag**, and whose vocabulary hint says *match capitalization* — the two things a
  Spanish sentence with `AgentRuntime` in it needs.
- The best streaming primitives for ticket 06: `interim_results`, `is_final` vs
  `speech_final`, `endpointing=100` recommended for multi, `CloseStream` to flush. Takes
  the capture rate as-is.
- Cost of admission: `mip_opt_out=true` on every request or the retention sentence is false;
  `keyterm` is a paid add-on; the batch body is raw bytes, not multipart, so it is the one
  adapter that does not share the OpenAI-shaped `fetch`.

### Ship third: Mistral Voxtral (`voxtral-mini-latest`, realtime `…-2602`)

- The cheapest of the three, European, open-weight, and its realtime path speaks **16 kHz**
  natively, which is what the Whisper-family local engine and the other providers want —
  the one remote that needs no resample if ticket 04 captures at 16 kHz. SSE on the batch
  endpoint gives "text while it works" at batch price.
- Why third and not second: code-switching inside a clip is **undocumented**, `context_bias`
  is "experimental" outside English and absent on realtime, and the Free-mode account trains
  by default — a fact blobot cannot detect from the key, so the disclosure has to carry an
  *if*. Ship it, and make its live test the es+en clip.

### Dropped

- **Groq**: no streaming, and the model is Whisper large-v3 — the same weights ticket 02's
  local engine runs. A remote Whisper buys a fast GPU, not a better transcript, so it adds
  nothing the list does not have once a local Transcriber exists; the 10 s minimum bill and the
  20 RPM table are a poor fit for short clips besides. Cheap to add later because it is the
  OpenAI multipart shape verbatim — if a CPU-only Linux box turns out to need a remote Whisper,
  this is the one. Not refused, not first.
- **ElevenLabs Scribe**: strong model, but a self-serve key **trains by default** and zero
  retention is Enterprise-only, so the honest disclosure would be "ElevenLabs may train on
  your voice unless you found the toggle in your account", and their STT terms put a recording
  notice on us. The realtime path also sends audio as base64 in JSON. Dropped on the retention
  sentence.
- **AssemblyAI**: the sync endpoint is dictation-shaped and the code-switching is native, but
  "Free users cannot opt out of the model improvement program" and transcripts are kept
  indefinitely without a paid TTL. Same reason as ElevenLabs: blobot cannot print a sentence
  it cannot make true from the key alone.

### What the three imply for the neighbours

- **Ticket 06**: two of three stream real partials, and all three can do
  record-then-transcribe; `streams` is per entry and the Transcriber advertises it.
- **Ticket 04**: capture at 16 kHz mono S16LE and the local engine, Deepgram and Mistral take
  it raw; OpenAI live is the one needing 24 kHz (resample in main, or capture at 48 kHz and
  decimate to both).
- **Ticket 11**: the error vocabulary can name `key rejected` (401 on all three), `no credit`
  (Deepgram 402, OpenAI 429 `credit_balance_exhausted`), `too long` (OpenAI 25 MB, 60-minute
  realtime session), and `model retired` (OpenAI `shutdown_date`).
- **Ticket 10**: the key is validated on paste with the probe, and the section shows the
  provider's own sentence from §9 beside the field.

---

## 9. The disclosure sentences

Written from the documents, for the Settings section, one per shipped provider. Each must stay
true or the entry comes off the list.

- **OpenAI** — *Audio is sent to OpenAI and transcribed there. OpenAI does not train on API
  data. For record-then-transcribe, nothing is kept; for live dictation, an abuse-monitoring
  log is kept for up to 30 days.*
  https://developers.openai.com/api/docs/guides/your-data
- **Deepgram** — *Audio is sent to Deepgram and transcribed there. blobot opts every request
  out of Deepgram's model-improvement program, so the audio is kept only for the duration of
  the request and is not used for training.*
  https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program
- **Mistral** — *Audio is sent to Mistral and transcribed there. Mistral keeps it for 30 days
  to monitor abuse. A pay-as-you-go account is not trained on; a free Studio account is,
  unless you turn that off in Mistral's privacy settings.*
  https://legal.mistral.ai/terms/privacy-policy ,
  https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models

---

## 10. Unverified, for the first live session

1. OpenAI: the transcription-session URL (`?intent=transcription` gone from the guide); the
   401 JSON body; whether `stream=true` on batch is SSE-framed; any duration cap under 25 MB.
2. Deepgram: `GET /v1/auth/token` success body (reference 404s); per-second billing; key
   string format.
3. Mistral: `Authorization: Bearer` on the realtime socket from a non-browser client;
   code-switching on a real es+en clip; billing granularity; the 60-min/500 MB vs 3-hour
   conflict.
4. All three: key prefix formats (none documented — validate with the probe, never a regex).
5. The 2026-07/08 OpenAI model changes were read from the current docs pages during this
   session and post-date the author's other notes; confirm the ids resolve in `/v1/models`
   before hard-coding them.
