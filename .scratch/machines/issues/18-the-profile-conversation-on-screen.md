Type: prototype
Status: open
Blocked by: 07

# Where a profile is addressed from, on screen

## Question

Split from `12`, where `12` says the split falls: between the two items under *What to make*.
This ticket is the **profile conversation**; `12` keeps the **Machine**, whose screenshots one
*Blocked by* line was making wait on the DM.

*Your agents* is a screen over the working surface, and nothing on it starts anything; a
conversation with an AgentProfile would be the first thing there that does. The naive move is the
team pane, and `12`'s reason against it stands: `WORKSPACE`, the roster, `@mention`, `handbook`
and the fan-out cost line are each false or empty there. **A pane whose furniture is mostly
absent lies by arrangement.** Draw what is true, in the two arrangements worth comparing:

- **a pane on the agents screen**, the conversation where the profile already is;
- **a dialog from the agent's own row** — the shape the Handbook took when a panel under the
  composer could not hold it (DESIGN.md, *Briefed*): a dialog and not a screen, because *your
  agents* is a **place** about every profile and a Handbook is one agent's. Whether that holds
  for a transcript is the thing to see at full size.

Rough and cheap, on the mock, judged by `--screenshot=<path>`.

## What must come out of it

1. Two screenshots, one per arrangement, drawing only the furniture `07` gives a DM: its verbs,
   its transcript, whether it has a mailbox. If `07` answers with a **probe** — one turn, not
   persisted — or a **team of one**, this ticket draws that instead and says so.
2. Where `07`'s four costs land, if the object exists: an unread mark (the rail's is earned by
   origin; this is no rail row), a permission request with nobody listening (*cancelled,
   never allowed*), the context gauge, the compaction line. Places only; the words are `07`'s
   and `09`'s.
3. A stance, put to the author, on which arrangement is honest. ADR-0001 is the prior: a profile
   is a definition, and nothing drawn here may claim a workspace or a branch, which are an
   Agent's. First-demo ticket 14's asymmetry rule is not a reason for the two to look alike;
   `12` §5 said so of kinds.

No new voice and no new status word: `waiting` covers a blocked agent, and the Routines firing,
refused a fourth voice, draws in the user's voice under a `system` line.

## Not this ticket

The Machine on screen, every place `12` names, is `12`, whole. What a DM'd agent may do and what
its transcript is (`07`); the home and `map.md` (`06`);
every word (`09`). No Machine kind is named here: where a DM executes is `07`'s, and the word is
`12`'s to place.

## Corrections, 2026-09-05 (consistency pass)

The DM's own words — *produces no branch and no pull request*, and what its transcript is — are
`07`'s, not `09`'s; `09` holds a Machine's sentences only, and only if `07` puts the DM on a kind.
And *the home on screen* was in a loop, `06` → `12` → `06`, that this ticket inherited: it is
refused back to `06` by name — if `06` says a home exists at all, `06` owns its screen question or
hands it here in words.

## Amendment, 2026-09-06 — accepted individual-Team entry point

The author accepted the visible one-member Team described in
[What an agent addressed outside a team may do, and what its transcript is](07-what-a-dmd-agent-may-do.md).
This ticket draws that outcome, as its first acceptance criterion explicitly allows, rather
than a separate profile transcript. Add an entry from the profile row, let the user choose an
existing individual Team or start the current creation flow with that profile preselected,
and open the ordinary Agent/Team working surface. Its existing unread/permission/context/
compaction surfaces are the honest furniture for this choice. The Agent is allowed ordinary
tools/files/commits under its configured Machine; no conversation-only guarantee is added.
