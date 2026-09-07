Type: grilling
Status: resolved
Blocked by: 14

# The first engine: sbx behind the interface, and a box's life

## Question

`14`'s half (b), split off as `14` proposes. `14` owns the `Machine` interface; this owns the
**mechanism** of the `box` kind on this computer under `sbx`, and how blobot drives setup and
sign-in, whose screen is `08`'s (*Decided, 2026-09-05*). Bare § numbers are `research/08`'s.

1. **The kit.** Both volumes are **declared kit volumes**: Docker's template leaves `~/.claude`
   on the overlay, so a login written there does not persist (§5). `15` decides the allowlist;
   this decides the mechanism, and that a scoped rule dies with `rm` (§7). The entrypoint, `13`'s
   tag, the name.
2. **The transport and the environment contract.** `sbx exec -i`: `initialize` in 0.43 s, stderr
   empty (§5). `child-env.ts` copies all of `process.env` minus one denylist, and every adapter
   rides posture and persona on env — `OPENCODE_CONFIG_CONTENT`, `CODEX_CONFIG`,
   `INITIAL_AGENT_MODE`, `FX_PERMISSION_MODE`, `CLAUDE_CODE_EXECUTABLE`, `CURSOR_CONFIG_DIR`.
   Into a box **only an explicit layer crosses**, and `sbx exec -e` puts values in host argv,
   readable via `ps`: posture needs a stdin or in-volume route, and Cursor's `cli-config.json`
   must reach the data volume before the bridge starts.
3. **Naming by Agent id, not names.** `02`'s `blobot-<team>-<agent>` is wrong: team names are
   released on delete, agent names recur, and the same sandbox name reattaches to the same
   volumes (`research/06`), so a new Alice inherits the old Alice's login. ADR-0001's grain says
   the id. Then `provision` on an existing id — refuse or adopt — and who sweeps orphans.
4. **Caps and concurrency.** 0.8–1.7 GB host RSS per running box, 12 GiB and 12 vCPU by default,
   `-m` and `--cpus` to cap (§4). What blobot sets; whether `TeamPool`'s limit counts boxes, since
   four agents are four VMs; RAM as a figure on `12`'s folder-step row.
5. **A box that dies under blobot** — the user's `sbx stop` or `rm`, a daemon restart, host sleep.
   What the transport reports, what the fold and transcript say, what `reconcile` does, given a
   stopped box restarts on the next `exec` in a second and stops itself 30 s after its last
   session (§4). The unfinished turn's files stay in the workspace volume, unfetched: said, not
   lost.
6. **The door versus an ephemeral port.** `PeerMessageServer` listens on port 0 per launch
   (`peer-message-server.ts:49`); the door is one scoped rule that survives a stop (§2, §7).
   So `start` adds and removes the rule per launch, or the mailbox binds a fixed port per user.
7. **The daemon and telemetry.** `daemon.log` uploaded an event batch before any box existed
   (§1). Whether blobot starts the daemon at all for a user who merely has `sbx` installed reads
   *no cloud dependencies* — raised with the author, never taken quietly.
8. **The installer and `sbx login` as mechanism.** Docker's published install command run by
   blobot, never shown; `sbx login` opening the browser itself; **never `sbx setup`**, which
   imports the user's API keys into Docker's store.
9. **The ssh-agent forward, off in the kit.** `SSH_AUTH_SOCK=/run/ssh-agent.sock` is in every
   box by default (§2); `01`'s 2026-09-05 amendment to point 5 refuses it.
10. **Pull and template load.** `sbx template load <tar>` puts blobot's image in the store with no
    Docker daemon on the Mac; an unknown `-t` pulls from a registry (§6). `13` output 6 says who
    and when; the call is here.
11. **The pool mapping.** Stop on eviction, start on selection, destroy on delete with `measure`
    priced first and `05` §4's *unknown* when stopped.
12. **`01` point 8's four constraints as acceptance criteria**: the box dials blobot; no
    Electron; stop-and-keep, wake by `session/load`; the mailbox wakes a sleeping box. First-demo
    ticket 14's rule: a promise that holds for Alice and not Bob is not made.

## What must come out of it

1. The kit spec, declared: sized volumes, entrypoint, tag, name from the Agent id, forward off,
   `15`'s preset plus one scoped rule.
2. The environment contract into a box: the explicit layer, its route, the Cursor file first.
3. `exec -i` as the transport, provisional until it has carried a session under a blobot image
   (`16`), and what a dying box reports.
4. Naming, adopt or refuse on an existing id, the orphan sweep; caps, the pool mapping, the door
   per launch or a fixed port, the pull call.
5. The daemon and telemetry put to the author; the installer and login verbs, unseen; `sbx
   setup` refused.
6. The four constraints checked, or the amendment naming which fails.

## Not this ticket

