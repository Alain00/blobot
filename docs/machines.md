# Machines preview

Machines adds a per-Agent choice between the installed runtime on this computer
and a private sandbox on this computer. Teams may mix both. Ordinary builds keep
sandbox activation disabled while account and platform acceptance is unfinished.
For development review, start the desktop with `BLOBOT_MACHINES_PREVIEW=1` in its
environment. This opt-in does not certify the pending checks below.

## Flow

1. Create a team, choose its working folder, and choose where members work. Local
   is the default. A sandbox initially allows 2 CPUs and 4 GiB RAM; adjust these
   before creating it. Member overrides apply individually, and later joiners
   inherit the Team default unless explicitly overridden. Existing members retain
   their placement and limits. The picker shows this computer's capacity and the
   combined ceilings; an overcommitted total is a warning, not an arbitrary cap.
2. Settings → Machines provides engine setup, Docker browser sign-in and an
   explicit check. Setup downloads the pinned vendor artifact, verifies its hash
   and, on macOS, its signature. It disables shared SSH credential forwarding;
   a required daemon restart refuses while other sandboxes exist. Linux opens
   the system package installer. No Docker commands or terminal are shown.
3. The first sandbox start downloads the adapter's pinned runtime image. Each
   Agent has an 8 GiB home and 20 GiB Docker volume, while its working folder is
   a host worktree (or the existing Workspace provider's plain/nested copy).
   The same image download is shared by Agents using it, with byte progress in each
   conversation. Cancel startup releases that Agent's wait; the transfer stops when
   its last waiter leaves. A verified archive is removed after confirmed import.
4. A failed member leaves peers working. Its conversation shows the remedy and
   any queued messages. Runtime sign-in opens only the adapter's recognized
   browser step, displays device codes, or accepts the requested one-time input.
   No host login is copied. The vendor CLI stores its own login in that Agent's
   guest home. Closing/cancelling stops the login process and releases the Machine.
5. A fresh guest readiness check follows login. Successful readiness retries that
   Agent and its queued work, keeping the previous provider session until a new
   one actually opens. Local queue acknowledgement is not exactly-once execution
   by a remote provider.
6. Idle sleep stops execution and retains data. Settings shows persisted limits
   by team/member. Agent panes offer sign-in, retry and opening the host working
   folder; team Workspace rows identify sandbox members. Closing the app drains
   starts, sign-ins, turns and compaction continuations before closing SQLite.
   Pending first starts are exposed before the whole Team becomes ready, so they
   can show progress and be cancelled on screen or at shutdown.
7. Settings lists recorded and unclaimed sandboxes separately from configured
   members. Explicit removal of a departed Agent's verified private data keeps its
   working folders. A name alone never permits adoption or deletion. Deleting a
   Team reports workspace and private-state outcomes independently; a known work
   size permits full clean even when private-state bytes are unavailable.

## Boundaries

Each AgentProfile now has one persistent personal folder, created on its first execution under
`<app userData>/profiles/<profileId>/files`. Local and sandbox memberships use those same files
through `BLOBOT_PERSONAL_DIR`; their persona also states the path. The folder supports ordinary
read/write files and executable scripts, with normal filesystem concurrency. Profile renames,
team removal, Machine deletion and profile retirement retain it, including when no memberships
remain. Profiles with different IDs receive different folders. Legacy Agent rows without a
profile ID receive no inferred personal identity.

This folder is separate from `/home/agent`: runtime logins, sessions, caches, private Docker data
and existing installed software retain their current ownership. Skills/MCP installation,
discovery, composition, credentials and management UI are deferred. Putting a definition in the
folder preserves the file; it does not activate it in a harness. Project-specific files remain in
the Workspace. Local execution retains the operator's HOME and native approvals; local Claude's
shell fence allows writing the exact personal folder beside its existing Git metadata paths.

For both new and existing sandboxes, the pinned RC5 engine adds the personal bind before the
runtime starts. The app removes the engine's auxiliary `/mnt/host` alias and verifies the exact
mount set and folder identity as root and the Agent UID. The mount is transient, so each wake
reattaches it from the saved profile reference; the same Machine and private volumes survive.
A failed attachment stops that Machine and retains its ownership record and files. A missing,
changed or replaced personal folder fails explicitly instead of creating an empty replacement.
The host-owned receipt at `<app userData>/profiles.records/<profileId>.json` lives outside the
entire personal data root, so losing that root or a whole profile directory is detected after
relaunch. The receipt and `.blobot-personal-id` marker identify the folder; preserve both when
backing it up or restoring it. Existing files in runtime homes are not automatically imported.

The personal folder is a deliberate writable bridge between one profile's teams: changes there
can affect its work elsewhere. It does not grant a sandbox another profile's folder or another
team's Workspace. This is not a claim of an additional OS fence for local execution. Shared
personal bytes live on the host filesystem and are outside the private 8/20 GiB volumes; no
per-profile quota or cross-computer storage provider is introduced in this effort.

The [personal storage measurement](../.scratch/machines/research/80-personal-directory.md)
records concurrent local/box use, adding the folder to an existing Machine, sleep/reopen,
ownership validation and removal on macOS RC5. Linux/KVM host acceptance remains separate.

The Agent's worktree and common Git metadata are writable, including repository
configuration/hooks. Internet and host/local-network access are allowed, retaining
the runtime's chosen approval policy. The Machine does not grant a bypass mode.
No host home, credential files, SSH forwarding or host Docker socket are imported.
The accepted operator skills directory is mounted read-only; escaping skill links
are excluded. The skills mount chosen at creation stays fixed; a missing recorded
directory must be restored, never silently replaced by another path.

Blobot's host Git reads, provisioning and commit/publish/switch controls disable
repository hooks and fsmonitor. Raw diffs also disable external diff/textconv;
transport uses the host SSH command and refuses custom protocol helpers. These
overrides leave shared configuration and the Agent's Git behavior unchanged.
**The Git buttons therefore do not run repository hooks.** Shared Git remains
trusted metadata: filters, credential helpers and modified refs/objects can affect
host Git, and other host programs/terminals do not use Blobot's overrides. This is
additional protection for the measured execution paths, not complete isolation
from a hostile repository.

Local runtimes keep their existing login, with adapter-owned native protection
required by ADR-0006. In particular, local Claude uses its native sandbox even when
the box preview flag is off: it refuses unavailable protection and unsandboxed
fallback, retains approval prompts, permits loopback binding, and permits writes
to the exact common Git directories of selected repositories. This is a behavior
change from main. macOS bridge/CLI tests cover ordinary and nested worktree commits
and loopback binding; Linux sandbox dependencies and behavior still need host
acceptance. See [the measured regression](../.scratch/machines/research/79-local-claude-git-sandbox.md).

CPU/RAM edits after creation are deliberately deferred: the pinned engine has no
verified same-storage resize route, and complete-state reconstruction remains
unverified. The app does not recreate a Machine to emulate an edit. See
[the scope decision](../.scratch/machines/issues/25-post-creation-resource-changes.md).

Updating an image pin does not migrate existing private state. An older saved kit
is refused before another download with a software-mismatch explanation. Its home
and login remain recorded. Continue with the matching application/image version,
or create a separate Agent sandbox; remove the old private data only after deciding
it is no longer needed. Automatic template pruning also stays deferred: retained
or missing ownership records and other engine clients can still use old templates.
Settings reports the download cache separately and does not invent private/template
byte totals. Linux installer packages are retained for the system installer; opening it is not proof that it consumed the file.

## Evidence and release gate

Validated artifacts cover five runtimes on arm64 and amd64, with native Docker CI
build/smoke checks. macOS arm64 RC5 measurements cover owned lifecycle/storage,
shared worktrees, the private-prefix installer, guest login challenges/cancellation,
and attachment-sized transport. These are distinct from successful account login,
provider turns and a Linux/KVM host test.

Current image pins are distributed by Guillermo's public
[`guillermolg00/blobot-machine-images`](https://github.com/guillermolg00/blobot-machine-images)
repository, built from snapshot `056a3b31fa1838e16fcdd181c7c89528f7baf226` for
`machines-20260905-1`. Guillermo was its sole listed writer/admin when checked on
2026-09-06. This private source repository's workflow publishes to its own repository;
public publication uses a separately reviewed snapshot/run. Hashes prevent a changed
asset from satisfying an existing pin. See [publisher provenance and CI limits](../images/machines/README.md).

Before removing the preview opt-in, record each remaining result in
[the acceptance ledger](../.scratch/machines/research/53-first-box-evidence-ledger.md):

- Complete the supported browser/device/manual login routes using the owner's
  accounts, then check login after sleep/reopen and isolation from a second Agent.
- Complete managed engine `sbx login` on macOS and Ubuntu, including missing-browser
  fallback, cancellation, keyring persistence and fresh positive readiness. The
  managed child closes stdin and forwards only host desktop-session endpoints;
  synthetic subprocess tests do not establish successful OAuth. The CLI's fallback
  URL/code is not currently surfaced when it cannot open a browser, so this remains
  an explicit release blocker rather than a certified flow.
- Run authenticated turns on each published image, including mailbox delivery,
  permission round trips, attachments, cancellation and session resume.
- Validate the Linux system installer and real sbx/KVM lifecycle on supported
  Ubuntu arm64/amd64 hosts. Native Docker CI is not this test.
- Complete Guillermo's visual/product review and address the findings.

The [implementation review](../.scratch/machines/review.md) and
[map](../.scratch/machines/map.md) distinguish implemented behavior, measured
evidence, deferred scope and these outstanding acceptance checks.
