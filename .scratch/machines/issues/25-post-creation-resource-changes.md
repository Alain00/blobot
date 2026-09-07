Type: task
Status: resolved

# Change CPU and RAM without replacing unverifiable Machine state

## Question

Can the pinned sbx engine change the resources of an existing general-purpose
Machine while preserving its complete persistent state?

## Answer

**Deferred to a separate engine capability effort, 2026-09-06.** This is an
implementation decision under Guillermo's explicit delegation to finish using
maintainable, efficient and usable approaches. It is a deviation from the earlier
resource-editor plan, not a claim that that editor was completed.

[Native-route revalidation](../research/61-native-resource-resize-and-storage-reuse.md)
finds no public local operation that changes CPU/RAM and retains the same storage.
The prior real resize probes already failed; source inspection does not make an
undocumented internal symbol a supported API. [The composed alternative](../research/60-composed-state-transfer.md)
refuses three unqueryable symlinks in two fresh Machines. Filesystem reconstruction
cannot presently establish the promised full-state guarantee.

The production flow therefore chooses CPU/RAM **before creation**, stores and
verifies those values, and displays them read-only afterward. It does not offer
an operation that predictably fails on a fresh box, recreate an Agent to emulate
an edit, import host credentials, switch engines, or weaken preservation claims.
Normal stop/start retains the existing Machine and its data through the engine.
All other Machines implementation and review work continues.

The staged copy modules and their tests remain internal evidence for a future
capability; the production replacement guard remains. The PR must explicitly
report the resource-editor deviation and reference the measured reasons. This
ticket is closed as outside the revised implementation scope, not as delivered.
