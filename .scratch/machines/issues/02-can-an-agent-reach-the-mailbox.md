Type: research
Status: open

# Can a sandboxed agent still reach the mailbox?

## Question

`@anthropic-ai/sandbox-runtime` does everything this effort wants except the one thing blobot
cannot trade: an agent inside it **cannot reach ticket 15's loopback MCP server**, so agents
cannot message each other. Measured three ways, all blocked — see
`research/01-external-sandbox-libraries.md` §3.

This is the frontier because it decides whether layer 1 (an outer fence blobot imposes) exists
at all. Every other question here is cheaper to answer and none of them matters if this is no.

## What to establish

1. **Is there a supported route today?** The netns is stripped and all traffic goes through
   host-side proxies, so the question is whether those proxies can be told to reach a loopback
   service, or whether a unix socket can be allowlisted in a form that actually connects
   (`allowUnixSockets: true` was not enough with the socket bind-mounted in and visible).
   Read the source rather than the README: it is Apache-2.0 and vendored reading is cheap.
2. **If not, is it a bug or a position?** Proxying to loopback is a normal SSRF guard, so this
   may be deliberate and permanent. File the question upstream —
   `anthropic-experimental/sandbox-runtime` — and record the answer here either way.
3. **What would blobot have to change to fit?** Not to be done, only priced. Ticket 15 chose
   loopback HTTP because *neither runtime re-handshakes*, which made a stateless HTTP endpoint
   with a per-agent bearer token the cheap correct answer. Moving the mailbox to stdio, or to a
   transport that survives the fence, reopens that ticket and is not a small edit.
4. **Does the fence survive being loosened for it?** If the mailbox is let through by widening
   the policy, say precisely what else is let through with it. A loopback exemption is an
   exemption for every loopback service on the user's machine, and that is a real cost.

## Why it is not simply "use bubblewrap ourselves"

A hand-rolled `bwrap` policy **does** keep loopback working — measured, a listener answered
`mailbox-ok` from inside. What it cannot do is close the read hole without also hiding the
CLI's own credential (§2). srt closes that with `denyRead` and pays for it here. The two
options fail in different places, which is why this ticket exists rather than a preference.

## Not this ticket

Where the boundary goes, what blobot may then claim, and which runtimes have one of their own.
`04`, `09` and `03`.

## Amendment, 2026-09-04 — absorbed, and widened past the fence

This was `.scratch/sandboxing/01`. That effort is now a region of `.scratch/machines/`, whose
destination is **the Machine**: the place an agent executes, of which a sandbox is one kind and
another computer is another. Renumbered `01` to `02`; the question above is unchanged and still
the frontier for the same reason.

What the wider destination adds is that **srt is no longer the only way loopback stops being
loopback**. If a Machine can be a remote box, then `127.0.0.1` is not merely proxied away, it is
*a different computer*, and ticket 15's three design constants are all repriced at once:

- **Stateless, because neither runtime re-handshakes.** Still true, and now load-bearing in a new
  way: a stateless endpoint survives a dropped network where a session would not.
- **The bearer token *is* the caller's identity.** On loopback that is sound because the only
  thing that can dial it is a process on this machine. Across a network it is a bearer token in
  the clear, and the token is the whole of the authorisation. Establish what it costs to keep
  this shape honest off-machine, or what replaces it.
- **The agent dials blobot.** Over ssh the direction is available both ways — a remote forward
  puts blobot's port on the far side, which keeps the loopback shape intact for the agent and
  moves the whole problem into the transport. Price that against the alternatives rather than
  assuming it.

Also widened: the runtime count. This was written against three runtimes and there are **five**
(Claude, Codex, OpenCode, fx, Cursor). Cursor already runs with `sandbox: enabled` set by
blobot's own adapter, and its loopback mailbox works today, which is a measured data point this
ticket did not have.

**Note the collision with what already ships**: `adapters/cursor` sets a sandbox *and* keeps the
mailbox, on the same machine. Whatever this ticket concludes has to explain that case rather
than contradict it.
