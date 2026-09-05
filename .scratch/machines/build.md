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
