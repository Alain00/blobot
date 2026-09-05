Type: grilling
Status: resolved
Blocked by: 20, 21

# Reevaluate the first Machine engine with the measured trade-offs

## Question

After both comparison research tickets are resolved, is it worth changing blobot's first
Machine engine to vanilla Docker Engine, or should we continue with `sbx`? Decide with
Guillermo through **grill-with-docs**, not by substituting the agent's preferences for his.

## Session boundary and method

This is a **later-session HITL decision**, not work for the session creating it. Read both
research artifacts and the current implementation first; use `grill-with-docs` with its
grilling and domain-modeling skills. Ask only choices whose factual prerequisites are settled.
If evidence is insufficient, name the missing fact and obtain it safely rather than asking
the author to guess or declaring a winner from the Eve comparison alone.

## Decision to resolve

- Compare both candidates against the author's requirements: own Machine per Agent, preserved
  data, editable maximum CPU/RAM rather than reservations, warning before interrupting work,
  simple settings, low overhead, idle sleep, message wake and truthful visual state.
- Make any isolation/egress/root/inner-Docker/login difference explicit. A simpler persistence
  mechanism does not silently authorize changing the microVM boundary or trust promises.
- Weigh native capabilities, the surrounding code and operational burden, remaining work,
  retained reusable implementation, migration/recovery risk and platform/distribution friction.
  Sunk implementation effort alone is not a reason to keep an engine or discard it.
- Choose **continue sbx** or **change engine**, with conditions and reasons approved by Guillermo.
  If neither can be accepted yet, record the precise unresolved branch instead of a false close.

## Completion and authorized plan changes

Record the author's answers and explicit final decision. Only **after** that decision may
this ticket update the remaining map and dependent tickets: reaffirm the route, or reopen the
affected decisions and define the migration/validation/rollback order. Keep still-valid work.
Use an ADR only if the domain-modeling criteria warrant one; amend the glossary only if a
domain meaning changes. The research tickets themselves authorize none of these plan changes.

No implementation of an engine switch in this ticket without an explicit additional request.
Link the decision from the map and hand off the newly agreed next work.

## Starting context

- [Current completion/activation boundaries](../build.md), implementation commit `5d2edd9`.
- [Lifecycle, persistence and resource research](20-engine-lifecycle-persistence-and-costs.md).
- [Isolation, network and product research](21-engine-isolation-egress-and-product.md).

## Comments

### 2026-09-05 — research complete; human reevaluation opened

Both prerequisites are resolved, including the authorized bounded Mac fixtures. The findings
are on the research tickets; minimal shell timings are not full-Agent or equal-isolation
benchmarks. No engine decision has been made and no downstream plan has been rewritten.

**First live question, awaiting Guillermo:** must each Agent retain `sudo` and the ability to
run its own Docker/Compose workloads inside its Machine? Recommendation: keep that capability
for general-purpose development Agents; removing it would narrow which projects they can run.
This is an explicit reevaluation of the workload assumptions, not a claim that a shell-only
Engine fixture already implements the promised Machine.

The answer determines the next comparison: a hardened container for a narrower workload,
or the costs and boundary of a private nested Docker environment. Then decide whether a
shared Linux kernel is acceptable, settle any necessary deployment conditions, and obtain
the author's final engine choice. Do not record an answer or migrate on the author's behalf.

## Answer

### 2026-09-05 — author confirms continuing with sbx

After the comparison and recommendation, Guillermo explicitly asked to close the research and
reevaluation tickets, resume implementation where it stopped, and confirmed that **each Agent
may use sudo and run its own Docker and Compose inside its Machine**. This answers the pending
workload question and approves **continue Docker Sandboxes through sbx**, not a switch to vanilla
Docker Engine. The research pair is already resolved; this closes the human decision too.

The trade-off accepted is a general-purpose development Machine with a per-Agent microVM and
private Docker, rather than narrowing the workload to obtain Engine's simpler container
lifecycle. Engine's native limit updates and volume reuse remain real advantages; reproducing
the current isolation and egress boundary around private nested Docker would require additional
work. The reasoning and measured costs remain in the two linked research artifacts, not here.
Existing implementation effort alone is not the reason to retain sbx.

The current Machine, credential, host-access and egress boundaries remain binding. Guest sudo
is a capability, not permission to use host sudo, expose the host Docker socket, or silently
change runtime approval modes. Passwordless guest sudo and a private Docker/Compose environment
are requirements for the image ticket; the Agent process still starts as UID 1000.

This choice does not certify the remaining product implementation. In particular, production
distribution/pinning and real CLI login remain subject to their existing validation gates.
The lifecycle research's persistence inventory must be applied to the image: the two currently
copied trees do not establish preservation of packages installed elsewhere or inner-Docker
state. Resolve those concrete guarantees before claiming replacement preserves the whole
Machine. No additional host mounts, credentials, or migration are authorized by this decision.

Resume the box implementation with **Where a Workspace lives when the Machine is not this one**,
then the image and other activation dependencies in the map. The independent local inner-fence
decision remains open and is not a reason to delay the box spine. Preserve existing staged
lifecycle/detection work and activation guards. Any genuinely unanswered choice encountered
during implementation goes to the author through grill-with-docs.

The author then deferred that implementation to the next session and requested commit/handoff.
No new implementation ticket was claimed and no production code changed in this closure.
No new ADR or glossary change is needed: this reaffirms the existing engine and Machine meaning.
