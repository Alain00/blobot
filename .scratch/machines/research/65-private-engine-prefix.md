# RC5 macOS engine from a private version prefix

2026-09-06. **The complete official macOS arm64 RC5 archive successfully ran its daemon and a disposable shell VM from a private prefix, retaining valid Docker signatures.** The previous daemon was restored, the VM and prefix removed, and the original two cached templates retained. This establishes relocation on this already-admitted host; it does not establish a fresh-host Gatekeeper, login or Linux installation flow.

The [executed engine fixture](65-private-engine-prefix-fixture.mjs) and [sanitized receipt](65-private-engine-prefix-results.json) are the primary measurement. The live round ran `01:05:41.774–01:05:58.047 UTC`, after [research64](64-production-box-launch-acceptance.md) released the empty engine. No production source, tracker or lockfile was changed by this research; no commit was made.

## Archive, extraction and signatures

The pre-existing official `DockerSandboxes-darwin.tar.gz` was rehashed before extraction: **136590091 bytes**, SHA-256 **`670ce2f469fe2a9d36046e448eb69769c0ebf77ac8ad9215b657dfd4c073916a`**, matching [RC5 release metadata](https://api.github.com/repos/docker/sbx-releases/releases/tags/v0.42.0-rc5) and [research62](62-engine-installation-integration.md). No download was needed. Docker documents extracting this archive with `tar -xzf`; using a fixed private prefix is the measured integration here, not a separate upstream installer API. [Official manual distribution](https://github.com/docker/sbx-releases#manual-install-from-release-artifacts).

The full exact member list, type, mode, size and PAX-key names are in `archive.members` in the receipt; actual extracted paths are separately in `extracted.paths`.

| Representation | Exact observed counts and types |
| --- | --- |
| Python `tarfile` logical members | 59: 51 regular (`typeflag 0`), 8 directories (`typeflag 5`); total regular payload 358751537 bytes |
| Native `/usr/bin/tar -tzf` and `-tvzf` | 58 names / 58 detail rows; only `-` and `d` types |
| Native extraction | 58 disk entries: 50 regular, 8 directories; all modes 0755 or 0644 |
| Links / devices / FIFOs / unsafe paths | None in this exact archive; no duplicate, absolute, empty-component, `.` or `..` paths |

The difference is **`libexec/._nerdbox-rootfs-arm64.erofs`**, a regular 9573-byte AppleDouble metadata member. Native macOS tar consumes it instead of leaving that file on disk. The extracted rootfs has `com.apple.cs.CodeDirectory`, `com.apple.cs.CodeRequirements` and `com.apple.cs.CodeSignature` xattrs; it also has the OS's `com.apple.provenance` xattr. The tar's PAX headers use both `LIBARCHIVE.xattr.*` and `SCHILY.xattr.*` for the three signature attributes, plus `mtime`. Preserve the native extraction behavior and full layout; a validator must not misreport the missing AppleDouble disk entry as lost payload.

Top-level entries are `bin`, `libexec`, `completions`, `LICENSE` and `THIRD-PARTY-NOTICES`. The required runtime paths measured below are `bin/sbx`, `libexec/containerd-shim-nerdbox-v1`, `libexec/lib/libsailor.dylib`, `libexec/nerdbox-rootfs-arm64.erofs`, plus the distributed `libexec/nerdbox-kernel-arm64` and filesystem tools. The archive also contains the complete `libexec/llama` distribution and completions. **`libexec/llama/llama-server` is mode 0644 in the publisher archive**; this test preserved that mode and did not exercise local-model serving.

Native extraction into an owned `/private/tmp/…/engine/v0.42.0-rc5` directory preserved every materialized member's type, mode and size. The extracted CLI SHA-256 is **`e0bc95e6d4b80cb9a6b84ae8b2f2f540d5289fec9347be40b01f7af5317f007a`**, equal to the installed RC5 CLI. `codesign --verify --strict` passed for **sbx, llmman, shim, libsailor, mkfs.ext4, mkfs.erofs and the signed rootfs**; all seven displayed Docker team **`9BNSXJN65R`**. The shim retained `com.apple.security.hypervisor=true`. No signature, entitlement or quarantine attribute was altered. This does not verify every optional llama binary's signature or prove notarization admission on a new host.

## Daemon and helper relocation

Before mutation, `sbx ls --json` was empty, the live process resolved to `/opt/homebrew/Caskroom/sbx@rc/0.42.0-rc5/bin/sbx`, and client/server agreed on **v0.42.0-rc5**, revision **`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`**, API **0.28.0**. SSH forwarding was read as false. Both the initial and immediate pre-stop inventories were empty.

The fixture stopped the empty daemon, observed `status: stopped` and no daemon process, then invoked the private absolute binary with `daemon start -d`. Its PATH contained the private `bin` and standard system directories, excluding Homebrew. The resulting daemon process's actual executable was the private `bin/sbx`; client/server again matched. `diagnose --json` gave **12 pass, zero warn/fail/skip**, both before and under the private executable. Only check names/statuses and summary were retained, never diagnostic message/detail/hint or credential contents. Starting detached is documented; `--policy` would initialize global policy and was deliberately not supplied. [Official daemon flags](https://docs.docker.com/reference/cli/sbx/daemon/start/).

One UUID shell VM used the already-cached `docker.io/docker/sandbox-templates:shell-docker`, image id `5fc81bc7a127`, 2 CPUs, 2 GiB memory, and explicit 512 MiB home/Docker volumes. Its custom kit had `/bin/sh`, no credentials and no workspace/host mount. No template load/pull, provider, login, inference or model-serving command was invoked. The guest returned `prefix65-ok` after checking its architecture was `aarch64`.

Host `ps` showed that VM's shim executable inside the private prefix. A bounded `lsof` read of that shim showed these opened prefix-relative paths, and only these paths were retained:

```text
libexec/containerd-shim-nerdbox-v1
libexec/lib/libsailor.dylib
libexec/nerdbox-rootfs-arm64.erofs
```

This directly measures helper/library/rootfs relocation. The kernel was present in the preserved distribution, but was not still open at this observation; it is not separately attributed by `lsof`. The fixture did not claim that the custom kit's default command was a provider launch: the actual measured guest operation was the explicit shell `exec`.

## Production installer comparison

The candidate `validateSbxArchiveMembers` was imported from actual `packages/core/src/machines/sbx/installation.ts` and accepted the real native tar outputs: **58 names and 58 detail rows**. The source hash is in the receipts. No mismatch exists between the tar's names/types/modes and its current validation rules.

The additional [source-level installer fixture](65-private-installer-fixture.mts) precaches a copy of the verified tar in a second owned temporary directory and calls **`new SbxInstaller(temp).install()`**, with a `fetch` implementation that throws if called. It makes no sbx/VM/daemon invocation.

Its [first receipt](65-private-installer-first-results.json) caught a real publication blocker: `codesign -R` was given `anchor apple generic …` and interpreted it as a **file path**, returning `invalid requirement specification`. Cleanup removed the staging/root; fetch calls were zero. The host's primary [`codesign(1)` manual](/usr/share/man/man1/codesign.1), “SPECIFYING REQUIREMENTS”, specifies that a literal requirement argument begins with `=`. This exact argv requirement was then independently verified against the installed CLI and shim:

```text
-R
=anchor apple generic and certificate leaf[subject.OU] = "9BNSXJN65R"
```

The implementation owner corrected the argument; this research did not edit production. The [final source-level receipt](65-private-installer-results.json), `01:08:44.848–01:08:46.319 UTC`, **passes** against source SHA-256 `d5329344cbfc8e84c4cf4b4c24c83804451a01d9992bb83a20c538f4d4ff8e31`, identical before/after the call. It returned `engine/v0.42.0-rc5/bin/sbx`, with the expected CLI SHA above, no remaining `.install-*` staging directory and **zero fetch calls**. The real installer's strict Docker requirement checks for CLI/shim completed; an additional strict Docker requirement check of the extracted rootfs also passed. The second temporary root was removed. No engine operation was made. This measures the successful extraction/verification/rename path, not atomicity under crash or concurrent install races.

## Shared scope, cleanup and limits

**A private distribution prefix still uses the same per-user daemon, state and account.** Existing template references remained visible. This test intentionally performed a coordinated handoff with an empty engine, never concurrent daemons or a claim of account isolation. No global preference, network policy, account setting, PATH installation, package manager, launch service or system directory was changed. Engine-owned operational logs/state necessarily changed during normal start/create/remove operations; this is not a bit-identical snapshot of that shared state.

The owned VM was removed; an empty inventory was checked before stopping the private daemon; `/opt/homebrew/bin/sbx daemon start -d` restored the previous resolved executable. Final client/server matched, `diagnose` again gave 12 passes, sandboxes were empty, original template references matched exactly, and the temporary prefix was deleted. Cleanup errors: **zero**. The smallest sampled available disk was **23728558080 bytes (22.10 GiB)**, above the 2 GiB guard; this was step sampling, not continuous peak monitoring. Engine exclusivity was returned immediately; no later installer check uses it.

Unmeasured: first download/quarantine propagation through the desktop app, fresh-host Gatekeeper/notarization admission, signed-out OAuth/browser cancellation, Linux packaging/KVM/AppArmor, daemon-version conflicts with unrelated users, crash recovery during publication/handoff, persistence across logout/reboot, optional llama serving and model inference. `Authentication: pass` was the existing engine's diagnostic observation, not a new sign-in or evidence about a fresh user. Nothing here changes the deferred resize/preservation contract.
