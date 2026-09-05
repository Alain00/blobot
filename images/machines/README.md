# Machine runtime builds

The tracked image inputs live here; runtime download pins belong to each adapter's `image.ts`.
The app currently has empty `builds` arrays and cannot fetch an unpublished candidate. No image
upgrade, provider sign-in, egress admission or box activation is enabled by this directory.

## Contents and boundaries

Every image derives from the same multi-platform Docker shell digest in `inputs.json`, with
Node 22.22.1, Git, guest Docker/Compose, sudo, Python 3, bubblewrap and socat inherited from that
base. Node is required by blobot's guest transport even for native ACP runtimes. `uvx` is not
installed. A project MCP server can use the interpreters actually present; downloading a new
dependency still needs the eventual egress policy. Kernel Landlock and usable unprivileged
namespaces require their own live fence acceptance.

| Runtime | CLI baseline | ACP launch |
| --- | --- | --- |
| Claude | 2.1.260 | Node with claude-agent-acp 0.70.0 |
| Codex | 0.151.0 | Node with codex-acp 1.7.0 |
| OpenCode | 1.18.4 | Native `opencode acp` |
| fx | 0.0.7 | Native `fx acp`; requires authentication even for initialize |
| Cursor | 2026.09.02-c22c1a3 | Vendor package, including its own sibling Node, `cursor-agent acp` |

The payload is `/opt/blobot`: the selected vendor distribution, two small launch wrappers, and
the required bridge with its full npm lock. Claude omits the SDK's optional duplicate native
CLIs and points `CLAUDE_CODE_EXECUTABLE` at the selected CLI; Codex similarly uses `CODEX_PATH`.
OpenCode amd64 uses the baseline glibc build. Cursor retains its complete vendor layout.
There is no orchestrator, credential, operator home, repository or skill tree in the build
context or final payload. The build-only installer is absent from the final image.

CLI wrappers/environment suppress known automatic update checks. Claude and Codex also set
their documented telemetry controls. This does not certify that every CLI makes no telemetry
request: Cursor has no verified global telemetry opt-out. `IS_SANDBOX` is not added. Agent Git
identity is supplied by the Workspace's process environment; the image does not know the
Agent's name and supplies no system-wide identity pretending otherwise.

The `agent` UID remains 1000. RC5 exec omits supplementary groups, so the `docker` wrapper
uses the already-authorized guest sudo to reach `/usr/bin/docker`; the daemon and config stay
inside that Agent's microVM. No host Docker socket is mounted. `start-docker=false` prevents
sbx from adding its automatic Docker volume. The root kit explicitly sets `privileged:true`
and the accepted home/Docker limits of 8/20 GiB; sbx still starts dockerd by binary presence,
so there is no duplicate startup hook. These capacities exclude the host worktree and rootfs.

## Build and verify

Use a native arm64 or amd64 Linux Docker environment with the containerd image store enabled.
The Mac development host can use its local Engine; the app's runtime download does not need it.

```sh
node images/machines/build.mjs --runtime claude --arch arm64 --out /tmp/machine-builds
node images/machines/smoke.mjs --runtimes claude --arch arm64 \
  --receipts /tmp/machine-builds --results /tmp/machine-builds/claude-arm64-smoke.json
```

`--artifact` accepts an already-downloaded vendor archive only if its size/hash match the pin.
`--cache` selects a public-input cache. `--no-export` keeps the Docker image and receipt without
writing a tar. Specify a credential-free `DOCKER_CONFIG` and explicit local `DOCKER_HOST` when
the normal Docker config invokes a credential helper. The context is assembled in a temporary
directory from only the selected inputs, archive, installer and bridge lockfiles.

The builder checks the base Node version, artifact hashes, guest architecture/user/storage
label and CLI version. It exports exactly one image. The final tag contains the full OCI
manifest SHA; a different CLI, bridge, base or build result therefore gets a different tag.
`recipe` fingerprints the build inputs separately. Locked inputs and normalized BuildKit
timestamps are not a claim of byte-identical builds across hosts.

The receipt distinguishes engine-reported `imageBytes` from exported `bytes`; neither is
physical host disk allocated to an Agent. The smoke check uses an empty private tmpfs home,
UID 1000 and no network, session, prompt or authentication. It records fx's expected signed-out
refusal and explicitly terminates Cursor when it stays alive after stdin EOF.

Each runtime has a 1 GiB archive ceiling in `inputs.json`. Initial arm64 archives/images are
approximately 594–772 MB; the ceiling leaves headroom while catching duplicate CLI payloads
or unexpected base growth in CI. It is a build regression limit, not the amount reserved on
disk or the figure shown before an actual download. Published receipts provide that figure.

## CI and distribution

The manual `machine-images` workflow builds all five runtimes on native Linux arm64/amd64
runners, runs smoke checks and uploads each archive with its receipt. With an optional new
`machines-*` release tag it verifies all ten results and creates a **draft** release. The
release assembly refuses missing architectures, failed smoke checks, corrupt bytes and an
existing release. It never edits adapter pins or publishes a draft automatically.

After reviewing and publishing immutable assets, verify anonymous downloads and copy the
generated `runtime-builds.json` entries into the matching adapter definitions. A private
GitHub release remains unavailable anonymously; no repository token is added to the app.
The prepared workflow has not yet run, and Linux amd64 acceptance is still pending CI.

`SbxImageStore` downloads with a pinned SHA and Range resume, validates the single-image OCI
and Docker metadata, checks architecture/UID/Docker-volume label, then calls `sbx template
load`. It refuses to replace a different image occupying the expected tag. Full SHA-256 is
checked before load; RC5 inventory exposes only an abbreviated manifest digest afterward.
Shared images outlive Agent removal; no automatic garbage collection is introduced here.
Any future explicit cleanup must account for active and retained recovery Machines.

Acceptance evidence and the remaining state-preservation work belong to
[The image: one per runtime](../../.scratch/machines/issues/13-the-image-one-per-runtime.md),
with reproducible fixtures under its research links. Signed-out startup does not prove
provider login, paid turns, mailbox delivery or migration crash recovery.
