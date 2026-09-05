# srt on macOS, and what moved since research/01

Observed 2026-09-04 on Guillermo's Mac: Darwin 25.6.0, `sandbox-exec` present, `bwrap` absent,
Docker Desktop 4.81.0 installed with the daemon stopped, `sbx` not installed. `claude` 2.1.260,
`cursor-agent` 2026.09.02. [OBS] marks what was run; [DOC] what was read from a vendor's own
source, binary or documentation. `research/01` was measured by Alain on Linux on 2026-08-31;
every difference below is a difference between the two platforms or between srt 0.0.74 and
0.0.75, and says which.

## 1. The mailbox blocker is Linux's, not srt's [OBS]

`@anthropic-ai/sandbox-runtime@0.0.75` (published 2026-09-01), wrapping the same script
`research/01` §3 ran, against a loopback listener on `127.0.0.1:46777` standing in for ticket
15's mailbox. Script kept as `02-srt-probe-macos.mjs`.

| what | `allowedDomains: [api.anthropic.com]` | same, plus `allowLocalBinding: true` |
|---|---|---|
| write inside the workspace | `YES` | `YES` |
| write outside it | `Operation not permitted` | `Operation not permitted` |
| `~/.ssh` | `0 entries` | `0 entries` |
| `https://api.anthropic.com` | `404`, landed | `404`, landed |
| `https://example.com` | blocked | blocked |
| **`http://127.0.0.1:46777`** | **blocked** | **`mailbox-ok`** |
| **`http://localhost:46777`** | **blocked** | **`mailbox-ok`** |

The reason is in srt's own source rather than in luck. On macOS the fence is a Seatbelt profile,
and `dist/sandbox/macos-sandbox-utils.js` adds, under `allowLocalBinding`:

```
(allow network-bind (local ip "*:*"))
(allow network-inbound (local ip "*:*"))
(allow network-outbound (remote ip "localhost:*"))
```

with a comment explaining that the outbound rule is deliberately `remote ip "localhost:*"` so
the egress allowlist stays enforced for everything that is not loopback. [DOC] The wrapped
command also carries `NO_PROXY=localhost,127.0.0.1,::1,169.254.0.0/16,10.0.0.0/8,...`, so a
tool dials loopback directly and Seatbelt decides, never the proxy.

On Linux the netns is removed entirely (`--unshare-net`) and the only way out is two unix-socket
bridges to host-side proxies (`linux-sandbox-utils.js`, the header comment at line 412). There,
`127.0.0.1` inside the sandbox *is a different loopback*, and `NO_PROXY` keeps a tool from even
trying the proxy for it. Whether the host-side HTTP proxy would forward to the host's own
`127.0.0.1:46777` if a tool were made to use it is **unmeasured** and is the Linux half of
ticket 02. `allowUnixSockets` on Linux is enforced by a seccomp filter on `socket(AF_UNIX)`
applied *after* the bridges start (README §"Unix Socket Restrictions"), which is why a
bind-mounted socket was visible and still unreachable in `research/01`.

**Consequence for the map.** Layer 1 of ticket 04, an outer fence blobot imposes around
`spawnNpmBridge`, is available on macOS today with the mailbox intact. It is not available on
Linux by the same route. That is an asymmetry per *platform*, which is a different thing from
ticket 14's asymmetry per *runtime*, and the Machine kind is where it can be said honestly.

## 2. research/01 §2's "no seam" is superseded [DOC]

`research/01` §2 concluded that from outside the process there is no seam between the CLI
needing its credential and the agent not being allowed to read it: *"same file, two consumers,
opposite requirements."* srt 0.0.75 has one. `credentials.files` and `credentials.envVars`
with `mode: "mask"` replace the real value inside the sandbox with a sentinel
(`fake_value_<uuid4>`, length-matched), and the host-side proxy substitutes sentinel→real on
egress to the entry's `injectHosts`, in headers and streamed bodies, with TLS terminated by
srt's own CA (`credential-mask-*.js`, `credential-sentinel.js`, `body-substitution.js`,
`mitm-ca.js`, `tls-terminate-proxy.js`). Fail-safe direction is fake→real, so a missed
substitution means auth fails rather than a secret leaking.

Two caveats that matter here:

- **On macOS, masked *files* degrade to `mode: "deny"`** ("SBPL cannot redirect reads"); env
  masking works on both platforms.
- **On this Mac Claude keeps its credential in the login Keychain**, not in
  `~/.claude/.credentials.json` (absent). So on macOS the read hole for the CLI's own credential
  is a Keychain and mach-lookup question (`allowMachLookup` exists in the schema), and whether a
  `claude` inside an srt fence can still sign its requests is **unmeasured**. It costs one turn
  to find out and it is the first thing ticket 04 should spend.

