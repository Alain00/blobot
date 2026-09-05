# Where the boundary goes — accepted policy, implementation in progress

2026-09-05. **Guillermo accepted the three rules with “ok” after they were restated in full.**
The product policy is accepted; conditional validation and implementation are still in progress.
Owner: [Where the boundary goes](issues/04-where-the-boundary-goes.md).
The image ticket needs the box inner-fence answer; disclosure and trust need the same policy.

The repository at `65ec602` still keeps Cursor's inner sandbox on, asserts Codex's bridge
mode and sends no explicit Claude sandbox options. Machine placement and approval posture
are different concepts in the existing domain. A box is the accepted microVM boundary,
including its approved host worktree/shared-Git mounts. The runtime can read its own login
inside it. Nothing in this round changes those accepted decisions.

## Accepted choices

1. **Local: use native protections, and say their limits.** Enable Claude's available inner
   protection, keep Codex/Cursor's existing protections, and preserve all already accepted
   settings scopes and project skills. OpenCode/fx have no equivalent inner sandbox. Explain
   the difference as a runtime capability, without promising a common local boundary. Refuse
   startup if a protection explicitly required by blobot cannot initialize. Keep the external
   srt wrapper as measured knowledge for a later effort; do not ship it in this implementation.
   Alternative: preserve current local behavior without adding Claude's protection, or ask
   for the external wrapper now with the additional platform/sign-in/mailbox validation.

2. **Box: make the microVM the common boundary.** Disable optional inner sandboxes where the
   adapter can do so independently of approval posture, retaining unavoidable runtime behavior.
   Do not change when a runtime asks for approval as a side effect. Alternative: keep each
   available inner sandbox enabled as additional protection inside the box, accepting the
   compatibility and differing-reach consequences. Both choices require actual validation;
   a bridge mode name alone does not establish the effective fence.

3. **Separate controls.** One choice says where the Agent runs (`local`/`box`), another says
   how often it asks for permission. Moving to a box does not silently relax approvals.
   The already-decided restriction of the future highest trust level to box is a dependency,
   not a combined scale. Alternative: request a unified control, explicitly reopening the
   dependent trust/interface assumptions rather than silently conflating them.

## Facts and remaining measurements

- The main ticket separates observations from documentation. Research07 measured that
  `_meta.claudeCode.options.sandbox` reaches Claude and that the SDK fails if an explicitly
  enabled sandbox is unavailable. It did not measure every settings-precedence combination.
- Retained project settings may widen array-valued sandbox rules according to the documented
  merge. If the native-local proposal is accepted, verify the actual pinned runtime and record
  the result. Dropping project scope or authoring managed system settings is not proposed.
- For box, explicit `enabled:false` precedence against project settings and runtime-specific
  behavior must be verified before activation. Keep approval posture independent; no automatic
  approval or broader trust level is introduced by the choice.
- The outer wrapper has different mailbox/loopback and sign-in facts on macOS/Linux. Deferral
  is a scope/cost choice, not a claim that a microVM provides its credential masking.
- Full-state migration is still open and remains separately guarded. These product answers do
  not certify preservation, egress, sign-in or a real provider turn inside a box.

The alternatives above remain the history of the proposal, not additional selected options.
The author accepted native local protections with disclosed differences and preserved project
settings, the microVM as the common box boundary with only independently optional inner
protections disabled, and separate placement/approval controls. This does not authorize
changing approval posture to turn off an inseparable runtime fence. The external srt wrapper
remains deferred. The accepted architecture is recorded in ADR-0006. Resolve the ticket only
after its factual conditions and implementation requirements have been met.

## Follow-up: native initialization failure

Research after the author's acceptance found two facts that supersede the earlier assumptions:

- [Claude, pinned CLI and SDK](research/42-claude-native-sandbox-policy.md): settings precedence
  and preserved project arrays are measured. However, a deliberately failed native backend
  still permits `initialize`/`get_settings` and exit0 with `failIfUnavailable:true`. Normal
  protocol/stderr do not expose this failure. The embedded code retries initialization when
  wrapping Bash and throws if it remains unavailable; that later tool failure was read, not
  executed by a model turn. Missing-dependency startup refusal and backend initialization are
  different conditions. No documented session-status check was found.
- [Cursor, pinned ACP path](research/43-cursor-codex-inner-sandbox.md): enabled and disabled
  sandbox config both produce `insecure_none` in ACP's actual permission provider. The
  interactive command's native sandbox/preflight does not establish ACP containment. Local
  behavior is preserved and the UI no longer implies a verified native fence. Codex's current
  coupled mode stays unchanged.

**One product decision is pending, not the three already accepted rules again.** Accept the
native Claude contract in which missing dependencies can refuse startup and backend failure
can instead refuse a protected Bash invocation, while the session and non-shell tools may
remain usable? Or retain the strict session-admission requirement, keeping activation withheld
until an integration can establish it? Preserved project exclusions remain exceptions under
either native-policy discussion.

Recommendation: accept the native contract with explicit disclosure, then validate its actual
failure path before activation. This changes the accepted failure timing, not approval posture.
No answer is inferred. The prepared `claudeSandboxFor` helper is NOT connected to session/new
or session/load. It omits `allowLocalBinding`: in-process MCP needs no exemption, so this change
does not widen access to arbitrary local services. The research fixture's broader setting was
a measurement input, not the selected production policy.
