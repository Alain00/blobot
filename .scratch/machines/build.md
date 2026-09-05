# Machines implementation

## 2026-09-05 — execution seam

The author asked to begin development. The first implementation follows *The engine, the
Machine interface, and a box's lifecycle*, after that ticket's split from the engine work.

Implemented in `packages/core/src/machines/`:

- `Machine`, bound to an Agent identity, with location, readiness, reconcile, start, spawn,
  stop, destroy, storage measurement and mailbox hostname. `MachineTransport` exposes a pipe,
  not a child process or an ACP type. `LineTransport` is its compatibility alias.
- Commands describe either executable/argv or a pinned Node package entry. Runtime requirements
  carry an opaque image reference and host list; no provider switch in the Machine factory.
- `LocalMachine` runs existing host commands; lifecycle calls own no files, and its volumes are
  explicitly null. The node executable can be supplied by a caller; core imports no Electron.
- All five adapters use the seam, preserve their existing injected spawn test doubles, and pass
  explicit environment layers. Only local execution inherits `process.env`. Speech keys are
  still removed, and Cursor's credential variables stay removed after environment composition.
- Desktop startup creates one local Machine per Agent and gives it to `runtimeFor`. Mailbox
  endpoint minting accepts the kind's hostname without widening the listener or changing tokens.
- ACP filesystem and terminal capabilities are one frozen constant, with a regression check
  covering every adapter. There are no host filesystem/terminal request handlers.

## Activation boundary

**No Agent runs in Docker yet.** `machineFor('box', ...)` refuses explicitly. Adapters also
refuse a supplied box before host-side preparation, even when a custom transport is provided.
Existing agents and new agents still run locally; no placement migration or default change has
been implemented. The optional question about making new agents default to box is unanswered.

The engine ticket must remove that refusal only after these paths are connected:

- Host executable discovery and npm resolution must become guest resolution. Never ship a host
  absolute executable/bridge path or copy the host environment into the guest.
- Cursor writes its config before spawning. It needs preparation on the data volume; do not
  pass a guest path to the current host `writeCursorConfig`.
- Claude, Codex, OpenCode and Cursor read workspace/user skills on the host for their palettes.
  A box's palette must reflect its own workspace and mounted skills. fx has only built-ins.
- `startTeam` currently checks installed runtimes on the host; box readiness must inspect the
  runtime inside its Machine. Its Workspace provider and branch transport must be connected too.
- TeamPool stop/wake and deletion must operate on the Machine lifecycle after transport closure,
  preserving work before destroy. Local no-ops do not establish box lifecycle behavior.
- Image, volume adoption, engine policy, engine sign-in and runtime sign-in still belong to
  their open decisions. The root kit/transport now exist (below), but have not been wired into
  the factory. The mailbox hostname alone neither opens the engine's door nor proves its
  policy is engaged; retain the inbound handshake check.

Do not use the shipped Docker Claude kit as the product image: the research records its bypass
default and login outside the declared volumes. Do not use `--clone` as a silent substitute for
the Workspace decision: it mounts the source and rejects a worktree.

## Validation

- Core: 752 passing tests, 41 skipped (including live-provider tests).
- Desktop: 495 passing tests, 1 skipped.
- Typecheck for both packages and production builds for core and desktop pass.
- New tests exercise real process argv/cwd/environment/EOF, per-Agent identity, non-destructive
  local lifecycle, all five launcher paths, box refusal, client capabilities and mailbox bearer
  routing. No Docker VM or billed provider turn was started in this session.
- The pnpm Corepack shim points at a missing `pnpm/12.1.0/bin/pnpm.cjs`; checks used the installed
  TypeScript, Vitest and electron-vite binaries directly. Socket tests required leaving the
  execution sandbox because it refused `listen` on `127.0.0.1`.

## 2026-09-05 — first sbx kit and transport

