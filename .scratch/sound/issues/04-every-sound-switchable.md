Type: task
Status: resolved
Blocked by: 02

# Every sound is switchable, and what the surface actually shows

## Problem

The author, having heard the set: *"i like all the sounds, but make them in a way we can quick
toggle them later."*

That reframes the effort. The question stops being *which of these do we build* and becomes *which
are on by default*, which is a much better question and a much cheaper one to be wrong about. But
it opens a trap: a settings screen with thirteen checkboxes is not a feature, it is an unanswered
design question handed to the user.

blobot has already refused that shape once. Settings ships **one section, because a sidebar with
one true item is more honest than four invented ones.**

## Answer

**Resolved 2026-08-31. Thirteen switches persist, three switches ship.**

### The state is one flat map

```
{ send: true, allow: true, allowAlways: true, reject: true, arm: true, disarm: true,
  remove: true, purge: true, waiting: true, waitingPatient: false, handoff: true,
  hover: false, key: false, popover: false }
```

Event id to boolean. No nesting, no versioning, no shape beyond this.

**It is not keyed by team or by agent, and that is a decision.** A workspace, a session, a mailbox,
a Handbook and a Routine are all per `<team>/<agent>` for the same reason each time: they are what
a turn needs and no Team can lend them. Sound is none of those things. It is a property of **this
machine and this person**, the way the window size is, and keying it finer would invent a grain the
domain does not have.

Consequence: it does not belong in the SQLite store beside teams and agents. It is user preference,
not domain state.

### Three switches ship, and one master

- **Sound on / off**, the master.
- **Interaction** — one switch over the eight committed acts.
- **Notifications** — one switch over `waiting` and `handoff`.

Per-event switches exist in the prototype because tuning needs them. They do not ship, on the
`bounds.ts` principle: blobot states its own ceilings in words the user can hold, and *interaction*
and *notifications* are two words a person can decide between. Thirteen is a list nobody reads.

The flat map persists underneath regardless, so exposing more later is a UI change and not a
migration. That is the whole reason for the shape.

### Navigational sound is off, not absent

Once everything has a switch, *refused* stops being available as an answer, and pretending
otherwise would be dishonest about what the code contains. `hover`, `key` and `popover` are built,
off by default, and **not exposed** by the three shipped switches. They live in the prototype so
the argument in ticket 02 can be heard rather than asserted.

If they are ever exposed, that is a reopen of ticket 02 and needs the density strip run again.

### Defaults

Everything armed except `waitingPatient`, which is an alternative to `waiting` rather than an
addition, and the three navigational ones.

Whether the **master** defaults on or off is ticket 06 and is a genuinely different question: this
ticket decides what is armed once sound is on at all.

### The prototype's affordance, for reference

A switch in its own cell at the left of each row; the rest of the row auditions the sound whether
armed or not, because auditioning something you have turned off is exactly what tuning requires.
Group switches in each section head, presets in the top bar, state printed at the foot as the JSON
it would persist.
