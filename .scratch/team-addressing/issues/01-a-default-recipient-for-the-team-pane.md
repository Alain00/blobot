Type: task
Status: resolved

# A default recipient for the team pane

## Problem

Talking to a team means naming a member first. In the team pane send is disabled until an
`@mention` resolves; in an agent pane the recipient is implicit and a mention overrides it.
The author's ask is to say something to a team without deciding who it is for.

This half needs no coordinator, no model and no new agent. It is the agent pane's rule applied
to the team pane with a designated **lead** as the implicit recipient, and `@bob` overriding it
exactly as it does today. Last valid mention wins, unchanged.

## This reopens ticket 12

`.scratch/first-demo/issues/12-team-and-conversation-ui.md`, *The recipient is an `@mention`,
not a picker*, decided the opposite: **in the team pane there is no implicit recipient**.

Its reason was honesty, not ergonomics. A `to Alice ▾` picker quietly implied a broadcast
surface that ticket 05 does not have. That reason survives and constrains the fix rather than
blocking it: a default recipient is only acceptable if the composer names and draws the agent
it resolved to, the way the send button already carries a blobatar. A team pane that looks like
it is talking to *the team* is the dishonest surface ticket 12 removed, and would be a second
reopen rather than a fix.

Ticket 12 carries a `## Reopened` note pointing here.

## What to settle

- **Who is the lead.** A flag on one membership, chosen at team creation and changeable on the
  rail row where the roster is already edited. What happens when that agent is deleted from the
  roster, and whether a team may have none, in which case the pane behaves as it does today.
- **Whether the lead is the same concept as issue 02's coordinator**, or deliberately smaller.
  The recommendation in this effort is that they are the same role at two levels of ambition,
  and that shipping this one first buys the ergonomic without committing to the rest.
- **Whether an agent pane changes at all.** It should not.

## Not in this issue

Routing. The lead receives the message as themselves. Nothing forwards it.

## Done when

A team can be selected and typed at without an `@`, the composer says who it resolved to, and
`@bob` still re-points the message mid-sentence.

## Answer

**A team has a lead, and the team pane writes to it when the user names nobody.** Built
2026-08-30. Nothing routes: the lead receives the message as itself, in one session, exactly as
`@lead` would have delivered it.

### Who the lead is

`teams.lead_agent_id` — an **agent id**, not a profile id, because leading is a fact about a
membership. The same agent leads one team and not another, so it cannot live on the agent's own
definition, and ADR-0002's rule that an edit restates the definition would otherwise drag the
designation across every team at once.

It is **nullable, and NULL is a behaviour rather than a missing value**: the pane goes back to
what ticket 12 specified, send disabled until a mention resolves. Three ways to be there, and
all three are honest:

- A team formed before this column existed. The migration adds it NULL, so nothing changes for
  a team the user already had until they say who leads.
- The lead was taken off the roster. It is **not** repaired by promoting whoever is left.
- A caller that named nobody, which is only reachable from tests.

**The default recipient is only ever somebody the user watched themselves choose.** That rule
decides every case above, and it is what keeps this from being the dishonest surface ticket 12
removed: a lead nobody was shown is a quiet default, which is the thing that ticket was about.

Chosen where the roster is chosen, on both screens that decide one — `LeadPicker` under *Who
joins* in the creation flow and under the ticks in the roster dialog, drawn as the chosen
agents' faces with one marked. On creation the first agent ticked is marked, and the mark is on
screen before the team exists, so the default is seen rather than assumed. In the roster dialog
naming a lead **counts as a change on its own**, because a team that has never had one is the
ordinary reason to open it.

### What the composer does

`implicit` in the team pane is the lead, where it was `undefined`. Everything else is unchanged:
last valid mention wins, `findAgentByName` still resolves, and an agent pane is untouched.

The reopen's price is paid in the composer saying who: the placeholder reads `Message Alice. @ to
say who else` before a key is pressed, and the send control carries the resolved name afterwards,
so the answer survives the placeholder disappearing. (The face that was on that button went with
the blobatar-economy pass landing alongside this; the name is what the reopen asked for and the
name is what is there.)

### The other two questions

- **Is the lead issue 02's coordinator?** Same role at two levels of ambition, and this is the
  smaller one, shipped without committing to the larger. Nothing here reads the lead in the
  orchestrator, the persona or the envelope — it is addressing and nothing else, so if 02 says
  no, there is nothing to unbuild.
- **Does an agent pane change?** No.

### Covered

`team-store.test.ts` — the first agent leads, the flow's choice is honoured, the sitting lead
survives a roster change, a named lead resolves to this team's membership, and a lead taken off
the roster leaves the team with none. `Composer.test.tsx` — the pane names and sends to the lead,
a mention re-points it mid-sentence, no lead keeps send shut until a mention resolves, and an
agent pane is as it was.

Seen on screen: the demo team's pane addressing Alice, and the creation flow's lead picker with a
roster ticked.

## Found on first contact, 2026-08-30

A team with no lead was left silent. `hermes-agent` predates the column, so it has none — the
decided behaviour — but typing into its team pane gave a disabled arrow and no reason for it: the
placeholder that says *Start with @ to say who* is gone by the second keystroke, and the rest was
in a tooltip.

The composer now carries `say who with @ · or give this team a lead` while the field has words
and no recipient, suppressed while the mention menu is up. It names both exits and promotes
nobody into the job, which is the rule this ticket turns on.
