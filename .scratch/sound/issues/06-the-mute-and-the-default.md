Type: task
Status: resolved
Blocked by: 04, 05

# Where the mute lives, what the default is, and what a first run hears

## Problem

Velvet UI's one non-negotiable: *sound is always opt-in. Mute is visible, persistent, remembered.*

blobot has to answer three things that principle leaves open. Where does the switch live. What
does a person hear before they have found it. And is *opt-in* the right reading for a desktop app
somebody deliberately installed, or is it a web convention that does not transfer.

## Answer

**Resolved 2026-08-31. Settings gains its third section. Interaction and notifications both
default on, stated and not consented to.**

### Where

The **Settings** door at the foot of the rail, which already holds ticket 11's four runtime states
and their remedies. It shipped with one section on the argument that *a sidebar with one true item
is more honest than four invented ones*, and already has two: **Runtimes** and **Context**. Sound
is a genuine third, so that argument is satisfied rather than contradicted. The section count grew
because there was something true to put in it, which is the sentence the screen was written under
and the one it enforces: *a section gets added here when there is something true to configure,
never to fill the column out.*

Three switches, per ticket 04: the master, **interaction**, **notifications**.

Nothing else. No level slider — the level is ticket 03's decision and asking the user to set it is
blobot asking them to do design work. No voice picker, for the same reason. No per-event list.

### The default is on, and the reason is the notification's own argument

Considered defaulting notifications off, on ticket 01's own grounds: that rule protects the user's
right not to be reachable, and switching it on for them takes that without asking.

**Refused, and the counter-argument is on the record.** The one notification that ships reports the
one state where *silence itself loses work*: an agent stopped on a permission request, on a team
you are not looking at, whose request with nobody listening is **cancelled, never allowed**. A
default of off means the failure this sound exists to prevent is the default experience, and the
user only discovers the fix after they have already paid for it once. That is a worse trade than
one unexpected sound.

Interaction defaults on for the ordinary reason: it cannot interrupt, and a feature nobody
discovers is a feature nobody has.

### Stated, never consented to

No modal, no first-run prompt, no *would you like sounds?* The precedent is exact: ticket 14's
permission disclosure **closes the creation flow, stated rather than consented to**, and a consent
dialog for something one click reverses is theatre that trains people to dismiss dialogs.

One line under the section head, in the register the rest of the app uses:

> blobot plays a short sound when you commit an action, and one when an agent is waiting on you
> from a team you are not looking at. Nothing else makes a sound.

That sentence is also the complete specification, which is the test of whether the vocabulary is
small enough.

### Persistence

`localStorage` in the renderer, not the SQLite store. Ticket 04 settled that this is user
preference on this machine rather than domain state, and the store is for things a team owns.
Losing it on a profile reset is the correct failure: it comes back at the default, which is on,
and one click fixes it.
