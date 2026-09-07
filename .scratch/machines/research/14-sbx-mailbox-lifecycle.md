# RC5 scoped mailbox lifecycle — live validation

Measured 2026-09-05 against local sbx client/server `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, server API `0.28.0`.
Complements [the read-only command contract](13-sbx-lifecycle-command-contract.md).

**PASS:** the guest mailbox URL uses `host.docker.internal:PORT`, while its scoped network
rule must allow `localhost:PORT`. Replacing the port and revoking each exact rule worked;
revoked traffic returned 403 without reaching the host listener. Scoped rule JSON uses
`origin: "scoped"`, not `origin: "local"`.

## Fixture and safety boundary

The delegated task authorized disposable fixtures only. Created exactly
`blobot-mailbox-probe-nnvegj`, from a root kit named `blobot-mailbox-probe`, using the already
cached `docker.io/docker/sandbox-templates:shell-docker` image, 2 CPUs, 2 GiB RAM, and two
512 MiB private block volumes. No workspace argument or inherited vendor kit; root kit had
empty credential/network declarations. Setup explicitly ran `chown 1000:1000` and
`chmod 0700` on `/home/agent` and `/workspace`.

Checked running daemon, matching client/server pin, forwarding setting false, image cache,
and no fixture-name collision before creation. There were no other sandboxes in the initial
list, but the script did not rely on that condition or remove any other name. Client
environment was allowlisted with `SBX_NO_TELEMETRY=1` and no `SSH_AUTH_SOCK`.

Two host HTTP listeners bound only `127.0.0.1`, on ephemeral ports 51834 and 51835. A random
in-memory UUID served as a synthetic bearer; the report recorded only whether it matched,
not its value. No actual credential, provider, model, repository, cloud, global policy,
engine setting, or daemon restart participated.

Reproduction script and kit remain outside the workspace:
`/private/tmp/blobot-sbx-mailbox.nnvegJ/probe.mjs` and `kit/spec.yaml`.
The script validates its boundaries before any mutation and removes only its exact fixture.
It prints a JSON report; no raw report file or credential archive was written to host disk.

## Guest attestation observations

`sbx exec -u 0 NAME /usr/bin/node -e ...` read `/proc/self/mountinfo`, `/proc/meminfo`,
`os.cpus()`, and `lstat/stat` for the fixed paths:

```json
{
  "cpu": 2,
  "memory": "MemTotal:        2066016 kB",
  "uname": { "type": "Linux", "release": "7.0.12", "machine": "aarch64" },
  "ssh": "ENOENT",
  "roots": [
    { "path": "/home/agent", "uid": 1000, "gid": 1000, "mode": 448 },
    { "path": "/workspace", "uid": 1000, "gid": 1000, "mode": 448 }
  ]
}
```

Mode 448 decimal is 0700. `ssh` is the root `lstat` error for `/run/ssh-agent.sock`, not a
claim based on absence of its environment variable. This fixture did not inject a fake host
SSH socket; [the separate RC5 admission probe](10-sbx-rc5-engine-admission.md#authorized-installation-and-fixture-probe--observed-2026-09-05)
covers that stronger case.

Relevant mountinfo rows, exactly as read:

```text
112 101 254:64 / /home/agent rw,relatime - ext4 /dev/vde rw
113 101 254:80 / /workspace rw,relatime - ext4 /dev/vdf rw
114 101 0:27 /resolv.conf /etc/resolv.conf ro,relatime - virtiofs bind-95f03ffa45a7d998 rw
115 101 0:28 /hosts /etc/hosts ro,relatime - virtiofs bind-4a666ea3a3b04a24 rw
```

The mount options **before** ` - ` describe the particular mount: the two network-file
mounts are `ro` even though their superblock options after the separator say `rw`.
Mount IDs, device numbers, block device names, and bind identifiers are observations from
one boot, not stable volume ownership identifiers. Check the target path, filesystem kind,
and effective mount options; do not require these ephemeral numbers on adoption.

## Exact scoped-rule JSON

After the first allow, `sbx policy ls NAME --type network --source local --json` included
this new entry (discovered by diffing IDs against the previous listing):

```json
{
  "id": "81a86dfa-06df-4bbc-863f-94c45ced59aa",
  "name": "81a86dfa-06df-4bbc-863f-94c45ced59aa",
  "policy_id": "9676af4a-1040-4c53-84e4-c87f307db1aa",
  "scope": "sandbox:blobot-mailbox-probe-nnvegj",
  "applies_to": "sandbox:blobot-mailbox-probe-nnvegj",
  "resource_type": "network",
  "decision": "allow",
  "resources": ["localhost:51834"],
  "origin": "scoped",
  "layer": "local",
  "status": "active",
  "editable": true,
  "sandbox_id": "blobot-mailbox-probe-nnvegj"
}
```

Despite its field name, `sandbox_id` here is the **sandbox name**, not the UUID from the
engine sandbox list. `--source local` includes a rule whose `origin` is `scoped`; a parser
that requires `origin === "local"` would discard the rule it just created.

The second rule had the same policy/scope metadata, its own ID
`a48bafdb-8b53-4c3e-b2d6-6d1e229a99fc`, and resource `localhost:51835`.
Only each exact newly added ID was revoked. Neither a policy ID nor a resource match alone
was used as permission to delete a rule.

## Create, replace, revoke: observed sequence

Each guest request used UID 1000 and `curl -sS --max-time 4`, the engine's existing proxy
environment, an explicit fake Authorization header, and the URL
`http://host.docker.internal:PORT/fixture`. The script did not bypass the proxy.

