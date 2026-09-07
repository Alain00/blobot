# Open-network lifecycle implementation

2026-09-06. Implements the accepted Internet plus host/local-network decision in the staged
`OwnedSbxMachine`, without a provider domain catalog or any approval-policy changes.

## What changes

The root kit still declares no network rules. After verifying the owned Machine, start creates
one `**` allow scoped to its exact sandbox name and records the rule ID plus the mailbox port.
The port is checked for reachability by policy; it is no longer a network isolation boundary.
The mailbox's existing per-Agent bearer remains its authorization mechanism.

Before a turn, the Machine rechecks the owned rule, its full scope/origin/resource shape and
effective admission of an arbitrary destination and the mailbox endpoint. Other scoped grants
are not adopted. Operator global allows are compatible with open access; they are read and
retained. Operator denials/governance are not silently overridden. Unknown policy shapes or
missing required grants refuse through existing Machine failure paths.

Stop, replacement and removal revoke only exact recorded scoped IDs. Old journals containing
an exact mailbox permission are migrated by verifying/revoking that recorded rule before
creating open access. If an external action removed the rule, a later explicit start can create
a fresh owned grant. A matching hostname without a matching rule identity is never ownership.
Neither daemon settings nor global rules are written.

`MachineRuntimeRequirements` now carries the image only; the unused `allowedHosts` catalog is
removed. Runtime adapters, their modes and trust translations are untouched. Existing tests
cover those translations and sleeping-runtime permission-handler retention. This change is
not an integrated certification of live provider approvals inside boxes; adapters remain gated.

## Validation

- Core: **973 passed / 47 skipped**, typecheck and build pass.
- Desktop: **621 passed / 1 skipped**, typecheck and build pass.
- Focused observation, registry, kit, adapter-boundary, sleeping-runtime, Claude policy and
  Cursor permission tests passed before the full suites. Added tests reject foreign/scopeless/
  malformed grants and admit compatible global allows only in the open-network path.
- The opt-in network and existing owned-lifecycle tests both passed on real pinned RC5 in
  183 seconds. The network test covers public HTTPS, ignoring proxy variables, an owned host
  HTTP listener, stop/revocation, migration of the legacy mailbox rule, deletion of the active
  grant and subsequent restart. The larger lifecycle test also exercises two simultaneous
  Machines, sleep/reopen, replacement, retained originals and interrupted-copy recovery.
- The dedicated final network run also passed a direct TCP exchange with an owned host-loopback
  listener, using guest `node:net` without HTTP or proxy environment handling. It completed in
  41 seconds, with typecheck passing afterward.

Logs: `/private/tmp/blobot-open-network-core-tests.log`,
`/private/tmp/blobot-open-network-desktop-tests.log`,
`/private/tmp/blobot-open-network-desktop-build.log`,
`/private/tmp/blobot-open-network-live.log`, and
`/private/tmp/blobot-open-network-tcp-live.log`.

Tests create only disposable owned Machines and synthetic services/state. They import no
credentials, mount no user repository, run no provider/inference and do not mutate global
settings. Engine inventory was empty after the two-test lifecycle run. The standalone network
test also compares global policy before/after and owns its cleanup by name and ID.

## Limits and next work

The selected engine still has its own protocol/routing behavior; open destinations does not
claim parity with every host network protocol. Its documented UDP/ICMP limits remain engine
constraints. Network reach grants neither tool approval nor authorization at a reached service.
Guest files, login and native protections differ from the host; no exact-risk-equivalence
claim is made. Filters and hostname editing are explicitly a separate future effort.

The lifecycle test's legacy private-tree replacement is not full root/home/Docker preservation.
That image work remains unfinished. Production `machineFor`, runtime-preparation, onboarding
and UI admission gates remain in place; no Agent was activated inside a box by this ticket.
