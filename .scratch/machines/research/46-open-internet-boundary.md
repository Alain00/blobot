# Open Internet and the host boundary in sbx RC5

Measured 2026-09-06 on Guillermo's Mac, arm64, client/server `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, API `0.28.0`.
The author explicitly chose Internet without an additional blobot destination list. This
investigation tests whether that can preserve the previously accepted host-service boundary.

## Result

The two native rule combinations tested do not satisfy both requirements. An IP-only allow
does not admit ordinary HTTPS by hostname. A wildcard hostname allow admits HTTPS but also
allows connections to a host loopback listener despite private-IP deny rules. This is measured
behavior, consistent with the local CLI's explicit caveat about resolved IPs.

| Scoped policy on the disposable box | HTTPS | HTTPS ignoring proxy variables | Host alias | Name resolving to host loopback |
| --- | --- | --- | --- | --- |
| Empty, default deny | HTTP 403 | curl reports 000 | HTTP 403 | HTTP 403 |
| Allow `0.0.0.0/0,::/0`; deny private/reserved CIDRs | HTTP 403 | curl reports 000 | HTTP 403 | HTTP 403 |
| Allow `**`; deny private CIDRs | HTTP 200 | HTTP 200 | HTTP 200 | HTTP 200 |

HTTPS target: `https://example.com`. Host targets: an owned synthetic HTTP listener bound
only to `127.0.0.1:53206`, addressed through `host.docker.internal` and
`127.0.0.1.sslip.io`. The host listener recorded exactly two requests in the wildcard phase
and none in the other phases. No real host database, application, LAN service or cloud metadata
service was contacted. `policy check` for a metadata IP evaluated only a policy object.

The wildcard/CIDR policy denies the literal `127.0.0.1` in `policy check` while allowing the
hostname resolving there. This is sufficient to refute the proposed hostname-plus-CIDR
composition; it does not certify every protocol, hostname, redirect or DNS change.

## Reproduction and ownership

[Fixture](46-open-internet-boundary-fixture.mjs),
[complete observation](46-open-internet-boundary-results.json).

```sh
BLOBOT_LIVE_SBX_OPEN_NETWORK=1 node .scratch/machines/research/46-open-internet-boundary-fixture.mjs
```

The fixture requires the pinned engine, cached shell template `5fc81bc7a127`, disabled SSH
forwarding, an empty box inventory and at least 3 GiB free. It creates one UUID-owned root kit
with no credentials or host mounts, 2 CPUs, 2 GiB RAM and two synthetic 512 MiB volumes. Only
scoped rules on that owned box change. No provider, login, inference or installation runs.
The shell image is the existing base template, not a certification of a released runtime image.

Box: `blobot-network-ec133c53-d1d0-4237-9bfa-0de8f574b185`, id
`5e683309-d849-43c0-80da-ca6ba39f34fd`. Each mutation checks that name/id binding. Cleanup
removes its scoped rules and box, verifies absence and compares the global network inventory
with the original. `completed`, `boxRemoved` and `globalUnchanged` are all true; no cleanup
error was recorded. Temporary evidence remains at `/private/tmp/blobot-open-network.pOEglv`.

## Relevant documented limits

The local RC5 `policy deny network --help` states:

> An allowed hostname isn't checked against CIDR rules for its resolved IP address.

This is quoted from the local executable. The
[official deny reference](https://docs.docker.com/reference/cli/sbx/policy/deny/network/)
describes deny precedence; a broad localhost deny cannot then be overridden with a narrow
mailbox allow. [Host-service access](https://docs.docker.com/ai/sandboxes/workflows/development/#accessing-host-services-from-a-sandbox)
documents the host alias. A blanket allow consequently needs a separately justified host
boundary rather than an assertion based on the VM's isolation of its files.

The read-only documentation/CLI review found no independent per-sandbox public-IP-only
control. The guard documented for [MCP registration](https://docs.docker.com/reference/cli/sbx/mcp/add/)
does not establish a guard on general proxy egress. An
[upstream proxy](https://docs.docker.com/ai/sandboxes/configuration/upstream-proxy/)
is daemon/host configuration and applies to HTTP/HTTPS, not all TCP, so it is not a verified
per-Agent replacement for this boundary. Absence of a documented control is not a proof that
no engineering solution can ever exist.

## Consequence for the implementation

Internet without a blobot destination list remains the accepted product decision. The prior
host-service exclusion is a separate accepted boundary. The tested wildcard cannot silently
amend it. No production code or activation gate changed. Ask the author whether to accept
broader network access to host/local services, or retain that exclusion and investigate an
additional boundary. Either answer preserves the worktree mounts, credential ownership and
tool-approval distinctions; network access alone grants no new filesystem mount or login.
