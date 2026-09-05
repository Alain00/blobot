# What each runtime confines, measured

Observed 2026-09-04 on Guillermo's Mac (arm64), zero tokens: no prompt reached any agent.
Installed: `claude` 2.1.260, `codex` 0.151.0 behind `codex-acp` 1.7.0, `opencode` **1.17.9**
(research/01 probed 1.18.4 on Alain's Linux), `fx` 0.0.7, `cursor-agent` 2026.09.02. [OBS] was
run here or read from a binary's strings; [DOC] is a vendor's docs, schema or source. Claude's
settings surface is in research/02 §3; this says what it confines.

## The table

| runtime | mechanism | platforms | reads | writes | network | own process? | route with no file in the workspace | loopback survives? | tag |
|---|---|---|---|---|---|---|---|---|---|
| **Claude Code** | Seatbelt; bubblewrap + socat (+ seccomp) — srt itself | macOS, Linux, WSL2 | whole disk; `denyRead` narrows | cwd + session tmp + `additionalDirectories`; config paths protected | host-side proxy, domain allowlist; `allowLocalBinding` key | **No** — Bash and its children only | `_meta.claudeCode.options.sandbox` (unverified) or user/managed settings; project scope can widen arrays | mailbox yes (in-process); shell → `127.0.0.1` needs `allowLocalBinding` | DOC+OBS |
| **Codex** | Seatbelt; Landlock (`codex-linux-sandbox`); native Windows sandbox | macOS, Linux, WSL2, Windows | whole disk; `~/.ssh` readable (measured) | bridge modes = `workspace-write`: cwd + `/tmp` + `$TMPDIR`; true `read-only` only via `codex sandbox` | closed by default, `CODEX_SANDBOX_NETWORK_DISABLED=1`; denial becomes a prompt | **No** — spawned commands | `INITIAL_AGENT_MODE` env (wins); `CODEX_CONFIG` env merges `writable_roots` only | mailbox yes (live, `read-only`); shell loopback **blocked** (measured) | OBS+DOC |
| **OpenCode** | none | — | prompt | prompt (`external_directory: ask`) | prompt (`curl *: ask`) | n/a | `OPENCODE_CONFIG_CONTENT`; nothing to put in it | yes | OBS+DOC |
| **fx** | none | — | prompt | prompt | prompt / allowlist | n/a | `FX_PERMISSION_MODE`; nothing else | yes (live, both ways) | OBS+DOC |
| **Cursor** | `cursorsandbox` → `sandbox-exec`; Bubblewrap + Landlock stage on Linux | macOS; Linux ≥ 6.2; Windows force-disabled | `readBoundary: system` = `(subpath "/")`; `~/.ssh` readable (measured) | cwd + `/tmp`, `/private/tmp`, `/var/folders`; `$HOME`, `.git/config`, `.git/hooks`, `.vscode`, `.idea` denied (measured) | `allow_all` = open; else SOCKS proxy + `sandbox.json` allowlist | **No** — shell-exec helper; `sandbox_mcp_servers: false` | `cli-config.json` in blobot's `CURSOR_CONFIG_DIR` (shipped); `sandbox.json` route unmeasured | mailbox yes; shell loopback **blocked** unless `allow_all` (measured) | OBS+DOC |

One row is true of all five and is the finding: **every sandbox here fences the shell tool, never
the CLI.** The process holding the credential, the `Read`/`Write` tools and the MCP client is
outside it on every runtime — research/01 §4's seam confirmed from the other side, and why the
mailbox survives everywhere without an exemption.

## Claude Code [DOC, extending research/02 §3]

The sandboxing page draws the line itself: *"The sandbox isolates Bash subprocesses. Other tools
operate under different boundaries: Read, Edit, and Write use the permission system directly
rather than running through the sandbox."* Defaults: *"read access to the entire computer,
except certain denied directories. Note that this default still allows reading credential files
such as `~/.aws/credentials` and `~/.ssh/`"*; writes to *"the current working directory, the
session temp directory, and any directories you've added"*, with `.claude/*`, `.mcp.json` and a
bare repo's `HEAD`/`objects`/`refs` protected inside them. Network is *"a proxy server running
outside the sandbox"* that prompts on an unlisted domain unless `strictAllowlist` or
`allowManagedDomainsOnly`.

For the delivery route: `sandbox.enabled`, `excludedCommands`, `filesystem.allowWrite` and
`network.allowLocalBinding` are **"Any file"** scope, and *"for array keys such as
`excludedCommands` and `allowRead`, Claude Code merges entries from every scope the session
loads, so a developer can append entries that widen the policy."* ADR-0003 loads project scope, so
a repository's own `.claude/settings.json` can widen a fence blobot sets from `_meta`: a checkout
is not a trusted author of its own sandbox. Only `filesystem.disabled`, `allowAppleEvents`,
`strictAllowlist` and `tlsTerminate` are user-or-managed. The binary carries `allowLocalBinding`,
`allowUnixSockets`, `allowMachLookup` [OBS]; srt without `allowLocalBinding` blocked `127.0.0.1`
(research/02 §1), and this sandbox is that library. The mailbox needs none of it.

## Codex [OBS + DOC]

The bridge is where the mode names lie. `dist/index.js` defines `read-only` as `("Ask for
approval", approvalPolicy "on-request", {type:"workspaceWrite", writableRoots:[],
networkAccess:false, excludeTmpdirEnvVar:false, excludeSlashTmp:false}, "workspace-write")` —
the same sandbox as `agent`, which differs only in `auto_review`; only `agent-full-access` is
`dangerFullAccess`. **Codex's real `read-only` sandbox is unreachable through the bridge**, which
is the mechanism behind research/02's *"read-only is not read-only"*.

The launcher shows the real one. `codex sandbox --help`: *"Full command args to run under
seatbelt"* (the binary also carries `codex-linux-sandbox helper`, `sandboxing/src/landlock.rs`
and `windows_sandbox_level`). Run here with no options against a loopback listener:

