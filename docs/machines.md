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
   their placement and limits.
2. Settings → Machines provides engine setup, Docker browser sign-in and an
   explicit check. Setup downloads the pinned vendor artifact, verifies its hash
   and, on macOS, its signature. It disables shared SSH credential forwarding;
   a required daemon restart refuses while other sandboxes exist. Linux opens
   the system package installer. No Docker commands or terminal are shown.
3. The first sandbox start downloads the adapter's pinned runtime image. Each
   Agent has an 8 GiB home and 20 GiB Docker volume, while its working folder is
   a host worktree (or the existing Workspace provider's plain/nested copy).
   The same image download is shared by Agents using it.
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

## Boundaries

The Agent's worktree and common Git metadata are writable, including repository
configuration/hooks. Internet and host/local-network access are allowed, retaining
the runtime's chosen approval policy. The Machine does not grant a bypass mode.
No host home, credential files, SSH forwarding or host Docker socket are imported.
The accepted operator skills directory is mounted read-only; escaping skill links
are excluded. Local execution retains its existing native configuration/login.

CPU/RAM edits after creation are deliberately deferred: the pinned engine has no
verified same-storage resize route, and complete-state reconstruction remains
unverified. The app does not recreate a Machine to emulate an edit. See
[the scope decision](../.scratch/machines/issues/25-post-creation-resource-changes.md).

## Evidence and release gate

Validated artifacts cover five runtimes on arm64 and amd64, with native Docker CI
build/smoke checks. macOS arm64 RC5 measurements cover owned lifecycle/storage,
shared worktrees, the private-prefix installer, guest login challenges/cancellation,
and attachment-sized transport. These are distinct from successful account login,
provider turns and a Linux/KVM host test.

Before removing the preview opt-in, record each remaining result in
[the acceptance ledger](../.scratch/machines/research/53-first-box-evidence-ledger.md):

- Complete the supported browser/device/manual login routes using the owner's
  accounts, then check login after sleep/reopen and isolation from a second Agent.
- Run authenticated turns on each published image, including mailbox delivery,
  permission round trips, attachments, cancellation and session resume.
- Validate the Linux system installer and real sbx/KVM lifecycle on supported
  Ubuntu arm64/amd64 hosts. Native Docker CI is not this test.
- Complete Guillermo's visual/product review and address the findings.

The [implementation review](../.scratch/machines/review.md) and
[map](../.scratch/machines/map.md) distinguish implemented behavior, measured
evidence, deferred scope and these outstanding acceptance checks.
