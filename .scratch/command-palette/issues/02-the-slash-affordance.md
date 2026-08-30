Type: prototype
Status: resolved
Blocked by: 01 (resolved), 03 (resolved)

# The slash affordance in the composer

## Question

`@` in the composer resolves a recipient (`Composer.tsx:47`). What should `/` do?

The mechanism is nearly free — the suggestion list already exists, and sending is literal text
insertion, because a slash command is just a prompt starting with `/`. So this ticket is not
about whether it can be built. It is about what the control becomes when a second prefix moves
into the one input the whole app funnels through.

## What to settle

**Whose commands, and when there is no answer.** Commands are per session: each agent has its
own workspace and its own inherited settings, so two agents on a team can advertise different
lists. In an agent's pane the answer is implicit. In the team pane there is no answer until a
mention resolves — which is the precondition send already has (`Composer.tsx:56`), so `/` and
`@` would share it. That symmetry looks right and should be checked rather than assumed: it
means typing `/` before naming anyone shows nothing, and the reason has to be legible.

**The empty state.** Issue 01 establishes that a session which has not held a turn may know no
commands at all. Say so plainly. Do not prime it with a throwaway prompt to make the menu look
populated — that spends a real turn of the user's tokens on a decoration.

**Whether the transcript draws it.** A sent command lands in `messages` with a body of `/foo`,
and the pane renders bodies as markdown. Whether "you ran a command" is a distinct thing to see,
or just text the user typed, is a voice question. `DESIGN.md` has three voices and this is not
obviously a fourth.

**Argument hints.** The wire carries an optional `input.hint`. Whether the menu shows it, and
whether selecting a command with a hint leaves the cursor somewhere useful, is the difference
between an affordance and a list.

## Constraints

- Read `DESIGN.md` first. The suggestion list has an existing form and this must be the same
  control, not a second one that happens to sit in the same place.
- Monochrome. A command is not an agent and must not be the second saturated thing on screen.
- No provider branching anywhere in the component. The list arrives from the runtime already
  normalized; the composer must not be able to tell what produced it.
- No em dashes in anything the user reads.

## Blocked, deliberately

By 01 for the data, and by **03 for what the list is allowed to contain**. Building the menu
before the filter is decided means building it against 48 of the author's personal skills and
discovering the shape is wrong.

## What 01 and 03 changed about this ticket, 2026-08-29

Both blockers are resolved, and between them they moved most of this ticket's weight elsewhere.

**The list is already curated.** `AgentRuntime.availableCommands` returns the workspace's own
`.claude/` commands plus five vouched built-ins, filtered inside the adapter. Measured live it
is **five entries, 1.9 KB**, down from the 223 this ticket was afraid of. So the questions that
assumed a long list — whether a search box is needed, whether 48 personal entries wreck the one
control the app funnels through — do not arise. Do not add a search box; there is nothing to
search.

**The component is not this effort's to build.** Another session is integrating cmdk into the
`@` suggestion list, and the same control serves `/`. That is the right shape: this ticket
always said it must be the same control rather than a second one in the same place.

**Still open, and still this ticket's:**

- **Whose commands, in the team pane.** Unchanged, and now sharper: commands are per session and
  ADR-0003 means two agents on a team genuinely can differ, because they can hold different
  workspaces. The symmetry with `@` — no recipient, no menu — still looks right and still wants
  checking rather than assuming.
- **The empty state.** Now more likely, not less. A workspace with no `.claude/` and a provider
  advertising none of the five vouched built-ins offers nothing at all, and that is a correct
  outcome rather than a failure. Say so plainly. Issue 01's rule stands: never prime it with a
  throwaway prompt to make the menu look populated.
- **Whether the transcript draws a command differently.** Untouched by either blocker. Still a
  voice question, still `DESIGN.md`'s.
- **Argument hints.** `hint` survives normalization and reaches the component. Whether selecting
  a command with one leaves the cursor somewhere useful is unchanged and unanswered.

One thing this ticket should no longer say: that a user's own skills are what the menu contains.
ADR-0003 decided they are not loaded at all, and the creation flow's disclosure is where the
user is told.

## Answer

Built, 2026-08-29, against a real `claude` and in demo mode.

**The transport.** Commands reach the renderer the way statuses do, and by the same route: the
orchestrator exposes `commandsOf(agentId)` and `onCommandsChange`, main relays them on
`blobot:commands` leading with the team id, and `UiSnapshot.commands` seeds a pane that was
rebuilt. Per agent, never per team, because each agent has its own session. The snapshot reads
them fresh rather than remembering them: a team that was evicted and resumed re-advertises, and
a menu kept across that would describe a session that no longer exists.

**Whose commands.** The resolved recipient's, which is the symmetry this ticket asked to check
rather than assume. It holds: in an agent's pane the recipient is implicit, and in the team pane
there is nothing to show until a mention resolves, which is the precondition send already has.

**The trigger is position, not the character.** A slash command is only a slash command at the
very start of the message, because that is what the CLI parses. This is the one place `/` cannot
copy `@`: `src/auth.ts` and `and/or` are not somebody reaching for a menu. A space ends it,
because what follows is the argument.

**Two empty states, said plainly**, and one non-empty state that is neither. No recipient yet
says so and names `@` as the fix. A session that offers none says so with the agent's name. A
typo like `/revieww` is *not* an empty state: it closes the menu, exactly as `@zz` does, because
otherwise every mistyped command would claim Enter and refuse to send. Nothing is ever primed
with a throwaway prompt to make the menu look populated.

**A note takes no keys.** Enter must keep sending while one is showing, because anything blobot
leaves off the list still works when typed. A message beginning with `/` is a message.

**Hints are shown**, in mono beside the name, and accepting a command leaves `/name ` with the
cursor after the space, which is where the argument goes.

**The decision is `commandMenu` in `model.ts`**, pure and tested there, because every
interesting question is a decision rather than a rendering. The component renders it.

**The transcript does not draw a command differently.** It is text the user typed, and the
existing user voice already says so. Nothing here argues for a fourth voice.

**One thing worth keeping.** The first render put the description in the row unconstrained, and
because a skill's description is whatever its author wrote — often several sentences — one row
became a paragraph and the menu became the screen. Every row is now exactly one line: the name
and hint keep their width because they are what the user is choosing between, and the
description ellipsizes, because it is there to tell two names apart rather than to be read.
