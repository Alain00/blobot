Type: research
Status: resolved
Blocked by: 19, 08

# Docker Engine and sbx: isolation, network access and product constraints

## Question

What security and product guarantees would blobot retain, lose or have to implement when
using vanilla Docker Engine instead of Docker Sandboxes through `sbx`? Evaluate both fairly
against the current requirements, not a generic claim that containers and microVMs are equivalent.

## Session boundary

**Next session only.** Use the research skill then; no research dispatch on ticket creation.
Gather facts and alternatives for the author's later grill. Existing engine, trust boundaries
and plan remain binding until that decision. This is not authorization to lower isolation.

## Investigate

- Threat boundary: malicious repository content/tools, Agent compromise, root inside a Machine,
  host access and sibling-Agent access. Compare shared kernels, per-Agent microVMs, rootless
  execution, namespaces/capabilities, syscall/security profiles and residual attack surface.
- Agent-run Docker/build tools. What is feasible without exposing the **host engine socket**,
  host signing agent, credentials, broad host paths or another Agent's volumes? Distinguish
  privileged nesting, rootless nesting and remote-build approaches, their costs and limitations.
- Egress: deny-by-default, domain/IP rules, DNS, redirects, raw TCP/UDP, proxies and bypasses.
  What is built in, what requires a broker or extra service, and what can actually be verified
  before work? Include the authenticated host-loopback mailbox and ephemeral-port lifecycle.
- Per-Agent CLI login/session persistence versus engine-managed OAuth. Keep host credentials
  unmounted and the PTY stream opaque; do not count a shared proxy login as proven per-Agent
  isolation. Account for browser callbacks/device codes and vendor/runtime differences.
- Installation, local/offline behavior, required accounts, updates, architecture/OS support,
  stable versus prerelease APIs, licensing/distribution and the macOS VM host dependency.
  Distinguish Engine's terms from those of any desktop distribution. Use current official terms;
  flag legal uncertainty rather than presenting an inferred distribution right as established.
- The simple product flow: install app → create Agent → use it; automatic sensible defaults,
  existing-Machine resource controls, truthful power/readiness, setup/remedy doors and failure
  recovery. Which visible friction disappears, which moves elsewhere, and which remains?
- Consequences for the existing microVM and highest-trust assumptions, isolation admission,
  Workspace/skills mounts and future Machine kinds. Name decisions that would need reopening.

## Evidence and completion

Produce a linked research artifact with a threat/capability matrix, primary-source citations,
versions and explicit **documented / observed / inferred / unverified** distinctions. Explain
advantages, disadvantages and compensating controls with their operational and performance
costs. Do not equate a CLI's small adapter with the full cost of its engine or enforcement.

Safe synthetic probes may validate a claim only within available local environments. No real
credentials, user-data mounts, external publication, shared-daemon changes, installation or
unrelated-work interruption without the appropriate explicit authorization. Do not attempt
escape/exploit testing against the user's host. Unknown guarantees stay unknown.

End with the trade-offs Guillermo must decide and evidence that would disqualify each route.
Do not resolve the engine choice here or modify downstream implementation tickets.

## Starting context

- `CLAUDE.md`, `CONTEXT.md`, relevant ADRs, and the [Machines map](../map.md).
- [Current implementation](../build.md) and [Eve source review](../research/15-eve-docker-sandbox-lifecycle.md).
- Existing box, Workspace, trust, egress and first-box measurement tickets, reached by the map's
  ownership index; read their actual decisions before calling a difference acceptable.

## Answer — 2026-09-05

[Isolation, network and product findings](../research/17-engine-isolation-egress-and-product.md)
resolve the factual comparison with a threat/capability matrix and primary sources. Ordinary
Engine containers, including rootless ones, do not retain the selected per-Agent kernel.
Private nested Docker and mandatory selective egress add operational work; native Linux
also needs a designed route to the loopback-only mailbox. Container hardening is useful,
not equivalent to a microVM or an implemented replacement architecture.

The artifact distinguishes documented capabilities from prior Mac observations and unverified
guarantees, including full bypass resistance, custom-kit OAuth, offline renewal and binary
redistribution. It names compensating controls, disqualifiers and decisions needing reopening.
No new live security test, engine mutation, credential handling or implementation occurred.
These findings resolve research, **not acceptance of a weaker boundary or selection of an
engine**. Guillermo's reevaluation still waits for the lifecycle/resource investigation.
