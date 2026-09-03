Type: grilling
Status: open
Blocked by: 01

# Defining an Agent by talking to it

## Question

Creation asks for name, runtime and model, opens the DM, and the rest is defined in the chat:
first through a card (ticket 06), then in words. The Agent may rewrite its own **identity**
(role, standing instructions, purpose, anchor if asked) and never its runtime, model, trust or
compaction. Decided while charting. What is the mechanism, and where are its edges?

Decide, with the author:

- **The tool.** One loopback tool beside `message_agent`, `propose_routine` and `record_entry`.
  Name it (`define_self`? `update_identity`?) and fix its arguments: which fields, whole-value
  restatement (ADR-0002's rule for an edit) or a patch. Recommendation: restatement, one call
  per turn, the same discipline as `propose_routine`.
- **When it takes effect.** The Persona is composed at session start and standing instructions
  are last in it. A rewrite mid-session cannot reach the running session's system prompt. Does
  it take effect at the next session (said inline, like trust), or does the adapter re-send the
  Persona as prompt text on the next turn? Recommendation: next session, said in the card, with
  the fx/Cursor persona-on-the-prompt adapters taking it immediately as a side effect that is
  not promised.
- **Disclosure and reversal.** Every write opens a card in the turn that made it, in
  `Compaction`'s collapsed shape, showing old and new. Reversal is from the definition (the
  Agent's own screen or the card): does reverting restore the previous text or the one before
  the Agent ever wrote? Recommendation: the previous text, one step.
- **The anchor by talking.** "Ancla me a ~/Work/vlue-backend" is a filesystem path handed to an
  Agent. The Agent may *ask*; blobot inspects and the person confirms in a card, because a path
  the Agent chose is a folder the Agent picked to read. Confirm.
- **Purpose.** The closed set (generalist, a project, code and repositories, research,
  day-to-day operations): what each one does to the anchor (nothing / pick a folder / pick a
  repository or make one / generalist folder / generalist folder) and the one sentence each
  puts at the head of the Persona. Draft the five sentences.
- **What ADR-0002 now says.** An edit restated the whole definition and only a person made one.
  Amend: the Agent makes some, in a bounded set, disclosed.
- **Runtimes.** Five adapters, one tool over the loopback server. Codex asks about every MCP
  call and blobot answers its own tool's permission itself; confirm that covers this tool.

The answer is the tool's contract, the card's content, and the ADR-0002 amendment.

## From ticket 01, 2026-09-03

ADR-0002 already carries a 2026-09-03 amendment: **a person may rename an Agent** (slugs make it
free), and **the runtime never changes**. Decide here whether the *name* is among what an Agent
may say about itself; 01 left it out of the bounded set (role, standing instructions, purpose,
anchor if asked). The purpose-to-anchor rule is fixed: *a project* and *code and repositories*
choose a folder, the other three get a made anchor; the five opening sentences are still yours.

## From ticket 02, 2026-09-03

Re-anchoring's mechanics are fixed there (fresh AgentWorkspaces per Member, Sessions start over,
Handbook kept, old workspaces removed or left and named). What is yours: whether an Agent may ask
to move its anchor at all beyond the confirm-in-a-card rule, and what it is told about the cost
(every Session of its restarts).
