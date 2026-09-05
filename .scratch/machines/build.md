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
