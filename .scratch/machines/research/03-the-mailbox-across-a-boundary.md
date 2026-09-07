# The mailbox across a boundary

Read 2026-09-04 on Guillermo's Mac (Darwin 25.6.0; `bwrap`, `socat` and `sbx` absent, so nothing
Linux or Docker was run here). [OBS] marks what was run, here or already in the repo; [DOC] what
was read from a vendor's source, binary or documentation: srt 0.0.75's `dist/` and README,
`peer-message-server.ts`, `docs.docker.com/ai/sandboxes/*` and `/reference/cli/sbx/*`, the OpenBSD
`ssh(1)`/`sshd_config(5)` pages, Claude Code's and Codex's sandboxing pages, the `codex` 0.151.0
binary here, and `adapters/cursor/live.test.ts`. research/02's measurements are not repeated.

**Ticket 15's three constants, as the code states them** (`peer-message-server.ts`): stateless,
with the bearer on every request *including the SSE GET*; the token *is* the identity — `#tokens`
maps token→agentId, the path is cosmetic; and the agent dials blobot on `server.listen(port,
'127.0.0.1')` — "Loopback only. An open port that can message agents is a real hole."

## (a) srt on Linux — read, not run [DOC]

**The host-side proxy has no SSRF guard.** `filterNetworkRequest` (`sandbox-manager.js:191–255`) is
`isValidHost` → `canonicalizeHost` → deniedDomains → allowedDomains → deny. Canonicalisation is
there so "inet_aton shorthand like `2852039166` (= 169.254.169.254) or `127.1`" cannot slip past a
*denylist* entry; nothing refuses loopback or private ranges as such. `isValidHost` takes IP
literals, the schema takes `127.0.0.1:46777`, and `matchesDomainPatternWithPort` matches the port
too. The dial is `dialDirect` (`parent-proxy.js:415`), a bare `netConnect(port, host)` — in
blobot's own process, on the host, where `127.0.0.1` is the mailbox. The plain-HTTP forward keeps
`Authorization` (`HOP_BY_HOP` strips `proxy-authorization` only) and pipes the response, so SSE
streams.

**Why research/01 saw BLOCKED anyway.** `generateProxyEnvVars` sets
`NO_PROXY=localhost,127.0.0.1,::1,169.254.0.0/16,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16`, so curl
never asked the proxy; it dialled the sandbox's own empty loopback (`--unshare-net`,
`linux-sandbox-utils.js:1435`). `allowLocalBinding` does not occur in `linux-sandbox-utils.js` at
all; it is a macOS rule.

**Unix sockets.** The seccomp filter blocks `socket(AF_UNIX)` for the user command; srt's own socat
bridges start first "so socat can still create Unix sockets" (`buildSandboxCommand`, line 596),
in a PID namespace the command cannot see. `allowUnixSockets: string[]` is "*Ignored* (seccomp
can't filter by path)" on Linux (README; schema); `allowAllUnixSockets: true` skips `apply-seccomp`
entirely (`linux-sandbox-utils.js:1371–1383`). research/01 used the wrong key, and the right one
is all-or-nothing.

| route | measured or read | what else the door admits | cost to the three constants |
|---|---|---|---|
| **A1 proxy**: `allowedDomains: ['127.0.0.1:<port>']`, the MCP client forced through `HTTP_PROXY` (NO_PROXY unset or `-x`) | read: allowed and dialled; unrun | exactly that host:port — the entry carries its port — and every other loopback/private name now meets the deny-by-default proxy | all three hold. **Depends on each runtime's MCP client honouring `HTTP_PROXY` for an `http://127.0.0.1` URL** — five unmeasured answers |
| **A2 unix carrier**: blobot also listens on a socket, the wrapped command runs `socat TCP-LISTEN:<port>,bind=127.0.0.1 UNIX-CONNECT:<sock>`, the CLI dials today's URL | read; unrun | **every** unix socket under `--ro-bind / /`: the README says `/var/run/docker.sock` would "effectively grant access to the host"; ssh-agent, dbus, gpg-agent follow | all three hold unchanged; the fence pays, and it is the one thing srt's Linux design exists to close |

Probe: `research/03-linux-mailbox-probe.mjs` — `proxy`, `unix`, `unix-denied` (control).

## (b) srt on macOS — measured in research/02 [OBS]

`allowLocalBinding` emits `(allow network-outbound (remote ip "localhost:*"))`: `connect()` to
`127.0.0.1` and `::1` on **every port**, the allowlist never consulted. Beyond the mailbox it admits
every loopback service on the host — dev servers, local databases, Ollama, other agents' srt
proxies (token-protected). The width is srt's config surface, not Seatbelt's: srt emits `(allow
network-outbound (remote ip "localhost:${httpProxyPort}"))` per port for its own proxy, so a
per-port allow is expressible and simply not offered. That is the upstream question. Constants:
all three hold.

## (c) A Docker Sandbox microVM — read; `sbx` needs `brew trust docker/tap` [DOC]

