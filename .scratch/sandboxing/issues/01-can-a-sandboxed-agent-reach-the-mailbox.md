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

Where the boundary goes, what blobot may then claim, and whether OpenCode can be given one.
`02`, `03` and `05`.