Resolved implementation seam:
[The first engine: sbx behind the interface, and a box's life](issues/17-the-first-engine-sbx-behind-the-interface.md).
The next session continues at
[A box's lifecycle, engine setup, and the pool](issues/19-a-box-lifecycle-and-engine-setup.md).

New internal primitives in `packages/core/src/machines/sbx/`:

- `kit.ts`: explicit image/Node/capacity inputs, immutable Agent-id names, a root kit without
  vendor inheritance, two private volumes and synchronous UID 1000 root ownership preparation.
- `transport.ts`: non-TTY `sbx exec -i` over `MachineTransport`, an explicit client environment
  and an allowlisted guest layer. Values travel in a bounded length-prefixed stdin header,
  never as `sbx -e` arguments. No create, daemon mutation or isolation claim in this primitive.
- `bootstrap.ts`: exact header consumption followed by inherited protocol stdin; pinned guest
  module resolution, runtime exec and JSON config merging before launch. Host bridge paths and
  engine/credential environment overrides are refused; preparation errors omit config values.
- `kit.test.ts`, `transport.test.ts`: fourteen deterministic tests, including six MiB of
  protocol input, config-before-launch, symlink refusal, unavailable client and stderr drain.
- `live.test.ts`: opt-in fixture-only real-engine probe, no provider/login. It creates its own
  temporary kit, empty mount and box and deletes the test resources afterwards. Tested on
  **v0.39.0** with an already-cached shell image; its creation syntax is version-specific.
- Shared child transport now handles stdin errors and drains stderr when no callback is set.

### Verified and deliberately not claimed

The live test passes: process UID 1000, explicit multiline environment delivery, config
available before launch, and both volumes persistent across stop/exec. Its initial permission
failure established why ownership must be prepared after the volumes mount.
[Evidence and commands](research/09-sbx-kit-and-ssh-boundary.md).

**Still no Agent runs in Docker.** The factory and all adapter guards remain unchanged.
The installed engine requires a writable host mount and has no established SSH forwarding
disable mechanism. RC2 has a daemon-level control and mount-free create syntax, but neither
the effective SSH boundary nor an RC2 box was tested. The prerelease choice is unanswered.
No engine upgrade, daemon setting change or credential import was performed. The new kit
does not implement the egress policy, mailbox rule, adoption marker, pool or product image.

Whole-home mounting must be reconciled with the image contract: any CLI/bridge installed
only beneath the image's `/home/agent` can be hidden. Do not infer login persistence from a
JSON fixture, nor resume support from a workspace counter. Low-level exec relies on the
future engine for admission and lifecycle; killing a client is not proof the VM has stopped.

### Validation after this seam

- Core: **766 passed, 42 skipped**; desktop: **495 passed, 1 skipped**.
- Additional opt-in real sbx probe: **1 passed** (11.16 s); final `sbx ls --json` returned an
  empty sandbox list. Only disposable test boxes/volumes were removed, not user data.
- Core/desktop typechecks and production builds pass; `git diff --check` passes.
- Same installed-binary workaround for the broken pnpm shim. Desktop tests print the existing
  jsdom canvas warning; it is not a failure. No paid model call was made.

## 2026-09-05 — RC5 development admission, in progress

The author extended this session to **two tickets** and required `grill-with-docs` for any
remaining choice. Current claim is
[A box's lifecycle, engine setup, and the pool](issues/19-a-box-lifecycle-and-engine-setup.md);
the intended second ticket is
[Detection, and its remedies, when the runtime is not on this computer](issues/08-detection-and-remedies-per-machine.md),
still blocked and unclaimed. Neither is resolved by the checks below.

The author explicitly approved the candidate upgrade, daemon-wide SSH forwarding disable,
and a restart conditional on no unrelated sandbox being interrupted. That development step
is complete: Homebrew now supplies RC5, the daemon reports forwarding disabled after restart,
and the fixture verifies absence of the relay at UID 1000 and root even with a fake host SSH
agent available. Both volumes survive stop/exec; no host Workspace is mounted. The only
virtiofs mounts observed are the engine's two generated, read-only network files.
[Exact installation and observed evidence](research/10-sbx-rc5-engine-admission.md).

Added `admission.live.test.ts` behind `BLOBOT_LIVE_SBX_RC5=1`. It never changes global settings
or starts/stops the daemon and requires an already-cached template. Updated the original
`BLOBOT_LIVE_SBX` fixture to support the observed RC5 mount-free syntax while retaining its
explicit v0.39 fixture route. Both clean up partially-created test sandboxes by exact name.
`client-environment.ts` shares the explicit host environment and forces `SBX_NO_TELEMETRY=1`
on transport clients; it still excludes real SSH-agent and credential variables.

Validation: sbx module **18 passed**, including both real-engine fixtures, run serially;
whole core **768 passed, 43 skipped**; core typecheck/build and `git diff --check` pass.
Final sandbox list empty. No paid model call, provider sign-in, repository import or image
deletion. Desktop code unchanged; its suite has not been rerun in this increment.

**Activation guards remain closed.** Product shared-daemon authority, resource/concurrency
budgets and box-object adoption/image replacement are still open choices on the claimed
lifecycle ticket. Development authorization is not silently promoted to product policy.
No commit/handoff yet: the two-ticket implementation session is in progress, paused for the
next explicit product decisions rather than marked complete.

### Resource-policy correction during the same session

Guillermo confirmed shared setup and adoption policies, but requires configurable **maximum**
CPU/RAM, not needless reservations. The prior sum-of-configured-RAM proposal is superseded.
[Measured resource evidence](research/11-sbx-resource-limits.md) shows a 4 GiB/2-vCPU fixture
at about 781 MiB host RSS after creation, increasing under a 256 MiB workload and decreasing
after release. The full configured capacity was not pre-resident; no guaranteed reclamation
latency or hard aggregate host-memory bound is claimed.

An explicit capability decision remains: RC5 has no established public resize operation for
existing persistent Machines. Ask whether configurable limits applying to new Machines is
acceptable initially; do not delete/recreate existing Machines or display desired limits as
effective. The two selected tickets remain unfinished, with no commit/handoff yet. The user
reiterated that completion must include commit and handoff for the next **two** tickets.

The author then **rejected new-Machines-only limits**: existing Machines must be adjustable,
with a restart if necessary and warning/confirmation before interrupting active work; resource
selection must not become a required creation step. Public RC5 routes were tested:
run-with-new-limits explicitly refuses; a resource mixin is invalid; a legal kit-add supplying
new parameterized-root arguments succeeds but leaves effective CPU/RAM unchanged. Both
private volumes kept their fixture markers. All probe boxes were cleaned up.
[Probe details](research/11-sbx-resource-limits.md#existing-box-resize-probes--observed-by-the-implementing-session).
The next decision is whether to reopen the first-engine choice to satisfy this requirement,
not whether to substitute new-Machines-only configuration again. No alternate engine installed.

### Replacement validation — next question refined

Guillermo proposed replacing execution while preserving volumes and requested a live check.
[Documented and measured result](research/12-sbx-volume-reattachment.md): RC5 rejects local
existing-volume attachment, but a two-box tar-stream fixture **passed** 2-CPU/2-GiB to
3-CPU/3-GiB replacement with both persistent trees, metadata, target restart and original
reopening intact. No real credentials, host archive, provider or user data participated;
all fixture boxes were removed. Product code remains unchanged by this validation.

This supersedes the binary engine-change question above: a viable **copy migration** needs
the author's decision on transfer cost, temporary disk/RAM and home data traversing broker
memory before implementation. Read the evidence's untested consistency/performance/failure
boundaries before promoting the fixture to a lifecycle contract. The two-ticket work remains
unfinished; commit/handoff at its completion is still owed.

## 2026-09-05 — implementation checkpoint, then Eve comparison requested

Still unfinished: **A box's lifecycle, engine setup, and the pool** remains claimed;
**Detection, and its remedies, when the runtime is not on this computer** is not claimed.
The author's latest approvals live on those tickets. No commit/handoff has been made.

Implemented in this working tree:

- `packages/core/src/machines/sleeping-runtime.ts`: event-driven execution power, configurable
  inactivity, session-preserving wake, held work/permissions, fresh pre-work hook, and explicit
  interruption confirmation for a supported Machine's resource edit. Twelve focused tests pass,
  including a prompt arriving during sleep or reconfiguration. Local execution uses this now;
  it stops the Agent process, not the computer.
- Desktop rail power dot and Settings → Machines idle duration, persisted atomically and applied
  to existing open executions. No polling per avatar. The user's explicit color exception is
  recorded in DESIGN.md and **The team and conversation UI**. These surfaces still need final
  visual verification; CPU/RAM controls for a real box are not wired into the desktop.
- `sbx/data-transfer.ts`: opaque two-volume streaming with before/after archive digests,
  sparse-file support, cancellation/deadline and original retention. Its separate RC5 live
  transfer fixture passed. GNU sparse format 0.0 fixed an observed digest mismatch; do not
  infer full real-CLI session/login verification from synthetic files.
- `sbx/owned-machine.ts`, `registry.ts`, `observations.ts`: **staged, unexported lifecycle**,
  owned IDs, journal before creation/copy, leases, limited boundary observations, scoped mailbox
  rule lifecycle and copy-based resource replacement. `destroy()` deliberately refuses until
  Workspace preservation integration. Stale process leases and interrupted operations still
  require a designed recovery path. No box factory/adapter guard was opened.

Verification checkpoint, not final acceptance: core suite **812 passed / 45 skipped**;
desktop **500 passed / 1 skipped**; both typechecks passed. A first opt-in owned-lifecycle
fixture passed create/stop/reopen/resize/original retention in about 72 seconds for the whole
test. **The later stronger fixture currently fails** the fresh pre-work network admission:
the assumed explicit global catch-all deny rule is not present in the observed listing after
a scoped allow. Reading named and unnamed policy listings has not resolved that assumption.
Do not weaken the check or claim a final green lifecycle suite. Fixture cleanup ran; no real
credentials or workspace participated. The failure/timeout branch added to that live test
has not been reached successfully yet.

Guillermo then asked to check whether Eve handles this more simply. **Implementation paused
for that read-only architectural comparison**. [Eve's actual Docker backend](research/15-eve-docker-sandbox-lifecycle.md)
records the source-reviewed distinction and the possible Docker Engine alternative; it changes
no binding decision. Main also read the docs shipped in published `eve@0.52.1`, downloaded
with `npm pack --ignore-scripts` to `/private/tmp/blobot-eve-review.LcgG5E`; no repo dependency
was installed. Any engine change must be discussed with the author, not inferred from this review.

## 2026-09-05 — lifecycle and scoped detection closed; engine review deferred

Supersedes the in-progress checkpoints above. Guillermo directed this session to finish on
`sbx`, commit, then prepare—but **not run**—research and a HITL reevaluation for another session.
The resolved scope and remaining activation dependencies live on
[A box's lifecycle, engine setup, and the pool](issues/19-a-box-lifecycle-and-engine-setup.md)
and [Detection, and its remedies, when the runtime is not on this computer](issues/08-detection-and-remedies-per-machine.md).

Final implementation adds scoped guest detection and watched-PTY command contracts to the
earlier checkpoint. `SleepingRuntime.inspect` neither wakes nor resets the idle clock, and
serializes inspection with sleep. Engine display/status is separate from fresh work/setup
checks. Adapter launch/sign-in refusals survive the sleep wrapper. Shared isolation setup
checks the supported pin, consent and empty inventories; browser-login exit is separate from
fresh readiness. No production installer/RC rollout, image activation, host credential import,
automatic recovery, or orphan destruction was enabled.

The failing network admission is fixed without broadening access: RC5 hides its synthetic
default-deny display row after an explicit rule, and uses `rules:null` for a second box's
empty scoped list. The parser handles these measured forms, keeps complete applicable-rule
checks, rejects unexpected allows/unknown metadata, and supplements them with the daemon's
effective authorizer. The live regression now covers **two simultaneous owned Machines**,
scoped mailbox rules, synthetic guest runtime detection, abandoned sign-in callback, no wake
on sleeping detection, stop/reopen, data-preserving limit replacement, original retention and
interrupted-copy refusal. Stop now verifies the exact engine ID reports stopped before power
can become asleep. A failed/unknown partial creation retains its lease and journal.

### Final verification

- Core: **830 passed, 45 skipped** (71 passing files, 11 skipped).
- Desktop: **503 passed, 1 skipped** (45 passing files, 1 skipped), including saved idle hours,
  zero-disable, invalid input and failed-save UI tests. Existing jsdom canvas warnings remain.
- Opt-in RC5 extended lifecycle plus observation suite: **14 passed**, 120.62 s. Synthetic
  fixtures only; no real provider login or paid inference. All test boxes/volumes were removed.
- Both typechecks, core and desktop production builds, and `git diff --check` pass. Used the
  installed binaries directly, as the pnpm shim issue remains environmental.
- Visual review in an isolated temporary Electron profile: Settings → Machines and actual rail
  components with synthetic awake/asleep snapshot data. Green/gray lower-right dots and settings
  layout inspected. `/private/tmp/blobot-machines-visual.hVExRn/{settings,power}.png`; this is
  presentation verification, not a claim that demo or real Docker Agents exercised sleep.

**Still no Agent runs in Docker.** The factory/all adapter box guards remain closed. CPU/RAM
editing exists in the staged lifecycle/runtime API, not a shipped box settings screen. Image,
Workspace, egress, real CLI login/resume, Machine-screen activation and explicit recovery doors
remain work under the existing plan. Do not reinterpret these two resolutions as the whole
Machines feature being ready, or use the upcoming research as permission to switch engines.

Implementation committed as **`5d2edd9`**. After that commit, the author-requested research pair
and dependent reevaluation were created under the map's next-session priority. They remain
open and unclaimed; neither research nor the grill was run, and no downstream plan was changed.

## 2026-09-05 — engine comparison closed; implementation resumes next session

The research pair was completed with bounded synthetic Mac fixtures and committed as `7afa57d`.
The author's subsequent engine/workload decision is recorded in
[Reevaluate the first Machine engine with the measured trade-offs](issues/22-reevaluate-the-first-machine-engine.md#answer).
All three comparison tickets are now resolved. The map's **Engine review complete** note is the
current continuation order; the research-first handoff and priority above are historical.

The author requested commit and handoff before the next implementation task. Only planning and
research artifacts changed in this follow-up; no production code changed, no implementation
ticket was claimed, and no application test/build result is newly claimed. The lifecycle and
detection closure above remains the authoritative implementation checkpoint, including its
closed activation guards. **Still no Agent runs in Docker through blobot.**

Research fixture cleanup was verified: no disposable sbx Machines or labeled Engine fixtures
remain, and the pre-existing Engine containers were left unchanged. Neither shared daemon was
stopped or reconfigured for the comparison. No real provider login or paid inference was used.

## 2026-09-05 — Workspace resumed; author changes box clones to worktrees

The Workspace ticket was claimed and its historical proposals audited against later decisions.
Guillermo accepted the recommended remaining choices, then clarified clone/worktree/remote
semantics and explicitly requested worktrees on both local and box. Its **Current direction**
section supersedes the clone implementation plan. The Machine ticket is narrowly reopened
and claimed for the resulting shared-Git access boundary; Workspace keeps its claim and is
blocked on that answer. The map's **Current continuation** is the entry point.

The public RC5 create route was verified with an owned synthetic fixture mounting exactly
one worktree and its common Git directory, both RW, beside the generated network files.
Commit inside at UID 1000 updated the host branch immediately, without fetch, with the same
origin URL; the main checkout and sibling loose files were absent at root and Agent UID.
The work survived stop/reopen. The [fixture and limitations](research/20-worktrees-in-sbx.md#parent-session-live-fixture--observed-2026-09-05)
remain research evidence, not production integration or a new isolation guarantee. The owned
box and temporary host tree were removed, with empty inventories before/after and no shared
daemon changes, provider login, paid turn or real repository mounted.

No application source changed in this resumption. No application test/build result is newly
claimed; the prior implementation checkpoint still stands. Worktree integration must revise
the volume/admission/persistence assumptions before activation, and the image work must read
that revised contract. The two implementation tickets have not been marked complete.


## 2026-09-05 — host-worktree Workspace implemented; image decision pending

Guillermo accepted shared Git metadata RW (“eso está bien, no pasa nada”), closing the narrow
Machine reopen. [Where a Workspace lives when the Machine is not this one](issues/05-where-a-workspace-lives.md#answer)
is now implemented and resolved. Its Answer owns the revised contract, scope and limitations;
the preceding research-only/no-source checkpoint is historical.

The implementation derives validated same-path mounts from the existing host providers,
admits them through the staged owned lifecycle, keeps Agent work separate from Machine
removal, supplies Agent commit identity without rewriting Git config, omits the main checkout
from the persona, limits box palettes to mounted authored content, and initializes readonly
skills aliases after home attaches. Full clean carries work/state/total bytes and refuses
unknown sizes before any purge; ordinary removal reports preserved inaccessible data.
Machine state measurement is still honestly unknown. The production factory and adapters
remain local-only until image/egress/setup admission is complete; no Agent runs in Docker
through the application yet.

Verification on this Mac, after implementation:

- Core: **837 passed, 46 skipped**, 74 passing files. Opt-in live suites are skipped normally.
- Desktop: **506 passed, 1 skipped**, 46 passing files. Existing jsdom canvas messages remained.
- Core and desktop `tsc --noEmit`: passed.
- Core build: passed. Desktop Electron main/preload/renderer build: passed.
- `BLOBOT_LIVE_SBX_WORKTREE=1` staged lifecycle fixture: **1 passed**, 27.80 seconds with the
  final readonly-skills test. UID 1000 commit reaches the host branch without fetch; main
  checkout/config stay unchanged; loose files survive sleep/reopen; skills remain readonly
  at root and UID 1000; destroying the Machine leaves host work intact. No provider login,
  paid inference, real repository or real skills tree used. Cached shell template only.
- `sbx ls --json`: empty after cleanup. No shared daemon/configuration changes. The failed
  first `:rw` syntax attempt was cleaned after verifying its box absent; corrected public
  `create` calls use writable paths by default and `:ro` only for skills.
- `git diff --check`: passed.

The second requested ticket, [The image: one per runtime](issues/13-the-image-one-per-runtime.md),
is claimed and **not complete**. [Image decision frontier](research/21-image-decision-frontier.md)
records primary-source research and the skills lookup matrix. The author has been asked
whether to use a pinned derivative of Docker's shell template or build a fresh Ubuntu base;
no answer has arrived. No image or release has been built/published. Complete private
system/Docker preservation, capacity budgets, release distribution and per-runtime acceptance
remain that ticket's work. Resource replacement on mounted Workspaces refuses until the
preservation contract is verified; it never runs the legacy home/workspace-only copy on them.

Implementation and its verification are committed as **`65aece0`**. Guillermo then requested
a commit and handoff to continue in another session. The next session resumes the claimed
image ticket and the pending base choice above; the request does not answer that choice.
This closing update changes documentation only, with no additional test/build result claimed.

## 2026-09-05 — image resumed; synthetic local snapshot boundary measured

Resumed from `/private/tmp/blobot-machines-handoff.UJNCQo/handoff.md` at `d9215bd`.
The image-base question was presented again and remains unanswered. Independent research and
a bounded RC5 fixture are recorded in
[Local templates and private Docker](research/22-local-template-and-private-docker.md),
including the implications for the image ticket's persistence gate and the distinction between
root filesystem snapshots and private volumes. The fixture passed; its two boxes and private
template were removed with no cleanup errors. No host data mounts, provider login, paid turn,
tar export or shared-daemon changes were used.

Only research and tracker artifacts changed in this resumption. Application tests/builds were
not rerun or newly claimed; the implementation checkpoint at `65aece0` still stands. The image
ticket is claimed and incomplete, and production activation/resource-replacement guards remain.

The author subsequently answered **“si acepto”** to the pending common-base proposal.
[The image: one per runtime](issues/13-the-image-one-per-runtime.md#base-decision-2026-09-05-guillermo)
owns that answer. Continue implementation using its pinned base; the pending-choice state above
is historical, and this acceptance alone does not close the remaining image outputs.

## 2026-09-05 — continuous implementation goal; image checkpoint

Guillermo requested completion of all Machines implementation as a goal, validation throughout,
one commit per ticket, and a checkpoint at each issue boundary for context recovery. The latest
map Notes supersede the older stop-after-two/handoff scope. Non-obvious choices still use
`grill-with-docs`; basic implementation choices are delegated.

Resume the claimed [The image: one per runtime](issues/13-the-image-one-per-runtime.md#implementation-checkpoint--continuous-goal-2026-09-05).
That checkpoint links the build/distribution code and acceptance evidence without treating
unpublished download pins or incomplete preservation as complete. The image implementation and
evidence form a dedicated checkpoint on `feat/machines` after `d9215bd`; Workspace remains
committed at `65aece0`. This checkpoint does not resolve the image ticket.

Completed acceptance evidence is indexed in the image ticket's **Acceptance results
before publication** section: research29 covers all five runtime images, research30 preserves
private state but retains a failing whole-state gate, and research33 validates the final
image-store code against real sbx. Latest full core validation is **849 passed, 46 skipped**,
with types/build passing; affected download/image/storage suites pass **29 tests**. Desktop
types/build were rechecked after the final core changes; its unchanged UI suite remains
**506 passed, 1 skipped**. Draft-release aggregation adds **3 passing Node tests** for ten
verified pins, corrupt bytes, missing architecture and failed smoke acceptance. Workflow YAML,
script syntax and `git diff --check` pass. Nothing enables production box launch or real Agent
snapshotting. Native amd64 builds, anonymous release downloads, provider sign-in, mailbox
acceptance and complete state preservation remain outstanding.

The next human decision is whether to create the separate public artifact repository
`guillermolg00/blobot-machine-images`. The private application repository remains `Alain00/blobot`.
The reviewable publisher tree is `/private/tmp/blobot-machine-publisher.bl_0auk9`; its exact
15-file, 107,462-byte manifest is
`/private/tmp/blobot-machine-images.040Rvi/publisher-review.json`. It contains build recipes,
lockfiles, documentation and the native CI workflow, without application source or Agent data.
No remote repository, push, workflow run or public release has been created. After an affirmative
answer, record it on the image ticket, create/push only this reviewed tree, validate all ten
native builds, review and publish verified assets, then test anonymous downloads before filling
adapter pins. Do not treat publication success as whole-state preservation acceptance.
Keep the continuous goal active and the image claimed while awaiting this non-obvious decision.

## 2026-09-05 — public distribution authorized and CI started

Guillermo answered **“ok”** to the public repository and verified-image publication question.
The image ticket records the scope. Created
<https://github.com/guillermolg00/blobot-machine-images> from exactly the reviewed 15-file tree,
initial commit `056a3b31fa1838e16fcdd181c7c89528f7baf226`. The private application repository
was not pushed or made public. The publisher checkout is still
`/private/tmp/blobot-machine-publisher.bl_0auk9`.

Dispatched the native 5-runtime × 2-architecture workflow for draft tag `machines-20260905-1`:
<https://github.com/guillermolg00/blobot-machine-images/actions/runs/33987159409>.
The CI run, not a local build, must supply final receipts. Research34's public-download fixture
will compare the published manifest, verify all ten archives through the production downloader
and archive validator, and exercise HTTP Range resume on fx arm64 before app pins are added.
It makes no engine calls. Keep only its fx archive for the separate engine-load check.

The research agent `image_preservation_resume` has exclusive sbx access for research35 while
distribution runs. Its task is to investigate a complete rootfs fidelity mechanism and actual
candidate stop/reopen, without changing production or relaxing the acceptance requirements.
Do not run a competing sbx fixture until that agent explicitly releases the engine.

## 2026-09-05 — public images verified; pause for main integration

The public distribution checkpoint is complete. Research34 records the immutable
`machines-20260905-1` release, ten successful native runtime/architecture build jobs, all ten
anonymous full-archive downloads through the production verifier, actual HTTP Range resume,
and successful real-sbx load/readiness/cleanup using the public fx arm64 bytes. Both published
architectures are now pinned in all five adapters. No application repository push occurred.
All downloaded archives were removed after verification; the public publisher's README was
updated and pushed separately as `0cfeb71`.

Research35 found real sparse-content corruption as well as ACL/nanosecond-mtime loss in the
engine snapshot. Authoritative PAX transfer preserves the tested state. Research36 closes the
ordinary concurrent-exec admission gap with a VM-local maintenance sibling and whole-container
freezer, including worker-death recovery. Both fixtures cleaned their sandboxes and ceded sbx.
Research37 then validated complete incremental PAX dumpdirs with default replacement semantics,
including type swaps, absence and replacement of running Node/tar binaries in a synthetic chroot.
Its eleven assertions pass and its Docker container is removed. Use its exact recipe and limits:
`--unlink-first` fails on the root directory; `--overwrite` damages existing mappings/hardlinks;
target-only directory xattrs need safe removal and sockets are silently omitted with exit zero.
The five research37 files are linked from the image ticket and ready for the same checkpoint.
These are component experiments, not production complete-state migration. The next step remains
composition of same-base candidate creation, full rootfs/private-volume transfer, mount
exclusion, checked freeze/quiescence, verification after reopen and durable cutover/recovery.

Core's internal `SbxStateChannel` is the tested protocol foundation for that future composition:
bounded control/data frames, awaited pipe writes and data consumers, refusal of concurrent
operations, terminal close after protocol/I/O failures, and sanitized errors. It does not yet
spawn workers or activate replacement. All existing reconfigure and box-launch guards remain.
The channel has 10 passing tests and core typecheck passes. The earlier affected image/download
suites passed 16 tests; core types/build and desktop types/build passed, and compiled adapter
definitions exactly matched the independently verified release catalog. Full suites will run
again after integrating `main`, because that changes the combined application.

Guillermo requested this checkpoint's commit, then integration of Alain's latest `main` with
conflicts resolved and validation, followed by a pause before more work or UI. Keep the image
ticket claimed; this commit does not resolve its outstanding preservation, sign-in, mailbox,
egress or activation gates. The overall goal is incomplete. Resume only after this requested
pause; do not treat the older continuous instruction as permission to start UI now.

## 2026-09-05 — main integrated and validated; requested pause

Image/distribution checkpoint: `1991ff6` (`feat(machines): pin verified public runtime images`).
Fetched `origin/main` at `9516cc9ea08b20f585c0758bb8497bc2389d3c14` and integrated its 19 new
commits with a merge, preserving both histories. The incoming work includes the file/Git sidebar,
live transcript blocks, pictures, chosen face shapes and updated design guidance.

Conflict resolutions preserve both implementations: all five adapters keep Machine admission
and local fallback construction while adding `PictureWatch`; the sleeping runtime factory
passes the picture store; the rail keeps upstream shape/wandering behavior when awake and the
existing Machine power/stillness behavior when asleep. Selective commits carry the Agent's
unsigned identity, including inside a nested Workspace. The persona keeps upstream's explicit
working-directory guidance while naming only the AgentWorkspace, as the accepted boundary
requires. No production box or resource-migration guard was opened.

The incoming September 4 map fork predates the accepted local/box scope. Resolved answers and
their dependency statuses remain intact. Its two new questions had number collisions: the
server fork is retained as ticket 23, closed under the already accepted scope boundary; the
composition-root question remains open as ticket 24, subject to existing inheritance/home
decisions. The main map records this reconciliation rather than silently reinstating the old
server frontier or losing the questions.

Validation on the combined branch:

- Frozen-lockfile dependency installation succeeded. The pnpm shim's extra manager metadata
  was removed from the working copy; the dependency lock is exactly main's version.
- Core: typecheck and build pass; **911 tests passed, 46 skipped** across 83 passing files.
- Desktop: typecheck and production build pass; **610 tests passed, 1 skipped** across 53
  passing files. React `act` warnings were non-failing in existing runtime-options tests.
- The real Git identity fixture now also verifies selected tracked/untracked files are
  committed as the named Agent, unsigned, while unrelated staged work and shared config stay
  intact. Existing selection, Machine power, adapter, store and sidebar tests all pass.
- Electron demo opened the Alice pane with the file sidebar and exited successfully after
  capturing `/private/tmp/blobot-main-merge-demo.png`; the empty synthetic folder is shown
  honestly as `no folder`. This is a rendering smoke check, not real-provider acceptance.

Stop here at Guillermo's request. The next continuation resumes complete-state migration and
the remaining Machines plan against this merged UI baseline. No new Machines UI work began,
the image ticket is still claimed and the overall goal is not complete. The application branch
has not been pushed.

## 2026-09-05 — resumed; transfer verification and explicit recovery

The author said “continua” after the main merge and requested pause. Continuous advancement
is authorized again. `1167d61` remains the merged baseline; no new Machines UI work has begun.

The staged lifecycle records an admitted replacement before copying and its copying/verifying
phase. `recoverReconfiguration` verifies both owned identities, stops both Machines, verifies
the original, removes the pending operation and retains the partial replacement. A new owner
can perform this recovery. Unknown creation identities remain refused and nothing is deleted.

New ownership/operation locks use separate empty SQLite files and `BEGIN EXCLUSIVE`, through
the existing better-sqlite3 dependency. They release on process death and do not depend on PID
reuse, elapsed time or stale-lock stealing. Files remain in place to preserve lock identity;
legacy `.owner`/`.lock` directories are explicit recovery cases. The message database and
private Machine contents are not involved. Primary locking semantics:
[SQLite locking](https://www.sqlite.org/lockingv3.html) and
[exclusive transactions](https://www.sqlite.org/lang_transaction.html).
Two actual child-process tests verify contention, SIGKILL recovery and unchanged journal.

`copySbxState` preflights all three trees before receiver mutation, checks source/relay/target
digests and bounds aggregate bytes, with cancellation and sanitized errors. The strict fresh
maintenance verifier compares saved digests; it deliberately does not exempt boot changes.
The guest-only PAX checker verifies member paths, full dumpdir coverage and bounded metadata.
Research41 proves acceptance of a real GNU tar stream in addition to the negative unit cases.
Neither component is wired to a full-state guest worker yet; resource replacement remains
refused for mounted Workspaces and explicit private Docker storage.

Research38 supplies a whole-root inventory/stream measurement, including mount exclusion,
and shows a real `dockerd.log` change after reopening even the original. Research39 traces
the unobservable flags and explains why same-base copying alone cannot establish their
preservation. Further attribute measurement is running as research40, with one synthetic
sbx owned by `image_preservation_resume`; wait for its explicit engine handoff before any
other sbx fixture. No provider sign-in, paid turn or production activation is implied.

Validation at this checkpoint:

- Core: **945 passed, 46 skipped**; typecheck and build pass.
- Desktop: **610 passed, 1 skipped**; typecheck and production build pass. Existing canvas/act
  test-environment notices are non-failing.
- Real staged lifecycle: interruption and recovery pass in **143.45 seconds**, including a
  fresh owner and the new SQLite leases. The original and partial candidate stay recorded;
  the UUID-owned fixture cleans them afterward. Final sbx inventory was empty before research40.
- PAX checker: **17 tests pass**, plus the real GNU tar fixture; its own Docker container is
  removed. A final metadata-buffer adjustment is checked again before committing.

Next: finish measured metadata admission, implement the held guest workers and isolated
rootfs/home/Docker restore, then verify stop/reopen semantics and durable cutover. Do not mark
the image ticket resolved at this checkpoint. Complete-state migration and the full Machines
goal remain unfinished; the application branch has not been pushed.
