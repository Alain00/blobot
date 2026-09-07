# A custom `sbx` kit and the host SSH boundary

Measured/read 2026-09-05 for **The first engine: sbx behind the interface**. Companion to
[The first box, measured: sbx](08-the-first-box-sbx.md); this note only adds the kit contract
and a boundary the engine must not claim to enforce without evidence.

## Result

A root `schemaVersion: "2"`, `kind: sandbox` kit can describe Blobot's image, command and
private block volumes without inheriting the built-in shell kit. The local v0.39.0 loader
accepts the example below. **This does not disable daemon-level SSH-agent forwarding.**
No per-sandbox switch for disabling it was established for installed v0.39.0.

The Docker **v0.42.0-rc2** release explicitly adds an SSH-agent forwarding disable option,
alongside per-client/fixed-socket selection. It also introduces creation with no workspace
path and direct sandbox-kit-reference positional arguments. Those capabilities must not be
assumed for v0.39.0. A follow-up binary inspection below establishes the RC2 setting name
and its daemon-wide scope, but does not exercise its effect on a running sandbox.
[Docker release](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc2).

## Locally verified kit shape

`sbx version` returned `v0.39.0 def8cb0523a77e757bdd6ef52b459fe374f3783e`.
The binary is `/opt/homebrew/Caskroom/sbx/0.39.0/bin/sbx`.

The following `spec.yaml` passed **both** `sbx kit validate <directory>` and
`sbx kit inspect <directory> --json`. This is a parser probe; the sizes and image are
example inputs, not product defaults. No sandbox was created by this investigation.

```yaml
schemaVersion: "2"
kind: sandbox
name: blobot
sandbox:
  image: docker/sandbox-templates:shell-docker
  entrypoint: [bash]
  command:
    default: ["-l"]
credentials: []
permissions:
  network:
    allow: []
    deny: []
volumes:
  - path: /home/agent
    size: 10g
    mode: "0755"
  - path: /workspace
    size: 10g
    mode: "0755"
```

Observed inspect output contained only `schemaVersion`, `kind`, `name`, `sandbox`, and
the two volumes. It normalized the omitted interactive command to `["-l"]`; empty
credentials/network blocks disappeared. There was no inherited shell credential,
permission, or volume in this output. The probe directory was
`/private/tmp/blobot-sbx-kit-contract.o20dAi`.

Use the custom kit's name as the agent and provide the kit at creation:

```sh
sbx create --name <machine-name> --kit <kit-directory> blobot <host-workspace-path>
```

