# Machine runtime builds

The tracked image inputs live here; runtime download pins belong to each adapter's `image.ts`.
[machines-20260905-1](https://github.com/guillermolg00/blobot-machine-images/releases/tag/machines-20260905-1)
supplies verified public arm64 and amd64 builds for all five adapters. No image upgrade,
provider sign-in or box activation is enabled by this directory alone.

## Contents and boundaries

Every image derives from the same multi-platform Docker shell digest in `inputs.json`, with
Node 22.22.1, Git, guest Docker/Compose, sudo, Python 3, bubblewrap and socat inherited from that
base. Node is required by blobot's guest transport even for native ACP runtimes. `uvx` is not
installed. A project MCP server can use the interpreters actually present; downloading a new
dependency uses the accepted open Internet/host/LAN reach under the selected runtime's own
restrictions; Blobot adds no destination allowlist. Kernel Landlock and usable unprivileged
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

The current public publisher is
[`guillermolg00/blobot-machine-images`](https://github.com/guillermolg00/blobot-machine-images).
Release `machines-20260905-1` was built from publisher commit
[`056a3b31fa1838e16fcdd181c7c89528f7baf226`](https://github.com/guillermolg00/blobot-machine-images/commit/056a3b31fa1838e16fcdd181c7c89528f7baf226)
by [native CI run 33987159409](https://github.com/guillermolg00/blobot-machine-images/actions/runs/33987159409).
The publisher is a source snapshot, with no parent commit linking it to this repository.
As verified on 2026-09-06, Guillermo (`guillermolg00`) is its owner and sole listed
collaborator with write access; its workflow token may create releases during workflow runs.
The separate public repository supplies anonymous downloads because this source repository
is private. Availability and future publication depend on that publisher; the app checks the
pinned archive hash and refuses replacement bytes even if a release asset is changed.

The manual `machine-images` workflow builds all five runtimes on native Linux arm64/amd64
runners, runs smoke checks and uploads each archive with its receipt. With an optional new
`machines-*` release tag it verifies all ten results and creates a **draft** release. The
release assembly refuses missing architectures, failed smoke checks, corrupt bytes and an
existing release. It never edits adapter pins or publishes a draft automatically.
It writes to the repository where the workflow runs (`GITHUB_REPOSITORY`), so a run in
`Alain00/blobot` creates a private draft there, not a new public runtime release. Public
publication requires a reviewed source snapshot in the publisher and a workflow run there;
the resulting source commit and CI run must be recorded with each adapter-pin update.

Actions in this source workflow are pinned to full commit hashes. Dependabot opens weekly
GitHub Actions update PRs for review. This does not retroactively attest the existing release
or change the publisher's workflow: its next reviewed snapshot must carry these pins too.
Docker Engine and Buildx installations remain version-selected (`v29.6.1`/`v0.35.0`) by
their pinned setup actions, rather than verified against an independent checked-in archive
hash. CI receipts are checks of the produced bytes, not independent build attestations.

After reviewing and publishing immutable assets, verify anonymous downloads and copy the
generated `runtime-builds.json` entries into the matching adapter definitions. A private
GitHub release remains unavailable anonymously; no repository token is added to the app.
The first native CI matrix passed on both architectures. All ten public archives subsequently
passed anonymous full-byte downloads and archive validation; fx arm64 also passed actual Range
resume and a real `SbxImageStore` load/readiness check. GitHub release immutability is enabled.
The release's manifest and receipts are the authoritative download and size records.

`SbxImageStore` downloads with a pinned SHA and Range resume, validates the single-image OCI
and Docker metadata, checks architecture/UID/Docker-volume label, then calls `sbx template
load`. It refuses to replace a different image occupying the expected tag. Full SHA-256 is
checked before load; RC5 inventory exposes only an abbreviated manifest digest afterward.
Shared images outlive Agent removal; no automatic garbage collection is introduced here.
Any future explicit cleanup must account for active and retained recovery Machines.

Acceptance evidence and the deferred state-preservation scope belong to
[The image: one per runtime](../../.scratch/machines/issues/13-the-image-one-per-runtime.md),
with reproducible fixtures under its research links. Signed-out startup does not prove
provider login, paid turns, mailbox delivery or migration crash recovery. Post-creation
resizing and automatic image migration remain deferred; a changed image/kit does not silently
replace an existing Machine or copy its login.
