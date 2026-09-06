Type: grilling
Status: resolved
Blocked by: 01

# Where a thread is hidden, and the one seam where the fiction breaks

## Question

A thread is a Team everywhere in the store and nowhere on screen, so every surface that lists
Teams has to be asked which side it is on. Agreed in principle in the grilling: **hidden where it
would duplicate the agent, visible where the thing being administered is genuinely the machine
and the disk.** This ticket walks the actual list.

Hidden, on the grounds that the agent's own row already stands for it: the rail, the teams list
behind the navigator, the roster editor (*who is on it*), the team pane.

Visible, on the grounds that lying to it strands bytes: **Settings → Machines**, which lists
sandboxes by team and member and is where a person goes looking for storage; the delete flow's
pricing, which is the only place `recovers about 3.1 GB` is ever said.

What that needs decided:

- **What Settings calls it.** It cannot say the team's name, because the name is an artifact of
  `01` and nobody has seen it. It has to name the agent, and then say enough that a person can
  tell this row from that agent's seat on a real team, which may sit directly above it.
- **The navigator.** `⌘K` finds teams and agents today. An agent found there should open its
  thread; a thread found as a team should not be findable at all.
- **Whether *your agents* keeps `talk`.** The rail is now the way to a thread. A second door from
  the agents screen is either a convenience or a second thing to keep true.
- **What happens to the `IndividualTeam` dialog**, which exists to choose among several
  individual Teams. Downstream of `01`'s answer on one-versus-several.
- **The count.** Any place that says *how many teams you have* now has two numbers and must pick
  one deliberately.

## Answer

Decided with the author, 2026-09-06. Hidden everywhere it would duplicate the agent, and the seam
this ticket was written to find turned out not to exist.

**Settings → Machines does not show threads.** The charting note said the fiction had to break
there because lying to it would strand gigabytes. That argument was about boxes, and a thread
always runs local: no sandbox, no private home, no volume, no engine. Its only disk is a worktree
under `~/blobot`, which is a folder the user can see. Listing threads would add one row per hired
agent to a screen about sandboxes, every one of them with nothing to administer.

**The Routines screen names the agent alone.** A Routine is `<team>/<agent>` and that screen
prints the team; `routine-rows.ts:98` walks `listTeams()`, so a thread's Routine would print
`01`'s invented string. A thread's Routine reads `alice`, a seat's reads `alice · api`. Absence is
the distinction, and it needs no new vocabulary — a label for the one case that does not need one
is worse than nothing.

**Hidden, because the agent's row already stands for it:** the rail, the navigator's teams list,
the roster editor, the team pane.

**`talk` stays and the `IndividualTeam` dialog goes.** That dialog exists to choose among several
individual teams, which `01` made impossible. `talk` does exactly what the rail row does — selects
the thread, closes the screen — so Machines' `18` keeps its entry point instead of being reversed,
and there is one behaviour behind two doors rather than two mechanisms. **Machines' ticket `18` is
superseded on this point** and should not be read as current.

**The navigator's agents list is every hired agent, opening their thread.** Not every seat: Alice
on four teams appearing four times is the sixteen-row list this whole redesign refused, and worse
in a search result, where rows have no grouping to tell them apart. A member of a team is still
found by finding the team.
