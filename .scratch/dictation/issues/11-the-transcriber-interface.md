Type: grilling
Status: resolved
Blocked by: 02, 03, 06 (all resolved)

# The Transcriber interface

## Question

Providers live behind an interface and the UI is provider-agnostic; the same rule for speech.
Decide what core owns: a `Transcriber` interface with a local implementation (a child process
over stdio, ticket 02's protocol) and one remote implementation per provider (ticket 03), and
the **event vocabulary** between them and the composer — a partial, a final segment, a level, an
error that names its cause (`no model`, `key rejected`, `engine exited`) — event-driven like
agent status. What a Transcriber advertises (`streams: boolean`, languages) so the composer can
draw the right thing without knowing which one it is. Where the process boundary sits: capture
in the renderer, the Transcriber in main, audio crossing once; whether core may know about audio
at all or only about the events (core's `domain` entry point has no Node dependency, and PCM is
Node's). A **mock Transcriber** for demo mode, reproducing the ugly cases on purpose the way
`MockAgentRuntime` does: a late partial that rewrites an earlier one, a stall, an engine that
exits mid-sentence. And how the loopback-style lifecycle applies: started on first use or with
the app, stopped when, restarted after a crash how many times.

## Answer (2026-09-01)

**One interface for both classes**, in `@blobot/core/domain` (pure) with implementations under
`packages/core/src/speech/` (Node):

```ts
interface Transcriber {
  readonly id: 'whisper' | 'openai' | 'deepgram' | 'mistral' | 'mock';
  readonly partials: boolean;                    // emits `partial`, or only `committed`
  start(hint: SpeechHint): Promise<void>;
  feed(pcm: Uint8Array): 'taken' | 'dropped';    // PCM_16K_MONO_INT16, 100 ms; dropped = backpressure
  mark(): void;                                  // segment boundary, from the renderer's RMS
  stop(): Promise<void>;                         // flush, close
  readonly events: AsyncIterable<TranscriberEvent>;
}
```

Local accumulates between `mark()`s and runs one `whisper-cli` per segment; remote forwards each
`feed` over its socket and treats `mark()` as a finalisation hint (`CloseStream` / commit).
`feed` answers `dropped` while stdin's or the socket's `drain` is false — ticket 04's *drop,
never queue*. Two interfaces (segment vs stream) were refused because the composer would then
know which one it has, which is the rule the UI keeps with runtimes.

**Four events, and the level is not one** (it is the renderer's and never crosses IPC):
`partial {text}`, `committed {text}`, `ended {reason: 'user' | 'ceiling'}`, `failed {cause:
'no_model' | 'engine_exited' | 'key_rejected' | 'network' | 'no_credit'}` — committed text stays
in the field on failure; `no_credit` because fx taught that a signed-in account with no credit
is a fifth state detection cannot see. `ended` and `failed` stay apart: one is what was asked
for, the other is what happened.

**The boundary**: core knows the audio *format* as a constant and processes no audio. PCM crosses
IPC **once**, renderer → main, as 100 ms `ArrayBuffer`s on `dictation:feed`; the Transcriber
lives in main; events return on the stream that already leads with a team id. No child process
from the renderer.

**`MockTranscriber`** in core with scenarios like `MockAgentRuntime`'s, reproducing the ugly
cases on purpose: a late `partial` rewriting an earlier one, a 5 s stall with no events, a
`failed engine_exited` mid-sentence after committed text. In `--demo` the snapshot says `ready`
with the mock behind it, so the mic works in demo with real audio in and scripted text out.

**Lifecycle**: local has no resident process — one `whisper-cli` per segment; Metal's warm-up
happens once in *say something*. Remote opens its socket in `start()`, closes it in `stop()`,
`KeepAlive` where the provider asks. **Zero retries inside a recording**: a drop is `failed
{network}`, the text stays, the next press starts clean. Nothing starts with the app.

**The hint** is `composeSpeechHint(roster, teamName, lastUserMessages)` in `speech/hint.ts`,
pure, under `bounds.ts`'s ceiling, called from main with what the store already holds, tested
the way `composeLeadBrief` is.
