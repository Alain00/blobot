Type: research
Status: open
Blocked by: 19, 08

# Docker Engine and sbx: lifecycle, persistence and resource costs

## Question

For blobot's existing per-Agent Machine contract, what does **vanilla Docker Engine** provide
natively, what does Docker Sandboxes through `sbx` provide, and what must blobot implement
around each? Compare advantages, disadvantages, limitations and remaining implementation cost.

## Session boundary

Created after the lifecycle/detection implementation commit at Guillermo's request. **Research
starts in another session**, not when this ticket is created. Use the research skill then.
This ticket gathers evidence; it does not switch engines, alter the remaining plan, activate
box Agents or decide an isolation trade-off on the author's behalf.

## Investigate

- Identify the actual stack on macOS and Linux. Separate Docker Engine from the desktop/VM
  runtime needed to host Linux containers on macOS, and from `sbx`'s per-Machine microVM.
  State versions, architecture and prerequisites; never label a Linux-only result as macOS proof.
- Creation, start, stop, restart, idle sleep, message-driven wake, reconnect/adoption and loss
  of the application/daemon/guest. Which states and configuration facts can be inspected reliably?
- Persistent named volumes versus container writable layers versus sbx-owned volumes. What
  survives stop, removal, replacement and upgrade? Inventory home, CLI login/session files,
  Workspace, installed tools and any inner Docker state. Under what conditions is attaching
  the old volumes to a new container sufficient, and what still changes or is lost?
- Live CPU/RAM updates and replacement requirements, effective versus desired limits, minimums,
  failed updates and lowering memory below current use. Distinguish maxima, reservations,
  vCPUs, quotas, guest capacity and host RSS. Keep the author's busy-work warning/confirmation.
- Cold/warm creation and wake, idle overhead, memory growth/reclamation, concurrent Agents,
  bounded work and replacement disk/time peaks. Compare equivalent workloads and include the
  shared macOS VM's cost; do not compare guest MemTotal with host RSS or invent process mappings.
- Crash-safe identity/journals, volume ownership, interrupted edits, rollback, retained originals,
  orphan handling, deletion after Workspace preservation, observability and API/CLI stability.
- Implementation reuse from the current branch: which parts of Machine, SleepingRuntime,
  detection and UI survive, which sbx mechanisms would be replaced, and which work remains
  regardless of engine? Compare remaining cost, not only already-spent effort or source LOC.

## Evidence and completion

Produce a linked research artifact and capability matrix: **native / blobot work / unsupported /
unverified**, with primary-source links, versions and separate documented/observed/inferred facts.
Use synthetic, disposable, bounded fixtures where a suitable local engine is already available.
Ask before installing/changing a shared engine or stopping unrelated work. Use no real logins,
user volumes, credential exports, paid inference or cloud engines. An unavailable environment
is an explicitly unmeasured result, not permission to silently install one.

Include reproducible measurements where available, test limitations, failed paths and a list of
facts the reevaluation must still validate. Research completion is evidence adequate for that
decision, not a favorable verdict for either candidate. Link the artifact on resolution.

## Starting context

- [Current implementation and activation boundary](../build.md), implementation commit `5d2edd9`.
- [Lifecycle decisions](19-a-box-lifecycle-and-engine-setup.md) and
  [scoped detection](08-detection-and-remedies-per-machine.md).
- Existing `research/11`, `research/12`, `research/13`, `research/14` for measured sbx contracts.
- [Eve's actual backend](../research/15-eve-docker-sandbox-lifecycle.md): a starting observation,
  not proof that Eve already meets blobot's persistent Machine requirements.
