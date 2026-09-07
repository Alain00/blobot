# RC5 still has no established local resource resize retaining the same storage

2026-09-06. **No supported, sustainable public local sbx RC5 operation was found that changes an existing sandbox's CPU/RAM while retaining its root and owned block volumes, or clones/adopts that complete storage into a differently sized local sandbox.** This revalidation reused the conclusive prior experiments; it did not start another sandbox, retry rejected writes, alter engine settings, invoke providers or inspect credentials.

The conclusion is about the available contract and measured RC5 behavior. It is not proof that private engine machinery could never reuse storage. It neither changes the chosen engine nor permits ignoring state that the current restore cannot verify.

## What was checked again

The [read-only collector](61-native-resize-readonly.mjs) and [captured results](61-native-resize-readonly-results.json) record 16 local help surfaces, static API-client symbol names and the version response. Installed `/opt/homebrew/bin/sbx` resolves to `/opt/homebrew/Caskroom/sbx@rc/0.42.0-rc5/bin/sbx`, SHA-256 `e0bc95e6d4b80cb9a6b84ae8b2f2f540d5289fec9347be40b01f7af5317f007a`. Client and already-running server both report revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`; server API is `0.28.0`.

Existing [research11](11-sbx-resource-limits.md#existing-box-resize-probes--observed-by-the-implementing-session), [research13](13-sbx-lifecycle-command-contract.md#adoption-and-effective-configuration-gap), [research16](16-engine-lifecycle-persistence-and-costs.md), and [research39](39-inode-flags-and-preboot-verification.md#documented-startup-surfaces-and-the-exact-rc5-observation) were reviewed first. [Research12](12-sbx-volume-reattachment.md) supplies the prior local attach refusal, and [research35](35-rootfs-fidelity-and-mount-namespaces.md#snapshot-failure-and-repaired-state) supplies actual template fidelity failures. None of those live tests was repeated.

Current primary documentation was compared with the exact installed help. The public kit source is still commit `21e1928b5fe0036163307ea8047e48390f2d6fec`. Public docs omit some commands present in RC5 and contain older environment-file naming, so the installed version is the authority for whether a flag exists. Conversely, a compiled symbol does not establish a supported API contract.

## Candidate mechanisms and outcomes

| Candidate | Facts | Consequence for complete local resize |
| --- | --- | --- |
| Stop and restart the same sandbox | Local lifecycle preserves state while the sandbox exists. | Storage retention works, but no new resource assignment follows. |
| `run --name` with changed CPU/RAM | Research11 measured explicit refusal of resource flags on an existing sandbox. Effective resources remained unchanged. | Already disproved for RC5; no repeat needed. |
| `kit add`, including qualified arguments for the original root | Research11 measured successful legal mixin application with changed root CPU/RAM arguments, but unchanged effective VM resources. | Container recreation/volume retention is not VM resizing. |
| Resource-only mixin or replacement root | A mixin cannot declare `sandbox.resources` or `extends`; exactly one root is composed. | No documented root-replacement resize operation. |
| `env create` / `env run` / environment plan | Declarative creation and attachment, host provisioning and configuration are supported. Installed help says creation-bound work waits for the next creation when attaching. There is no resource-update/rebuild/retain-storage operation in these commands. | No documented exception to existing creation semantics. No environment file or lifecycle command was executed. |
| Attach an existing volume | `create -v` and every `volume` command are explicitly cloud-only. Research12 measured the local refusal. | No local cross-sandbox attachment route. |
| Local kit volume identity | Public `MountSpec` contains only `path`, `type`, `size`, `mode`; no external/source/name identity. Strict v2 decoding rejects unknown fields. | Matching guest mount paths do not select the old disks. |
| Local `template save` / `load` | Saves and transports an OCI image, then creates another sandbox from it. | Not the same storage or a whole-disk clone. Research35 already measured dropped ACLs, lost mtime precision and wrong sparse-file content. |
| `template save --capture-mode all` | Installed help explicitly limits memory+disk+microVM checkpoint capture to `--cloud`. | Not a local RC5 checkpoint facility; no documented changed-resource resume guarantee either. |
| `--clone` | Clones the host Git repository into the container, selected at creation. | Not a sandbox, rootfs, disk or VM clone. |
| `move --to local/cloud` | Installed help describes local↔cloud transport via an OCI template and a new destination sandbox ID. | Not local→local storage adoption or a block clone; no CPU/RAM options appear on the move command. |
| Settings or engine state files | Public settings are daemon-owned global settings, not a per-sandbox disk/resource adoption surface. No documented stopped-box resource rewrite was found. | No mutation of settings, registries, containerd metadata or VM files was attempted or proposed. |

Sources: [local run](https://docs.docker.com/reference/cli/sbx/run/), [kit add](https://docs.docker.com/reference/cli/sbx/kit/add/), [environment commands](https://docs.docker.com/reference/cli/sbx/env/), [kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/), [template guide](https://docs.docker.com/ai/sandboxes/customize/templates/), [save reference](https://docs.docker.com/reference/cli/sbx/template/save/), and the exact command help in the attached JSON. Cloud-specific rows rely on installed help because the current web command index is incomplete.

The [RC5 release notes](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5) announce enforcement of root-kit CPU/memory declarations, not an existing-box update operation. They also document fixed cleanup/name reuse: deleting a sandbox and reusing its name no longer inherits its old data. Name reuse cannot be treated as storage adoption.

The [public MountSpec](https://github.com/docker/sbx-kits-contrib/blob/21e1928b5fe0036163307ea8047e48390f2d6fec/spec/types.go#L184) still exposes four fields. [v2 decoding](https://github.com/docker/sbx-kits-contrib/blob/21e1928b5fe0036163307ea8047e48390f2d6fec/spec/v2.go#L129) uses strict known fields and limits the sandbox block to root kits. The public spec says volumes are creation-time only and kit-add skips volume changes. Its older “resource enforcement pending” wording is not used to contradict the actual RC5 create measurements. [v2 specification](https://github.com/docker/sbx-kits-contrib/blob/21e1928b5fe0036163307ea8047e48390f2d6fec/spec/SPEC-v2.md#57-volumes).

## API and implementation boundary

No official versioned local API schema or documented resource-update/storage-adoption endpoint was found in the Docker Sandboxes reference, release repository or reviewed kit interfaces. The official [release repository](https://github.com/docker/sbx-releases) distributes a proprietary implementation; the public kit parser is not the complete daemon source. A third-party reverse-engineered SDK surfaced in search, but it was not used as primary authority or invoked. Likewise, unrelated products named `sandboxd` are not evidence about Docker sbx.

Static inspection of this exact executable finds generated client methods including `CreateSandbox`, `InspectSandbox`, `SaveSandbox`, `StartSandbox`, `StopSandbox`, `ResizeExec` and **`SwapSandboxContainer`**. This is relevant evidence that internal inspect/swap machinery exists. It is **not** evidence of supported CPU/RAM mutation, whole-VM checkpointing, correct storage ownership transfer or resource changes on restart. The symbol extraction is bounded and not an exhaustive proof of every possible private operation; no internal endpoint was called or disassembled into a new integration contract.

Research11 already traced upstream Nerdbox's CPU/RAM configuration into VM creation. This revalidation also checked its guest task-service methods: `Update` and `Checkpoint` delegate to the guest container, not a documented sbx VM-resource/storage-adoption API. Those names cannot establish a VM resize capability, and the public Nerdbox revision is not proven identical to Docker's RC5 build. [Pinned task service](https://github.com/containerd/nerdbox/blob/9ca39da8113429fd0a6370b9cc878a5f0c10fd0f/internal/vminit/task/service.go#L611), [prior VM-configuration analysis](11-sbx-resource-limits.md#cpu-vcpus-are-not-physical-cores-set-aside).

## What would change this conclusion

A candidate would need an exact local engine operation or supported configuration contract that does one of the following: changes a stopped sandbox's VM resources without rebuilding its filesystems; reattaches all owned disks/root state to a new VM with new resources; or clones the complete disk state with demonstrable metadata fidelity. It would also need documented ownership/lifetime semantics and a controlled effective-resource/preservation check. Another accepted YAML field, successful kit-add exit, saved OCI image, generic container update method, or private symbol alone does not supply that evidence.

Accordingly, the currently implemented file-transfer work is **not duplicating an established native local facility found by this review**. That result does not make the transfer complete: research60's rejected selected symlinks and research58's unsupported special-object attribute observations remain separate preservation limits. This note makes no decision to bypass them, broaden the state contract, move execution to cloud or switch engines.

Only research61 artifacts were written. No live fixture or temporary runtime resource was created; nothing required cleanup. No production/tracker/lockfile edits or commit were made.
