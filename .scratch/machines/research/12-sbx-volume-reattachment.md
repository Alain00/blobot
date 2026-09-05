# Replacing a local sbx Machine while preserving its data

Checked 2026-09-05 against official documentation, the public kit parser, and the installed
`sbx v0.42.0-rc5` help. Read-only research: this researcher created no sandbox, changed no
engine setting, and moved no user data. The implementing session owns any live probes.

## Answer and boundary

The user's design is sound: a Machine can keep its identity and persistent data while its
execution environment is replaced with different CPU/RAM limits. **A supported local sbx
operation that attaches an old sandbox's kit-owned block volumes to a newly created sandbox
was not established.** The public existing-volume option is explicitly cloud-only, and kit
volumes expose no external volume identity. This is a product-surface limitation, not proof
that the underlying storage cannot physically be reused.

There are distinct candidates:

| Mechanism | Established | Still missing |
| --- | --- | --- |
| `sbx kit add` | Recreates the container and retains kit-owned volumes | Does not change the effective VM limits in the existing [resize probes](11-sbx-resource-limits.md#existing-box-resize-probes--observed-by-the-implementing-session) |
| New sandbox plus old volume identity | Public `-v` exists only for cloud | Supported local detach/attach or external-volume selector |
| Save template, create replacement | Local image snapshot/export/import commands exist | Whether mounted kit volume contents are included; full CLI state preservation |
| Copy persistent trees into replacement volumes | Parent's bounded RC5 fixture below passed data/metadata preservation, changed limits, restart, and original reopening | Production transaction/failure recovery, real runtime state, and representative cost |

Sources and qualifications for each row follow. None of these findings authorizes changing
the selected engine, enabling cloud execution, moving real credentials, or removing an
Agent's existing data.

## Direct reuse: cloud volumes are not local kit volumes

Read from `/opt/homebrew/bin/sbx volume --help` and `create --help` on RC5:

- Every `volume` subcommand requires `--cloud`.
- `create -v NAME:MOUNTPATH` attaches an existing persistent volume but is cloud-only.
- Cloud volume persistence uses a snapshot when a sandbox exits, not continuous shared-disk
  semantics; concurrent mounts have last-exiting-writer behavior.

This exact installed help is the primary version-specific evidence. The current web command
index omits `volume`, and its volume URL could not be retrieved; absence from that index is
not used as evidence of impossibility. [CLI reference](https://docs.docker.com/reference/cli/sbx/).

Local kit mounts are described by `path`, `type`, `size`, and `mode`. The parser's
`MountSpec` has those four fields, with no `name`, `source`, or `external`; v2 decoding uses
strict known-field checking. Thus an arbitrary existing disk identity cannot be supplied
through the documented kit grammar. `type` is empty for block storage or `tmpfs` for RAM
storage. Composition by guest path is not attachment by persistent-volume identity.
[Kit volume reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/#volumes),
[MountSpec](https://github.com/docker/sbx-kits-contrib/blob/21e1928b5fe0036163307ea8047e48390f2d6fec/spec/types.go#L184),
[strict v2 decoder](https://github.com/docker/sbx-kits-contrib/blob/21e1928b5fe0036163307ea8047e48390f2d6fec/spec/v2.go#L129).

The public source revision above was repository HEAD when checked; identical linkage into
the RC5 executable was not established. The parent can independently validate rejection of
extra fields with the installed `kit validate`, without relying solely on current source.

`sbx kit add` explicitly preserves kit-owned volumes while recreating the container, and
reattaches the named workspace volume for clone-mode sandboxes. That is reuse **inside the
same sandbox's reconstruction**, not a public cross-sandbox transfer contract. Clone mode
also introduces host-repository access and is not a substitute for blobot's mount-free
private workspace. [Kit-add reference](https://docs.docker.com/reference/cli/sbx/kit/add/).

## Persistence lifetime: stop and remove differ

`sbx stop` leaves the sandbox available for reuse; the usage guide says installed packages,
configuration, history, and other sandbox state survive stops/restarts while it exists.
`sbx rm` removes associated resources and sandbox state irreversibly.
[Persistence guide](https://docs.docker.com/ai/sandboxes/usage/#what-persists),
[remove reference](https://docs.docker.com/reference/cli/sbx/rm/).

RC5's release notes specifically state that removal now reclaims disk volumes and that
reusing a deleted sandbox's name no longer inherits its files, Docker images, or session
history. Relying on name reuse to recover storage would rely on a fixed data-isolation bug.
[RC5 release notes](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5).

Physical storage outside a container therefore does not imply independently managed lifetime.
For blobot, [the root kit](../../../packages/core/src/machines/sbx/kit.ts) declares persistent
`/home/agent` and `/workspace`; files written elsewhere are not thereby guaranteed to survive
container replacement. The current design must also inventory any deliberately persistent
tool installation or service data outside those paths before promising complete preservation.

## Saved templates: supported command, incomplete preservation contract

Local `sbx template save SANDBOX TAG` stores an image in the runtime's image store;
`--output` also exports a tar, and `template load` imports it. A new sandbox can select the
saved image. This is an image clone, not attachment of the original volumes.
[Save reference](https://docs.docker.com/reference/cli/sbx/template/save/),
[template commands](https://docs.docker.com/reference/cli/sbx/template/).

The guide describes capturing filesystem changes and warns that filesystem credentials can
be embedded. It also says some user-level agent configuration files are recreated when a new
sandbox is created. It does **not** explicitly settle whether external kit-owned block-volume
contents are included in a local snapshot. The broad filesystem wording is insufficient to
promise preservation of those mounts. A fixture must distinguish a root-filesystem marker
from markers inside each mounted persistent volume, and verify the replacement using the
same root kit rather than a built-in vendor kit.
[Template guide and limitations](https://docs.docker.com/ai/sandboxes/customize/templates/#saving-a-sandbox-as-a-template).

RC5 `template save --help` additionally exposes memory/checkpoint capture with
`--capture-mode all`, **effective only with `--cloud`**. This is not a local resume or resize
mechanism. No separate public local volume snapshot/export/import command was found in the
inspected CLI surface. An image snapshot containing login state must not become a shared
template or an unreviewed host credential archive.

## Strongest fallback to validate: copy, not reattach

`sbx cp` supports host-to-sandbox and sandbox-to-host files/directories, explicitly not
sandbox-to-sandbox. Its directory placement rules can introduce an extra directory level.
The reference supplies no general ownership/xattr/hardlink consistency guarantee.
[Copy reference](https://docs.docker.com/reference/cli/sbx/cp/).

`sbx exec` supports a selected UID and open stdin without a TTY, and starts a stopped sandbox
before executing. These primitives make a direct **streaming archive transfer through the
host process**, from the old guest into newly allocated volumes in the replacement guest,
a plausible alternative without writing a credential archive to host disk. This is an
engineering inference, not a documented sbx migration feature or a tested result here.
[Exec reference](https://docs.docker.com/reference/cli/sbx/exec/).

If this route is investigated, the acceptance criteria are:

1. Quiesce provider and background writers with the user's required warning/confirmation;
   stopping a Turn alone does not establish database/filesystem consistency.
2. Create a distinct owned replacement with desired limits, unchanged guest paths/UIDs,
   the approved root kit, and no provider startup until restoration is verified.
3. Transfer both persistent trees without host-side durable credential storage or logging
   payloads; test file hashes, hidden files, modes, numeric owners, symlinks, hardlinks,
   sparse files, and relevant xattrs/ACLs. Treat SQLite and runtime locks explicitly.
4. Verify actual guest limits and restored data before atomically moving blobot's Machine
   binding. Keep the old sandbox intact for rollback until successful cutover.
5. Measure pause time, transfer cost, and peak disk/RAM for representative workspaces.
   Copying is proportional to data transferred; it is not the constant-time volume
   reattachment the user proposed. Concurrent old/new guests also add temporary overhead.
6. Separately validate real runtime login/session reopening under the preserved paths.
   Restoring files is not resuming a process or guaranteeing provider session compatibility.

These are verification requirements for a candidate workflow, not a newly accepted policy
or completed implementation. A successful marker probe can establish the mechanism; it
cannot alone certify all runtime data, failure recovery, or performance at production scale.

## Live validation — parent session, 2026-09-05

**PASS for a bounded copy-and-replace mechanism, not direct volume reattachment.**
Executable: RC5 `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`. Reproduction script and root kit
are retained outside the repo at `/private/tmp/blobot-sbx-volume-check.cyBPkm/probe.mjs`
and `kit/spec.yaml`. The full observed JSON was returned in the session tool transcript;
the script does not persist that output itself. No real login, provider, repository data,
cloud call, host workspace mount, engine setting change, or daemon restart participated.
Client environment was allowlisted, telemetry disabled, SSH forwarding verified false.

Two disposable sandboxes used the same kit name, guest paths, cached shell image and two
512 MiB kit volumes. The source requested 2 CPUs / 2 GiB; the target requested 3 / 3 GiB.

| Observation | Result |
| --- | --- |
| Local `create -v NAME:/workspace` | Exit 1: `--volume only supported with --cloud`; no attach sandbox created |
| Source effective resources | 2 CPUs, `MemTotal: 2066016 kB` |
| New target before copying | 3 CPUs, `MemTotal: 3104752 kB`; synthetic session absent, newly initialized volumes |
| Transfer | GNU tar stream through two non-TTY `sbx exec` clients, root UID; no host archive |
| Exact recursive comparison | File SHA-256/length, hidden file, modes, UID/GID, mtime, symbolic-link target and hard-link counts all matched |
| Target stop/reopen | Same 3-CPU/memory reading and preserved data/metadata |
| Original stop/reopen | Same original 2-CPU/memory reading and original data/metadata |
| Cleanup | Only the two exact disposable sandbox names removed; final sandbox list empty |

The synthetic fixture contained a fake provider session (not a real credential), binary data,
an executable file, a relative symlink and hard-linked files. The archive included both
`home/agent` and `workspace` with numeric owners, ACL/xattr and sparse options enabled.
**ACL/xattr and sparse preservation were not independently asserted** because those special
fixtures were not created. No SQLite database, open writer, real CLI resume, interrupted
transfer, disk-full condition or post-cutover rollback was tested. Original reopening was
verified before new user work could diverge; it is not a general rollback guarantee.

30,720 archive bytes transferred in approximately 980 ms, including automatic source startup;
this is a tiny mechanism test, not a throughput or large-workspace benchmark. The source was
stopped beforehand; `exec` started it for the read, with no provider workload. Both VMs must
run during this stream. The original was stopped again immediately afterwards. Production
must explicitly quiesce all writers, bound this temporary overlap, handle cancellation,
verify restoration and change the Agent-to-sandbox binding transactionally. No such product
code or user approval of a data-migration policy is implied by the probe.

Additional observation for lifecycle hardening: volume roots reported mode 0755 despite the
kit requesting `mode: "0700"`; the fixture's fake credential file was 0600 and its directory
0700, both preserved. Do not use the kit declaration alone as evidence of effective root
permissions; verify or explicitly enforce the intended permissions in setup.