"Services running on your host are reachable from inside a sandbox using the hostname
`host.docker.internal`. Use this instead of `127.0.0.1` or your machine's local network IP
address, which are not reachable from inside the sandbox. The sandbox proxy translates
`host.docker.internal` to `localhost` before forwarding the request, so you must add the localhost
address with the specific port to your network policy allowlist: `sbx policy allow network
localhost:11434`." Rules take "optional port suffixes" and `--sandbox` scopes one to a single
sandbox. All outbound TCP is proxied on the host, "a forward proxy for HTTP and HTTPS; other TCP
traffic is forwarded transparently."

The other door is the wrong one. "Every sandbox starts an MCP gateway"; `sbx mcp add <name> --url`
rejects a URL that "resolves to a private/RFC1918, loopback, link-local, or cloud-metadata
address" unless `--skip-ssrf-check`, has no header flag, registers host-globally, and integrates
"Claude Code, Codex, Gemini, Kiro, or OpenCode" — not Cursor, not fx.

| route | measured or read | what else the door admits | cost to the three constants |
|---|---|---|---|
| **policy + hostname**: `sbx policy allow network --sandbox <name> localhost:<port>`; endpoint minted as `http://host.docker.internal:<port>/agents/<id>/mcp` | read; unrun | that one port, for that one sandbox; the host proxy sees the plaintext bearer, as srt's does | stateless holds; bearer holds (one hostname change in `endpointFor`); the agent still dials, through a name the VM's proxy owns |
| **MCP gateway**: `sbx mcp add blobot --url http://127.0.0.1:... --skip-ssrf-check` | read | the gateway's own meta-tools on the same connection | **breaks bearer-is-identity** (no header) and agent-dials-blobot (agent→gateway→blobot); refused on that alone |

Grain: `--name` defaults to `<agent>-<workdir>`, "Running the same workspace path again reconnects
to the existing sandbox", and "To run multiple sandboxes against the same workspace, give each a
distinct name." Per *(agent kind, directory)* by default, per name on request — blobot would name
one per Agent, `blobot-<team>-<agent>`, each mounting its own worktree "at the same absolute path
as on your host". For ticket 05: a worktree's `.git` points into the main repository's
`.git/worktrees/`, and clone mode is refused "from inside a Git worktree other than the main one",
so a direct mount needs the repository as a second workspace. Two corrections to research/02 §4:
the install page lists **Linux (Ubuntu 24.04+, KVM) as a microVM host**, and `sbx login` (Docker
OAuth) is a prerequisite — ticket 09's to weigh against *no cloud dependencies*.

Once authorised: `brew trust docker/tap && brew install docker/tap/sbx && sbx login`; a host
listener on `127.0.0.1:46777` echoing `Authorization`; `sbx policy allow network --sandbox
blobot-probe localhost:46777`; `sbx create --name blobot-probe shell <worktree> <repo>`;
`sbx exec -it blobot-probe bash -c 'curl -s -H "Authorization: Bearer t"
http://host.docker.internal:46777/; curl -sN --max-time 3 http://host.docker.internal:46777/sse'`;
then `sbx run claude --name blobot-probe` with `mcpServers` on that hostname.

## (d) A remote box over ssh [DOC, `ssh(1)`, `sshd_config(5)`]

`-R [bind_address:]port:host:hostport`: "connections to the given TCP port or Unix socket on the
remote (server) host are to be forwarded to the local side." "By default, TCP listening sockets on
the server will be bound to the loopback interface only"; a remote `bind_address` "will only
succeed if the server's `GatewayPorts` option is enabled" (sshd default `no`). Port `0` is
"dynamically allocated on the server and reported to the client at run time". The socket form is
created under `StreamLocalBindMask` (default `0177`, owner only). A server may refuse via
`AllowTcpForwarding` or `PermitListen`; `ExitOnForwardFailure yes` makes that loud rather than an
agent with no tool — ticket 15's readiness rule again.

| route | measured or read | what else the door admits | cost to the three constants |
|---|---|---|---|
| **reverse forward**: blobot spawns the user's `ssh -R 0:127.0.0.1:<port>` (as `gh` is spawned) and hands the far CLI `http://127.0.0.1:<remotePort>/...` | read; unrun | **any process on the remote box** can dial that loopback port — the laptop's population, on another machine. The socket form narrows it to the ssh user; the socat the CLI needs for a TCP URL widens it back to that user's processes | stateless now earns its keep: a dropped session loses in-flight calls only and the idempotency key makes the retry ordinary. The bearer travels **only inside the ssh channel**; on the far side it is loopback again. Agent-dials-blobot holds literally |
| **public endpoint**: blobot listens on a routable address | read | the whole network; a bearer in clear HTTP is the whole authorisation | refused by ticket 15's own comment; honest means TLS with a certificate blobot lacks, a laptop reachable behind NAT, and a token crossing a network it does not control |

The forward carries the mailbox only; inference egress is the remote box's own network, so the
fence question is asked again there. Ticket 11 keeps *no credential stored*: ssh runs on the
user's own keys and agent.

