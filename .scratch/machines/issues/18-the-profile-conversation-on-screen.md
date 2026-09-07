Type: prototype
Status: resolved
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

## Answer

Resolved 2026-09-06. The accepted individual-Team behavior is implemented as a visible `talk`
action on each profile row. Its dialog names only that exact profile's active one-member Teams;
the user chooses a history explicitly or starts ordinary Team creation with the profile and a
suggested name preselected. The folder is disclosed before creation. A missing/retired profile
cannot prepare a workspace, and opening rechecks membership in main through the preceding
behavior ticket's guard. A refusal stays in the dialog; Escape returns focus to the action and
leaves Your agents open. Selecting a Team opens its ordinary working surface.

Compared an inline expansion and a dialog on the throwaway branch
`prototype/machines-individual-team`, commit `6e36df4`. The dialog keeps the roster stable and
gives Team names room. This layout is a routine design choice under the author's standing
delegation; the author accepted the individual-Team behavior, not a separate vote between
these prototypes. No profile transcript was added. Unread, permission requests, context and
compaction use the existing Team/Agent surfaces, including cancellation when nobody listens.

[Prototype and renderer validation](../research/45-individual-team-ui.md) records both
arrangements, the chosen implementation, screenshots and the synthetic Electron fixture.
Desktop: **621 passed / 1 skipped**, typecheck and build pass. The core overview's introductory
punctuation was aligned with DESIGN.md; its 11 tests, typecheck and build pass. Core's previous
full run remains 971 passed / 46 skipped. The real built renderer's create/cancel/select
interactions and narrow layout pass with a synthetic API; this does not certify provider turns
or box activation. The Machine screen and full-state preservation remain with their tickets.

## Superseded, 2026-09-06

**The chooser dialog is removed. `talk` stays and does what an agent's rail row does.**

This ticket's dialog exists to pick among several individual Teams for one profile, and
`.scratch/rail/issues/01` made that question impossible to ask: an agent has **one** thread, and
the `UNIQUE` `thread_for` column is what enforces it rather than any call site. So there is
nothing to choose between, and one behaviour behind two doors — the rail row and `talk` — replaces
two mechanisms.

What survives is this ticket's entry point and its guard. The recheck is still there, as
`threadOf(store, profileId)`, and it is now a lookup on a stored value rather than the
`members.length === 1 && members[0].profileId === agent.id` inference two files had each invented
separately — a predicate wrong in both directions, since a real team of one vanished into a
person's row and a thread somebody joined silently became a team.

What is reversed is the visibility. This ticket made an individual Team a **visible** Team with an
ordinary working surface; a thread is the one Team the user never sees as one, hidden from the
rail's team rows, the navigator, the roster editor and the team pane. The Teams already created
through this flow are **not backfilled**: nothing recorded intent when they were made, so they stay
ordinary teams where the user left them.

Do not read the Answer above as current on the dialog, on choosing among several, or on a
one-member Team presenting as a Team. `.scratch/rail/` is where those are decided now.
