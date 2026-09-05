Type: research
Status: resolved

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

## Answer, 2026-09-04

Yes, on every kind of boundary, and by a different door each time. The evidence is
`research/02` (macOS, measured) and `research/03` (Linux read from srt's source, Docker Sandboxes
read from its docs, ssh from the manuals), with `research/03-linux-mailbox-probe.mjs` for Alain.

**What survives unchanged is the mailbox's shape.** Stateless HTTP, a bearer token that *is* the
caller, the agent dialling blobot: all three constants hold on every kind. **What changes per kind
is the carrier** — the hostname blobot mints in `endpointFor` and the one door that kind opens —
so the carrier is a property of the Machine kind, and ticket 15 is not reopened.

| kind | the door | what else it admits |
|---|---|---|
| srt fence, macOS | `allowLocalBinding: true`; measured `mailbox-ok` | every loopback service on the host; a per-port SBPL rule is expressible but not offered (the upstream question, reframed) |
| srt fence, Linux | `allowedDomains: ['127.0.0.1:<port>']` through the host-side proxy, which has **no SSRF guard** and dials with a bare `net.connect`; research/01 saw BLOCKED only because srt sets `NO_PROXY=localhost,127.0.0.1,…` and curl obeyed | one port, port-exact; **unmeasured** whether each runtime's MCP client honours `HTTP_PROXY` for a loopback URL. The alternative, `allowAllUnixSockets`, opens every host socket, `docker.sock` included, and is refused |
| Docker Sandbox | `http://host.docker.internal:<port>/agents/<id>/mcp` plus `sbx policy allow network --sandbox <name> localhost:<port>`; `127.0.0.1` is not reachable from inside | that one port for that one sandbox; the host proxy sees the plaintext bearer, as srt's does. The MCP gateway is **refused**: no header flag, so bearer-is-identity breaks |
| remote box, ssh | `ssh -o ExitOnForwardFailure=yes -R 0:127.0.0.1:<port> <box>`: blobot's port appears on the far side's loopback, the bearer travels only inside the channel | any process on the remote box. A public endpoint is refused on ticket 15's own comment |
| the runtimes' own sandboxes | none needed: all five fence commands, and `message_agent` is a call the CLI process makes | ticket 02's "collision" with Cursor is not one |

**Grain, for ticket 01**: a Docker Sandbox is per *(agent kind, directory)* by default and per
`--name` on request; blobot would name one per Agent, `blobot-<team>-<agent>`, mounting its own
worktree at the same absolute path — and a worktree mounted alone has no git, because its `.git`
points into the main repository, so the repository comes in as a second workspace (ticket 05).

**Still unmeasured, in order**: the Linux probe (Alain); Docker after `sbx login` (the commands
are in `research/03` (c)); a real `claude` under srt on macOS (Keychain, `_meta` sandbox); the
ssh reverse forward against any Linux box; and the per-port loopback question upstream.

## Comment, 2026-09-05 — the Docker door is run

`research/08` §2 and §5 ran the row the answer marked *read; unrun*: from inside a shell sandbox
the bearer arrived intact and the SSE stream stayed open; `127.0.0.1` is refused inside; the rule
is exactly `sbx policy allow network --sandbox <name> localhost:<port>`, scoped, surviving a stop
and dying with `rm`; and a real `claude` from Docker's own template dialled the mailbox on
`session/new` with the header set. One thing the run added to *still unmeasured*:
`host.docker.internal` resolves to `fe80::1` in the guest's `/etc/hosts` and is not in `NO_PROXY`,
so a runtime whose MCP client ignores `HTTPS_PROXY` — fx is Zig, OpenCode is Bun — may dial
link-local directly; measured for Claude only, and `16` carries the other four.

## Amendment, 2026-09-05 — the box's name

The *Grain, for ticket 01* paragraph above sketched the box's name as `blobot-<team>-<agent>`. That
was a sketch and not this ticket's decision, and `17` amends it by name: a team's name is released
on delete and an agent's name recurs, while the engine reattaches the same name to the same
volumes, so a name would hand a new Alice the old Alice's login. The box and its volumes are named
by **Agent id** (`17` for the box object, `05` §8 for the volumes and the adopt-or-refuse marker).