This invocation shape is documented, not executed in this investigation. In v0.39.0 the
locally observed `create` usage is `AGENT PATH [PATH...]`; `create shell --help` explicitly
requires a workspace and mounts it at its host path. A custom root kit must not use
`extends: shell`, and appending a mixin to the positional `shell` agent does not replace
that agent's built-in capabilities. Kit-provided network grants also do not erase
global or organization policy. [Docker kit usage](https://docs.docker.com/ai/sandboxes/customize/kits/).

## Setup and storage contract

The image needs an `agent` user at UID 1000, its home at `/home/agent`, passwordless sudo,
and proxy variables preserved through sudo. Docker's shell template supplies this base.
An image is required for a root sandbox kit; `sandbox.build` currently also needs an image.
`sandbox.entrypoint` is an argv prefix and `command.default` its argument tail.
[Docker kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/).

For additional configuration, the v2 spec provides:

- `setup.install`: objects with `command` (a shell string), optional `user` and description;
  synchronous application, root by default. A bare string list is rejected by the loader.
- `setup.startup`: argv arrays, replayed each container start, agent user by default.
- `setup.files`: absolute paths writable by UID 1000; `content`, octal `mode`, and
  `onlyIfMissing`. `${WORKDIR}` is the supported runtime placeholder.
- `files/home/` and `files/workspace/`: static payload copied into the agent home and
  primary workspace respectively.
- `volumes`: list entries with absolute `path`, optional byte-size `size`, octal `mode`,
  and optional `type: tmpfs`; omitted type is block-backed. Applied at creation.

These are documented contracts, not a boot/persistence observation of the probe kit.
[Docker normative v2 specification](https://raw.githubusercontent.com/docker/sbx-kits-contrib/main/spec/SPEC-v2.md).

Startup dispatch does not gate the agent entrypoint: `background: false` only orders the
startup dispatcher. Any prerequisite needed before the first runtime launch needs a
separate readiness check or a synchronous install/file step. `sbx kit add` cannot be used
to attach the above volumes after creation.
[Docker kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/).

## SSH: what is and is not established

Docker documents that an available host `SSH_AUTH_SOCK` causes a forwarded socket inside
the sandbox; sandbox processes can request signatures with host keys. This is a usable
host authentication capability even though private-key bytes remain on the host.
Outbound SSH policy and socket forwarding are separate: signing a local commit needs
no outbound SSH connection.
[Docker credentials](https://docs.docker.com/ai/sandboxes/configuration/credentials/#ssh-agent).

The earlier local probe in [The first box, measured: sbx](08-the-first-box-sbx.md) already
observed `/run/ssh-agent.sock`, a relay to the gateway, and sudo access. This investigation
found these strings in the **installed binary**, without inspecting daemon secrets:

```text
SSH_AUTH_SOCK_GATEWAY
/run/ssh-agent.sock
github.com/docker/sandboxes/sandboxd/pkg/server.sshAgentRelayCustomizers
github.com/docker/sandboxes/sandboxd/pkg/server.(*DockerNextBackend).recreateSSHAgentRelay
github.com/docker/sandboxes/sandboxd/pkg/server.(*sshAgentForwarder).relay
```

Its embedded `ssh.*` setting identifiers were `acceptEnv`, `authorizedKeys`, `autoCreate`,
`defaultAgent`, `defaultTemplate`, `manageKey`, `port`, and `workspaceRoot`. None was a
forwarding disable control. Binary strings are corroboration, not a public API contract.

**Do not add `credentials[].sshAgent` to a v2 kit.** Search-engine snippets and an older
authoring topic still show that draft shape. The freshly retrieved normative spec §5.4.3
explicitly says the field does not exist and is rejected by strict decoding.
[Current normative spec](https://raw.githubusercontent.com/docker/sbx-kits-contrib/main/spec/SPEC-v2.md).

The open issue **Provide an option to disable ssh agent forwarding** reports that clearing
the client environment leaves the daemon's socket active. A Docker member states that the
feature will become opt-in through a setting. A third-party comment proposes restarting
the daemon without the socket environment; the reporter says the relay then remains but
can no longer find the host agent. That workaround was **not tested** here and would affect
the shared daemon rather than only one Machine.
[Issue](https://github.com/docker/sbx-releases/issues/305),
[Docker member comment](https://github.com/docker/sbx-releases/issues/305#issuecomment-4874209654),
[reported workaround](https://github.com/docker/sbx-releases/issues/305#issuecomment-4871326567),
[reporter result](https://github.com/docker/sbx-releases/issues/305#issuecomment-4874592712).
The issue comments spell the variable `SSH_AGENT_SOCK`; Docker's actual documented
variable is `SSH_AUTH_SOCK`.

## Engine implications and remaining verification

- Omitting credential declarations and `extends` avoids kit inheritance; it is not proof
  that all global daemon authentication facilities are absent.
- Clearing `SSH_AUTH_SOCK` on the child process, deleting the guest Unix socket, or stopping
  the guest relay is not an established boundary against an agent with sudo and the gateway
  endpoint. Do not present those operations as host-key isolation.
- A deny rule for `gateway.docker.internal:<port>` might affect a route, but this investigation
  found **no primary-source guarantee** that the internal relay traverses policy enforcement.
  Even `deny external-host:22` does not prevent local signature requests. No such rule was
  tested or proposed as a proven fix.
- Before admitting runtime work on v0.39, the engine needs a verified admission condition
  that rejects an attached forwarding capability, or a separately verified provider-level
  disable mechanism. An RC release note alone is insufficient evidence to implement a new
  setting name or silently upgrade the shared installation.
- The candidate kit's whole-home volume, image contents under that mount, fresh create,
  stop/start persistence, and absence of inherited capabilities still need a real sandbox
  probe under the engine's intended configuration. Parser success does not settle them.

## Follow-up: exact RC2 control, inspected without installation

GitHub's `GET /repos/docker/sbx-releases/releases/latest` returned `v0.39.0`,
`prerelease: false`, published `2026-08-19T10:42:00Z`, on 2026-09-05. RC2 is a prerelease
published `2026-08-28T11:34:45Z`.
[Latest stable release API](https://api.github.com/repos/docker/sbx-releases/releases/latest),
[RC2 release API](https://api.github.com/repos/docker/sbx-releases/releases/tags/v0.42.0-rc2).

Downloaded the official `DockerSandboxes-darwin.tar.gz` to
`/private/tmp/blobot-sbx-rc2-contract.am0TtV/`, then extracted **only `bin/sbx`** there.
The SHA-256 matched GitHub's release-asset digest:
`a087e25b14d341b87fc00191d4e8e0d9cd1228ca0158ff31529a740df618eb8a`.
[Official package](https://github.com/docker/sbx-releases/releases/download/v0.42.0-rc2/DockerSandboxes-darwin.tar.gz).

The researcher's inspection used `strings` and commands ending in `--help`. The subsequent
implementation probe did attempt a settings query; see the operational caveat below.

The binary contains these exact setting names and descriptions:

| Key | Embedded description |
| --- | --- |
| `ssh.agentForwardingEnabled` | Allow clients to forward an SSH agent into sandboxes. Existing forwarders require a daemon restart after changes. |
| `ssh.agentSocketPath` | Optional fixed host SSH agent socket path. Empty uses each client's current SSH_AUTH_SOCK. Existing forwarders require a daemon restart after changes. |

The `settings --help` output states that settings belong to the daemon and are persistent;
`settings get --help` says an unknown key exits nonzero and `--json` adds type/source info.
`settings set --help` accepts boolean `true` and `false`. No per-sandbox selector appears.
This yields a concrete **daemon-wide** control and read-only admission input:

```sh
# Admission query on an appropriately running compatible daemon:
sbx settings get --json ssh.agentForwardingEnabled

# Administrative mutation, NOT executed in this research:
sbx settings set ssh.agentForwardingEnabled false
```

The query must return a recognized boolean false, rather than treating an unknown key,
parse failure, missing value, or unavailable settings as permission to continue.
**A false setting alone does not establish that already-created forwarders are gone:**
the description explicitly requires restarting the daemon for those. A complete admission
check therefore also needs evidence that the effective daemon was restarted after the
change, or a check that the target sandbox has no forwarding endpoint. The exact JSON
response structure and the running-provider behavior were not probed here. No default
value is inferred from strings or setup wording.

RC2 `create --help` confirms these operational differences directly:

```sh
# Custom root kit, no host workspace mount (help-verified, not executed):
sbx create --name <machine-name> <absolute-kit-directory>
```

`--kit` now describes additional mixin kits; the root sandbox kit belongs in the positional
argument. `create` explicitly allows omitted workspace paths. `run` must not be substituted
for `create` because its default workspace behavior differs.

The RC2 `setup --help` also explains that setup can import detected agent secrets globally
and enable forwarding/current-client or fixed socket modes. It is unsuitable as an automatic
prerequisite for this engine task and was not run.

This investigation changed only temporary validation/download artifacts and this report.
It did not create VMs, change settings/policies, start/stop daemons, authenticate, install,
upgrade the shared engine, or read stored credentials.

## Implementation probe: transport and persistence on v0.39.0

The parent implementation session subsequently ran the opt-in deterministic test at
`packages/core/src/machines/sbx/live.test.ts` on this Mac. **One test passed in 11.16 s**.
This used the already-cached shell image, not a provider CLI or the future blobot image.
The tested root kit is generated by `packages/core/src/machines/sbx/kit.ts`.

- v0.39.0 requires a **writable** primary workspace mount; even an empty `:ro` mount is
  rejected. Only a newly-created, empty temporary directory was mounted. No repository,
  host home, login directory or source worktree entered the test VM.
- Two 512 MiB volumes at `/home/agent` and `/workspace`, mode `0700`, initially deny UID
  1000 writes (`config/EACCES`). The supported synchronous preparation is
  `setup.install: [{user: "0", command: "chown 1000:1000 /home/agent /workspace"}]`.
  This fixed the live failure. No UID/GID volume fields exist in the normative schema.
- A stdin-framed launch applied JSON configuration before running the fixture as UID 1000,
  carried multiline/Unicode environment values and protocol input, and excluded a host-only
  sentinel environment variable. Values were not placed in host command arguments.
- After `sbx stop`, the next exec read the first configuration, merged a second patch and
  incremented a workspace file from one to two. This proves stop/start persistence for these
  test volumes, **not** runtime login persistence, image replacement or ACP `session/load`.
- Each created probe box was removed by exact name with `sbx rm -f`, along with its disposable
  volumes and temporary mount. No model turn, authentication or registry pull was performed.

The image's Dockerfile ownership is insufficient once its home is covered by a volume.
Synchronous setup precedes runtime exec; an asynchronous startup hook is not a substitute.
[Docker lifecycle](https://github.com/docker/sbx-kits-contrib/blob/main/skills/kit-author/topics/lifecycle.md),
[kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/).

This probe intentionally ran only trusted fixture code: it does **not** prove absence of
the default SSH relay or establish production isolation. v0.39.0 remains inadmissible for
Agent workloads under this map. The question whether to adopt RC2 for development remains
unanswered; no engine upgrade or daemon configuration mutation was made.

### Operational caveat: a query may try to start the daemon

An RC2 `settings get` attempted from the restricted execution sandbox could not reach the
existing daemon socket. It printed startup/wait messages and timed out after ten seconds,
reporting that the existing process remained running but unresponsive. The query terminated;
an unrestricted process/status inspection confirmed the existing Homebrew daemon was still
running. No replacement daemon or setting change was observed.

Likewise, `sbx daemon status` in the restricted environment reported stopped, whereas the
authorized unrestricted status returned running. Treat access failures as **unknown**, not
stopped or safe. Commands that look read-only may auto-start a daemon; lifecycle setup must
decide that authority before using them as routine discovery.
