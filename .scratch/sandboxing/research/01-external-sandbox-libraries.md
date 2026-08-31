# What is available, measured

Observed 2026-08-31 on the author's machine. Everything marked [OBS] was run; everything marked
[DOC] is read from a vendor's own documentation or from a shipped binary's own strings.

Machine: Linux 6.8.0-60-generic, `CONFIG_SECURITY_LANDLOCK=y`, landlock in the active LSM list,
unprivileged user namespaces on (`user.max_user_namespaces = 126536`),
`kernel.apparmor_restrict_unprivileged_userns = 0`. `bwrap`, `socat`, `rg`, `gcc`, `docker` and
`systemd-run` all present; `podman`, `firejail` and `nsjail` absent. [OBS]

Runtimes: `claude` 2.1.251, `codex` 0.151.0, `opencode` 1.18.4. [OBS]

## 1. The cloud category is refused on the rules, not the merits [DOC]

`@vercel/sandbox` runs ephemeral **Firecracker microVMs on Vercel's infrastructure**. An account
and token are required and the code to be run is uploaded. E2B, Daytona, Modal and Fly Machines
are the same product shape.

This is not a close call. It breaks *local-first* and *no cloud dependencies*, both permanent
architectural rules, and it would ship the user's repository to a third party — a much larger
version of the leak ADR-0004 refuses when it declines to hand an agent a `resource_link` to a
path. Recorded so the question is not asked twice.

## 2. Rolling our own with bubblewrap: works, and is the wrong shape [OBS]

`spawnNpmBridge` (`packages/core/src/adapters/acp/npm-bridge.ts:62`) is a **single `spawn` for
all three runtimes**, so wrapping it confines node, the bridge, the CLI and every tool the CLI
runs, in one place, behind `AgentRuntime`. It looks like the whole answer and it is not.

Two policies, both run:

| policy | writes outside | `~/.ssh` readable | `~/.claude/.credentials.json` |
|---|---|---|---|
| `--ro-bind / /` + `--bind <ws>` | blocked | **YES** | **YES** |
| adding `--tmpfs $HOME` | blocked | no | **gone, and the CLI needs it** |

The first leaves reads wide open, which is the hole that matters: `Read`, `Glob` and `Grep`
never prompt, so an ungated read is the realistic exfiltration path, not `curl`. The second
closes it and takes the CLI's own credential with it — **same file, two consumers, opposite
requirements**, and from outside the process there is no seam between them.

Good news from the same probe: `--share-net` keeps DNS and egress intact for inference, and a
real listener on `127.0.0.1` answered `mailbox-ok` from inside the sandbox. Hand-rolled
bubblewrap does **not** break ticket 15.

Conclusion: hand-rolling is cheap and the policy is the hard part. Which is the argument for
not hand-rolling it.

## 3. `@anthropic-ai/sandbox-runtime` (srt) — the library that was being asked for [OBS]

`@anthropic-ai/sandbox-runtime@0.0.74`, Apache-2.0, `anthropic-experimental/sandbox-runtime`. A
CLI **and a Node library**. It enforces filesystem and network restrictions on **arbitrary
processes** at the OS level with no container, and **the wrapped process needs no awareness of
it**. Linux: bubblewrap, with the network namespace removed entirely so all traffic must pass
host-side HTTP and SOCKS5 proxies that filter by domain. macOS: generated Seatbelt profiles.
Windows: a dedicated local user plus a WFP egress fence. [DOC]

```ts
await SandboxManager.initialize({
  network:    { allowedDomains: ['api.anthropic.com'], deniedDomains: [] },
  filesystem: { denyRead: ['~/.ssh'], allowWrite: [workspace, '/tmp'] },
})
const wrapped = await SandboxManager.wrapWithSandbox(cmd)
spawn(wrapped, { shell: true, stdio: 'inherit' })
```

Reads default to allowed and are subtracted with `denyRead`; writes default to nothing and are
added with `allowWrite`. Network is allow-only. That is the same
subtract-from-open / add-to-closed split the two adapters already use, which is a good sign for
`trust.ts` translating into it.

Every Linux dependency it names is already installed here, and the Ubuntu 24.04 AppArmor
blocker it warns about is already `0` on this machine. [OBS]

### Measured against blobot's actual constraints [OBS]

Wrapping a shell with `denyRead: ['~/.ssh','~/.aws']`, `allowWrite: [<ws>,'/tmp']`,
`allowedDomains: ['api.anthropic.com']`:

