# RC5 lifecycle command contracts and unresolved inspection gaps

Checked 2026-09-05 on the installed `v0.42.0-rc5` for **A box's lifecycle, engine setup,
and the pool**. This researcher ran only help, status/version, diagnostics, list, policy-check,
and setting-get commands. The daemon was already running. No settings/policy/lifecycle
mutation, credential-file read, diagnostic upload, sandbox creation, or guest execution.
Runtime queries used a host-environment allowlist, no SSH agent socket, and
`SBX_NO_TELEMETRY=1`; the initial status query also explicitly removed `SSH_AUTH_SOCK`.

Read [the v0.39 live engine findings](08-the-first-box-sbx.md) and
[the RC5 admission findings](10-sbx-rc5-engine-admission.md) for earlier live evidence.
This document adds exact current JSON and identifies what the public command surface
**does not prove**. A successful parse is not admission by itself.

## Daemon status and version

`sbx daemon status --json` returned exit 0 and:

```json
{
  "status": "running",
  "socket": "<engine-state>/sandboxd/sandboxd.sock",
  "logs": "<engine-state>/sandboxd/daemon.log"
}
```

Paths above are redacted for portability; those are the exact keys. There is no PID,
start timestamp, epoch, server version, or pending-restart flag. The command is documented
as a status check. **Stopped-daemon behavior and its exit/JSON shape were not remeasured**:
this task did not authorize stopping the shared daemon. Do not invent a tested
`status: stopped` schema or claim this test proves absence of implicit startup when stopped.
[Status reference](https://docs.docker.com/reference/cli/sbx/daemon/status/).

`sbx version --json` returned exit 0, empty stderr:

```json
{
  "client": {
    "version": "v0.42.0-rc5",
    "revision": "ca4a4bd42035628137d78c5a0bef5c0d3301a35a",
    "build_tags": "cloud"
  },
  "server": {
    "state": "running",
    "version": "v0.42.0-rc5",
    "revision": "ca4a4bd42035628137d78c5a0bef5c0d3301a35a",
    "api_version": "0.28.0"
  }
}
```

`client.build_tags: cloud` identifies the compiled binary, **not cloud execution**. The
local command above omitted `--cloud`. RC5 help promises optional runtime component
versions when the backend supplies them; none appeared here. Release notes define
`server.state` as `running` or `unavailable`, but the latter response was not captured in
this session. Compare client **and server** version/revision before admitting this pin.
[RC5 release](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5).

## Engine sign-in readiness without reading credentials

`sbx login --help` offers an interactive sign-in and username/password-stdin flags; it
offers no status subcommand. Do not invoke login merely to ask whether sign-in exists.

`sbx diagnose --json` returned exit 0, empty stderr, and this shape:

```ts
{
  version: string;
  checks: Array<{
    name: string;
    status: string;
    message: string;
    detail: string;
    hint: string;
  }>;
  summary: { pass: number; warn: number; fail: number; skip: number };
}
```

There was exactly one `{name: "Authentication", status: "pass", ...}` check. Other checks
included `Daemon`, `Daemon diagnostics`, `Virtualization`, `Directory permissions`, `Version
match`, and `Socket`. Free-form diagnostic messages/details were not emitted into this
research; they are unnecessary to parse the named status and may contain user/environment
information. This is a candidate readiness signal from the engine's own diagnostic command,
not a guarantee that a registry pull, Docker account entitlement, or future token refresh
will succeed.

The signed-out, expired-token, unavailable-keychain, and network-failure cases were **not
measured**. Therefore do not map every non-pass Authentication result to `needs sign-in`;
until those cases are proven, distinguish unknown/error from a definite negative. Do not
treat overall diagnostic exit 0 as authentication success if the named check is absent or
not recognized. Its machine-readable status spelling is pinned observed behavior, not an
enumeration documented by the CLI reference. RC5 help has `--json` as an alias for
`--output json`; `--upload` is separate and was never used.
[Diagnose reference](https://docs.docker.com/reference/cli/sbx/diagnose/).

## Template cache is not effective sandbox image inspection

`sbx template ls --json` returned:

```json
{
  "images": [
    {
      "id": "94670d5b2a24",
      "repository": "docker.io/docker/sandbox-templates",
      "tag": "claude-code-docker",
      "flavor": "claude-code-docker",
      "created_at": "2026-09-04T18:58:46Z",
      "size": 936879795
    },
    {
      "id": "5fc81bc7a127",
      "repository": "docker.io/docker/sandbox-templates",
      "tag": "shell-docker",
      "flavor": "shell-docker",
      "created_at": "2026-09-04T18:54:27Z",
      "size": 588725040
    }
  ]
}
```

The image ID is abbreviated, and no immutable registry digest is exposed in this observed
response. Matching repository/tag proves a listed cache entry, not that an existing Machine
was created from it, nor that mutable tag content is trusted. `template inspect --help`
explicitly requires `--cloud` in this release. No local `template inspect` was run.
[Template reference](https://docs.docker.com/reference/cli/sbx/template/).

## Scoped mailbox rule commands

RC5 help and current official references validate these forms; **this researcher did not
run the mutating first or fourth command**:

```sh
sbx policy allow network --sandbox NAME localhost:PORT
sbx policy ls NAME --type network --source local --json
sbx policy inspect RULE_ID --json
sbx policy rm network --sandbox NAME --id RULE_ID
```

Both mutation commands default to the **global** policy when `--sandbox` is absent. Always
supply the validated owned sandbox name. Neither allow nor remove exposes `--json` in RC5
help. `rm --id` takes the rule identifier, not the display name; `--resource` also exists but
does not prove ownership of a matching rule. Read the rule set before/after creation and
persist the exact new owned ID; refuse ambiguity rather than revoke a pre-existing rule.
[Allow reference](https://docs.docker.com/reference/cli/sbx/policy/allow/network/),
[remove reference](https://docs.docker.com/reference/cli/sbx/policy/rm/network/).

**Mailbox host spelling is load-bearing:** the guest URL remains
`http://host.docker.internal:PORT`. The earlier v0.39 live probe found that the proxy rewrites
that destination to `localhost:PORT`, and the scoped rule allowing `localhost:PORT` was the
one that actually admitted traffic. A policy check for the guest spelling disagreed with
the actual route. This is not newly revalidated on RC5; use a scoped live fixture before
claiming a working RC5 mailbox door. See [the mailbox measurement](08-the-first-box-sbx.md#2-the-mailbox-door-blobot-probe-a-shell-bind-mounted-repo-a).

Current global `policy ls --json` returned a `rules` array. A representative network entry:

```json
{
  "id": "default-deny-all",
  "name": "default-deny-all",
  "policy_name": "default-deny-all",
  "scope": "global",
  "applies_to": "all",
  "resource_type": "network",
  "decision": "deny",
  "resources": ["**"],
  "origin": "local",
  "layer": "local",
  "status": "active",
  "editable": false
}
```

The two filesystem defaults additionally had `policy_id: local-policy` and no
`policy_name`. Thus neither field is universal. `policy ls --type network --source local
--decision allow --json` returned `{"rules":[]}`. **There was no scoped mailbox rule to
inspect**, so its exact `scope`, `applies_to`, editability, and ID persistence across restarts
remain for the implementing session's fixture; do not hard-code them from a global example.
Listings for a sandbox include applicable inherited rules, not only owned rules. Remote
governance can hide inactive rules unless `--include-inactive` is supplied.
[List reference](https://docs.docker.com/reference/cli/sbx/policy/ls/).

Global `policy check network --json http://localhost:46777` returned exit **1** with valid
JSON containing `allowed:false`, `deny_kind:"implicit"`, `context:"global"`,
`governance:{active:false}`, `action:"net:connect:tcp"`, `resource_type:"net:domain"`,
`resource_value`/`target:"localhost:46777"`, `type:"network"`, and a default-deny reason.
The host.docker.internal spelling produced the same structure with that target instead.
A known-denied result is not a transport/parse failure merely because its exit code is 1;
nor is policy evaluation evidence that an HTTP request reached the listener.
[Check reference](https://docs.docker.com/reference/cli/sbx/policy/check/network/).

## SSH admission freshness: setting value is not restart evidence

`settings get --json ssh.agentForwardingEnabled` returned:

```json
{
  "default": true,
  "description": "Allow clients to forward an SSH agent into sandboxes. Existing forwarders require a daemon restart after changes.",
  "key": "ssh.agentForwardingEnabled",
  "requires_restart": true,
  "source": "override",
  "type": "bool",
  "value": false
}
```

`requires_restart` describes the setting; it is **not** a pending-restart flag or proof that
restart happened. The response contains no effective runtime value, applied timestamp,
daemon epoch, or revision counter. Status/version also lacks a usable restart generation.
No public command proving that a previously stored admission receipt is still fresh was
established. The [earlier live admission probe](10-sbx-rc5-engine-admission.md#authorized-installation-and-fixture-probe--observed-2026-09-05)
remains evidence about that measured daemon and fixture, not a perpetual certificate.

RC5 `sbx settings --help` explicitly states that **settings commands start the daemon if it
is not running**, including reads. Status-before-get therefore avoids the normal stopped
case, but cannot eliminate a stop/start race; no documented `--no-start` option was found.
Keep routine Settings rendering separate from engine admission/setup. Unknown or changed
state requires revalidation of the current owned guest boundary; a timestamp or matching
client version alone cannot establish it. No new automatic restart policy is decided here.

## Adoption and effective configuration gap

Current `sbx ls --json` returned `{"sandboxes":[]}`; prior fixture results establish sandbox
name/ID/agent/status metadata. Public `ls --help` mentions ports/workspace but exposes no
effective image digest, root-kit fingerprint, resource limits, or owned-volume identities.
There is no public local sandbox `inspect` command in the inspected help tree.

`kit inspect REFERENCE --json [--kit-arg ...]` loads an **artifact** from a directory, ZIP,
registry, or Git source and can preview substituted arguments. It does not inspect a
running/stopped sandbox's installed composition. No `kit ls` or `kit show` exists in this
release's help. Calling it on a local source file validates today's source, not what an
existing container runs. [Kit-inspect reference](https://docs.docker.com/reference/cli/sbx/kit/inspect/).

A blobot receipt binding Agent, engine sandbox UUID, and expected configuration fingerprint
can establish what blobot recorded creating and detect replacement by UUID. It cannot by
itself establish the current image/configuration or rule out out-of-band modification of
that same sandbox. Guest probes can verify selected current properties (UID, mounts,
CPU/RAM, absence of SSH relay), not prove the complete image identity. **Do not describe
receipt-only adoption as verified effective configuration.** A stricter contract needs
additional supported inspection or an explicitly limited acceptance decision; undocumented
daemon endpoints or mutable engine database files were not adopted as a shortcut.
