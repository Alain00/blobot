# Machine boundaries and approval posture are separate

An Agent's Machine says where it executes and what it can reach; its approval posture says
when the runtime asks the operator before acting. Guillermo accepted separate controls on
2026-09-05: choosing a box never silently grants broader approvals. Local execution uses
available native runtime protections, retaining project settings and disclosing differences
rather than promising a common local fence; a protection explicitly required by blobot must
fail startup if it cannot initialize.

For a box, the microVM is the common boundary. Disable an optional inner sandbox only when
the adapter can do so without changing approval posture; retain inseparable runtime behavior.
This avoids conflicting restrictions while preserving the operator's approval choice. The
external local wrapper is deferred. Detailed policy and measured limits belong to
[Where the boundary goes](../../.scratch/machines/issues/04-where-the-boundary-goes.md);
the decision alone does not prove effective enforcement, complete state preservation or box
readiness.

Conditional validation subsequently found that the current Claude integration cannot certify
native backend initialization at session admission. Its new native policy remains inactive
pending the author's decision about failure timing. Cursor's ACP sandbox setting likewise
does not establish effective native containment. These are implementation limits under this
decision, not exceptions silently weakening its required-startup rule; the ticket records them.
