# Where the boundary goes — accepted policy and validation

2026-09-05. **Guillermo accepted the three rules with “ok” after they were restated in full.**
The product policy and failure-timing follow-up are accepted, implemented and validated.
Owner: [Where the boundary goes](issues/04-where-the-boundary-goes.md).
The image ticket needs the box inner-fence answer; disclosure and trust need the same policy.

The repository at `65ec602` still keeps Cursor's inner sandbox on, asserts Codex's bridge
mode and sends no explicit Claude sandbox options. Machine placement and approval posture
are different concepts in the existing domain. A box is the accepted microVM boundary,
including its approved host worktree/shared-Git mounts. The runtime can read its own login
inside it. Nothing in this round changes those accepted decisions.

## Accepted choices

1. **Local: use native protections, and say their limits.** Enable Claude's available inner
   protection, preserve Codex/Cursor's existing local behavior, and preserve all already accepted
   settings scopes and project skills. OpenCode/fx have no equivalent inner sandbox. Explain
   the difference as a runtime capability, without promising a common local boundary. Refuse
   a protected operation when its required protection cannot run, with the native failure timing
   accepted in the follow-up below. Keep the external
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

## Facts evaluated for activation

- Research07 established the Claude delivery route. Research42 measures scalar precedence,
  merged project arrays and the startup limitation; research44 measures the protected Bash
  rejection with the actual helper. The ticket's Answer records the distinction between a
  successful session and a failed protected command.
- Retained project arrays can widen or bypass native protection. Project scope is preserved;
  no managed system settings are authored.
- Claude's explicit box `enabled:false` overrides ordinary project/local true in the measured
  cascade. Cursor's config is independently selectable but ACP does not establish the native
  fence its interactive command has. Codex's coupled mode is retained. Full box activation
  still waits on its separate implementation gates.
- The outer wrapper has different mailbox/loopback and sign-in facts on macOS/Linux. Deferral
  is a scope/cost choice, not a claim that a microVM provides its credential masking.
- Full-state migration is still open and remains separately guarded. These product answers do
  not certify preservation, egress, sign-in or a real provider turn inside a box.

The alternatives above remain the history of the proposal, not additional selected options.
The author accepted native local protections with disclosed differences and preserved project
settings, the microVM as the common box boundary with only independently optional inner
protections disabled, and separate placement/approval controls. This does not authorize
changing approval posture to turn off an inseparable runtime fence. The external srt wrapper
remains deferred. The accepted architecture and failure-timing amendment are recorded in
ADR-0006. The ticket's Answer links the completed implementation and validation.

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

**The focused follow-up asked one product question.** Accept the
native Claude contract in which missing dependencies can refuse startup and backend failure
can instead refuse a protected Bash invocation, while the session and non-shell tools may
remain usable? Or retain the strict session-admission requirement, keeping activation withheld
until an integration can establish it? Preserved project exclusions remain exceptions under
either native-policy discussion.

**Accepted by Guillermo with “ok” after checkpoint `d9da267`.** The native contract may reject
detected missing dependencies at startup and a backend failure at the protected Bash invocation;
the session and non-shell tools may remain usable. This amends the earlier strict failure-timing
requirement without changing approval posture or the three accepted architecture rules.
Validate the actual failure path before activation. The policy omits `allowLocalBinding`:
in-process MCP needs no exemption, so this change does not widen access to arbitrary local
services. The research fixture's broader setting was a measurement input, not selected policy.
