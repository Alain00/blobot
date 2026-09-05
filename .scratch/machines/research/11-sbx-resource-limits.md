# sbx RC5 resource limits: caps, consumption, and what is not established

Checked 2026-09-05 for **A box's lifecycle, engine setup, and the pool**. User priority: configurable limits, maximum CPU/RAM, no unnecessary reservations, performance first.

## Scope and result

Read-only research: official documentation/source, local `--help`, and `strings`. No boxes created or started, no daemon command or metrics query executed, no settings changed. **No RAM consumption, reclaim latency, CPU scheduling, or limit enforcement was measured.**

The installed executable resolves to `/opt/homebrew/Caskroom/sbx@rc/0.42.0-rc5/bin/sbx`. RC5 supports explicit vCPU and guest-memory sizing at creation. No supported public live-resize command or host-RSS-per-box metrics contract was established. Do not describe the engine as guaranteeing elastic RAM or a hard aggregate host CPU/RSS ceiling.

## Creation contract (RC5 help verified)

| Surface | Verified meaning | Do not infer |
| --- | --- | --- |
| `--cpus int` | CPU count; `0` chooses all host CPUs | CPU percentage quota, exclusive physical-core reservation, or total-process CPU bound |
| `--memory string` | Binary-size memory limit; default half host RAM, capped at 32 GiB | Immediate resident allocation of the entire size; RSS equal to the size; all host overhead included |
| `sandbox.resources.cpu` / `.memory` | Kit-side resource declarations | Live updates or enforcement proven by successful YAML parsing |

