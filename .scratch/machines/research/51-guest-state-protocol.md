# The guest peer enforces ordering, bounded frames and verified transfer completion

2026-09-06. This checkpoint implements the guest half of `blobot-state-v1` in
`packages/core/src/machines/sbx/state-worker.ts`. It runs against the existing
host channel and three-tree relay. Its filesystem backend is still an injected
interface: this is not a real rootfs/home/Docker restore or an activation gate.

The standalone function can be serialized into a guest bootstrap with its own
Node built-ins. It requires maintenance preparation before tree operations,
checks sequential request IDs and source/target roles, and accepts at most a
1-MiB control frame or a 64-KiB data frame. Split headers and coalesced input
are handled without accumulating an entire transfer. Each receive write and
outgoing frame is awaited for backpressure.

Source archive bytes are counted and hashed independently of its preflight.
The receiver checks byte count and SHA before finishing extraction, then asks
its backend to re-read restored state. Failed preflight, wrong wire contents,
corrupt restoration, malformed ordering and incomplete input close the peer
with a generic error. Backend exception text, paths and archive diagnostics
never enter replies. An incomplete receiver is aborted on disposal. Disposal
does not authorize thawing an unverified candidate; the lifecycle owner stops
the guest and retains the original.

Validation: 14 new worker tests, including the serialized function and both
real protocol peers through `copySbxState`. Focused worker/channel/transfer
tests: **32 passed**. Full core: **989 passed / 47 skipped**. Core typecheck
and production build and desktop typecheck pass. The tests use synthetic
in-memory payloads; no sbx instance or provider is involved.

The remaining backend must establish held maintenance and private mount views,
preflight complete metadata fidelity, restore authoritative state, and verify
the candidate across its lifecycle. A wire hash cannot prove omitted inode
flags or post-startup behavior. [Copy-up observations](50-overlay-copy-up-and-base-attributes.md)
separate image-backed observations from explicitly set writable policy flags;
they do not authorize a metadata exception. Existing full-state replacement
and production activation guards remain unchanged.
