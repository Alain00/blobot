Type: research
Status: open

# What Hermes takes in a prompt

## Problem

`AgentRuntime.accepts` is blobot's own word for what a runtime takes, and the composer refuses
before the user writes rather than after (ADR-0004). So this needs an answer before an attachment
reaches a Hermes agent, not after.

Hermes declares `PromptCapabilities(image=True)` in `initialize` (`acp_adapter/server.py:1319`)
and nothing else. No `embedded_context`, no `audio`. But the server imports
`EmbeddedResourceContentBlock`, `ResourceContentBlock`, `TextResourceContents`,
`BlobResourceContents` and `AudioContentBlock`, which suggests the prompt handler understands more
than the capability advertises.

Two possible readings and they lead to different code:

1. **The declaration is right and the imports are for the outbound direction** (tool results and
   history replay, which also use these types). Then `accepts` says images and text, refuses
   everything else, and blobot behaves.
2. **The declaration is understated.** Then blobot still behaves, because a client that sends what
   an agent did not advertise is the client that is wrong, and ADR-0004's whole posture is to pay
   the price honestly rather than optimise it away.

Either way the answer is the same in the composer. The reason to measure is to know whether a text
attachment -- an embedded `resource` block, which is how blobot sends a `.txt` or a `.csv` -- is
carried or silently dropped. Silently dropped is the bad case: the user sees a thumbnail and the
agent never saw the file.

## What to do

1. Read the prompt handler's block loop in `acp_adapter/server.py` and list which
   `ContentBlock` types it turns into something the agent sees.
2. Send one image and one embedded text resource through a live `hermes-acp` session and confirm
   both arrive. This is also the first live attachment test against *any* real runtime, which
   `build.md`'s *Next session* already names as the next gap: neither live suite has one.
3. Set `accepts` from what was measured, not from the capability flag, and note the divergence if
   there is one.

## Related

The two ceilings in `orchestrator/bounds.ts` apply unchanged and are refused at pickup. Nothing
here changes what blobot embeds or how large it lets an attachment be.
