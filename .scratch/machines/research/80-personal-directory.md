# Personal directory storage and RC5 attachment

Measured 2026-09-06 on macOS arm64, sbx client/server v0.42.0-rc5,
revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`.

## Contract and route

The [author's scope](../proposal-personal-agent-state.md) requires one actual writable folder
per AgentProfile across concurrent memberships. UI, native skill/MCP installation, composition,
credentials and remote execution are separate work. The shared folder is outside the runtime
HOME and every AgentWorkspace. Removing a Machine only removes its owned engine storage.

The pinned CLI's `sbx mount --help` exposes a late bind-mount operation. Disposable probes
established the differences from its help text: repeating it stacks mounts, and a VM stop/start
loses the late mount. It also leaves an auxiliary `/mnt/host` export in the guest. A synthetic
unshared sibling file was unavailable both at its host path and beneath that alias; the shared
file was readable through both aliases. No user files or credentials were inspected.

A second probe removed `/mnt/host` with guest `umount` after attachment. The exact personal bind
remained readable and writable as UID 1000. Repeating that sequence after stop/start worked.
The implementation therefore checks for an existing valid personal mount, mounts only when
absent, removes the auxiliary alias, and verifies the complete resulting boundary. It retains
the original Machine baseline and independently verifies the additional personal mount and
identity marker. The receipt is saved before attachment so failures can retry that same identity.

This route uses native RC5 commands and preserves existing sandbox IDs, kits and private volumes.
It does not reconstruct a VM, reuse an ext4 disk concurrently or synchronize shutdown snapshots.
The ordinary create-time host mounts remain as described by
[Docker's create reference](https://docs.docker.com/reference/cli/sbx/create/); late-mount behavior
above is an observation of the pinned CLI and the fixtures, rather than inferred from that page.

## Automated live acceptance

Command from the repository root:

```sh
BLOBOT_LIVE_SBX_RC5=1 pnpm --filter @blobot/core exec vitest run src/machines/sbx/personal-directory.live.test.ts
```

Initial run: **1 passed**, 87.99 seconds. The fixture uses the cached shell image, disposable
synthetic data, and an already running engine. It does not install images, change global engine
settings, authenticate a provider, use inference or operate on the user's existing Machine.
Final rerun after separating the ownership catalog: **1 passed**, 89.87 seconds.

- Creates a legacy Machine without personal storage, saves a private-home sentinel, and stops it.
- Adds Ana's folder to that same Machine; verifies unchanged ID and baseline, and reads the sentinel.
- Runs Contab and Blue concurrently with Ana's folder, plus a third sandbox with Bea's folder.
- Writes a script from LocalMachine, runs it in Blue, changes it in Contab, and sees the new output
  immediately from Blue and local execution.
- Verifies Bea cannot read Ana's folder or workspace, the auxiliary alias exposes no files, and
  Blue does not inherit Contab's private-home sentinel.
- Sleeps/reopens Blue and retains the script. Deletes Contab while Blue keeps using it.
- Reconstructs registry and profile-storage services, reopens Blue, and retains the script.
- Deletes both remaining sandboxes and verifies the profile folder still holds the updated file.
- Cleans up only fixture-owned IDs and its temporary host root.

## Failure and integration checks

Unit/integration coverage exercises simultaneous first starts, stable profile identity across
service reconstruction, different profiles, missing/replaced/symlinked folders and markers,
partial initialization, local process environment and deletion, Machine identity pinning,
interrupted attachment/retry, mount absence/duplication/read-only/extra-alias rejection, and
environment injection that adapters cannot retarget. Desktop tests connect profile IDs to the
same path across local/box memberships; persona and Claude tests verify path delivery and the
exact additional native write scope with unchanged approvals on new/resumed sessions.

Spec review identified whole-owner loss as a gap in the first implementation. Ownership receipts
now live in the sibling `profiles.records` catalog, outside the entire personal data tree. Added
regressions move the whole profile directory and the whole data root, reconstruct services, and
verify refusal without creating a replacement. Missing receipts with existing data and changed
receipts within a running process also fail explicitly.

Final full suites after that correction: **core 1,150 passed / 48 skipped**, **desktop 685 passed /
1 skipped**. Typecheck and both builds passed. Standards review found no actionable issues;
Spec review confirmed the storage-loss correction and closed its finding. Skipped tests retain
their existing opt-in/platform conditions; the personal-directory live test is run explicitly.

## Limits

No authenticated LLM turn or native skill/MCP discovery is claimed by these filesystem tests.
Local harness approvals still govern tool access. Ordinary concurrent writes have ordinary
filesystem races. The app does not import existing home contents or refresh provider config.
Linux/KVM acceptance remains pending; passing macOS RC5 fixtures does not certify Linux.
The receipt and marker must travel with a backup/restore of personal storage. No personal-data
deletion UI or per-profile quota is included.
