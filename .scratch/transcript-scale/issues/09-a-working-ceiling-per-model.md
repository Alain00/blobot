Type: task
Status: resolved

# A working ceiling, per model

## Problem

The gauge divides by the wrong number, and so would any threshold built on it.

`Feed.tsx:248` is `used / size`, where `size` is whatever the runtime advertised. Claude on
Opus 5 reports `{used: 36785, size: 1000000}`, so the block draws **3%**. If an agent's answers
start degrading somewhere around 300k, that agent is already an eighth of the way into the part
of the window that is actually usable, and the screen is saying it has barely started.

The advertised window answers one question honestly: *when does the turn hard-stop*. That is
ticket 04's ending, and 04 draws it. It does not answer the question the user actually feels,
which is *when does this agent start getting worse* — and that is the question ticket 10 has to
trigger on. A single fraction of `size` cannot serve both: "compact at 75%" fires at 750k on
Opus 5 and at 150k on a 200k OpenCode model. One of those is roughly right and the other is long
past the point where the trigger was worth having.

Raised by the author 2026-08-30: *"each runtime/agent has his own max tokens and are not the
ones specified."*

## What to do

Give blobot its own word for the usable ceiling, distinct from the size the runtime claims.

**Shape it like `core/trust.ts`.** blobot names the concept, each adapter translates from its own
end, and nothing in the renderer can tell which runtime is behind the number. The figure itself
is provider knowledge, so by the permanent rule it lives in the adapter — not in core, and never
in a component.

**Key it on the model, not the runtime.** Opus 5 at 1M and whatever OpenCode is pointed at do not
share a ceiling, and the user already picks the model per agent, so it is on `runtimeOptions` and
the adapter has it at hand.

**It has to fail soft for a model we have never heard of.** A hardcoded table of per-model
degradation points ages on every release, which is exactly the hazard ADR-0003 fought when it
refused to build the palette from a vendor's release cadence. So: a measured entry where we have
one, and a conservative fraction of the reported `size` as the fallback otherwise. An unknown
model gets a cautious ceiling rather than no ceiling, and the fallback is the common path, not
the exception.

**Do not swap the denominator on the gauge.** `used/size` is what the runtime actually said and it
stays true and stays drawn. Overwriting 1M with 300k means asserting on screen a number the
runtime never sent, and it reads as nonsense the moment an agent goes past it and the block shows
over 100%. Draw the ceiling as a **mark** instead, with the pair of real numbers beside it: two
facts, both honest. Past the mark it says so in words rather than in an impossible percentage.
`DESIGN.md` governs the mark — monochrome, no red bar, and no em dashes in the string.

## The number needs a provenance

300k is a reasonable figure and it is also a claim. This repo's habit is to measure against the
real thing and keep the transcript (`.scratch/first-demo/research/`, the live OpenCode and Codex
runs), and whoever revisits this table in six months cannot tell whether it has aged unless the
entry records what it was measured against and when. Every entry carries its source. An entry
nobody measured does not go in the table; it takes the fraction fallback like any other unknown
model, which is the point of having one.

## Not to do

**The gauge still does not advise.** Ticket 05's rule survives this ticket unchanged: no warning,
no nag, no remedy offered from the block. The mark is a fact about the model, drawn next to a
fact about the agent. It is not a suggestion to compact. What 05's amendment frees is the
*trigger* in ticket 10, and that is a separate surface with its own consent.

## Done when

- Typecheck, tests and build pass.
- The ceiling is resolved in the adapter and reaches the renderer as one blobot-shaped value, with
  no `runtime_id` anywhere near the component.
- A test proves an unknown model takes the fraction fallback rather than the advertised window.
- A component test reads the block back for two agents whose models have different ceilings, and
  for one agent that is past its mark.
- Every table entry has a dated source beside it.

## Answer

Done, 2026-08-30. The gauge divides by what is usable and names it.

**The split that made it work.** The ticket asked for the number to live in the adapter and the
renderer to stay provider-agnostic, and the way those two hold together is that the *lookup* and
the *arithmetic* are different jobs. `ceilingFor` in `runtime-for.ts` — beside the one place a
`runtime_id` already becomes a class — asks the right adapter what anybody has established for a
model and gets back a plain token count or `undefined`. `workingCeiling` in
`core/context-ceiling.ts` turns that into a ceiling against whatever window the runtime went on
to report. Only the first knows a provider exists; only the second knows a window was reported;
neither has to know both.

So the number reaches the pane on `UiAgent.contextCeiling`, resolved once at team start where
the record is in hand, and `Feed.tsx` does the arithmetic itself. No `usage_updated` payload
changed, no reducer changed, and the live path and the restored path go through one function.

**It fails soft, and the cap is the part that matters.** A bare fraction fails *open* exactly
where advertised and usable diverge hardest: 60% of a million is 600,000, twice the point the one
model anybody has looked at was reported to degrade at. So the fallback is
`min(size × 0.6, 200_000, size)`, and there is a test asserting an unmeasured million comes back
under the fraction rather than at it.

**The table has one entry.** `CLAUDE_CEILINGS = { opus: 300_000 }`, and its provenance line says
what it is: *reported by the author, not measured against a transcript*, which is weaker than the
rest of this repo's observations and is written down as weaker. OpenCode's and Codex's tables are
empty, which is the honest state — OpenCode is a front end onto somebody else's model, and the
Codex adapter advertises no model group for blobot to pass through. A test asserts the Claude
table's shape, so adding an entry without a source is a test to argue with rather than a diff to
miss. The lookup is exact: `opus-5-turbo` does not match `opus`, because a table that guesses is
a table making claims nobody checked.

**On screen, the denominator moved and the raw pair did not.** `37k/1m · 12% · of 300k`. The
window stays because it is what the runtime said and because two agents on one team can be five
times apart; the percent is of the ceiling because that is the figure a reader acts on; the
ceiling is named because a hidden denominator is worse than the wrong one. Past it the row reads
`past 120k` in words rather than a percentage over a hundred. `DESIGN.md`'s activity-column entry
carries the amendment.

**Measured on screen**, `--demo` on mock runtimes, which name no model and therefore take the
fallback like nearly every real agent: `Alice 4k/200k 3% of 120k`. It read `2%` before, against
the advertised 200k.

**Ticket 05's rule survived intact.** No warning, no colour, no bar, and nothing on the block
suggests compacting. What 05's amendment freed is ticket 10's trigger, which is a different
surface with its own consent.

**A note for whoever builds 10.** The threshold it fires on is `WorkingCeiling.tokens`, and it
should read `measured` beside it rather than only the number. Firing an automatic session
restart off a *guess* about a model nobody looked at is a much stronger claim than drawing that
guess on a gauge, and the two decisions deserve different confidence. The flag is carried through
for exactly this and is drawn nowhere yet.
