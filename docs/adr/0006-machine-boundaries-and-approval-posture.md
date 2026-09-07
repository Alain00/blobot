# Machine boundaries and approval posture are separate

An Agent's Machine says where it executes and what it can reach; its approval posture says
when the runtime asks the operator before acting. Guillermo accepted separate controls on
2026-09-05: choosing a box never silently grants broader approvals. Local execution uses
available native runtime protections, retaining project settings and disclosing differences
rather than promising a common local fence. A required native protection must refuse the
protected operation when it cannot run. The native integration may detect the failure during
startup or when that operation is attempted; an open session does not certify its sandbox.

For a box, the microVM is the common boundary. Disable an optional inner sandbox only when
the adapter can do so without changing approval posture; retain inseparable runtime behavior.
This avoids conflicting restrictions while preserving the operator's approval choice. The
external local wrapper is deferred. Detailed policy and measured limits belong to
[Where the boundary goes](../../.scratch/machines/issues/04-where-the-boundary-goes.md);
the decision alone does not prove effective enforcement, complete state preservation or box
readiness.

The original acceptance required every initialization failure to refuse session startup.
Conditional validation found that the current Claude integration cannot establish that
condition. Guillermo explicitly accepted the native failure timing in the follow-up after
checkpoint `d9da267`: a protected shell command may fail while the session and non-shell tools
remain usable. This does not remove inherited project exceptions or extend protection to
those other tools. Cursor's ACP sandbox setting likewise does not establish native containment;
the ticket records the evidence and the UI states these differences.

## Internet access amendment, 2026-09-06

Guillermo explicitly chose Internet access without an additional blobot destination allowlist:
“acceso a internet sin limitar por ahora mas alla que lo que cada harness ya limita por sus
propios medios”. This replaces the earlier host-proxy domain-list decision. The Agent may use
external APIs, sites and development downloads without a blobot hostname editor or permission
to widen the list. Native runtime behavior and approval posture remain their existing controls;
this does not silently grant tools broader approvals or undo the accepted inner-fence policy.

After a synthetic sbx probe showed that its open policy also reaches host-loopback services,
Guillermo accepted host/local-network reach: “si pero el agente tendria los mismos permisos
que te deja tener si lo corres en tu maquina ni mas ni menos”. Opening the network does not
change the selected approval posture, grant tools new approvals or imply service authorization.
Host credentials, SSH forwarding and additional host mounts remain excluded; the mailbox still
requires its per-Agent bearer. Its port is no longer isolated by a destination policy.
The guest has its own OS, files and login, so this is approval-policy continuity, not a claim
that all effective capabilities are identical to execution on the host. The already accepted
optional inner-fence policy remains separate. Engine protocol limitations and operator/organization
network policy must be disclosed rather than described as restrictions imposed by the harness.
No destination-filtering, credential-containment or lossless proxy-denial guarantee follows from
this choice. Implementation and measurements belong to
[Egress from a box](../../.scratch/machines/issues/15-egress-from-a-box.md).
