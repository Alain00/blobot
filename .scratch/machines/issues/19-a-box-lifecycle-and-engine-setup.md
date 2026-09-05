Type: grilling
Status: open
Blocked by: 17

# A box's lifecycle, engine setup, and the pool

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