| what | result |
|---|---|
| write inside the workspace | `YES` |
| write outside it | `Read-only file system` |
| `~/.ssh` | `0 entries` — hidden |
| `~/.claude/.credentials.json` | visible, because it was not denied |
| `https://api.anthropic.com` | `404` — the connection landed |
| `https://example.com` | `000`, blocked |
| **loopback `127.0.0.1:46777`** | **`BLOCKED`** |

**`denyRead` closes the read hole that §2 could not.** That is the finding that makes srt worth
taking seriously, and it corrects an earlier claim in this session that an external sandbox
cannot separate what the CLI may read from what the agent may read. It can, for everything
except the credential the CLI itself needs — and with egress allowlisted, reading that
credential buys an attacker much less, because it cannot leave.

### The blocker

**The mailbox is unreachable, and three ways around it failed:**

| attempt | result |
|---|---|
| `allowLocalBinding: true` | `BLOCKED` |
| `127.0.0.1:46777` and `localhost:46777` in `allowedDomains` | `BLOCKED` |
| a unix socket, `allowUnixSockets: true`, path bind-mounted in | socket file visible (`srwxrwxr-x`), connect `BLOCKED` |

This is srt behaving as designed rather than a misconfiguration: the netns is stripped so
everything must traverse the proxies, and proxying to loopback is a standard SSRF guard. But
ticket 15's mailbox is `127.0.0.1` HTTP with a per-agent bearer token that *is* the caller's
identity, so under srt **agents cannot message each other** — which is the entire product.

(One failed attempt was our own fault and is recorded so it is not re-run: a unix socket under
the session scratchpad returned `EINVAL` because the path exceeded `sun_path`'s 108 bytes. The
retry from a short path listened correctly and was still blocked.)

srt is `0.0.74` under `anthropic-experimental` and moving. Whether a host loopback service can be
reached from inside is a question for upstream, not a settled no. That is ticket `01`.

### Stated limitations worth carrying forward [DOC]

srt says of itself, in the same register ticket 14 uses: domain filtering does not inspect
traffic, so domain fronting bypasses it and a broad allow like `github.com` is an exfiltration
route to any repository. It is **not a boundary** against processes with inherited file
descriptors or `SCM_RIGHTS` sockets, or against programs that ignore proxy environment
variables. On Linux, mandatory deny paths only block files that already exist. Allowlisting
`/var/run/docker.sock` hands over the host.

None of that disqualifies it. It does mean a sandbox would not let blobot start using the word
*safe*, and the disclosure would have to say a true thing about a stronger boundary rather than
an absolute one.

## 4. The runtimes ship their own, and they draw the line somewhere blobot cannot [OBS]

- **Claude Code 2.1.251** ships Linux sandboxing via **bubblewrap** (19 references in the
  binary) and macOS via `sandbox-exec`. Settings surface, read from the binary:
  `sandbox.enabled`, `sandbox.enabledPlatforms`, `sandbox.allowUnsandboxedCommands`,
  `sandbox.bwrapPath` (managed settings only), `sandbox.network.allowedDomains`,
  `sandbox.network.deniedDomains`, `sandbox.network.allowManagedDomainsOnly`,
  `sandbox.network.tlsTerminate`, `sandbox.allowAppleEvents`. It states outright: *"bubblewrap is
  required for subprocess env scrubbing and isolation"*, with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`
  to disable it.
- **Codex 0.151.0** has `--sandbox read-only|workspace-write|danger-full-access`, and a
  **standalone `codex sandbox <command>` launcher** that will wrap any command in its Linux
  sandbox.
- **OpenCode 1.18.4** links the Landlock syscalls (`landlock_create_ruleset`,
  `landlock_add_rule`, `landlock_restrict_self`) and carries a `"sandbox"` key, but **no
  user-facing surface was found**. This is the asymmetry risk and it is ticket `05`.

The reason this matters is not convenience. A CLI sandboxes **its own bash subprocesses** while
leaving **its own process** able to read its credential and hold its MCP connections. That seam
does not exist from outside, because the `Read` tool is a function call inside the CLI, not an
exec — §2's dilemma restated as a positive. Whatever blobot does outside, only the runtime can
draw the line inside.

## Where that leaves it

Three layers, and they are not alternatives:

1. **Outer fence, blobot's** — srt around `spawnNpmBridge`. Runtime-agnostic, one spawn site,
   real filesystem and egress control. Blocked on the mailbox.
2. **Inner line, the runtime's** — Claude's and Codex's own sandboxes, translated per adapter
   from one blobot word, exactly as `trust.ts` already translates. Keeps the mailbox. Asymmetric
   until OpenCode is answered.
3. **What is already shipped** — the permission posture, which is a speed bump and says so.

Nothing here has been decided.
