Type: grilling
Status: resolved
Blocked by: 17

# A box's lifecycle, engine setup, and the pool

## Resource capability amendment, 2026-09-06

[Change CPU and RAM without replacing unverifiable Machine state](25-post-creation-resource-changes.md)
records the measured capability limit and delegated implementation decision.
Production sbx limits are chosen before creation and retained with that Machine;
the existing staged two-volume replacement is not a general-purpose box resize.
Keep normal stop/start, explicit deletion and ownership checks. A future resize
capability must close its own complete-preservation gate before being offered.

## Question

The second half of *The first engine: sbx behind the interface, and a box's life*, split on
its explicit *Sizing* seam. Read that ticket's original questions and handoffs as background;
this ticket now owns the lifecycle and setup decisions below.

- Box-object adoption/refusal, orphan cleanup and image changes (volume markers remain the
  Workspace ticket's).
- Resource caps, concurrency and TeamPool start/stop mapping; preservation before deletion.
- Engine loss, host sleep and process death; the engine facts behind resume and wake.
- Ephemeral mailbox port rules, their replacement/revocation and confirmation before launch.
- Daemon startup and telemetry, raised with the user; installer, template load and browser login.
  Never bare `sbx setup`, and never importing the operator's credentials.
- SSH admission belongs here because the discovered control is **daemon-wide**, not in the
  kit: `ssh.agentForwardingEnabled=false`, with restart required for existing forwarders.
  Choose a supported engine version with the user, verify the actual settings response and
  effective absence of the host signing capability, then decide how to handle an existing
  shared daemon without disrupting unrelated sandboxes. Unknown is refusal, not false.
- Runtime sign-in mechanism and readiness cost handed to the setup experience ticket.
- Fetch transport's first run and proxy block diagnostics, handed here by the first engine
  ticket; editor access only if the screen ticket actually includes it.

## Acceptance

The kit/exec work is the prerequisite, not proof that a box may yet run an Agent. Read the
image, Workspace and egress decisions before activating a box in the factory or changing
placement defaults. Record actual engine measurements separately from interface guarantees.

## Starting evidence

[A custom sbx kit and the host SSH boundary](../research/09-sbx-kit-and-ssh-boundary.md)
records parser checks, the exact candidate setting, and the successful fixture-only live
transport/persistence test. Read the final operational caveat: status/settings queries can
misreport under restricted socket access, and a query can attempt daemon startup.

Installed stable v0.39.0 has no established SSH disable control and requires a writable host
workspace mount. RC2 adds a daemon control and mount-free create syntax, but was only inspected
in a temporary directory, not installed or used to run a box. The user has **not answered**
whether adopting that prerelease for development is acceptable. Ask before upgrading, changing
shared settings or restarting the daemon. Do not treat this implementation request as approval
to import credentials or disrupt another application's sandboxes.

Keep this ticket bounded: if the daemon/SSH/setup decision consumes the session, split pool
and lifecycle integration into a named successor before claiming them complete.

## Comments

### 2026-09-05 — Eve comparison requested before adding more engine-specific work

Guillermo asks whether Eve's Docker sandbox integration shows that this implementation is
overcomplicated. The [source review](../research/15-eve-docker-sandbox-lifecycle.md) finds a
different engine and a narrower persistence/resource contract. It also identifies Docker
Engine's native resource updates and independent volumes as an alternative worth discussing,
not an approved replacement for the microVM/egress decisions. Worktree implementation and
its remaining failing live admission check are recorded in `../build.md`'s latest checkpoint.
Neither this ticket nor its dependent detection ticket is resolved by the comparison.

### 2026-09-05 — observable adoption and sleep confirmed (Guillermo)

The author accepts adoption based on the recorded engine ID and observable limits, permissions,
mounts and isolation. Any mismatch or unverifiable required fact refuses. This cannot detect
all out-of-band image/configuration changes; do not claim complete inspection from sbx.

Sleep is now explicitly visible on the Agent avatar (DESIGN.md's power-dot amendment).
A message wakes execution and is delivered once; inactivity sleeps it without killing work,
pending permissions, queued messages or held Routine work. The timeout is configurable and
applies to existing executions. Two hours is the implementing session's announced initial
default, not a fixed product limit. A local Machine sleeps its Agent process, never the host.

### 2026-09-05 — development engine authorization (Guillermo)

Asked whether to install the current candidate **v0.42.0-rc5**, disable SSH-agent forwarding
daemon-wide, and restart **only after checking that no unrelated sandboxes are interrupted**.
The author answered **"ok"**. This authorizes that development-machine operation, not silent
shared-daemon changes on users' computers, credential import, or a production prerelease policy.
The earlier unanswered RC2 question is superseded by this exchange. Effective SSH isolation
still needs measurement; an accepted setting alone is not proof.

### 2026-09-05 — authorized engine step measured; remaining product choices are open

RC5 is now installed, forwarding is disabled and the daemon restarted after confirming an
empty sandbox list. The opt-in fixture checks relay absence at UID 1000 and root, even with a
fake host SSH agent, and volume persistence across stop/exec. It passes. See the
[observed engine record](../research/10-sbx-rc5-engine-admission.md#authorized-installation-and-fixture-probe--observed-2026-09-05).

This is **not** resolution of the lifecycle ticket. Shared-daemon behavior for product users,
resource/concurrency budgets, adoption/image replacement and setup integration remain to be
settled and implemented. The next of this session's two tickets is
[Detection, and its remedies, when the runtime is not on this computer](08-detection-and-remedies-per-machine.md),
claimed only after its lifecycle prerequisite is resolved. No box factory/adapter guard changed.

### Next interview round — proposals, not answers

- Shared setup: only on explicit selection/setup of a box; never launch the daemon merely to
  paint Settings. Disable telemetry for blobot's clients. Changing shared settings or restarting
  requires explicit consent; foreign sandboxes prevent that operation, with no silent local fallback.
- Resource starting point: 2 vCPUs and 4 GiB per running box, a pool target of 50% of host RAM
  based on configured limits, evicting only idle background teams. A target, not a hard cap:
  active teams and in-flight work are never killed to satisfy it. These are proposed budgets,
  not figures demonstrated by the fixture or defaults already implemented.
- Existing boxes: adopt only with matching ownership/Agent identity and configuration; mismatch
  refuses. Keep unmatched/orphaned boxes and old images without automatic destruction or migration.

Put these to Guillermo before implementing them as product policy. His approval of the local
RC5 operation does not answer this round.

### 2026-09-05 — product policies confirmed, resource semantics corrected (Guillermo)

The author confirmed the three proposals above **with a correction**: all operational limits
must be configurable and are **maximum CPU and RAM**, not allocations to reserve needlessly.
Performance and optimization are important. Do not implement the earlier sum-of-configured-RAM
proposal as occupied capacity. Measure actual consumption where the engine permits it; never
claim elastic memory or hot limit changes without engine evidence. Safety/ownership checks are
invariants, not tunable permission grants. Pool reclamation still preserves the active team,
in-flight work and pinned Routine runs. Record any engine limitation and raise a genuinely
different product trade-off with the author before implementing it.

### Resource evidence and next question

[Resource semantics and measurements](../research/11-sbx-resource-limits.md) now establish
that a 4 GiB guest did **not** occupy 4 GiB of host RSS at creation (about 781 MiB observed),
and resident usage rose/fell with a bounded workload. CPU is a vCPU ceiling, not physical
core reservation. No supported resize operation for an existing box was found, and no
public per-box host RSS metric was established. Do not implement a guessed process-id mapping.

The next user choice is whether changed CPU/RAM limits may initially apply only to **new**
Machines, with existing Machines reporting both effective and desired limits, or whether
resizing existing Machines is required for this milestone. No answer has been assumed.
Destructive recreation is not an acceptable hidden implementation of a settings edit.

### 2026-09-05 — existing Machines must be adjustable (Guillermo)

The author **rejected new-Machines-only configuration**. Maximum CPU and RAM must be editable
on an existing Machine. Restarting that Machine is acceptable; if it is working, warn and
obtain confirmation **before** stopping it, then reopen it with its data preserved. Do not
make resource selection a required creation/onboarding step: reasonable defaults are automatic,
and the simple adjustment lives on the existing Machine.

This supersedes the prior pending question, not the ownership or image-mismatch refusal.
An intentional resource edit of an owned Machine is a controlled reconfiguration, not adoption
of an unrelated box. No credentials may be exported through blobot and no data may be silently
deleted to simulate a restart. The engine mechanism must satisfy this requirement before this
ticket can be resolved; a UI-only setting that affects new Machines does not meet it.

### Engine capability mismatch — measured, not a user decision

RC5 refused changed `--cpus`/`--memory` on an existing stopped sandbox. A resources mixin is
invalid, and a valid kit-add supplying new arguments for a parameterized root returned success
**without changing the measured limits**. Both private-volume markers survived every probe.
[Exact resize evidence](../research/11-sbx-resource-limits.md#existing-box-resize-probes--observed-by-the-implementing-session).

The required behavior is settled; the first engine currently has no verified mechanism for it.
Before replacing the selected engine or reducing the requirement, raise this mismatch with
Guillermo. No other engine has been installed, and no production admission guard was opened.
This ticket and its dependent detection ticket are unfinished; do not close them for the
successful SSH/transport probes alone.

### 2026-09-05 — replacement with preserved data: validated mechanism, pending trade-off

Guillermo asked whether a new execution environment could simply reuse the old volumes, then
requested validation. [Volume ownership and replacement evidence](../research/12-sbx-volume-reattachment.md)
distinguishes that design from the installed engine's supported surface: local `create -v`
explicitly refuses, and no public cross-sandbox attachment selector was established.

A synthetic local copy-and-replace probe **passed**: 2 CPUs / 2 GiB source to 3 CPUs / 3 GiB
target; both persistent trees retained file hashes, hidden session fixture, modes, owners,
mtimes and links, survived target restart, and left the original reopenable unchanged.
Transfer streamed through host process pipes with no host archive. Both disposable boxes
were cleaned up. This establishes a candidate mechanism, not production readiness or actual
provider login/session preservation.

The next question is no longer simply whether to change engines. Ask with grill-with-docs
whether an explicit resource edit may use this **copy migration**, including temporary extra
disk/RAM and pause proportional to data, rather than direct volume reattachment. Home data
would traverse the host broker's memory, though no durable host credential archive is needed;
the prior no-credential-export boundary must not be silently reinterpreted. Keep the old
owned box until validated cutover, and require the existing busy-work warning/confirmation.
No answer to this trade-off has been assumed, no engine replacement authorized, and neither
selected ticket is resolved.

### 2026-09-05 — copy migration approved (Guillermo)

The author answered **"si perfecto"** to the explicit copy-migration trade-off: temporary
extra disk/RAM and pause, opaque home/workspace data streamed through the local broker's
memory with no host credential archive, and the original retained until the replacement is
verified. This narrowly authorizes preservation during an intentional resource edit of the
same Agent; it does not authorize reading credentials, logging payloads, seeding other Agents,
uploading state, or automatically replacing images. Existing busy-work warning/confirmation
still applies. The original Machine identity belongs to the Agent; an engine sandbox ID may
change at a verified cutover. Implement and test this route without changing engines.

## Answer — 2026-09-05

The lifecycle/setup **contract and staged engine implementation** are resolved. This does not
activate box Agents: the acceptance boundary above still depends on the existing image,
Workspace, egress and screen tickets. The author explicitly deferred engine reevaluation to
a later session; `sbx` remains the engine of this implementation.

- One durable Agent binding records the exact engine IDs, kit and observed limits/boundary.
  Adoption refuses mismatches, incomplete records, stale ownership leases and interrupted
  operations. Such data is quarantined for explicit recovery, never swept or guessed safe.
  Image changes are refused; intentional resource edits alone use the approved copy path.
- CPU/RAM defaults are 2 vCPUs/4 GiB, configurable maxima rather than reservations. The engine
  cannot report supported per-box host RSS; no sum of configured RAM pretends to be usage.
  Existing Machines can change limits by validated two-volume copy and atomic cutover, retaining
  the old stopped box. An interrupted copy preserves the old active binding and pending journal.
  Busy execution requires confirmation before cancellation, and automatically reopens after
  success. The controls on an actual box remain part of the existing Machine screen work.
- Power belongs to execution, not turn status or login. Two hours of inactivity is the
  configurable initial policy; zero disables it. Turns, permissions, mail and Routine holds
  prevent automatic sleep. The desktop applies changes to existing local executions now.
  Sleep closes runtime then Machine; a prompt serializes behind wake and carries the latest
  provider session. Eviction/quit closes execution; neither sleep nor eviction deletes data.
  Unexpected process loss is unknown/failed, not asleep. Host suspension is not a request to
  cancel active work; normal timers resume and reevaluate inactivity when the app resumes.
- A mailbox rule is scoped to the recorded box and ephemeral port, observed after creation,
  replaced on reopen and revoked by its exact owned ID. The complete applicable rule inventory
  rejects unexpected allows. RC5's synthetic `default-deny-all` row disappears when explicit
  rules exist: it is not required as a stored rule. Fresh authorizer checks supplement the
  inventory. Actual authenticated mailbox reachability still belongs to the inbound handshake;
  [the RC5 door fixture](../research/14-sbx-mailbox-lifecycle.md) verifies the transport separately.
- `SbxEngine` separates display from explicit work/setup. Display only asks daemon status;
  work checks the pinned peers, forwarding setting and named auth diagnosis. Non-pass auth
  shapes remain unknown, not an invented sign-out signal. Shared isolation configuration
  requires consent, the supported pin and empty inventories before/after consent and immediately
  before restart. Guest root/Agent socket checks remain necessary; a saved setting is not proof.
- Startup and browser-login mechanisms are fixed CLI operations with an allowlisted client
  environment and telemetry opt-out. Login runs in a watched, unparsed PTY and ends with fresh
  detection, not an exit-code success claim. No bare `sbx setup`, secret import or global policy
  reinitialization. Official installer routes are in the command evidence; automatic production
  RC installation is **not** approved or enabled. The explicit development RC5 installation is
  the only installation performed. Image download/load timing remains the image ticket's.
- `destroy()` refuses until the Workspace owner can preserve work. `measure()` returns unknown,
  not zero. The fetch transport is the already measured framed exec; Workspace export and
  network-block presentation remain their existing owners, not implementation claims here.

Verification: the owned RC5 fixture passes create, verified stop, same-ID reopen, fresh network
admission, changed-limit copy, retained original reopening, cancellation and interrupted-copy
refusal, including two simultaneous Machines (120.62 s with observation unit tests). It uses only disposable synthetic state, not a
provider login. Focused tests also cover shared-setup refusal, concurrent sleep/message and
confirmed/declined active-work interruption. Final aggregate checks and visual review live in
[the build record](../build.md). The factory and all five adapter box guards remain closed.
