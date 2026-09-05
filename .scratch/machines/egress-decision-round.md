# Egress decision round

2026-09-06. Author response recorded for
[Egress from a box: the allowlist, and how a block is said](issues/15-egress-from-a-box.md).
The fixed-list proposal below was rejected. Implementation remains in progress.

## Accepted answer: Internet without an additional blobot list

Guillermo: “acceso a internet sin limitar por ahora mas alla que lo que cada harness ya limita
por sus propios medios”. No blobot domain allowlist, hostname editor, automatic widening request
or fixed development-destination catalog is required. APIs, sites, private registries and custom
inference endpoints are not excluded merely because blobot did not list their hostname.

This is a deliberate amendment of the previous Internet destination policy. It does not grant
new host mounts, host credentials, forwarded SSH keys, host-service access or broader tool
approvals. The exact mailbox door remains. Harness behavior and the accepted optional-inner-fence
decision remain unchanged. sbx protocol limitations or inherited organization policy must be
reported honestly; no claim of unrestricted UDP/ICMP support is inferred from the product choice.

The domain-list proposal, its expansion decision tree and per-runtime host pins as an admission
gate are superseded. Startup/network evidence remains useful for login and diagnostics, not
authorization. No generic proxy-log transcript collector is needed for a blobot list that no
longer exists. Runtime errors/requests retain their existing carriers. Implementation must
verify Internet reach while preserving the host/Machine boundary; no box is enabled by this
documentation amendment alone.

## Host-service reach accepted

Guillermo answered the explicit host/local-network question: “si pero el agente tendria los
mismos permisos que te deja tener si lo corres en tu maquina ni mas ni menos”. Implement open
network reach including host/local services, preserving the selected harness approval policy.
No automatic trust increase, credential import, SSH forwarding or new filesystem mount follows.
The prior host-service exclusion is superseded. Network reach is not service authorization;
the mailbox keeps its bearer check. Its old port-revocation claim no longer holds while the
Machine has open network access. Effective guest capabilities can differ from the host because
the OS, files, login and native fencing differ; do not promise literal capability equality.

The Internet and host-network choices are now settled. Continue implementation and validation
without asking again. The following is the evidence that prompted the accepted amendment.

The author then explicitly deferred network restrictions to another effort, calling an
arbitrary whitelist inefficient. No domain-filter/editor work remains in this goal. Network
policy must not be reopened merely to complete the historical ticket's original checklist.

The [owned RC5 fixture](research/46-open-internet-boundary.md) tested the two candidate native
policies. `allow **` plus private CIDR denies reached both a public HTTPS site and a synthetic
host-loopback listener, including through a hostname resolving to loopback. IP-only permits
kept the hostname-based HTTPS request blocked. The read-only documentation review found no
independent per-sandbox control that solves this composition. All fixture rules/boxes were
removed and the global policy was unchanged.

The Internet decision is accepted and is not being asked again. The newly exposed choice is
whether the author also accepts network reach to host/local services with sbx's open policy.
That reach was excluded in the earlier host boundary and required the separate answer recorded
above. The author has now explicitly accepted it; no additional host fence is required here.

## Prior context (Internet allowlist superseded above)

- A box has a host-enforced destination allowlist, per Agent, plus its exact mailbox door.
- Guest sudo and private Docker/Compose do not expand the host-access or egress boundary.
- SSH-agent forwarding and importing host credentials are excluded. Worktrees share Git
  metadata and origin; that URL grants neither authentication nor network admission.
- There is no fetch-home transport: both kinds use the host worktree.
- Approval posture and network reach are separate controls. A proxy denial is not a pending
  permission request and does not put the Agent into `waiting`.
- No new approvals administration screen has been approved. Basic implementation choices are
  delegated, while non-obvious product/trust choices require the author.

Sources: the current answers of [Machine](issues/01-what-a-machine-is.md),
[Workspace](issues/05-where-a-workspace-lives.md),
[engine reevaluation](issues/22-reevaluate-the-first-machine-engine.md), and
[boundary](issues/04-where-the-boundary-goes.md). Historical clone/socket/fetch questions in the
egress ticket are superseded by these accepted amendments, not reopened here.

## Rejected proposal: fixed development destinations

Recommend a fixed initial list covering the chosen runtime's functional API/sign-in/plugin
destinations, source forges and development downloads: package registries, the image's operating
system package sources, and container registries with their required delivery hosts. Start
from denial of unlisted destinations. Keep separable optional telemetry destinations outside
the list and disable optional telemetry using supported runtime settings where possible.

