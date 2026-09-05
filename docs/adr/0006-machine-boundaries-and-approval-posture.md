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