| Step | Result at old port 51834 | Result at new port 51835 |
| --- | --- | --- |
| Before any allow | 403, no host request | Not requested yet |
| Allow scoped `localhost:51834` | 200, bearer matched | 403, no host request |
| Allow scoped `localhost:51835` | Old rule still present | 200, bearer matched |
| Revoke exact old rule ID | 403, no host request | 200, bearer matched |
| Revoke exact new rule ID | Old rule already absent | 403, no host request |

The commands were:

```sh
sbx policy allow network --sandbox NAME localhost:PORT
sbx policy ls NAME --type network --source local --json
sbx policy rm network --sandbox NAME --id RULE_ID
```

The allow/remove commands exited 0 with textual acknowledgments. Actual guest requests
immediately after each command observed the table above; no retries or propagation sleeps
were needed in this fixture. This is an observation, not a latency guarantee under load.

Host listeners saw exactly three successful requests: one old-port hit and two new-port
hits. All had `/fixture`, `remote: 127.0.0.1`, `tokenMatches: true`, and `Host:
localhost:PORT`. Every denied guest attempt returned:

```text
Blocked by network policy: domain localhost:PORT
  detail: no matching allow rule — blocked by default deny policy

403
```

`curl` exited 0 for the HTTP 403 because the fixture intentionally did not use `--fail`.
Thus exit-code-only readiness would be wrong; inspect HTTP status and the authenticated
listener response. The listener saw no traffic from any denied request.

## Policy check still evaluates a different spelling

While the old scoped rule existed:

- `policy check network --sandbox NAME --json http://host.docker.internal:51834`
  exited 1 with `allowed:false`, `deny_kind:implicit`, and the guest spelling as target.
- The same command for `http://localhost:51834` exited 0 with `allowed:true`.

Both responses used `context: sandbox:NAME`, `action: net:connect:tcp`,
`resource_type: net:domain`, `type: network`, and `governance:{active:false}`.
The guest could nevertheless reach the listener through `host.docker.internal` in the
first case because the real proxy path rewrites the hostname. RC5 therefore retains the
earlier v0.39 discrepancy. Actual authenticated reachability is the mailbox-door proof;
a policy check on the guest URL alone is not.

## Cleanup and limits of this result

After both revocations, neither owned rule ID appeared in the scoped listing.
`sbx rm -f blobot-mailbox-probe-nnvegj` exited 0; the final list contained no fixture with
that name. Its disposable volumes were deleted, and both loopback listeners closed.
Only synthetic fixture data was removed; no user data requires recovery.

This proves the scoped HTTP door and exact rule lifecycle on RC5. It does not validate SSE
stream lifetime on this version, real runtime authentication, cross-daemon rule persistence,
foreign sandbox isolation, governance overrides, interrupted cutover recovery, or full
effective-image identity. The handoff should cite this result without expanding its scope.

## Production-lifecycle regression, measured later the same day

The internal lifecycle fixture initially required a global `default-deny-all` rule even after
adding its scoped mailbox allow. RC5's **unnamed and named** listings then contained only the
explicit rule: `default-deny-all` is a synthetic empty-policy display row, not a durable rule.
The denied `.invalid` canary still returned `allowed:false`, `deny_kind:implicit`, with the
exact sandbox context and governance inactive. The mailbox target returned allowed. Denial
exits 1 with valid JSON; it is not an invocation failure. This reproduced twice before the fix.

The fix keeps the applicable global/scoped rule inventory, refuses unexpected allows, and
supplements it with effective-authorizer checks for default denial and the mailbox. It does
not turn the canary into proof about all destinations. The unnamed inventory also includes
other sandboxes' rules; only correctly scoped foreign entries are excluded, never unknown
scope metadata. Unit regressions and the full owned-lifecycle fixture now pass this admission.
No global policy reset or permission weakening was performed.

[Docker's local-policy contract](https://docs.docker.com/ai/sandboxes/governance/access-controls/local/)
documents default denial, scoped rules and the authorizer check. The synthetic-listing behavior
above is an RC5 observation, not a documented stable JSON guarantee. Continue pinning/checking
the client/server contract and rerun the live regression when it changes.

The two-Machine extension exposed a second exact representation: with an explicit rule on
one box, the other box's empty named listing returns `{"rules":null}`, not `{"rules":[]}`.
Captured twice before normalizing that exact empty form; missing/invalid `rules` still
refuses. The final fixture admits two distinct owned Machines concurrently, checks each
mailbox policy with the other's rule present, then stops the peer and completes replacement.
The extended lifecycle plus observation tests passed in 120.62 s; no shared policy changed.
