# Integrating installation of the pinned sbx RC5

2026-09-06. **RC5 has official artifacts for macOS arm64 and Linux arm64/amd64. A Wayfinder action can download and verify a fixed artifact without exposing a terminal. macOS has a documented archive route; the documented Ubuntu package route changes shared system state and requires administrator privileges. Docker OAuth still requires the user's browser interaction.** A completely silent, fresh-host installation/login flow has not been measured.

This review reused [research10's installation/admission evidence](10-sbx-rc5-engine-admission.md) and [research13's lifecycle/authentication contract](13-sbx-lifecycle-command-contract.md). It read official release metadata, docs and casks, the already-downloaded Mac archive, installed-binary help/signatures, and bounded HTTP range reads of Ubuntu package control metadata. No installation, extraction to host disk, daemon mutation, login, VM, provider or credential access occurred. Only this note was written.

## Exact distribution and integrity

Pin tag **`v0.42.0-rc5`**, client/server revision **`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`**, server API **`0.28.0`**. The release was published `2026-09-04T18:21:55Z`. Use its explicit tag, never `/latest` or a moving RC channel. Docker states RCs are absent from apt/dnf repositories; those carry stable releases. The current `sbx@rc` cask points to RC5 but is movable. [Official RC instructions](https://github.com/docker/sbx-releases#release-candidates), [release metadata](https://api.github.com/repos/docker/sbx-releases/releases/tags/v0.42.0-rc5).

| Platform / artifact | Compressed bytes | Publisher SHA-256 |
| --- | ---: | --- |
| [macOS arm64 tar.gz](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-darwin.tar.gz) | 136590091 | `670ce2f469fe2a9d36046e448eb69769c0ebf77ac8ad9215b657dfd4c073916a` |
| [Linux amd64 tar.gz](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-linux-amd64.tar.gz) | 115325284 | `2b528d5e2512e883678784636cefe68e459de38673f83a42848fdb9f42b5cf44` |
| [Linux arm64 tar.gz](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-linux-arm64.tar.gz) | 102799717 | `739406c2bf06c7dfc9dbfc5d5e0f2d49fd2ea1327273cf27b715fbf9293868a2` |
| [Ubuntu 24.04 amd64 deb](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-linux-amd64-ubuntu2404.deb) | 94530904 | `2d167aeb4885ef6427cb744aa5ac4434fe7f02862e21e3a859054cec2f25221c` |
| [Ubuntu 24.04 arm64 deb](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-linux-arm64-ubuntu2404.deb) | 82477424 | `77f70284a37890219c7c2df42d379fc0ce46334d6127c489386a8a5702e43da4` |
| [Ubuntu 26.04 amd64 deb](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-linux-amd64-ubuntu2604.deb) | 94511052 | `b733beccc27c438e1553966304332006b389ba2e0579af891a302ed8e2ed273d` |
| [Ubuntu 26.04 arm64 deb](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc5/DockerSandboxes-linux-arm64-ubuntu2604.deb) | 82476148 | `5d6014d636d5c61ca38be945229ffa7905e8c6a1c203ea9a75e2037bd3d81ed4` |

These are the API's published digests, not new full Linux-download verifications. The existing Mac tar was independently rehashed and matches. The release also publishes per-platform provenance/SBOM JSON; this review did not verify provenance signatures and does not equate a GitHub release-page commit signature with artifact attestation. The Mac DMG used by the official cask has SHA-256 `af36980cfc4f863a12c52288f896fb31883dd9fcf4f06abd4dd0ff4ed66c7f7c`. [Official cask](https://raw.githubusercontent.com/docker/homebrew-tap/main/Casks/sbx%40rc.rb).

An actionable downloader can pin the table's URL, byte length and SHA-256 in the application, stream to an owned staging path, verify before execution, validate archive paths/types, preserve distribution permissions/layout and atomically publish the completed version. These are integration steps, not an upstream auto-installer already validated by this research.

## Installation, permissions and shared effects

**macOS:** Docker supports Apple silicon and macOS 14 Sonoma or later. Its manual instructions are `tar -xzf DockerSandboxes-darwin.tar.gz`; they do not require Homebrew. The inspected 59-member tar has top-level `bin/`, `libexec/`, `completions/`, `LICENSE` and `THIRD-PARTY-NOTICES`. Keep the complete distribution, especially the shim, kernel/rootfs and `libexec/lib/libsailor.dylib`; copying only `bin/sbx` is insufficient. Required CLI/helper entries carry executable mode 0755. [Manual installation](https://github.com/docker/sbx-releases#manual-install-from-release-artifacts), [platform prerequisites](https://docs.docker.com/ai/sandboxes/install/).

A user-owned version directory plus an absolute executable path is a concrete candidate that avoids changing system PATH or invoking Homebrew. Prior research10 used an unpacked copy for inspection, but a fresh daemon from a Wayfinder-owned prefix has **not** been tested. The installed Mac `sbx` reports Docker Developer ID team `9BNSXJN65R`; `codesign --verify --strict` succeeded for it and its shim. The shim carries `com.apple.security.hypervisor=true`. This does not certify Gatekeeper/notarization behavior after a new app-driven download, and no quarantine removal or signature alteration was attempted.

Homebrew's alternative is shared administration: its RC cask conflicts with stable/nightly, installs the command/completions, and **runs `sbx daemon stop` during uninstall preflight**. An invisible “switch cask” must not silently interrupt unrelated Machines. A private executable prefix also does not establish a private daemon or private account/state.

**Linux:** the documented supported baseline is Ubuntu 24.04+ on amd64/arm64, working KVM and user membership in `kvm`; nested environments need nested virtualization. Membership changes require a new login/session. Docker Engine and Desktop are not prerequisites. The documented pinned RC package path is administrator-run `apt install ./<matching-release>.deb`; the generic repository/convenience-script route does not select this RC. A generic Linux tar exists, but artifact availability is not a support promise for arbitrary distributions. [Installation/prerequisites](https://docs.docker.com/ai/sandboxes/install/), [RC package instructions](https://github.com/docker/sbx-releases#release-candidates).

Bounded in-memory reads of the four Ubuntu deb control archives establish:

- Package `docker-sbx`; version `0.42.0~rc5-1~ubuntu.24.04~noble` or `0.42.0~rc5-1~ubuntu.26.04~resolute`, matching architecture.
- Dependencies: `ca-certificates`, `e2fsprogs`, `dbus-daemon`, `gnome-keyring`; recommendation: `apparmor`.
- Distribution paths include `/usr/bin/sbx`, `/usr/libexec/containerd-shim-nerdbox-v1`, kernel/rootfs and `libsailor.so`; `/etc/apparmor.d/docker-sbx-nerdbox-shim` is a conffile.
- The inspected **amd64 Ubuntu 24.04** postinst creates a local AppArmor include and reloads the profile when enabled. Its prerm executes `killall sbx` on remove/purge. Those maintainer scripts were read, never executed; they were not independently compared across all four packages.

Thus package installation/removal affects system packages, dependencies and AppArmor, and removal can affect unrelated sbx processes. A GUI privilege mechanism can keep the terminal hidden, but cannot truthfully make required administrator authorization or new group membership invisible. Linux tar deployment without package integration, dependency setup and AppArmor/KVM validation remains unmeasured; it must not be advertised as verified rootless installation merely because unpacking itself can be unprivileged.

## Daemon and login without a terminal panel

The native lifecycle commands are `sbx daemon start -d`, `sbx daemon status --json`, and `sbx version --json`. Run the chosen absolute binary with the existing scrubbed client environment and `SBX_NO_TELEMETRY=1`. Compare the **server** revision with the client before declaring the engine ready. Do not pass `--policy` as routine startup: it initializes global network policy. Settings, authentication, image state and daemon operations are shared across users of that per-user engine; status alone is not proof of an isolated Wayfinder instance. [Daemon start](https://docs.docker.com/reference/cli/sbx/daemon/start/), [prior exact JSON](13-sbx-lifecycle-command-contract.md#daemon-status-and-version).

Docker documents `sbx login` opening the user's browser for OAuth. Wayfinder can launch the CLI as a managed child and display progress/results in its own UI, with no terminal panel. **This is a candidate integration, not a measured hidden-stdio login:** RC5 offers no documented JSON login event stream, device-code-only flag, `--no-browser` flag or login-status subcommand. Browser opening failure, stdin/PTY requirements, cancellation and callback completion still need a controlled integration test. Do not invoke login as a readiness query. The documented fully noninteractive alternative is `--username … --password-stdin` with a user-provided token; it requires credential input and is not a silent substitute for browser consent. [Install/sign-in flow](https://docs.docker.com/ai/sandboxes/install/#sign-in), [login flags](https://docs.docker.com/reference/cli/sbx/login/).

Research13 observed `sbx diagnose --json` returning an `Authentication` check with `status: pass`. Use recognized structured outcomes without displaying arbitrary diagnostic details or invoking `--upload`; non-pass is not automatically “signed out”. On Linux, Docker documents Secret Service storage with a protected-file fallback when no keychain is available. Treat this as engine-owned authentication state rather than a credential file for Wayfinder to parse. [Authentication evidence](13-sbx-lifecycle-command-contract.md#engine-sign-in-readiness-without-reading-credentials), [official FAQ](https://docs.docker.com/ai/sandboxes/faq/#can-i-use-docker-sandboxes-on-headless-linux).

The remaining concrete gates are a fresh Mac archive-prefix start/admission test, supported Linux package installation and KVM/AppArmor checks in an appropriate disposable host, and a managed browser-login/cancellation test. No resize or preservation work was reopened.

## Additional integration fact: sandbox names

The [official `create --name` reference](https://docs.docker.com/reference/cli/sbx/create/) and exact RC5 help explicitly allow letters, digits, hyphens and **periods**, require an alphanumeric first character and at least **two characters**, and reserve `default`. They publish **no maximum length**. The [0.39 release notes](https://docs.docker.com/ai/sandboxes/release-notes/#0390) specifically describe correcting these rules. The kit-name length constraint is a different contract and must not be imported here.

For an Agent-ID domain that excludes periods, replacing `_` with `.` is reversible and length-preserving while leaving existing hyphen-only names unchanged; `slug_hex` becomes `slug.hex`. Reversibility is an application-domain property, not an sbx guarantee: if original IDs can contain periods, the mapping can collide. This review did not execute sandbox creation to probe an undocumented maximum.