## (e) The runtimes' own sandboxes [DOC + OBS]

The mailbox is a tool call made **by the CLI process**, and every inner sandbox fences the
*commands* that process runs — so the mailbox is on the right side of (e) by construction, and
the ticket's "collision" is not one.

| runtime | what the sandbox applies to | loopback for *commands* | mailbox |
|---|---|---|---|
| Claude Code | "It applies only to Bash commands and their child processes." [DOC] | `allowLocalBinding` = (b)'s rule on macOS, nothing on Linux; `allowAllUnixSockets` = A2 | outside the fence |
| Codex 0.151.0 | `--sandbox`: "the sandbox policy to use when executing model-generated shell commands" [OBS]; domain rules do "not filter web search, apps, MCP, or other hosted tools" [DOC] | Seatbelt strings carry `(allow network-outbound (remote ip "localhost:*"))` [OBS]; under `network_proxy`, "`allow_local_binding = false` blocks loopback, link-local, and private destinations", excepting "an exact local IP literal or localhost allow rule" — the per-port form srt lacks | outside; `read-only` keeps commands off the network |
| Cursor | `sandbox: enabled, networkAccess: allow_all`; the live suite's `message_agent` "arrives carrying this agent's own bearer token" [OBS, `BLOBOT_LIVE_CURSOR=1`] | the test does not separate "MCP is outside" from "allow_all admits loopback"; it need not, the posture is a constant | reaches `127.0.0.1` today |
| OpenCode, fx | no sandbox surface (research/01 §4, fx tickets) | — | nothing to cross |

An inner sandbox touches ticket 15 only if a runtime moves its MCP client inside its own fence;
Cursor's canary is the insurance, per runtime.

## What is still unmeasured, in order

1. **Linux, Alain**: `node research/03-linux-mailbox-probe.mjs proxy|unix|unix-denied`, then one
   real CLI per runtime under `proxy` with `NO_PROXY` unset — whether its MCP client honours
   `HTTP_PROXY` for `http://127.0.0.1`. If none do, A2 or a stdio carrier is the Linux answer.
2. **Docker, Guillermo, after `brew trust`**: the commands in (c); the worktree-plus-repository
   mount; whether a blobot-launched `claude` starts with `~/.claude` absent.
3. **A real `claude` under srt on macOS**: Keychain and `_meta.claudeCode.options.sandbox`
   (research/02's order, unchanged).
4. **ssh**: `ssh -o ExitOnForwardFailure=yes -R 0:127.0.0.1:<port> <box>` against any Linux box;
   the allocated port on stderr, a `curl` on the far side, then the socket form and its mode.
5. **Upstream, `anthropic-experimental/sandbox-runtime`** (ticket point 2, reframed): not "will
   you allow loopback" — the Linux proxy already does — but a per-port loopback allow on macOS,
   and a way to route one loopback destination through the Linux proxy without stripping
   `NO_PROXY` for every tool.

## Addendum, 2026-09-04 — two doors `sbx` already has [OBS + DOC]

Read from `sbx create --help` and the binary's own symbols on Guillermo's Mac (`sbx` v0.39.0),
and from Docker's VS Code integration page.

- **ssh into a sandbox exists, and it is sandboxd's, not the guest's.** `sbx setup ssh` writes a
  `Host *.sbx` block into the user's ssh config with a managed `known_hosts`; `ssh <name>.sbx`
  routes through the daemon's embedded SSH server (`sandboxd/pkg/server/ssh_portforward.go`,
  `startSSHServerIfEnabled`, `checkLoggedIn`), with no client key to manage, and sftp and port
  forwarding that a sandbox can refuse (*"sftp is not available for this sandbox"*). Documented
  for VS Code Remote-SSH. For blobot this is **the user's door**, not blobot's: blobot drives the
  bridge over `sbx exec -i` (stdin kept open, *"flags match docker exec"*), and an *open in
  VS Code* on an agent's `WORKSPACE` line is one `ssh <name>.sbx` away.
- **ssh agent forwarding into the sandbox.** With `SSH_AUTH_SOCK` set on the host, sandboxd
  forwards the agent in (`SSH_AUTH_SOCK_GATEWAY`, `/run/ssh-agent.sock`): a process inside can ask
  for signatures and cannot read the key. The proxy-injection pattern applied to ssh keys, which
  is what lets a `git fetch` over ssh work from inside a box without a credential entering it.
- **`sbx create --clone`** is ticket 05's `box` answer, already built: *"Run the agent on a
  private in-container clone of the host Git repository (mounted read-only) instead of
  bind-mounting the workspace; the agent's commits are accessible via the `sandbox-<name>` git
  remote on the host"*, wired back through a git daemon. blobot would fetch
  `blobot/<team>/<agent>` from that remote as turns finish, and the host repository is mounted
  read-only rather than not at all. `sbx create AGENT PATH [PATH...]` also takes extra read-only
  workspaces.
