# Engines for our own box

Read and run 2026-09-04 on Guillermo's Mac (macOS 26.6.2, Apple Silicon; Docker Desktop 4.81.0,
daemon stopped; `sbx` v0.39.0, not logged in; no `container`, `limactl`, `krunkit`). Under test:
**one minimal Linux image per runtime** — node, the pinned ACP bridge and the CLI, the child
`npm-bridge.ts` already spawns, run inside with blobot keeping stdio — and **one instance per
agent** with a *data* volume, a *workspace* volume, a door to the loopback mailbox and an egress
allowlist. Which engine runs it, and what each gives for free. [DOC] is read, [OBS] is run here.
Nothing was installed, logged in or started.

## The table

|engine|boundary|platforms|licence / login|image|volumes|host loopback door|egress?|boot / idle|blobot builds|
|---|---|---|---|---|---|---|---|---|---|
|**Docker Sandboxes** `sbx`|microVM per sandbox: nerdbox, own kernel, runc inside [OBS]|macOS 14+ arm64, Windows 11, Ubuntu 24.04+ KVM [DOC]|proprietary, DSSA [OBS]; `sbx login` [DOC]|any OCI image via `-t`, under a contract [DOC]|workspace at host path, `:ro`, `--clone`; sized volumes in a kit [OBS]|`host.docker.internal` → proxy → `localhost:<port>` once allowed [DOC]|yes, host proxy, deny-by-default [OBS]|50% host RAM, max 32 GiB [OBS]|one kit spec|
|**Docker containers**|namespaces; macOS/Windows share Desktop's one VM, Linux the host kernel [DOC]|macOS, Windows, Linux|Desktop DSSA, free under 250 staff / US $10 M [DOC]; Engine Apache-2.0|any OCI image|`-v`, `--mount`, named [OBS]|`host.docker.internal` / `--add-host …:host-gateway` [DOC]|no; `--network none` + proxy|shared VM|proxy, socket bridge|
|**Apple `container`**|one VM per container, Virtualization.framework [DOC]|macOS 26, Apple Silicon [DOC]|Apache-2.0, no login [DOC]|any OCI image [DOC]|bind (virtiofs), named ext4, tmpfs [DOC]|none; `sudo` pf redirect lost on reboot, or bind on the vmnet gateway [DOC]|no [DOC]|"sub-second start"; 1 GiB / 4 CPUs [DOC]|door, proxy, allowlist|
|**Lima**|VM per instance; OCI image in containerd *inside* [DOC]|macOS, Linux|Apache-2.0, no login [DOC]|cloud image, not OCI [DOC]|virtiofs/9p at host path [DOC]|`host.lima.internal` [DOC]|no [DOC]|4 GiB / 4 CPUs; "a second for a MicroVM… 10 seconds" otherwise [DOC]|guest, containerd, proxy|
|**krunkit / libkrun**|VM per process, HVF / KVM [DOC]|macOS 14+ arm64; Linux|Apache-2.0, no login|disk image; krunvm takes OCI [DOC]|virtiofs, unprotected [DOC]|gvproxy NATs host IP to `127.0.0.1` [DOC]|no|unpublished|rootfs, init, net, proxy|
|**gVisor** `runsc`|userspace kernel under Docker; Linux only [DOC]|Linux 5.6+|Apache-2.0|any OCI image [DOC]|Docker's|Docker's|Docker's|"small, mostly fixed" overhead [DOC]|one `daemon.json` line|
|**Firecracker / Cloud Hypervisor** (+ Kata)|KVM microVM; Linux only [DOC]|Linux servers|Apache-2.0|block rootfs (FC) or OCI via Kata [DOC]|virtio-fs (CH); block only (FC)|TAP|no|FC "<125 ms", "<5 MiB overhead" [DOC]|the hosted kind|

## Docker Sandboxes

