Type: grilling
Status: resolved

# What a thread is, and how it is told apart from a one-member team

## Question

Every other ticket here needs one word for the object behind an agent row. It is internally a
Team, it must never present as one, and the store has to be able to tell it from an ordinary Team
that happens to have one member.

`IndividualTeam.tsx` today **infers** it: `members.length === 1 && members[0].profileId ===
agent.id`. That inference is about to become load-bearing for the rail's contents, and it is
wrong in both directions. A user who makes a real team called *scratch* with Alice alone on it
would find it vanish from the list and reappear as part of Alice's row. A thread whose agent is
later joined by a second member would silently become a team.

Decide:

- **The mark.** An explicit column on `teams` (a flag, or the profile id it is a thread for),
  against the current inference. If explicit, what it is called, whether it is nullable, and what
  the migration does with the individual Teams Machines' `18` has already created in the field.
- **The invariant.** Whether a thread may gain a second member at all. If it may, it stops being
  a thread and starts being a team, and the rail's list changes under the user. If it may not,
  the roster editor has to refuse it and say why.
- **The word.** `CONTEXT.md` needs the term. *Thread* is used throughout this map; the domain
  already has Team, Agent, AgentProfile, AgentWorkspace, Handbook, Routine and Machine, and this
  is the first object that is one of them wearing a different face. Whether it earns a glossary
  entry of its own or is defined as *a Team with one member and no team surface* is part of the
  answer.
- **One thread per agent, or several.** `IndividualTeam` today offers a **choice** of individual
  Teams, plural. A rail row is singular. If several may exist, the row has to pick one; if one
  may exist, that dialog's reason for existing goes.

The permanent rules bind: nothing here gives an AgentProfile state of its own.

## Answer

A **thread** is a Team carrying a `thread_for` value. Decided with the author, 2026-09-06.

**The mark is a nullable `thread_for` column on `teams`, holding the AgentProfile id, `UNIQUE`.**
Not a boolean, which would need a second column to say whose, and not the
`members.length === 1 && members[0].profileId === agent.id` inference that
`IndividualTeam.tsx:16` and `individualTeamOf` (`team-store.ts:416`) each invented separately.
A value rather than a shape, so three answers fall out of one constraint: a thread is told apart
from a one-member team without looking at its roster, *one thread per agent* is enforced by the
database instead of by every caller, and the audience recheck becomes a lookup.

**One thread per agent**, which is what `UNIQUE` buys. `IndividualTeam.tsx` exists to choose among
several individual teams and that reason goes with this: the row is the person, and *which of your
four conversations with Alice* is a question nobody messaging a colleague has to answer. What
several threads would buy — separate folders for separate work with the same agent — is what a
Team is. The dialog's fate is `05`'s.

**A thread never gains a second member.** One member for the life of the row: the roster editor
never opens on one, and the store refuses. The alternative, a thread that becomes an ordinary team
when somebody joins, is a live object changing kind under the user, and it would owe an answer to
what fills the agent's row afterwards — which cannot be empty, because every hired agent has one.

**The migration backfills nothing.** `thread_for` is NULL for every existing row, so individual
teams already created through Machines' `talk` stay ordinary **teams**, visible in the list where
the user left them, with their icon, their folder and their name. Nothing recorded intent when
they were made, so a backfill is a guess, and the cost of guessing wrong is a team that appears to
have vanished. Threads are only ever created after this.

**`CONTEXT.md` gets an entry for *Thread*** — *the Team behind an agent's own conversation: one
member, no team surface.* It earns one because five other tickets refer to it, and because the
failure it prevents is the one already in the codebase: two files inventing the same predicate
independently. *Thread* is unclaimed here; *conversation* is not, being what the transcript is
called everywhere.

Two things this does not decide, recorded so they are not read into it: the thread's Team still
carries a `lead_agent_id` pointing at its one member, because routing an unaddressed prompt needs
one, and suppressing everything the word *lead* implies is `02`'s work, not the schema's. And the
Team's `name` is the agent's, disambiguated in the store when a real team holds it, because the
name is never drawn and the branch — `blobot/alice/alice` — is the one place the string surfaces.
