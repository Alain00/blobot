# ADR-0004 — An attachment is embedded, never linked

- **Status:** accepted
- **Date:** 2026-08-30
- **Decided by:** the author, grilled through `.scratch/composer-attachments/`
- **Touches:** `packages/core/src/runtime.ts` (`Prompt`, `AgentRuntime.accepts`),
  `packages/core/src/orchestrator/bounds.ts`, both ACP adapters' `sendPrompt`,
  `docs/adr/0002` (per-agent choices), ticket 10's AgentWorkspace isolation, ticket 14's
  permission posture

## Context

The composer sends a string. The author asked for attachments, with a screenshot — a file that
exists only on the clipboard and has no path anywhere.

ACP's prompt is an array of content blocks. The baseline every agent must accept is **text and
`resource_link`**; `image` and `embeddedContext` are opt-in and advertised on `initialize`. Both
runtimes on this machine advertise both, observed rather than assumed:

| runtime | `promptCapabilities` |
| --- | --- |
| `@agentclientprotocol/claude-agent-acp` 0.70.0 | `{image: true, embeddedContext: true}` |
| OpenCode 1.18.4 | `{embeddedContext: true, image: true}` |

So there were three ways to hand a file to an agent, and they are not equivalent:

1. **Embed** the bytes in the prompt. Full payload in the context window, once per recipient,
   permanently resident in that session's history.
2. **`resource_link`** the user's own path. Near-zero context, baseline ACP, works on runtimes
   blobot has no adapter for yet.
3. **`resource_link` blobot's own stored copy**, once the attachment is persisted with the
   Message.

Option 2 or 3 is what a context-cost-conscious client would do, and this repo's own rules say
*always compact context*. The cheap option is the one the codebase's instincts point at.

## Decision

**blobot embeds. It never hands an agent a path to a file outside that agent's AgentWorkspace.**

The fact that settles it is in `packages/core/src/adapters/claude/permissions.ts`:

> `Read`, `Glob` and `Grep` are absent because Claude never prompts for them.

A path given to an agent is read with **no permission gate, at any trust level**. `careful`,
`normal` and `trusting` are identical here. So neither link option can be defended on the
grounds that the user gets to approve the read — there is no approval, and no record.

Option 3 is the more dangerous of the two despite looking like the safer one. blobot's
attachment store is stable, predictable and holds **every attachment from every team**: one link
into it and `Glob` walks the rest. An agent on one team would be able to read a screenshot the
user sent a different team last month, silently. Option 2 has the same shape aimed at the user's
home directory, and `~/Downloads/spec.pdf` also tells an agent where downloads live.

Two supporting reasons, neither sufficient alone:

- The pasted-screenshot case has **no path to link**, so the embedding machinery has to exist
  regardless. Linking is an optimisation on top of it, and what it optimises away is the
  isolation boundary.
- Embedding is identical on both runtimes and on any future one that advertises the capability,
  where a `file://` path is a filesystem question every adapter would answer differently.

## Consequences

**Accepted, deliberately.**

- **Attachments are expensive, and permanently so.** An embedded image is in that session's
  history for the life of the session, not for one turn. A fan-out to three agents pays three
  times. blobot's answer is to *state the cost and not manage it* — the composer says what a
  send will cost, and the context gauge reports `attachments · 2 · 480 KB · sent this session`
  rather than pretending it is a per-turn figure.
- **A hard ceiling and a real refusal are now required**, since there is no cheap path for a
  large file to take. Both limits live in `orchestrator/bounds.ts` beside the peer-message
  bound, because they are the same rule: what blobot is allowed to put into an agent's context.
  A file over the line is refused **when it is picked up**, naming the size and the limit. A text
  attachment is never truncated.
- **blobot does not resize.** Silently downscaling would be cheaper and is refused: an agent
  reading a shrunken screenshot of a stack trace and getting the line number wrong is a bug with
  no visible cause. blobot does not touch the user's content anywhere else either — it refuses
  rather than truncates, and it does not compact.
- **PDFs are not supported.** Embedding one as a blob resource is protocol-legal and neither
  runtime says it does anything with it; the failure mode is silent, which is worse than the
  gap.
- **A runtime that cannot take images has to be handled rather than discovered.** `AgentRuntime`
  advertises `accepts` in blobot's own words, and the composer refuses before the user types.

## Alternatives rejected

- **`resource_link` to the user's path** — ungated read outside the AgentWorkspace, and a map of
  the user's filesystem.
- **`resource_link` to blobot's store** — the same, plus a single directory that exposes every
  attachment from every team to any agent given one link into it.
- **Copying the attachment into the AgentWorkspace** — blobot writes nothing into a checkout of
  the user's repository. A file left there can be committed home; this is the same argument that
  put ticket 14's permission posture on the wire instead of in a settings file.
