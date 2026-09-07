# RC5 engine admission: installation and SSH control

Checked 2026-09-05 for **A box's lifecycle, engine setup, and the pool**. This note is read-only research; installation and live checks belong to the implementing session. No binary or installer was executed, no release archive downloaded, no daemon contacted, and no settings changed by this investigation.

The final section records the implementing session's subsequent authorized mutations and
observations separately from the read-only investigation above.

## Release and macOS installation

Latest stable remains **v0.39.0**. **v0.42.0-rc5** is a prerelease published `2026-09-04T18:21:55Z`; it is newer than the RC2 inspected in the previous session. [Stable API](https://api.github.com/repos/docker/sbx-releases/releases/latest), [RC5 API](https://api.github.com/repos/docker/sbx-releases/releases/tags/v0.42.0-rc5).

Official RC5 assets, metadata fetched directly from that API:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [DockerSandboxes-darwin.tar.gz](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-darwin.tar.gz) | 136590091 | `670ce2f469fe2a9d36046e448eb69769c0ebf77ac8ad9215b657dfd4c073916a` |
| [DockerSandboxes-darwin.dmg](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-darwin.dmg) | 149566453 | `af36980cfc4f863a12c52288f896fb31883dd9fcf4f06abd4dd0ff4ed66c7f7c` |

The manual macOS instructions say to extract the tar archive with `tar -xzf DockerSandboxes-darwin.tar.gz`; they do not document an install script. They also document `brew install docker/tap/sbx@rc` and warn that stable, RC, and nightly casks conflict. An explicit RC tag must be used because `/releases/latest` excludes prereleases. [Official installation README](https://github.com/docker/sbx-releases#manual-install-from-release-artifacts).

The current [official RC cask](https://raw.githubusercontent.com/docker/homebrew-tap/main/Casks/sbx%40rc.rb) pins RC5 and the DMG hash above. It installs `bin/sbx` and shell completions, requires Apple silicon/macOS Sonoma, and has no post-install script in its 26-line definition. **Its uninstall preflight invokes the installed binary's `daemon stop`.** Switching channels through Homebrew therefore has a daemon side effect, not merely a symlink change. Verify absence of foreign work before uninstalling. No claim about scripts or runtime assets inside the tar archive is made here; inspect the verified archive before using it.

## Public daemon commands and documentation gaps

The CLI reference verifies these command forms:

```sh
sbx daemon status --json
sbx daemon start -d
sbx daemon stop
sbx daemon restart
```

`daemon start` additionally exposes `--policy` to initialize global network policy; this is a separate shared-state mutation, not a necessary SSH isolation flag. No separate socket/data-directory flag is listed in these references or the top-level reference. **Absence from documentation is not proof that an internal override does not exist; no supported isolated daemon invocation was established.** [Start](https://docs.docker.com/reference/cli/sbx/daemon/start/), [status](https://docs.docker.com/reference/cli/sbx/daemon/status/), [stop](https://docs.docker.com/reference/cli/sbx/daemon/stop/), [restart](https://docs.docker.com/reference/cli/sbx/daemon/restart/), [top-level CLI](https://docs.docker.com/reference/cli/sbx/).

Treat setup as shared administration. The previous [local binary inspection](09-sbx-kit-and-ssh-boundary.md#follow-up-exact-rc2-control-inspected-without-installation) established that settings are daemon-owned and persistent, and that even a query may auto-start an inaccessible daemon. A daemon status check alone is not a complete proof that listing/exec is healthy.

## SSH admission

RC5 advertises an explicit forwarding-disable control and optional fixed socket path. It also supports mount-free `create` by omitting workspace paths; `run` still defaults to a workspace mount. Kit references now occupy the agent positional argument. [RC5 release notes](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5).

The exact keys/commands below were **previously inspected in RC2**, not executed or newly verified against RC5 in this research:

```sh
sbx settings get --json ssh.agentForwardingEnabled
sbx settings set ssh.agentForwardingEnabled false
sbx settings get --json ssh.agentSocketPath
```

RC2 embeds a warning that existing forwarders require a daemon restart after either setting changes. The old report contains the exact descriptions and help behavior. RC5's release notes confirm the capability, but neither the JSON response schema nor its default/effective value is specified by the web pages inspected. Confirm with RC5 help/setting output before implementing its parser. [Prior binary evidence](09-sbx-kit-and-ssh-boundary.md#follow-up-exact-rc2-control-inspected-without-installation).

**Proposed acceptance check, not an upstream guarantee or an executed result:** after an authorized compatible-daemon restart, require recognized boolean `false`, matching client/server version, and a throwaway box whose fixed known relay endpoint is absent even when checked as root. The guest's missing `SSH_AUTH_SOCK` alone does not prove absence. A refused connection is weaker than endpoint absence, and a relay with zero identities still exposes a signing interface. Unknown JSON, permissions errors, timeouts, and ambiguous state should fail admission. Docker documents that forwarded agents expose signing capability even though private keys stay on the host. [SSH credentials model](https://docs.docker.com/ai/sandboxes/configuration/credentials/#ssh-agent).

For a root guest probe, the verified command shape is `sbx exec -u root NAME COMMAND...`; exec automatically starts a stopped sandbox. Do not launch an unapproved foreign box just to inspect it. [Exec reference](https://docs.docker.com/reference/cli/sbx/exec/).

## Upgrade and runtime caveats

- The current web `create` reference still requires `AGENT PATH`, while RC5 release notes allow no path. Prefer the pinned RC5 binary's help and a fixture for its exact contract. [Create reference](https://docs.docker.com/reference/cli/sbx/create/).
- RC5 reports disk-volume cleanup fixes, a new default 10 GB Docker volume, and CPU/memory kit resources. Explicit product budgets and persistence/adoption checks remain necessary; these notes are not evidence that all old runtime/template state survives an upgrade unchanged. [RC5 release notes](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5).
- Template images are separate runtime state managed by `template ls/load/save/rm`; an executable-only install does not demonstrate template readiness. [Template reference](https://docs.docker.com/reference/cli/sbx/template/).
- Docker sign-in remains documented. The telemetry opt-out is `SBX_NO_TELEMETRY=1`; apply it to both administrative and ordinary child-client launches rather than relying on a parent shell's optional environment. [FAQ](https://docs.docker.com/ai/sandboxes/faq/).

## Authorized installation and fixture probe — observed 2026-09-05

Guillermo approved the current candidate, daemon-wide forwarding disable and a restart only
without interrupting unrelated sandboxes. `sbx ls --json` returned an empty sandbox list before
uninstall and again before restart. No existing sandbox was stopped or deleted.

- Downloaded the official tar to `/private/tmp/blobot-sbx-rc5-install.wsOUYz/`; its SHA-256
  matched the API's `670ce2f469fe2a9d36046e448eb69769c0ebf77ac8ad9215b657dfd4c073916a`.
  Inspected the archive and help before daemon operations. This unpacked copy is not the active install.
- Switched from Homebrew `sbx` to the official `docker/tap/sbx@rc` cask. The local tap was
  stale and first installed RC4. Fast-forwarded **only** Docker's clean tap, then upgraded to
  RC5. RC4 was never used to start a sandbox or daemon. No other package was upgraded.
- Active `/opt/homebrew/bin/sbx version` now returns
  `v0.42.0-rc5 ca4a4bd42035628137d78c5a0bef5c0d3301a35a`.
  Homebrew removed the old binary distributions and RC4 download cache; these can be
  reinstalled. Existing template images and engine data were retained.
- The first RC5 daemon start cleared `SSH_AUTH_SOCK` but did not yet set the telemetry opt-out.
  That short startup must **not** be described as telemetry-free. The subsequent authorized
  restart and every fixture command used `SBX_NO_TELEMETRY=1`.
- `settings get --json ssh.agentForwardingEnabled` initially returned `type: "bool"`,
  `value: true`, `source: "default"`, `requires_restart: true`. Set it to false, then restarted
  after rechecking the empty sandbox list. Readback: the same key and bool type,
  `value: false`, `source: "override"`, `requires_restart: true`.
- `daemon status --json` returns `status` and `socket` (also `logs` while running); **it does
  not return a server version**. Do not invent such a field in an admission parser.

Added the opt-in [RC5 fixture](../../../packages/core/src/machines/sbx/admission.live.test.ts),
run with `BLOBOT_LIVE_SBX_RC5=1` under core's Vitest. It checks the already-running engine and
the already-cached shell template before creating its own root kit, with **no workspace path**,
2 CPUs, 2 GiB RAM and two 512 MiB volumes. These are fixture budgets, not product defaults.
It performs no install, setting mutation or daemon restart itself.

Observed: **1 test passed in 11.19 seconds**. A fake host SSH-agent Unix socket was deliberately
present in each client's environment; it received zero connections. `/run/ssh-agent.sock`
was absent (ENOENT, not a permissions error) at UID 1000 and UID 0 before and after stop/exec.
Both private volumes retained their fixture data after stop/exec.

The first assertion expected zero virtiofs mounts and failed. Inspection showed **exactly two**,
`/etc/hosts` and `/etc/resolv.conf`, both read-only mounts of engine-generated network files.
The corrected assertion checks those exact paths/modes; there was no host Workspace or home
mount. Do not describe mount-free create as literally zero virtiofs mounts.

Each attempt removed its exact disposable fixture sandbox (including volume data); final
`sbx ls --json` returned `{"sandboxes":[]}`. No model, provider login, real SSH key, repository
content or paid turn participated. This establishes the measured SSH mechanism on RC5, not
production image, network-policy, Workspace or whole-Machine admission acceptance.