Docker Sandboxes converged on the same shape independently: *"The host-side proxy injects
authentication headers into outbound HTTP requests. The raw credential values never enter the
VM."* [DOC] Two vendors, one design; blobot should treat proxy-side injection as the standard
answer to *the agent must not read what the CLI must send*, and it is the piece that survives a
Machine that is not this computer.

## 3. Claude's sandbox is reachable from where blobot already stands [DOC]

- `@anthropic-ai/claude-agent-sdk@0.3.232` (the bridge's pin) exposes `sandbox?: SandboxSettings`
  with `enabled`, `failIfUnavailable` (defaults **true**: missing dependencies fail rather than
  running unsandboxed), `autoAllowBashIfSandboxed`, `allowUnsandboxedCommands`, `excludedCommands`,
  `network.{allowedDomains, deniedDomains, allowLocalBinding, allowUnixSockets, allowMachLookup,
  tlsTerminate}`, `filesystem.{allowWrite, denyWrite, denyRead, allowRead}`, and `credentials`
  as in §2.
- `@agentclientprotocol/claude-agent-acp@0.70.0` builds the SDK options as
  `{ systemPrompt, settingSources, ...userProvidedOptions, ...(settings), env, cwd, ... }` where
  `userProvidedOptions` is `_meta.claudeCode.options` (`dist/acp-agent.js` ≈4761–4920). So a
  `sandbox` object handed the way `allowedTools` already is should reach the SDK unedited. **Not
  yet verified live**; ticket 04 asked exactly this and it is one `session/new` away.
- `claude` 2.1.260 on this Mac bundles srt (its strings include `npx sandbox-runtime`,
  `macos-sandbox-utils`' parameter list and `/usr/bin/sandbox-exec`) and reads
  `sandbox.enabled`, `sandbox.enabledPlatforms`, `sandbox.failIfUnavailable`,
  `sandbox.excludedCommands`, `sandbox.credentials.*`, `sandbox.filesystem.*`,
  `sandbox.network.*`. The inner line and the outer fence are **the same library**, which is why
  their policies can be expressed in one vocabulary.

## 4. Docker Sandboxes, from its own documentation [DOC]

Read 2026-09-04 (`docs.docker.com/ai/sandboxes/` architecture, security and Claude Code pages;
the product page). Not yet run: `sbx` needs `brew trust docker/tap && brew install docker/tap/sbx`.

- **Boundary**: a microVM per sandbox with a proprietary VMM, its own Docker daemon, `sudo`
  inside; Claude runs `--dangerously-skip-permissions` by default because *the VM is the
  boundary*. macOS, Windows and **Linux with KVM (Ubuntu 24.04+)** per the install page —
  `research/03` corrected an earlier third-party claim that Linux was container-only. **`sbx login`
  (Docker OAuth) is a prerequisite**, which ticket 09 has to weigh against *no cloud dependencies*.
- **Workspace**: mounted through virtiofs **at the same absolute path as on the host**,
  read-write, caching on by default. Third-party measurements put metadata-heavy work at roughly
  3× native.
- **Network**: all outbound TCP through a host-side proxy, deny-by-default with allow/deny
  lists, private CIDRs blocked, UDP and ICMP blocked; *"the default allowed domains include
  broad wildcards."*
- **Credentials**: proxy injection as in §2, for keys set with `sbx secret set`. With a
  subscription the docs say `/login` inside the sandbox, which means **the OAuth token lives in
  the VM**; injection covers API keys, not the CLI's own login.
- **Host reach**: `host.docker.internal`, translated to `localhost` by the sandbox proxy, plus
  `sbx policy allow network --sandbox <name> localhost:<port>`; `127.0.0.1` itself is *not*
  reachable from inside. `research/03` (c) has the route and the MCP gateway it refuses.
- **Config**: *"Sandboxes don't pick up user-level configuration from your host, such as
  `~/.claude`."* Only the working directory's project-level config. ADR-0003's *an agent inherits
  all three scopes* is not true inside a Docker Sandbox.
- **Lifecycle**: persistent until `sbx rm`; stopping keeps the VM.

## What is still to measure, in the order it should be spent

1. `sbx` installed here; the mailbox and a host loopback port from inside a Docker Sandbox; the
   worktree mounted at its own path; whether `~/.claude` absence breaks a blobot-launched agent.
2. A real `claude` under an srt fence on macOS: does it authenticate from the Keychain, and does
   `_meta.claudeCode.options.sandbox` reach the SDK.
3. The Linux route for the mailbox (Alain): host-side proxy to host loopback, or a stdio carrier.
