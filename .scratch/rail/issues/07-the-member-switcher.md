Type: prototype
Status: resolved

# The member switcher the roster leaves behind

## Question

Removing the nested roster removes the one deliberate door into a member's pane. What is left is
the faces in the transcript, the file panel's empty-state chooser, `⌘K` and `@mention` — three of
which are incidental, and *is this the only rendering of this fact* is the test the file sidebar
wrote into `DESIGN.md`.

Agreed: the team pane gets one deliberate switcher, faces on the tray. Draw it.

- **Where.** The tray already carries `handbook · 4` and the workspace line; the file panel's
  head is the face and the name, and pressing it is the way back to the team. A row of faces in
  the team pane is the mirror of that, and the two must not disagree.
- **What a face says at rest**, and whether it carries status. The rail's agent rows were the one
  surface wearing status on the face as well as the body, and that surface is going.
- **The selected member**, when a member's pane is open. The switcher has to still be reachable
  from inside the pane it switched to, or it is one-way.
- **A team of one that is not a thread**, which `01` may allow.
- **How this behaves beside the file panel's own chooser**, which already picks a member and
  already draws faces with no line over them.

Prototype and screenshot, the same way `03` does. The two prototypes should be looked at together
before either is built, because between them they decide how many places in this app draw a row
of faces.

## Answer

**Nothing is built.** The author, on the two placements below: *"None, that already exists in the
right sidebar."*

The file panel already is the deliberate door this ticket was written to add. In a team pane its
empty state **is** the chooser — the members' faces with no line over them, and clicking one is
the same act as its rail row was — and its head is that agent's face and name, which presses back
to the team. So the door is two-way already, and it was built to the same requirement this ticket
restated: *is this the only rendering of this fact?*

Both placements were drawn before that was settled, in [prototype-pane.html](../prototype-pane.html),
captured in [prototype-pane.png](../prototype-pane.png): **A** named face chips in the tray under
the composer, **B** a bare strip at the head of the transcript, **C** A again from inside a
member's pane with the current member selected. Kept because the drawing is what made the answer
obvious: A is a second row of faces forty pixels from a panel whose whole head is a face, and the
app would have had two controls doing one job — which is the duplicate `DESIGN.md`'s transcript
column has now refused three times.

One residual, recorded rather than argued: the file panel can be closed, and with it the door.
The remaining routes are the transcript's own faces, `⌘K` and `@mention`. If that turns out to
bite, it is a fresh ticket about the panel's persistence and not about a switcher.