No hostname editor or agent-triggered widening in this first version. This stays inside the
existing exclusion of a policy administration feature. The practical cost is explicit:
arbitrary websites, private package registries, custom inference endpoints or a project's own
external API remain unreachable unless their destinations belong to the shipped list. A
service running inside the Agent's own Machine is a different case from an external service.

This requires the author's answer. If fixed destinations are unsuitable, the next round must
decide the narrow scope and lifetime of user-authored exceptions before any editor is built.
No exception or unrestricted mode is silently inferred from the general-purpose Machine goal.

Domain admission is not a read-only guarantee or a content filter: permitted destinations can
carry both reads and writes. Optional telemetry sharing a necessary functional hostname cannot
be separated by a hostname rule. Do not promise that every telemetry request is suppressed.
Exact host rows are technical research and validation work, not a list for the author to invent.

## Facts recovered before asking

Read-only adapter/contract review at `1aa70a7`:

- `MachineRuntimeRequirements.allowedHosts` exists, but neither the runtime image declaration
  nor the five adapters supplies a network list. `OwnedSbxMachine.start` rejects nonempty lists;
  the lifecycle currently admits only its owned mailbox permission. Box production remains gated.
- [Signed-out traffic](research/29-runtime-image-deny-all-traffic.md) observed Codex reaching
  `chatgpt.com`, `api.github.com` and `github.com`; OpenCode reaching `registry.npmjs.org`; and
  Cursor reaching `api2.cursor.sh`. All requests were blocked. Claude logged no destination
  during that initialize window; fx stopped at missing authentication. These are not complete
  login/inference lists or proof of permanent silence.
- [Source follow-up](research/31-codex-first-start-hosts.md) identifies plugin distribution as
  a plausible cause for Codex/OpenCode traffic. A blocked startup hostname is not automatically
  telemetry. The measured manifests differ from the current published images; exact released
  artifacts still need their own validation before activation.
- The existing global/scoped inventory rejects unexpected global allows. A permissive global
  policy cannot be treated as a closed per-Agent list merely by adding scoped allows. No shared
  global policy was changed for this review; incompatible policy continues to refuse admission.
- The current Machine interface has no network-denial event. Historical policy-log snapshots
  aggregate per-host attempts; they do not identify an individual tool or establish attribution
  to a turn. The transcript carrier needs an honest Machine-level subject and deduplication.
- RC5's local `policy log --help` offers sandbox, JSON, limit, type and quiet flags, with no
  follow/cursor/since argument. Recorded rows contain host, VM, proxy type, rule, reason,
  timestamps and counters, without process/turn/event identity. Retention and counter reset
  behavior remain unverified; snapshot polling must not be advertised as lossless delivery.
- Current Docker documentation describes transparent TCP enforcement for clients that ignore
  proxy settings, internal policy-aware DNS, and external UDP/ICMP blocking. `forward-bypass`
  means TLS tunneling without termination/injection, not exemption from destination policy.
  These documented properties still require bounded RC5 enforcement probes for our image and
  nested Docker. No adversarial bypass resistance was measured in this read-only review.

Primary references checked by the read-only policy review:
[local policy](https://docs.docker.com/ai/sandboxes/governance/access-controls/local/),
[network architecture](https://docs.docker.com/ai/sandboxes/architecture/#networking),
[network isolation](https://docs.docker.com/ai/sandboxes/security/isolation/#network-isolation),
[monitoring](https://docs.docker.com/ai/sandboxes/governance/monitor-and-enforce/monitoring/),
[kit rule syntax](https://docs.docker.com/ai/sandboxes/customize/kit-reference/#network), and
[RC5 release](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5).
Prefer exact hosts/ports: the kit reference marks some broader patterns as enforcement pending,
while other policy pages describe wider support. Do not resolve that discrepancy by assumption.

## Historical implementation outline for the rejected proposal

The exact implementation is delegated, subject to tests: adapter-owned declarations, scoped
rule identity and lifecycle, no unexpected global grants, bounded polling or a verified stream,
and persistent denial events without inventing tool attribution. Validate proxy-ignoring
clients, allowed HTTPS behavior, raw TCP/UDP and nested Docker before claiming enforcement.
Do not enable boxes until image preservation, runtime/login/host-matrix validation, disclosure,
Machine UI and the other existing activation gates are satisfied. No provider turn or credential
operation ran in this read-only decision preparation.