```
write-home-denied  write-tmp-denied  write-cwd-denied  gitconfig-write-denied
loopback127-blocked  example-blocked  read-home-ssh-ok  CODEX_SANDBOX_NETWORK_DISABLED=1
```

Its Seatbelt profile (strings) is *"start with closed-by-default"* `(deny default)`,
`(allow file-read*)`, writes only under `WRITABLE_ROOT` params and no network rule; the
`(allow network-outbound)` and *"allow local binding and loopback traffic"* blocks are annotated
*"when network access is enabled, these policies are added after those in
seatbelt_base_policy.sbpl"*. Docs on scope: *"The sandbox applies to spawned commands, not just
to built-in file operations."*

Route: `getInitialAgentMode()` reads `INITIAL_AGENT_MODE` and the mode wins over `CODEX_CONFIG`
(Codex effort research/02, `e10`/`e11`), but `mergeSandboxWorkspaceWriteRoots` does merge
`sandbox_workspace_write.writable_roots` from it. `-c` never reaches the child; `CODEX_HOME`
relocates `config.toml` *and* `auth.json`, a credential trap; `--permission-profile` needs a
`[permissions]` table in the user's `config.toml` (measured error).

## OpenCode [OBS + DOC]

The 1.17.9 Mach-O has **zero** `seatbelt`, `sandbox-exec`, `landlock` or `bwrap` strings. Its
`sandbox` tokens — `workspace.type.sandbox`, `sandboxes`, `addSandbox`, `removeSandbox` — are, in
`anomalyco/opencode@dev` `packages/opencode/src/project/project.ts`, `sandboxes: string[]` with
`addSandbox(id, directory)`: a project's extra directories, and in `workspace-routing.ts` a remote
Daytona workspace. `landlock` has **no hit** in the repository. `https://opencode.ai/config.json`
has no key containing `sandbox`; `permission` covers `read`, `edit`, `bash`, `webfetch`,
`external_directory`, as prompts. The `permissions` and `config` docs pages do not contain the
word.