The `Machine` interface, `spawn` and `local` (`14`). The image, its base, sizes and who pulls
(`13`). The allowlist and how a block is said (`15`, `09`). The Workspace in a box, the fetch, the
purge line's figure (`05`). The screen, the four states, their words, caching (`08`, `09`, `12`).
The fifth level and `sudo` inside (`10`). Measurements (`16`). A hosted or remote box: a
constraint in question 12, built nowhere.

## Handoffs and corrections, 2026-09-05 (consistency pass)

**Output 6 is narrowed.** The verdict on `01` point 8's four constraints, and any amendment naming
which fails, is `14`'s output 4 and stays there. What is this ticket's is **the engine's fact per
constraint**: for (i) that `sbx exec -i` is blobot dialling in and the box never dials out but
through the mailbox door; for (iii) whether the declared data volume holds the resume state a
`session/load` needs; for (iv) the 0.99 s first exec after a stop (`research/08` §4).

**Question 3 is split with `05`, as `05` §8 already says**: `05` owns the volumes — adopt on a
matching marker, refuse otherwise; this ticket owns the *box object* under an existing id, and the
orphan sweep. And the name is an amendment on `02`, recorded there, not a second decision here.

**Question 5 is narrowed** to the event the interface reports when a box dies under blobot. The
sentence is `09`'s; the reconcile outcome is `05` §3's table, read here.

**Handoffs accepted by name**, so nobody waits: the fetch route's first run and its transport
(from `14` output 7; `05`'s shape (a) stands on it); the proxy log as the carrier of a block
(`15` says the words); what an image bump does to a running box; the moment the pull runs (`13`
holds who pulls and how it is drawn); the CLI's sign-in inside a box as **mechanism** — tier 1 the
kit's proxy-managed OAuth if `16` measures it holds, tier 2 the vendor's login on a pty *shown*
and never parsed (`08`'s note) — while `08` keeps the experience and `09` the words; the cost of
`sbx daemon status`, supplied to `08` §4, which keeps the caching decision; and, only if `12`
keeps the user's door, `sbx setup ssh` (the subcommand that writes an ssh config block, verified
from `sbx setup --help`; bare `sbx setup`, which imports API keys, stays refused) and VS Code's
Remote-SSH open, with its egress hosts and its write into the data volume named to `15` and `05`.

**Sizing.** This is more than one session. The seam: kit, transport and the forward off (questions
1, 2, 9) first, because everything else stands on a box that starts; lifecycle, pool, the door
rule and the daemon (4, 5, 6, 7, 11) second. A claimant takes the first and splits the second off
by name.

## Execution split, 2026-09-05

This session takes the first half: kit declaration, stable Agent-id naming, exec transport,
explicit environment delivery and the mechanism that disables host ssh-agent access.
[A box's lifecycle, engine setup, and the pool](19-a-box-lifecycle-and-engine-setup.md) owns
the second half, including setup/sign-in mechanisms and the outstanding lifecycle handoffs.
The original question list above is retained as history; the split governs ownership now.

## Answer — 2026-09-05

The first implementation seam is complete: a root blobot kit and a transport for an
already-prepared box, under `packages/core/src/machines/sbx/`. The original lifecycle/setup
questions are transferred, not answered implicitly. [Implementation status](../build.md)
and [measured kit/SSH evidence](../research/09-sbx-kit-and-ssh-boundary.md) carry the details.

- The kit declares exactly two explicitly sized private volumes, no vendor kit inheritance,
  and a harmless Node version entrypoint. A synchronous root install gives the mounted roots
  to UID 1000. The image tag and capacity values remain caller inputs, not product defaults.
  Names use the immutable Agent id without slugging or truncation.
- Launch configuration travels in a length-prefixed stdin header before untouched protocol
  bytes, never interpolated into host argv or shell code. Guest environment changes must be
  explicitly allowlisted; host credential/SSH environment is not forwarded to the client.
  Pinned modules resolve in the guest, and JSON config patches run there before the runtime.
  This supplies Cursor's needed primitive without wiring its host config path into a box.
- Tests cover a six MiB protocol payload, multiline values, guest package/version checks,
  config merging and symlink refusal, EOF, spawn errors and nonzero exit. A real v0.39 fixture
  also verified UID 1000, config-before-launch and both volumes across stop/exec. It did not
  run a provider or establish the future blobot image's acceptance.
- **The proposed SSH switch is not a kit field.** Installed v0.39 is not an admissible Agent
  engine under this map. RC2 exposes a daemon-wide setting and requires restart for existing
  forwarders. Clearing environment alone is not isolation. Actual admission, shared-daemon
  consent and the unanswered prerelease choice therefore belong to
  [A box's lifecycle, engine setup, and the pool](19-a-box-lifecycle-and-engine-setup.md).

`machineFor('box')` and all adapter box guards remain closed. No placement default changed,
no new engine was installed and no daemon settings or sign-ins were changed. This resolution
closes the kit/transport seam, not the product's Docker activation or any unanswered human
choice. Next session starts at the named lifecycle/setup successor.