The first two rows were read from `/opt/homebrew/bin/sbx create --help` and `run --help`, agreeing with the [create reference](https://docs.docker.com/reference/cli/sbx/create/). CLI CPU values are integers; kit grammar accepting a numeric CPU value does not establish fractional CPU quotas in the local runtime. The [kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/#sandbox-block) uses `cpu: 2`, `memory: 4g`. [RC5 release notes](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5) say kit CPU/memory constraints are now applied.

There is stale upstream wording: [SPEC-v2](https://github.com/docker/sbx-kits-contrib/blob/main/spec/SPEC-v2.md#14-forward-compatible-fields) still calls resource enforcement best-effort/pending. For pinned RC5, use explicit create flags and verify effective configuration in a controlled fixture rather than treating either generic document as a measurement. Nothing inspected supplies a product-wide budget, minimum reservation, CPU share, memory reservation, or `maxCPU`/`maxRAM` pool setting.

## CPU: vCPUs are not physical cores set aside

[Nerdbox VM configuration](https://github.com/containerd/nerdbox/blob/main/docs/vm-configuration.md#resources) defines CPU as number of vCPUs and RAM as MiB. Its VM creation path calls `SetCPUAndMemory` before starting the VM, and its libkrun binding forwards these values to `krun_set_vm_config`. [Creation path](https://github.com/containerd/nerdbox/blob/main/internal/shim/sandbox/vm/vm.go), [binding](https://github.com/containerd/nerdbox/blob/main/internal/vm/libkrun/krun.go).

In upstream libkrun's macOS path, `start_threaded` spawns a host thread for a vCPU. This supports the interpretation of a schedulable vCPU count rather than dedicated physical cores withheld from other applications. No exclusive CPU affinity/reservation appears in the inspected path. **This is source-based interpretation, not a scheduling benchmark or assurance that RC5's full process consumes at most that many cores**: device/daemon work also exists. [macOS vCPU implementation](https://github.com/containers/libkrun/blob/main/src/libkrun/src/vmm/macos/vstate.rs).

Summing configured vCPUs can be a conservative application admission policy; it does not reserve OS CPUs. Conversely, permitting overcommit means that a sum of limits is no longer a hard aggregate maximum. A UI must distinguish concurrency policy, configured per-box limits, and observed utilization.

## RAM: guest capacity, resident memory, and reclamation differ

Upstream libkrun constructs guest memory mappings for the configured size; its macOS path maps these regions into HVF. Mapping capacity alone does not demonstrate that every byte becomes resident immediately. [Guest-memory builder](https://github.com/containers/libkrun/blob/main/src/libkrun/src/vmm/builder.rs), [HVF mapping](https://github.com/containers/libkrun/blob/main/src/libkrun/src/vmm/macos/vstate.rs).

The upstream balloon device supports free-page reporting and, on macOS, advises those pages with `MADV_FREE`; its inflate/deflate handlers report unsupported operations. This is evidence for a free-page reclamation mechanism, **not general live RAM resizing**, an immediate RSS drop, or a guaranteed zero-reservation policy. Nerdbox's upstream arm64 kernel enables virtio balloon and page reporting. [Balloon device](https://github.com/containers/libkrun/blob/main/src/devices/src/virtio/balloon/device.rs), [event handlers](https://github.com/containers/libkrun/blob/main/src/devices/src/virtio/balloon/event_handler.rs), [kernel config](https://github.com/containerd/nerdbox/blob/main/kernel/config-6.12.44-arm64).

Version caveat: upstream `main` was nerdbox `9ca39da8113429fd0a6370b9cc878a5f0c10fd0f` and libkrun `413a011760b7ee61493fb0073f7810319ca6a181` when checked. These revisions were not proven identical to RC5. RC5 ships `libexec/lib/libsailor.dylib`; its strings mention virtio-balloon, `MADV_FREE`, and guest memory mappings. **Strings only show code/diagnostic presence, not an enabled working feature.** Neither actual preallocation nor effective reclamation in RC5 was established here.

Therefore `maxMemoryBytes` should be described as configured guest RAM, not a promise about host RSS. VM/daemon/device overhead must remain visible in any later host budget measurement. Avoid deliberately touching/locking memory or creating warm boxes merely to reserve capacity; that is application behavior under our control. Do not claim the engine itself makes no reservation without a live, version-specific test.

## Existing boxes and metrics

- RC5 top-level help exposes no `update`, `resize`, or `stats` command. `run --name` reattaches, but its help does not promise applying changed CPU/memory flags to an existing box. **Supported in-place resizing was not established.** Do not destroy/recreate a persistent box to implement a settings edit without a separately approved preservation workflow.
- Nerdbox's task `Update` forwards to the guest container; this is not evidence of resizing the VM itself. Its `Stats` reads guest cgroups. [Guest task implementation](https://github.com/containerd/nerdbox/blob/main/internal/vminit/task/service.go).
- The [usage guide](https://docs.docker.com/ai/sandboxes/usage/#interactive-mode) documents live CPU/memory metrics in the TUI. RC5 `ls --help` promises sandbox metadata plus `--json`, not resource usage or host RSS. A supported machine-readable per-box RSS/CPU sampling API was not established. Embedded `ContainerStats` symbols are insufficient to adopt an undocumented socket endpoint.
- Guest cgroup usage excludes host-side VM overhead; host process RSS and guest RAM usage are not interchangeable. Do not label a guest metric as host RAM consumption.

## Implementation implications, not new user decisions

Expose explicit configurable per-box limits and pool/concurrency settings. Preserve actual creation limits as effective state separately from desired settings; report when a changed limit cannot yet be applied. Lazy creation and stopping idle owned boxes avoid unnecessary application-created overhead. A conservative configured-cap admission limit can exist without preallocating those resources, but it sacrifices concurrency and must not be mislabeled observed consumption. An adaptive consumption-based admission policy requires a trustworthy metrics source and a later measurement; it cannot guarantee a hard aggregate ceiling merely by sampling.

Before promising automatic RAM reclamation or live limit changes, a controlled RC5 fixture should measure idle/use/free/pressure states and verify behavior across stop/start. That follow-up was not executed by this read-only investigation.

## Subsequent implementing-session measurement — macOS, RC5

The parent session subsequently ran a controlled fixture, separate from the read-only research
above. Script and raw output are temporarily retained at
`/private/tmp/blobot-sbx-rc5-install.wsOUYz/resources.mjs` and `resources.json`.
No provider, repository content, real credential or paid model call participated. The test
required zero other sandboxes to attribute the one shim process; it created an isolated root
kit using the cached shell image and deleted its exact disposable sandbox and volumes afterwards.
It did not change settings or restart the daemon.

Requested **2 vCPUs, 4 GiB RAM**, two 512 MiB volumes. Guest observations: `os.cpus().length`
was 2; `/proc/meminfo` reported `MemTotal: 4086656 kB`. Host `/bin/ps` RSS for the one
`containerd-shim-nerdbox-v1` process (KiB):

| Phase | RSS KiB | Approx. MiB |
| --- | ---: | ---: |
| Immediately after creation | 799808 | 781 |
| Guest Node allocated/touched a 256 MiB buffer | 1212800 | 1184 |
| Immediately after releasing it and requesting GC | 1214800 | 1186 |
| Three seconds later, guest Node exited | 979728 | 957 |
| After `sbx stop` | process absent | no running VM process |

This demonstrates that **the full configured 4 GiB did not become host-resident at creation**
and that resident memory later fell after releasing a workload. It is not a reclamation SLA,
a memory-pressure benchmark, a zero-overhead claim, or a hard host-RSS bound. It does not prove
which mechanism reclaimed the memory. CPU percentages from `ps` are lifetime averages and were
not used to claim instantaneous CPU usage or a scheduling limit.

One integration trap: `sbx ls --json` supplies a sandbox UUID, but the shim's `-id` is a
different, 64-character container id. The first attempt matched the sandbox UUID and found
**no process**; that was an attribution failure, not zero RAM. The successful observation used
the explicit one-sandbox condition. Do not build a multi-box RSS sampler by matching the
sandbox UUID to `ps`, nor assign zero usage when the mapping cannot be established.

The unresolved capability remains changing CPU/RAM limits on an **existing persistent box**.
No supported public update/resize contract was found. New configurable defaults can be applied
at creation; desired and effective limits must not be silently conflated for existing Machines.

The author subsequently rejected new-Machines-only configuration; see the claimed lifecycle
ticket. The controlled resize probes below test the actual requirement instead.

## Follow-up research: can kit-add recreation resize an existing Machine?

Read-only follow-up, 2026-09-05. The user requires settings to apply to **existing** Machines, permits a restart, and requires warning/confirmation if a Machine is working. This section investigates a possible mechanism; it does not substitute an unsupported-settings answer for that requirement. No live kit-add or resize operation was performed by this researcher.

### What RC5 explicitly supports

`sbx kit add SANDBOX REFERENCE --kit-arg ...` is present in RC5 help. It adds a **mixin**, recreates the container with the updated kit list, and preserves kit-owned volumes. The sandbox must have the recreate-aware labels. This supports investigating a state-preserving restart workflow, but does not itself promise changed CPU/RAM limits. [Kit-add reference](https://docs.docker.com/reference/cli/sbx/kit/add/).

The help does not include `--cpus` or `--memory`. It accepts `--kit-arg name=value` and qualified `--kit-arg kit.name=value`, plus args files. It describes the new kit as appended to the original kit list, not replacing its root. The [using-kits guide](https://docs.docker.com/ai/sandboxes/customize/kits/#using-kits) describes repeated local application while iterating, but currently limits supported add fields to environment variables, install commands, and network allow rules. Its broader preservation wording is not a resource-mutation guarantee.

### A resource-only mixin is not valid v2

The public parser in [spec/v2.go](https://github.com/docker/sbx-kits-contrib/blob/main/spec/v2.go) rejects a `sandbox:` block unless the artifact is `kind: sandbox`. `resources` is nested exclusively inside that block; memory is parsed to MiB and CPU to a numeric field. Therefore `kind: mixin` plus `sandbox.resources` is not a supported resize kit. Using `extends:` in a mixin is also forbidden. [Kind rules](https://github.com/docker/sbx-kits-contrib/blob/main/spec/SPEC-v2.md#4-kind-mixin).

The [composition guide](https://github.com/docker/sbx-kits-contrib/blob/main/skills/kit-author/topics/composition.md) describes child-wins scalar/recursive-map inheritance for `extends:` and unique artifact names across a composed root and mixins. It does not specify min/max merging of CPU or memory. Exactly one root is allowed; adding a second root is not a replacement operation. RC5 embedded diagnostics also contain a mixin-only refusal and duplicate-kit-name error. These strings establish possible refusal paths, not whether a same-path kit-add is deduplicated before composition.

### Parameterized-root hypothesis to test, not a supported contract yet

V2 kit arguments are substituted before decoding and may parameterize resources in the original root, e.g. a declared `cpu`/`memory` argument used inside `sandbox.resources`. Argument declarations belong to the signed artifact, while supplied values do not. [Argument specification](https://github.com/docker/sbx-kits-contrib/blob/main/spec/SPEC-v2.md#21-args).

A narrowly scoped fixture could create a parameterized root, then add an empty legal mixin while supplying qualified arguments for that root. Questions needing a live answer: does kit-add accept arguments targeting the already-recorded root, reload its original source, or reuse its frozen values; do prior explicit CLI CPU/RAM values override the changed root; does the recreated VM actually report changed vCPU/RAM; and do both home/workspace contents survive? A second update must also work without an ever-growing list of dummy mixins. **None of those behaviors follows from the help alone.**

Reapplying a changed local root reference as though it were a mixin violates the documented kind boundary. Editing its file and relying on another mixin to trigger an implicit root refresh is similarly not a documented stable update API. If a fixture demonstrates it works, record the exact pinned-version contract, effective resource readings, preserved-data checks, and repeat-update behavior before adopting it.

The implementing session's live measurements, if any, belong in a separate section below; this research neither modified nor reinterpreted the earlier measurements.

## Existing-box resize probes — observed by the implementing session

Run against RC5 on this Mac, using only disposable root-kit fixtures, the already-cached shell
image, and markers on both 512 MiB private volumes. No provider/login, repository contents,
paid model call, global-policy change or daemon restart. Scripts and raw results remain under
`/private/tmp/blobot-sbx-rc5-install.wsOUYz/`: `resize.mjs` / `resize.json` and
`resize-args.mjs` / `resize-args.json`.

1. A root kit with `sandbox.resources: {cpu: 2, memory: "2g"}` and **no CLI resource override**
   created a guest reporting 2 CPUs and `MemTotal: 2066016 kB`.
2. Stopped it, then attempted
   `sbx run --name NAME --cpus 3 --memory 3g --detached`.
   RC5 explicitly refused with exit 1: `--memory, --cpus can only be used when creating a new sandbox`.
   Subsequent guest measurement still reported 2 CPUs / `2066016 kB`; both markers survived.
3. A `kind: mixin` containing `sandbox.resources` failed `kit validate`: the sandbox block is
   legal only on a root sandbox kit. `kit add` also refused it. Notably, **kit add started the
   stopped fixture before reporting the invalid artifact**, so callers cannot treat it as a
   read-only preflight. Repeated values 3/3g, 1/1g, 3/3g all left the original limits intact.
4. Created a new root whose declared `cpu` and `memory` arguments are substituted inside
   `sandbox.resources`, defaulting to 2 / 2g. This root validated and booted with those values.
   Added a legal harmless mixin (`setup.install` containing `true`) while supplying
   `--kit-arg blobot.cpu=3 --kit-arg blobot.memory=3g`. **kit add returned success, but the
   guest still reported 2 CPUs and `MemTotal: 2066016 kB`.** Both markers survived.
   Success from this command is not a resource resize.

The parameterized-root probe initially used an invalid top-level `env` in the harmless mixin;
validation refused it before kit-add. It was corrected to the already-established
`setup.install` shape and the complete probe rerun. That initial validation failure is not
counted as evidence against resource resizing.

All exact fixture sandboxes and their disposable volume data were removed. The parent verified
the final list was empty. The observations establish that the public routes tested **do not
meet the user's requirement to adjust existing Machines**, even with a restart. They do not
prove that no future or undocumented mechanism can do it. An undocumented mutation of engine
state, credential export, or deleting/recreating the Agent's data is not an approved fallback.