So the Landlock symbols in the Linux build are the embedded Bun runtime's, not a feature; ticket
03's first bullet is answered. The route exists and is empty. Wrapping `opencode acp` in `codex
sandbox` is the outside option in a vendor's coat: it confines the whole process, so the launcher
result above applies — loopback blocked, credential readable, policy from `~/.codex`. The test,
if anyone insists: `codex sandbox -C <ws> -- opencode acp`, then `session/new` with loopback
`mcpServers`; expect the mailbox to fail as srt's did on Linux.

## fx [OBS + DOC]

Zero occurrences of `sandbox`, `seatbelt`, `landlock`, `sandbox-exec` or `bwrap` in the binary.
`fx permissions --help`: *"ask — Prompt before sensitive tool calls; auto — Apply rules, then
review unresolved sensitive tool calls (default); yolo — Disable fx permission checks"*; rules are
`/allowlist add command|tool|url|web-fetch-domain` into `~/.fx/settings.json`. The permissions doc
says *"File operations accessing paths outside the workspace are also subject to policy"* — a
prompt — and *sandbox* appears nowhere in it or the docs index. `FX_PERMISSION_MODE=ask` is the
whole lever, already set.

## Cursor [OBS + DOC]

The sandbox blobot ships is real, and worth exactly this. `cursorsandbox` (3.4 MB Rust,
*"Sandboxing helper for Everysphere shell-exec"*) execs `/usr/bin/sandbox-exec` with a
`(deny default)` profile: `(allow file-read-data (subpath "/"))`, writes to `WRITABLE_ROOT`
params plus `/tmp`, `/private/tmp`, `/var/folders`, denies on `.git/config`, `.git/hooks`,
`.cursorignore`, `.vscode`, `.idea`. It carries a `--run-linux-inner` *"Bubblewrap inner helper
stage"*; the docs put Linux at kernel 6.2+ with Landlock v3 and unprivileged userns; the JS
defaults `sandbox_force_disable_win32: true`. Driven directly with a policy file
(`{"version":1,"sandbox":{"type":"workspace_readwrite",…}}`, schema recovered from serde errors):

| policy | `$HOME` | `/tmp` | cwd | `.git/config` | `127.0.0.1` | `localhost` | `example.com` | `~/.ssh` |
|---|---|---|---|---|---|---|---|---|
| `networkAccess:false` | denied | ok | ok | denied | **blocked** | **blocked** | blocked | readable |
| `networkAccess:true` | denied | ok | ok | denied | 200 | 200 | 200 | readable |
| `false` + `disableTmpWrite` | denied | denied | ok | denied | blocked | blocked | blocked | readable |

In the CLI, any `sandbox.networkAccess` but `allow_all` selects `networkDisabledPolicy()` plus a
SOCKS proxy on `127.0.0.1` with an allowlist from `sandbox.json` (`user_config_only` /
`user_config_with_defaults`); `readBoundary` defaults to `"system"`, with `"workspace"` behind
`sandbox_read_control_portal: false`; `sandbox_mcp_servers: false`, so the mailbox runs in the
node process, unsandboxed.

Consequence for shipped code: **`cursor/live.test.ts`'s "sandbox versus loopback" proves an
in-process path the sandbox never touches** and would pass at any `networkAccess`. What the
sandbox *can* block is a shell dialing loopback — an agent curling the dev server it just
started — blocked in every mode but `allow_all`. So `allow_all` is not the "network on" dial the
adapter comment describes; it is the mode in which the fence has no network at all.
A restricted egress admitting loopback exists in the profile strings
(`(allow network-outbound (remote ip "localhost:*"))`) but was not reachable from the policy
file, and `sandbox.json` lives at `~/.cursor/sandbox.json` or `<project>/.cursor/sandbox.json`:
the user's file or the workspace's. Whether `CURSOR_CONFIG_DIR` relocates it is unmeasured
(ticket 01: `mcp.json` and `rules/` are **not** relocated).

## The asymmetry, stated

Ticket 14's rule: *a guarantee that holds for Alice and not for Bob is worse than no guarantee.*
Sorted by what each can promise about a shell command:

- **A real boundary, configurable by blobot today**: Claude (settings or `_meta`, each key's scope
  known), Codex (`workspace-write` is the only fence the bridge offers; a kernel boundary on
  writes and network that the trust word cannot touch), Cursor (`cli-config.json`, per agent,
  shipped). Three vocabularies, and none confines reads by default: only Claude can be told to
  (`denyRead`); Cursor's read boundary is behind a flag; Codex's does not exist.
- **No boundary and no route to one**: OpenCode and fx. Prompts on string patterns, bypassed by
  `bash -c` the day they were written, and both adapters say so.

So the inside option fences three and not two, and the three fences disagree on what a fence is:
Codex blocks a shell's loopback with no exemption, Cursor blocks it in every mode but the one
that blocks nothing, Claude has a key for it. A blobot word meaning *confined* would be true on
Claude, narrower on Codex, false on OpenCode and fx — the shape 14 refused, at greater cost,
because a sandbox is a bigger claim than a `deny` rule. And on all five the process holding the
login is outside the fence by design, so what the outside option can promise — the *agent*
cannot read what the *CLI* must send — no inside fence promises at all. That is this file's
strongest argument to ticket 04 for the fence being the Machine, and it holds only if 02 comes
back yes.

## Costs a turn — the exact tests, not run

1. **Claude `_meta` sandbox** (research/02 §3's open item): `session/new` with
   `_meta.claudeCode.options.sandbox = {enabled:true, network:{allowedDomains:["api.anthropic.com"]}}`;
   prompt *"run `curl -s -m 3 http://127.0.0.1:<port>/` and `echo hi > ~/probe`"*; expect both
   refused and a retry titled "Bash command (unsandboxed)". Repeat with `allowLocalBinding:true`;
   expect the curl to land.
2. **Cursor, network off, mailbox on**: `sandbox.networkAccess: "user_config_only"`, two agents,
   one `message_agent`; expect delivery, proving the live test was never about the sandbox.
3. **Codex writable roots via env**: `CODEX_CONFIG={"sandbox_workspace_write":{"writable_roots":["/tmp/x"]}}`
   under `read-only`; prompt a write to `/tmp/x/a`; expect no prompt.
