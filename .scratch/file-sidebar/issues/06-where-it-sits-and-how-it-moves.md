Type: grilling
Status: resolved

# Where it sits, how it moves, and what the flanks rule says afterwards

## Question

The surface decisions, and the rule they contradict if nobody writes them down.

**The flanks rule.** `DESIGN.md`: *the flank is recessed*, amended **2026-09-05** with *"there was
a second flank and there is one now"*, because the activity column came off that morning and the
premise of the original argument (dressing one side of a *three*-column window reads as an
accident) went with it. This sidebar restores the third column. *Already decided* 3 says it
survives on the merits; what is open is the **wording of the amendment**, which must state why
this flank is not the one that was removed, and it must be written into `DESIGN.md` rather than
left on this map. Per `CLAUDE.md`, adding to `DESIGN.md` is ordinary work and contradicting it is
a reopen — this is the former only if the sentence is actually written.

**The toggle.** The details popover hangs off one glyph in the chrome above the transcript,
*"where the activity column's own toggle stood"*. This needs a control too, and the two must not
read as one thing or as a row of accumulating switches. Where does it go, and is it a press like
the popover's?

**The drag.** *Already decided* 7 fixes closed-by-default, one global remembered width, a floor
around 220px, a ceiling at half the window and a snap-shut below the floor. Open: what the handle
is (a hairline that widens on hover, a gutter, nothing visible at all), whether the transcript's
900px measure re-centres continuously during a drag or settles once, and what happens when the
window is too narrow to hold both — the transcript has a measure it is entitled to, and a rail on
the other side.

**The motion.** Opening and closing is a width transition and lands in one of `DESIGN.md`'s two
budgets; the two-in-the-air cap applies. A drag is direct manipulation and should not be animated
at all, which is a distinction worth stating rather than discovering.

## Answer

Resolved 2026-09-05. One measurement reopened a decision the map had already made in charting.

### The arithmetic, first

`.vA` is `grid-template-columns: 232px minmax(0,1fr)` and the transcript's `.col` is
`max-width:900px`. On a 1440px screen:

| | |
|---|---|
| rail | 232 |
| sidebar at 320 | 320 |
| left for the transcript | **888** — already under its measure |
| sidebar at the 220 floor | leaves 988, which clears |

**`Already decided` 7's "ceiling at half the window" is wrong** and is corrected here: at 1440 it
would leave the transcript 488px. The sidebar and the measure are in direct competition on a
laptop, which charting did not notice.

### The transcript keeps its measure; the sidebar gives

**The ceiling is `window − rail − 900`, not half the window.** The floor of 220 wins when even
that is impossible, and the transcript centres in what is left below that. The transcript is the
surface the app is *for*; the sidebar is chrome, and `DESIGN.md` treats the 900px measure as a
property rather than a preference.

A width below which the sidebar **refuses to open and says so** is named as the fallback for
genuinely small windows and is not built now: a narrow panel is better than an absent one, and
nobody has met the case.

### The flanks amendment: in both places, and with the test in it

`DESIGN.md`'s *the flank is recessed* was amended on 2026-09-05 with *"there was a second flank
and there is one now"*, which is a note about the activity column's removal. This restores a third
column, so that sentence needs a successor.

**The rule's own text takes the count and the test.** The distinction is one line: *the activity
column drew what the transcript was already drawing; this draws what the transcript cannot.* That
is the test a future flank has to pass — **is this the only rendering of this fact?** — and a rule
amended without it stated is a rule that will admit the next flank on the strength of this one.

**The sidebar's own `DESIGN.md` entry carries the rest**, beside the details-panel entry, which is
where this kind of reasoning already lives.

### The toggle is a second glyph, beside the details one

`.paneltoggle` sits in the chrome above the transcript, *"exactly where the column's own toggle
stood"*. The sidebar's goes beside it.

Rejected: **no visible toggle**, a keyboard shortcut and the drag handle only. It hides a whole
panel behind a gesture nobody discovers.

Rejected: **the panel's own edge as the control**, so the handle is always present and clicking it
opens what is closed. An invisible strip at the window's edge is a hit target found by accident.

**Two glyphs is not a row of switches; a third would be.** That is the standing limit for this
chrome, which has been pruned twice.

### Motion: the open animates, the drag does not

- **Open and close** run on the interaction budget — one run, around 200ms, `--ease-out`, in flow.
- **A drag animates nothing** and tracks the pointer exactly. *An animated drag is a panel that
  lags your hand, which reads as the app being slow rather than as motion.* Stated in the entry
  rather than left to be rediscovered.
- **The snap shut below the floor** is the one animated part of a drag, because it is the app
  acting rather than the hand.
- **The transcript re-centres continuously with the drag**, not on release. Easing the measure
  while the pointer is moving is two things easing against each other.

### Unchanged from charting

Closed by default. One global remembered width, not per team. Floor 220. Drag below the floor
snaps shut.
