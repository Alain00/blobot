# The start-docker label: exact true, but two separate engine paths

2026-09-05. Read-only follow-up to
[Private Docker preservation: an exec restarts its daemon](24-private-docker-preservation-gate.md).
Question: can an otherwise identical derivative with
`com.docker.sandboxes.start-docker="false"` avoid both the automatic Docker volume and
daemon reactivation during separate exec calls?

## Finding

**RC5's label predicate accepts only the exact four bytes `true`.** A value of `false`
or an empty string makes that predicate false; mere label presence is insufficient.
However, **automatic volume configuration and daemon readiness use separate paths**.
The inspected code supports disabling the automatic DinD customizers with this label,
but does not support assuming it also disables daemon startup when `dockerd` exists.

This is static analysis of the installed arm64 binary, not a completed fixture with a
label-false image. No sbx or Docker Engine operation, image build, registry download,
setting mutation, container startup or process signal was performed in this follow-up.

## Primary evidence

Docker's own Droid-image Dockerfile identifies the label as a request to the runtime,
not a declaration that Docker exists in the image. It sets `true`, but does not document
the false-value parser or startup lifecycle.
[Upstream Dockerfile](https://github.com/docker/sbx-kits-contrib/blob/main/droid/Dockerfile#L25)

The installed binary is
`/opt/homebrew/Caskroom/sbx@rc/0.42.0-rc5/bin/sbx`, RC5 revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, SHA-256
`e0bc95e6d4b80cb9a6b84ae8b2f2f540d5289fec9347be40b01f7af5317f007a`.
Its Go function table in Mach-O `__gopclntab` identifies the following functions.
The addresses below refer only to this exact binary, not a public source guarantee.

| Function / location | Inspected behavior |
| --- | --- |
| `sandbox.hasDinDLabel`, `0x100d4e2c0–0x100d4e600` | Looks up the 33-byte key `com.docker.sandboxes.start-docker`; requires string length 4; compares its bytes to integer `0x65757274` (little-endian `true`) |
| Label comparison, `0x100d4e3dc–0x100d4e4e0` | Other lengths return false; exact byte equality determines the boolean |
| `sandbox.DinDCustomizers`, call at `0x100d4d708` | Calls that predicate and branches directly to an empty return if false, before the volume/customizer work |
| `DockerNextBackend.startRuntimeWithLifecycleGateHeld`, `0x1021bdc64` | Calls `ensureDockerdInContainer` after restart customizers; no label predicate appears on this path |
| `DockerNextBackend.ensureDockerdInContainer`, `0x1021be250–0x1021be370` | Calls `sandbox.EnsureDockerd` when its SDK backend is available; does not read an image label |
| `sandbox.EnsureDockerd`, `0x100d4eb90–0x100d4f7a0` | Obtains the container, probes for `dockerd`, checks the Unix-socket ping, and backgrounds the daemon if needed |

The text-section scan found one direct call to `hasDinDLabel`, from `DinDCustomizers`.
`EnsureDockerd` itself has no image-inspection/label lookup call: its first two guest
operations are the binary-presence probe and the socket ping. A missing binary returns
without startup; an existing binary with an unavailable API proceeds toward startup.
This explains why the previously measured independent exec could restart private Docker
without restarting the VM.

Reproduce the focused disassembly with the existing Xcode toolchain:

```text
/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/llvm-objdump -d --start-address=0x100d4e2c0 --stop-address=0x100d4e600 /opt/homebrew/Caskroom/sbx@rc/0.42.0-rc5/bin/sbx
```

Repeat with the other address ranges above. The stripped Mach-O symbol display may label
these ranges relative to `_crosscall2`; the precise Go names come from `__gopclntab`,
not that nearest exported-symbol display. The label's bytes are at file offset
`0x2fdc0c3` for length 33. Pclntab is at file offset `57707776`; function entry offsets
are relative to `__text` address `0x100001c50` in this binary.

## Narrow candidate and fixture proposal

The label-only Dockerfile change is:

```dockerfile
LABEL com.docker.sandboxes.start-docker="false"
```

Apply it to the already-approved pinned `shell-docker` base. Empty-string override is
unnecessary given the exact comparison. No package or base-image change follows from it.

For the first synthetic fixture, use a root kit with `security.privileged: true`, one
explicit `/var/lib/docker` block volume of `21474836480` bytes and the approved home
volume of `8589934592` bytes. The v2 grammar supports top-level privileged settings and
explicit volume sizes. [Kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/)
Reuse the proven temporary workspace arrangement for the fixture; do not turn that
fixture path into the product's host-worktree design.

**Start without a Docker startup hook.** Measure whether Docker nevertheless starts,
the count/source of Docker mounts, block-device byte capacity and actual filesystem
capacity, process arguments, containerd configuration and policy log. Filesystem capacity
can be smaller than its block device due to filesystem metadata; report both. The label
parser result is not a measurement that the requested limit was honored.

Then repeat the prior graceful termination and independent warm exec, recording the same
boot and process-identity evidence. Static evidence predicts one explicit 20 GiB volume
but continued automatic daemon reactivation. If that prediction is wrong, capture it
before designing a startup hook. If it is confirmed, the label solves the volume-sizing
mechanism only; maintenance still requires a separately verified strategy such as a
single long-running exec per guest. Do not copy live Docker storage or assert preservation.

No global environment or daemon setting is needed for this candidate. No live fixture
has yet validated it, and neither this proposal nor the accepted capacities approves a
durable snapshot lifecycle for real Agent data.