The cask [OBS]: a `LICENSE` reading *"Docker Sandbox (sbx) - Proprietary Software … Use is subject
to the Docker Subscription Service Agreement"*, and `libexec/` holding `containerd-shim-nerdbox-v1`,
`nerdbox-kernel-arm64` (*Linux version 7.0.12*) and a 12 MB erofs rootfs with `init=/sbin/vminitd`
and *"guest runtime only supports runc options"*; the notices point the kernel patches at
`github.com/containerd/nerdbox`. A sandbox is a microVM booting containerd's `vminitd`, and the
image runs as a **runc container inside it** — Kata's shape as a shim. The VMM *"runs natively on all
three platforms using each OS's native hypervisor: Apple's Hypervisor.framework, Windows Hypervisor
Platform, and Linux KVM"*; *"You don't need Docker Desktop or Docker Engine to use `sbx`"* [DOC].

**A user image is the root.** `-t, --template   Container image to use for the sandbox (default:
agent-specific image)` [OBS]. The kit reference is the whole contract: *"The agent's container image must provide: A non-root `agent` user at UID 1000 with
passwordless sudo. A `/home/agent/` home directory owned by `agent`. HTTP proxy environment
variables (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`) preserved across sudo. The agent binary, either
baked in or installed with `setup.install`"* (docs.docker.com/ai/sandboxes/customize/kit-reference/)
— no sshd, init or in-VM daemon, though every Docker-authored kit still starts `FROM
docker/sandbox-templates:shell`, and a `node:22` base is unverified.

**Volumes are a kit's, not a flag's** [OBS]. Each built-in agent is an embedded kit spec. Claude's:
`image: docker/sandbox-templates:claude-code-docker`, `entrypoint: [claude,
"--dangerously-skip-permissions"]`, six `:443` hosts under `permissions.network.allow`, and
`volumes:` for `/home/agent/.claude/projects size: 2g` plus four siblings at `512m` — *"Volumes
persist across container recreation. With deterministic volume naming, the same sandbox name
reattaches to the same volumes … Block volumes are sparse ext4 images … Every volume must set a
size."* Codex's writes `sandbox_mode = "danger-full-access"`; Cursor's runs `--yolo`; no fx kit. Kits
ship as *"directory, ZIP, or OCI"*; a blobot kit would be the whole integration, declared.

**Network and credentials** [OBS]. `sbx policy init <allow-all|balanced|deny-all>` *"must be run
before … starting a sandbox for the first time"*; `allow network` takes domains, `*.` wildcards,
`:port` and `**`; `--sandbox` scopes; deny wins. *"Direct external UDP and ICMP are blocked …
Sandboxes cannot communicate directly with each other or share a network with your host"* [DOC,
security/isolation/]. `sbx ports` publishes sandbox→host only. `sbx secret set`: *"the proxy uses stored secrets to authenticate API requests on
behalf of the agent. The secret is never exposed directly"*; OAuth rides sentinels
(`sk-ant-oat01-proxy-managed` into `~/.claude/.credentials.json`). **The limit that bites**:
*"Proxy-managed OAuth isn't supported for third-party sandbox agents, including kits that extend a
built-in agent"* [DOC, configuration/credentials/] — a blobot image's `claude /login` lands in the
VM's `/home/agent`, which is the data volume anyway, and the CLI still owns it.

**Login.** `sbx login` *"opens a browser for Docker OAuth"*; *"The `sbx` CLI is free to use,
including for commercial and professional work, with no per-seat fee"* [DOC, faq/]. Strings [OBS]:
*"By logging in, you agree to our Subscription Service Agreement"*, *"cannot access credential store
(run 'sbx login')"*.

**A hosted kind exists** [OBS]: `sbx --cloud`, and `sbx move` *"captures the source sandbox's
filesystem as a template, transports the OCI image across the local↔cloud boundary"*, egress rules
carried, secrets never. The same image, on Docker's cloud.

## Plain Docker

*"Docker Desktop runs the Docker Engine inside a lightweight Linux virtual machine"* (desktop/features/vmm/),
one for every container; on Linux the host kernel — which is why srt's Linux design exists:
*"bwrap --unshare-net … creates a completely isolated network namespace with NO network access …
Host side: Run socat bridges that listen on Unix sockets and forward to host proxy servers …
Sandbox side: Bind the Unix sockets into the isolated namespace … Domain filtering happens at the
host proxy level, not the sandbox boundary"* (`linux-sandbox-utils.js`, srt 0.0.75 [OBS]). The
container form is `--network none` plus a bind-mounted socket; the same code serves Apple
`container`.

The DSSA §3.2 restricts unpaid Desktop use *"to use for a non-commercial open source project and/or
(ii) use in a commercial undertaking with fewer than 250 employees and less than US $10,000,000 …
in annual revenue"*; Engine's terms *"aren't changing"* (subscription/desktop-license/). The boundary fact is **CVE-2025-9074**, CVSS 9.3: *"allows local
running Linux containers to access the Docker Engine API via the configured Docker subnet, at
192.168.65.7:2375 by default"* (NVD), fixed in 4.44.3 — *"launch additional containers without
requiring the Docker socket to be mounted … Enhanced Container Isolation (ECI) does not mitigate
this vulnerability"* (release notes). Engine on Linux was unaffected; the shared VM was the flaw. Anthropic's devcontainer is the other
first-party allowlist: `init-firewall.sh` builds an `ipset` of `api.github.com/meta`,
`registry.npmjs.org`, `api.anthropic.com`, `sentry.io`, `statsig.com`, then `iptables -P OUTPUT
DROP`, needing `NET_ADMIN`/`NET_RAW` (anthropics/claude-code `.devcontainer/`).

## Apple `container`

*"It runs a lightweight VM for each container that you create"*; *"Each container has the isolation
properties of a full VM"* (docs/technical-overview.md). *"Supported on macOS 26 … we do not support
older versions"*, Apple Silicon, Apache-2.0, a per-user launch agent; linking `Containerization`
needs the `com.apple.security.virtualization` entitlement. Bind mounts are virtiofs; named volumes
are ext4 sparse images (docs/volumes.md). The door is the gap: each container has an IP on
`192.168.64.0/24` reachable from the host, but nothing like `host.docker.internal`. The documented
route, `sudo container system dns create host.container.internal --localhost 203.0.113.113`, is a
pf redirect: *"Creating a localhost domain disables Private Relay. The local domain packet filter
rule is removed on a restart"* (docs/networking.md); a maintainer's alternative binds the service on
the vmnet gateway (discussion 1170), which is not `127.0.0.1`. No egress control; `--internal`
networks lack DNS. Version 1.3.1 (2026-08-29), monthly minors.

## Lima, krunkit

Lima is a VM per instance from a **cloud image**; the OCI image runs in the guest's containerd, so
the boundary is VM + container and the door is `host.lima.internal` (192.168.5.2 → host loopback,
lima-vm.io/docs/config/network/user/). Its 2.0 (2025-11-06) says why: *"run an AI coding agent inside
a VM in order to isolate the agent from direct access to host files and commands"* (CNCF blog) —
but no agent template, no egress key, and the container-driver PRs (#3839 Apple Container, #3840
Docker/Kata) closed unmerged 2026-07-04. krunkit
takes a raw/qcow2 disk on macOS 14+; krunvm takes an OCI image through buildah over virtiofs, whose
README warns *"libkrun does not provide any protection against the guest attempting to access other
directories in the same filesystem"*; gvproxy NATs its host IP to `127.0.0.1`. All Apache-2.0, no
login, all leaving the proxy to blobot.

## gVisor, Firecracker, Cloud Hypervisor

**gVisor**: *"an application kernel that implements a Linux-like interface"*; `sudo runsc install`
adds a Docker runtime under Docker's own networking; *"Today, gVisor requires Linux"*
(gvisor.dev/docs). A middle boundary for one `daemon.json` line; not offered on Desktop.
**Firecracker**: KVM microVMs, *"Boot in <125ms"*, *"<5 MiB overhead per VM"*, rootfs an ext4 block
image, OCI reaching it through firecracker-containerd's devmapper or Kata's `io.containerd.kata-fc.v2`;
Linux hosts only. **Cloud Hypervisor**: KVM/MSHV, Rust, virtio-fs so Kata mounts the OCI bundle
directly, Apache-2.0/BSD-3. Kata is what makes *"same image in our cloud"* literal:
`io.containerd.kata.v2` over Cloud Hypervisor, Firecracker or QEMU, image unchanged.

## How the market builds the per-agent image

|image|base|agent install|size|
|---|---|---|---|
|`docker/sandbox-templates:*`|Ubuntu, `agent` + sudo, Node/Python/Go/Java [DOC]; source unpublished|kit `curl … claude.ai/install.sh \| bash` as root [OBS]|Hub compressed: claude-code 610 MB, `-minimal` 300, codex 758, cursor-agent 595, opencode 1011, shell 512|
|`ghcr.io/openai/codex-universal`|ubuntu:24.04, five Pythons, four Nodes, Rust, Go, Java|**none** — the sandbox, not the agent; agent phase *"internet access is off by default"*|—|
|Claude Code on the web|*"a fresh VM running Ubuntu 24.04 on x86_64"*; *"Replacing the base image entirely isn't supported yet"*|n/a|n/a|
|Claude devcontainer|`node:20`, `USER node`|`npm install -g @anthropic-ai/claude-code@${VERSION}`|—|
|OpenHands `ghcr.io/openhands/agent-server`|`nikolaik/python-nodejs:python3.13-nodejs22-slim`, uid 10001, HTTP on 8000|`INSTALL_ACP_PROVIDERS=claude-code,codex,gemini-cli`: Node 22.19 into `/acp-node` plus the ACP bridges|—|
|`ghcr.io/anomalyco/opencode`|`alpine` + `libgcc libstdc++ ripgrep`|one static binary|~60 MB|

OpenHands is blobot's shape exactly: a private node and the ACP bridges beside the vendor CLI.
Official installs, sizes measured here on arm64 [OBS]:

- **claude** — *"Native Install (Recommended)"* `curl -fsSL https://claude.ai/install.sh | bash -s <ver>`,
  or signed apt/rpm/apk repos; *"the npm package installs the same native binary … does not itself
  invoke Node"*; `DISABLE_UPDATES` to pin; *"rejects [`--dangerously-skip-permissions`] when launched
  as root"*; creds in `~/.claude/.credentials.json`, relocatable by `CLAUDE_CONFIG_DIR`. 189 MB.
- **codex** — npm `@openai/codex` is a 13 KB node shim over a per-platform dependency (285 MB); the
  release `codex-aarch64-unknown-linux-musl` (87 MiB) needs no node. `~/.codex/`.
- **opencode** — one Bun-compiled binary (129 MB; ~60 MiB tarball), musl builds, the vendor's
  alpine Dockerfile; `~/.local/share/opencode/`.
- **fx** — Zig, 6.5 MB; `fx-linux-aarch64` 4.9 MiB; `~/.fx/`. Apache-2.0.
- **cursor-agent** — 559 MB unpacked (169 MiB tarball): its **own node** (146 MB) and glibc `.node`
  addons, so Debian/Ubuntu, not alpine; `CURSOR_CONFIG_DIR`; auto-updates by default.

Node is in every image regardless, because the Claude and Codex bridges are npm packages.

## By criteria

- **Strongest boundary on macOS**: a VM per agent — `sbx` and Apple `container`; Desktop's
  containers share one VM, and CVE-2025-9074 is what that cost. `sbx` has a documented door;
  `container`'s costs `sudo` or a non-loopback bind.
- **Strongest on Linux**: `sbx` (KVM microVM) or Kata over Firecracker / Cloud Hypervisor; gVisor
  the middle; plain Engine the host kernel.
- **No login and no licence**: Apple `container`, Lima, krunkit, gVisor, Engine, Firecracker, Cloud
  Hypervisor. Not `sbx`; Desktop only under its thresholds.
- **Least for blobot to build**: `sbx` — image, volumes, allowlist, proxy and door are one declared
  kit, the login in the data volume rather than at the proxy. Every other engine leaves the proxy
  and the door to blobot; Lima and krunkit leave the guest too.
- **Same image as a future hosted kind**: unchanged under `sbx` (local and `--cloud`), Docker,
  gVisor, Apple `container` and Kata over Cloud Hypervisor; Firecracker needs a block conversion;
  Lima and krunkit need a guest around it.
