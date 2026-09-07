# Sandbox lifecycle and staged preservation

`owned-machine.ts`, `registry.ts`, `engine.ts`, `kit.ts`, `observations.ts`,
`transport.ts`, `image-store.ts` and `installation.ts` support the desktop preview.
Creation chooses fixed CPU/RAM limits. Stop/start reuses that same Machine and its
private storage. Recorded identities are ownership evidence; a `blobot-` name alone
does not authorize adoption or deletion.

The `state-*.ts` modules are **staged preservation research**, not a supported
desktop capability. They are retained beside their regression tests because the
experiments establish which metadata and complete private state a replacement must
preserve. `state-exec.ts` is their test entry point; it is not exported by core or
imported by the desktop. Core is a private workspace package, not an npm release.

The older `data-transfer.ts`, `OwnedSbxMachine.reconfigure` and explicit recovery
method support only disposable legacy lifecycle fixtures. Production kits with a
host worktree or private Docker storage refuse replacement before any copy starts.
No desktop action calls these methods. Keeping these tests enabled protects the
failure and preservation evidence; they are not ordinary resize acceptance.

Reactivate replacement only after ticket 25's complete-state preservation gate is
met: private home, Docker and system state must survive verified quiesce/copy/reopen,
with cancellation and interrupted-cutover recovery tested on every supported host.
The product then needs an explicit confirmation and recovery flow. Passing a subset
of the staged tests does not reopen the gate or authorize migrating existing boxes.

See `.scratch/machines/issues/25-post-creation-resource-changes.md` and the linked
research records for the measured failures and deferred product scope.
