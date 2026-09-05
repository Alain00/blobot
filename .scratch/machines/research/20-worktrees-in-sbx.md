# Host worktrees in sbx: the mount contract

Checked **2026-09-05**, after the author asked to keep the Workspace as a host worktree, like
`local`. This is factual research for **Where a Workspace lives when the Machine is not this
one**, not a decision changing the boundary.

**Method:** official Docker/Git documentation and public kit-spec source; installed binary
help and static binary strings. No sandbox was created, inspected, started or mounted; no
Docker command, daemon call, sign-in, config change or live mount probe was performed. The
only new artifact is this file. The parent session owns any separate synthetic Git fixture.

Labels: **[DOC]** upstream documentation/source; **[HELP]** installed command help;
**[STATIC]** text found in the installed executable, not a tested execution path;
**[INFERRED]** deduction; **[UNVERIFIED]** requires a fixture or a stronger source.

## Result

**A host worktree plus its common Git directory, both writable and at their existing absolute
paths, is a plausible route to full Git access without mounting the main checkout.** The old
claim that additional workspaces must be read-only is not supported by the current help or
docs: read-only is selected by adding `:ro`. **The exact combination has not been run here.**
Docker's documented host-worktree recipe mounts the worktree alone and explicitly leaves
Git operations to the host; it does not automatically expose the linked Git directory.
[Docker Git workflows](https://docs.docker.com/ai/sandboxes/workflows/git/#host-worktree),
[multiple workspaces](https://docs.docker.com/ai/sandboxes/usage/#multiple-workspaces).

The product trade-off is consequential: a writable common Git directory shares repository
metadata, not only the agent's files. It cannot preserve the old promise that the agent cannot
write the user's repository. The author must decide that boundary; choosing worktrees does
not make them independent repositories.

## Installed pin and public commands

**[HELP/STATIC]** `/opt/homebrew/bin/sbx` resolves to
`/opt/homebrew/Caskroom/sbx@rc/0.42.0-rc5/bin/sbx`. This session did not run `sbx version`,
because its help says the JSON includes server information. The prior
[RC5 command record](13-sbx-lifecycle-command-contract.md#daemon-status-and-version) contains
the client/server observation. This session's `sbx --version` was rejected as an unknown
flag; subsequent execution was limited to `--help`.

| Question | Evidence and limit |
|---|---|
| Custom root kit and host paths together? | **[HELP]** `sbx create --help` accepts `AGENT\|SANDBOX_KIT [PATH...]`, with a directory, ZIP, Git or OCI kit as the first positional. `--kit` is for added mixins. **[DOC]** RC5 notes confirm the positional kit form. |
| Guest paths? | **[HELP]** `sbx create shell --help` says workspace paths retain their host paths. Additional workspace paths are accepted. **[DOC]** the multiple-workspace guide gives the same rule. |
| Are extras necessarily RO? | **[HELP]** the shell help instructs callers to append `:ro` to make extras read-only. **[DOC]** the guide also describes `:ro` as opt-in. **[INFERRED]** unsuffixed extra directories are writable; no evidence here supports mandatory RO extras. |
| Explicit `:rw` at create time? | **[UNVERIFIED]** not advertised by the create help or the inspected guide. Do not assume the separate runtime-mount syntax is also the positional-create parser's syntax. Use unsuffixed paths as the documented candidate. |
| Automatic Git-dir exposure? | **[DOC]** absent from the documented host-worktree workflow, which explicitly says the agent cannot resolve the `.git` pointer. No claim of new automatic linking was found in RC5 notes/help. |
| `--clone` with a linked worktree? | **[DOC]** explicitly refused; this restriction belongs to clone mode, not proof that direct worktree mounting is refused. |

Sources: [RC5 release notes](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5),
[create reference](https://docs.docker.com/reference/cli/sbx/create/),
[shell create reference](https://docs.docker.com/reference/cli/sbx/create/shell/),
[workspace modes](https://docs.docker.com/ai/sandboxes/usage/#clone-mode).
The web create references still require a path, whereas installed RC5 help allows no path;
do not treat the rolling references as an exact transcript of this pin.

**Candidate only, not executed:**

```text
sbx create --name <owned-name> <absolute-root-kit-directory> <agent-worktree> <common-git-directory>
```

Both directories would be explicit arguments. Nothing in this candidate mounts the parent
directory of `<common-git-directory>`. For nested Workspaces, each independent repository
requires its actual common Git directory, not an assumption that every `.git` is a directory.

## A shipped but hidden runtime mount command

**[HELP]** `sbx mount --help` succeeds on this installation, although `mount` is absent from
`sbx --help`'s command list. It advertises:

```text
sbx mount SANDBOX HOST[:CTR_TARGET[:ro|rw]]
```

Its help says RW is the default and can be explicit; the host path must exist, may be relative,
and is resolved/cleaned before submission. The container target must be absolute. An omitted
target uses the host path. The operation is described as a real bind mount, idempotent for the
same specification, with mount governance checked before contacting the daemon and respecting
the effective RO/RW intent.

**[UNVERIFIED]** This research did not establish the persistence of a runtime-added mount over
restart, behavior with custom root kits, mount removal, or the exact `.git` combination. The
public `https://docs.docker.com/reference/cli/sbx/mount/` could not be retrieved, and the public
[top-level reference](https://docs.docker.com/reference/cli/sbx/) does not list the command.
Treat it as evidence of a shipped capability, not a stable integration commitment or a reason
to prefer it over create-time paths.

## Validation and where mounts are declared

**[STATIC]** Targeted string inspection of the installed executable found diagnostics for:

- a primary workspace that must be writable (`:ro`/`:readonly` rejected);
- workspaces needing absolute paths and existing directories;
- additional workspaces requiring a primary workspace;
- mount options restricted to `ro` or `rw`.

These are evidence of validators in the binary, **not proof of which parser or execution path
uses each string**. No malformed `create` was attempted to reach them. **[HELP]** current shell
create also permits a single-file additional argument when read-only, to protect that file
inside an otherwise writable workspace. That exception does not establish writable-file
mounting via positional create arguments.

**[DOC]** Kit `volumes` are block storage or tmpfs, described by absolute `path`, `type`, size
and filesystem mode. They are not host bind-mount entries: no `source` field exists in that
grammar. Public `ValidateVolumes` rejects other volume types and validates absolute paths,
size and octal mode. A kit `mode: "0700"` is permissions, not a `ro`/`rw` mount selector.
Host workspaces belong to create arguments, not a fabricated `volumes.source` key.
[Normative kit spec §5.7](https://raw.githubusercontent.com/docker/sbx-kits-contrib/main/spec/SPEC-v2.md),
[public validator](https://github.com/docker/sbx-kits-contrib/blob/main/spec/validate.go#L219).

## Why the common Git directory matters

**[DOC]** A linked worktree's `.git` file points to its private administrative directory under
the repository's `worktrees/<id>`. Its `commondir` points back to shared repository metadata.
The worktree's HEAD/index are private, while ordinary branch refs and the repository config
are shared. Git recommends resolving these locations with `git rev-parse`, rather than
guessing their layout. [Git worktree details and refs](https://git-scm.com/docs/git-worktree#_details).

**[DOC]** Shared metadata includes objects, refs/packed refs, config, hooks and ordinary reflogs.
`commondir` is incomplete without its target. Alternate object stores and submodule Git
directories can introduce further paths. [Git repository layout](https://git-scm.com/docs/gitrepository-layout).

**[INFERRED]** For an ordinary repository without additional external dependencies, mounting
the worktree and the real common directory at the same absolute paths should preserve these
links without the main checkout's tracked, ignored or loose files. Creating a commit needs
writes to the private index/HEAD/logs and shared objects/branch refs; making the common
directory RO defeats that ordinary flow. RW on the common directory also permits changes to
other shared refs, hooks and config: branch naming is not a filesystem permission boundary.
The original checkout can remain unmounted while these shared writes remain possible.

This is consistent with Docker's explicit rule that direct mounts expose the files under
the mount with host-visible writes; mounting a directory does not narrow rights to the files
a Git command normally intends to change.
[Docker direct-mount isolation](https://docs.docker.com/ai/sandboxes/security/isolation/#direct-mount-default).

## What remains before implementation can claim support

1. **Author decision:** accept writable shared Git metadata as part of the box boundary,
   including refs/config/hooks, or require a narrower design that is no longer ordinary local
   worktree semantics. Excluding the main checkout does not answer that decision by itself.
2. **Synthetic RC5 fixture after authorization:** root kit + primary worktree + unsuffixed
   common-directory argument; inspect exact guest mounts, commit/diff/status behavior and
   host visibility; prove the main checkout and unrelated worktrees are absent. Repeat across
   stop/start. No such box fixture was run by this researcher.
3. **Path cases:** canonical host paths on macOS, `.git` files, external common directories,
   alternates, submodules and nested repositories; specify a refusal for unsupported layouts.
   The earlier fixed guest `/workspace` must not silently replace an existing absolute pointer.
4. **Admission:** verify actual mount inventory and RW modes, not merely successful CLI exit.
   Existing governance can reject a mount; the existence of help is not policy admission.

No engine reevaluation is proposed or performed by these findings.

## Parent-session live fixture — observed 2026-09-05

The implementing session subsequently ran the separate opt-in
[worktree fixture](20-worktree-fixture.mjs), with
[recorded results](20-worktree-fixture-results.json). **Passed** on client/server
v0.42.0-rc5 at revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, host Apple Git 2.50.1.
This supersedes the untested ordinary-mount statements above only for the following case.

One synthetic repository, two linked worktrees, an ignored host-only marker and a sibling
loose-file marker were made in a temporary directory with isolated Git configuration and
invented author identity. Origin was an `example.invalid` URL and was never contacted.
An owned root-kit box used the already-cached shell image, 2 CPUs/2 GiB and the existing
two 512 MiB private fixture volumes; those unused private volumes are not a new product
workspace-storage decision. Its only supplied host paths were the Agent worktree and the
common `.git` directory, unsuffixed, through public `create` positional arguments.

- Exact virtiofs inventory at UID 0 and 1000: the two supplied directories, RW, and the
  engine-generated `/etc/hosts` and `/etc/resolv.conf`, RO. The main checkout's README and
  ignored `.env`, and the other worktree's uncommitted file, were absent at both UIDs.
- `/run/ssh-agent.sock` was absent at both UIDs. The already-running daemon's forwarding
  setting was checked false; no setting, policy or daemon lifecycle was changed.
- UID 1000 committed a newly written file with the Agent identity and signing disabled.
  The host immediately resolved the Agent branch to that commit without fetch; the main
  branch and checkout remained unchanged. Guest `origin` was the same synthetic URL.
- After a verified stop, guest exec reopened the same box and resolved the same commit.
- The exact owned box and host fixture tree were removed. Sandbox inventory was empty
  before and after. No real repository, provider login, token, model call or image pull.

The probe establishes ordinary linked-worktree operation. It does not establish submodules,
external alternates, Git LFS, host credential helpers, custom global Git configuration,
nested Workspace integration, concurrent writes, adversarial filesystem escape resistance,
or compatibility of runtime session state when a mounted host path changes. The writable
common directory still exposes shared Git metadata by construction; excluding checkout files
does not establish isolation of refs, config or hooks. The product acceptance of that boundary
remains with the reopened Machine ticket. No production admission guard was weakened.
