Type: grilling
Status: open
Blocked by: 01

# What lives in an agent's home, and what map.md may say

## Question

Raised by the author, 2026-09-04: *"inside the agents home there could be a map.md that teach
the individual profile that he has more projects."*

The proposal is good and it is the wayfinder pattern this repo already trusts: an index read to
judge relevance, then zoom only into what the task touches. A profile that knows *she is on three
teams, one is a Rust service, one is a folder of documents, she leads on the third* is **compact
context**, which is the permanent rule, rather than the full copy the rule forbids.

**But a map is a document blobot writes into a place an agent can read, and this repo has
refused that shape twice** — ticket 14 refused a settings file in an AgentWorkspace because a
file left in a checkout can be committed home, and ADR-0004 refused handing an agent a
`resource_link` to a path because `Read`, `Glob` and `Grep` never prompt, so a path handed to an
agent is an ungated read. A `map.md` that names `/home/alain/work/acme-api` is that second
refusal, authored by blobot, in blobot's own file.

## What to decide

1. **Names or paths.** The obvious rule is that a map carries names and never paths, and it
   should be tested rather than adopted: an agent told about a project it cannot locate may go
   looking, and a coding agent that goes looking is `Glob` across a home directory. Establish
   whether a name is safe on its own, or whether the safety has to come from the Machine (`04`)
   rather than from the wording.
2. **What else the map may carry.** Team names, roles, who the teammates are, what the Workspace
   is *about*. Almost certainly not: transcripts, Handbook entries, diffs, or anything from
   another team's turn — that is the leak the team grain exists to prevent, and it is the one
   thing that must not follow from a profile-grain home.
3. **Who writes it and when.** Composed fresh from the live status fold, like `composeLeadBrief`,
   or a file maintained on the disk? The first is honest by construction and has no staleness;
   the second is what the author proposed and is what survives if the home is where the agent
   executes, because a file is readable and a composed prompt is not.
4. **What else lives there.** Standing instructions currently live in a SQLite column and are
   authored alone in a text field. Handoffs are archived to `~/.local/share/blobot/handoffs/`,
   which is nobody's home in particular. Both are candidates and neither has to move.
5. **Whether an agent may write to its own home.** `record_entry` writes a Handbook, disclosed
   inline, bounded, provisional. A home an agent can write to freely is the *"rewriting its own
   persona off screen"* refusal in a new location, and the narrowing that ticket 10 of
   `handbooks` allowed (withdraw your own `noticed` entry, never a `told` one) is the shape any
   yes here should take.

## The precedent that decides most of it

`composeLeadBrief` is this exact problem solved once already, one grain down: what a lead knows
about its teammates is **composed fresh every turn because it *is* the live status fold**, it
replaces the roster line rather than doubling it, and it never enters the `messages` row. If
`map.md` can be that, it inherits an argument that has already been made and tested. If it must
be a file, say why, because the difference is whether staleness is possible at all.
