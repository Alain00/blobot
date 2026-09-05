# Eve's Docker backend is not Docker Sandboxes (`sbx`)

Read-only source review, 2026-09-05. Official repository snapshot:
[`vercel/eve@e6037391160b493e395f46a226878fc81ae1a1c0`](https://github.com/vercel/eve/tree/e6037391160b493e395f46a226878fc81ae1a1c0),
commit dated 2026-09-04, package version **0.52.1**. Temporary clone:
`/private/tmp/blobot-eve-source.X3p0bo`. No Eve installation in blobot, sandbox execution,
daemon query, image pull, or implementation change occurred. This document describes
inspected source, not a benchmark or live verification of Eve.

## Result

**Eve's `docker()` backend executes ordinary Docker CLI commands, not `sbx` and not
`docker sandbox`.** Its session persistence is the writable filesystem of a retained
container, not an independent volume that is reattached to a replacement microVM. It
implements neither CPU/RAM options nor resize in this backend. Comparing its small public
factory call with blobot's sbx lifecycle therefore compares different engine capabilities
and different product contracts.

The executable resolves to `EVE_DOCKER_PATH` or `docker`; subprocesses receive commands such
as `run`, `container inspect`, `start`, `exec`, `stop`, `commit`, and `rm`.
[Driver, lines 95–146](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker-cli.ts#L95),
[container construction, lines 17–59](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker-container.ts#L17).

## Requirements and actual configuration

- A reachable Docker-compatible daemon running Linux containers. Missing executable or
  unavailable daemon raises an actionable error; this backend does not install/start
  Docker. Availability uses `docker version --format {{.Server.Version}}`; default selection
  also probes `{{.Server.Os}}` with a five-second timeout. **No minimum Docker version or
  version pin is enforced in the inspected adapter.**
  [Driver, lines 50–132](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker-cli.ts#L50).
- Eve itself declares Node `>=24`.
  [Package manifest, lines 522–524](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/package.json#L522).
- Docker options are exactly `image`, `env`, `pullPolicy`, and `networkPolicy`. Defaults are
  version-tagged `ghcr.io/vercel/eve`, empty environment, `if-not-present`, and `allow-all`.
  `EVE_SANDBOX_IMAGE_TAG` can override the version-derived image tag.
  [Public options](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/public/sandbox/docker-sandbox.ts#L24),
  [defaults](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker-options.ts#L30),
  [image resolution](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/eve-image.ts#L3).

`startDockerContainer` supplies no `--cpus`, `--memory`, `--mount`, or `--volume`. The default
image's Dockerfile also declares no `VOLUME`. Thus normal default-backed session writes,
including `/workspace`, reside in the retained container filesystem. A custom image could
declare its own volumes, but Eve exposes no volume management/migration contract for that
case. CPU/RAM enforcement, if configured externally, belongs to Docker/operator infrastructure;
Eve's Docker factory neither chooses nor updates it.
[Complete run builder](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker-container.ts#L17),
[default image Dockerfile](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/Dockerfile).

## Lifecycle implemented in the Docker binding

| Event | Actual behavior |
| --- | --- |
| Template prewarm | Reuse cached image; otherwise run build container, prepare base runtime, seed files, run bootstrap, stop, `docker commit`, remove temporary build container |
| First session | Create detached container from base/template image, labelled `eve.sandbox=1` and role=session |
| Reattach | Resolve persisted `containerName` or derived session key; inspect running state; `docker start` if stopped |
| Retain state | `captureState()` stores backend name, session key, and `{containerName}`; it does not snapshot the session filesystem |
| Authored stop / server shutdown | `docker stop -t 0`, retaining container filesystem |
| Explicit delete | Stop, `docker rm -f`, then clear reconnect state in shared lifecycle |
| Missing physical container | Create a fresh one from base/template; no restoration of post-creation session files |

The binding implements these branches in
[`docker.ts`, lines 94–296](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker.ts#L94).
Template commits capture the reusable bootstrap environment, **not ongoing session backups**.
The shared explicit-delete path clears persisted state only after backend deletion returns.
[`ensure.ts`, lines 185–199](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/ensure.ts#L185).

**Sleep is not VM suspension here.** The container stays alive with PID 1 running
`sleep 2147483647`. Docker sessions have no built-in idle TTL in this backend; callers may
stop compute at an authored boundary, and the server tracks open handles for shutdown.
The 30-minute inactivity description in Eve's docs applies to its **Vercel** backend, not
Docker. The adapter's stop helper is best-effort: it catches thrown failures and does not
check nonzero CLI exit status. Do not import that implementation as proof of a guaranteed
stop even though the shared interface says provider failures should reject.
[Keepalive and stop helper](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker-container.ts#L12),
[shared stop contract](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/shared/sandbox-backend.ts#L20),
[shutdown registry](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/active-handles.ts#L43).

## Reconfiguration is not resize or state migration

There is no resource-update operation in the inspected Docker binding. Its `useSessionFn`
simply returns the current session; passing Vercel-style session resource options is not a
Docker update path. The only supported mutable policy operation attaches/detaches Docker
networks for `allow-all` or `deny-all`. Domain policies are rejected.
[Session handle, lines 271–295](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker.ts#L271),
[network implementation](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker-network.ts#L10).

Shared lifecycle derives a session key from the sandbox definition. When that key changes,
it drops the old reconnect metadata and opens the new key, then repeats `onSession`.
**The inspected rotation path neither copies old session files nor deletes the old container.**
Explicit deletion and development cleanup are separate paths; this is not a demonstrated
transactional reconfiguration workflow. Eve package version alone is intentionally excluded
from the session key, while the sandbox definition version participates.
[Rotation, lines 110–155](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/ensure.ts#L110),
[session-key derivation, lines 121–144](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/runtime/sandbox/keys.ts#L121).

## Ownership check: useful ID pinning, narrower than blobot's admission

New containers get ownership-style labels, but reattachment does **not inspect those labels**,
image, resources, or effective configuration. It looks up `containerName`, checks running
state, then resolves `{{.Id}}` and uses that ID for the live handle's subsequent operations.
That prevents a *live handle* from retargeting a later container with the same name; it does
not compare a persisted engine ID during the next reattach, because captureState persists
only the name. A recreated same-name container can therefore be selected without an
old/new engine-ID comparison in this path. This is a source-level scope observation, not
a claim that an exploit was tested.
[Create and captureState](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker.ts#L190),
[ID resolution](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/execution/sandbox/bindings/docker.ts#L301).

## Why the product comparison is not one-to-one

1. **Execution boundary:** Eve's model calls, credentials, custom tools, and durable workflow
   run in the trusted app runtime; its sandbox executes shell/file operations. Blobot runs
   separately authenticated third-party CLI agents *inside* each Machine. CLI installation,
   login UI, persisted home, ACP transport, and mailbox access are not solved by Eve's Docker
   shell/file adapter.
   [Eve security model, lines 8–23](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/docs/concepts/security-model.md#L8).
2. **Isolation and egress:** Eve Docker is a regular container on an operator-provided daemon
   and offers only allow-all/deny-all networking. Blobot selected one sbx microVM per Agent
   with scoped mailbox egress and SSH-forwarding admission. Copying Eve's Docker backend
   would change those engine/security choices, not merely simplify equivalent plumbing.
3. **Persistence and resources:** Eve retains the same container and leaves resource policy
   to infrastructure. Blobot's user requires changing existing Machines' CPU/RAM with warning,
   preserved data, reopen, and safe failure handling. No equivalent Docker workflow exists
   in the inspected Eve code.
4. **Backend and ownership policy:** Eve's availability-aware default can select Vercel,
   Docker, microsandbox, or just-bash, cached for the process. Its documented child-agent
   model can share a parent's sandbox. Blobot's current contract refuses silent fallback and
   gives every Agent its own Machine.
   [Default selector](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/packages/eve/src/sandbox/backends/default.ts#L48),
   [documented sharing and backends](https://github.com/vercel/eve/blob/e6037391160b493e395f46a226878fc81ae1a1c0/docs/sandbox.mdx#L120).

The transferable idea is the interface split: backend factory, create/reconnect, capture
reconnect metadata, stop, delete, shutdown, and shared lifecycle above it. It does not require
adopting Eve or weakening blobot's requirements.

## Limited alternative: Docker Engine has capabilities Eve does not expose

Docker Engine's own `docker container update` supports dynamic CPU and memory limits for
Linux containers, including `--cpus` and `--memory`. Its named volumes have a lifecycle
independent of individual containers and can be mounted into replacements by volume name.
Those are **Docker Engine capabilities**, not features implemented by Eve's Docker backend,
not sbx-local capabilities, and not yet a measured blobot replacement workflow.
[Docker update reference](https://docs.docker.com/reference/cli/docker/container/update/),
[volume lifecycle and syntax](https://docs.docker.com/engine/storage/volumes/#a-volumes-lifecycle).

Consequently, a plain-Docker backend is a plausible alternative to investigate if the user
chooses to reopen the engine boundary. It would require reviewing the current microVM
isolation choice, host-Docker-socket exclusion, guest-owned Docker requirement, scoped egress,
and the fifth trust level; dynamic resource updates alone do not settle those obligations.
The currently binding decisions remain
[What a Machine is](../issues/01-what-a-machine-is.md) (especially points 6–7),
[Does a Machine answer the fourth level?](../issues/10-does-a-machine-answer-the-fourth-level.md),
and [The first engine: sbx behind the interface](../issues/17-the-first-engine-sbx-behind-the-interface.md).
This research changes none of them. Ownership checks, CLI login handling, data preservation,
warning before interruption, and verified stopped state remain required whichever adapter
is used; Eve's different contract is not a reason to remove them.

## Scale of the adapter, not a quality metric

The public `docker()` factory is 19 lines, but delegates to **1,086 physical lines** across
nine production `docker*.ts` binding modules, plus **1,291 lines** of Docker-specific tests.
Those counts include comments/blanks and exclude shared lifecycle, public types, cache
locking/pruning helpers, image code, and framework setup. They are only navigation context:
the meaningful work comprises subprocess transport, process cancellation, image/template
cache, create/reconnect, file I/O, network toggling, and shutdown. No performance or quality
conclusion follows from the count, and the inspected tests were not run in this review.
