# Runtime images: unauthenticated ACP initialize

Date: 2026-09-05. Mechanical checks against the locally built arm64 images for
**The image: one per runtime**. This is Docker Engine evidence, not sbx/Machine
admission or proof of an authenticated Agent session.

- Executable fixture: [`26-runtime-image-acp-fixture.mjs`](26-runtime-image-acp-fixture.mjs).
- Receipts, exact image IDs, responses, stderr, timing and cleanup evidence:
  [`26-runtime-image-acp-results.json`](26-runtime-image-acp-results.json).

## Boundary and request

Each check uses its own UUID-named `docker run --rm --init -i` container, by immutable
image ID, with `--network none`, `--user agent`, one CPU and 1 GiB RAM. `/home/agent`
is a fresh, private tmpfs owned by UID/GID 1000; no host directory or credential is
mounted. The CLI connects through the explicitly supplied local Docker socket and a
separate empty Docker config, avoiding the operator profile's credential helper.

The fixture runs a UID/home probe, the image CLI's `--version`, and exactly one
JSON-RPC `initialize` request with protocol version 1. Client filesystem read/write
capabilities and terminal capability are false. It sends EOF after the response,
enforces a timeout, removes only its own exact container names, and confirms absence.
It implements no authentication, session creation, prompt, inference or tool call.

Bridge entrypoints use `/usr/bin/node` and the respective package's
`/opt/blobot/node_modules/@agentclientprotocol/.../dist/index.js`. Native runtimes
use the image's `/opt/blobot/bin/... acp`; Cursor adds `--workspace /home/agent`,
matching the existing adapter. Image environment and wrapper defaults are exercised.

## Observations

All five images reported UID/GID 1000, an empty `/home/agent`, and Node `v22.22.1`.
Their CLI versions match their receipts. Fourteen checks exited with code 0. Cursor's
ACP process answered but remained running after EOF and required timeout termination,
exiting 143. None produced stderr; all fifteen containers were confirmed absent
after cleanup.

| Image CLI | ACP initialize | Response latency |
| --- | --- | ---: |
| Claude `2.1.260` | Success; bridge reports `@agentclientprotocol/claude-agent-acp` `0.70.0`, protocol 1 | 377 ms |
| Codex `0.151.0` | Success; bridge reports `@agentclientprotocol/codex-acp` `1.7.0`, protocol 1 | 401 ms |
| fx `0.0.7` | Authentication gate: JSON-RPC error `-32600`, requiring Vercel AI Gateway login or an API key | 105 ms |
| OpenCode `1.18.4` | Success; reports `OpenCode` `1.18.4`, protocol 1 | 1192 ms |
| Cursor `2026.09.02-c22c1a3` | Success; protocol 1, `cursor_login` advertised, no `agentInfo` in the response | 634 ms |

Latency includes Docker container creation and process startup. It is one observation,
not a benchmark. Codex received its response after about 401 ms and exited after
about 2.46 seconds, consistent with its bridge's EOF shutdown grace period.

Cursor received EOF immediately after its response, at about 634 ms, but did not
exit before the 45-second deadline. The fixture terminated its own container and
verified removal. A caller cannot rely on EOF alone to end this pinned Cursor ACP
process; this handshake result is distinct from a clean shutdown. Its version comes
from the separate CLI probe because the initialization response omits `agentInfo`.

fx's error is an explicit authentication requirement at initialization, not a missing
executable or a successful ACP initialization. No fake credential, login, vendor
patch or session was used to bypass it.

## What these checks establish and leave open

The built Claude/Codex bridge dependency trees load without their duplicate optional
native SDK payloads and answer their versioned ACP initialization handshake. This
does not by itself prove a Claude session launches the explicitly selected external
CLI: that path remains an authenticated-session acceptance check. The separately
executed image CLI versions are recorded, rather than inferred from bridge versions.

With network physically disabled, successful startup cannot make a remote request.
It does not establish that the same image makes no attempt at background traffic
when egress is available. Telemetry/update silence, especially Cursor's unresolved
telemetry behavior, remains a separate gate from this fixture.

No login, prompt, mailbox, native skills, permissions, private Docker daemon,
host-worktree or persistence behavior was exercised. No amd64 image was run.

Reproduction for available images:

```sh
node .scratch/machines/research/26-runtime-image-acp-fixture.mjs \
  --receipts /private/tmp/blobot-machine-images.040Rvi/out \
  --results /private/tmp/blobot-runtime-image-acp-recheck.json \
  --runtimes claude,codex,fx,opencode,cursor \
  --docker-config /private/tmp/blobot-machine-images.040Rvi/docker-config \
  --docker-host unix:///Users/guillermo/.docker/run/docker.sock
```

The input receipt directory is a local build output, not an upstream published
release. Preserve this report's image IDs when comparing later builds. `--append`
adds previously unmeasured runtimes to a compatible report; repeated attempts use a
separate output file.
