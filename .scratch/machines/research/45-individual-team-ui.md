# Individual-Team entry: prototype and renderer validation

2026-09-06, Guillermo's Mac. Implements
[Where a profile is addressed from, on screen](../issues/18-the-profile-conversation-on-screen.md)
after acceptance of ordinary, visible individual Teams. No separate profile session exists.

## Two arrangements

Preserved source: branch `prototype/machines-individual-team`, commit `6e36df4`, based on
`27f6cfc`. Its `IndividualTeamPrototype.tsx` compares an inline expansion and a Radix dialog
using the app's real styles and synthetic roster. The production implementation is separate.

- Inline: `/private/tmp/blobot-individual-prototype-inline.png`.
- Dialog: `/private/tmp/blobot-individual-prototype-dialog.png`.

The dialog was chosen under the author's delegation of routine design details. It avoids
changing the roster's height, accommodates Team names and makes the choice about one profile.
The author accepted the behavior after explanation; no explicit A/B preference is attributed
to them. Profile row clicks still edit, while `talk` is always visible. Existing hover/focus
behavior for edit and retire is retained.

## Implementation checks

Component tests cover exact profile identity, exclusion of group/legacy/other-profile Teams,
explicit selection, inline refusal/retry, empty-state creation and Escape/focus restoration.
Creation tests cover the selected lead, disclosed folder and retired/missing-profile refusal
before workspace preparation. Main's membership guard was validated in `27f6cfc`.

- Desktop suite: **621 passed / 1 skipped**; typecheck and build pass.
- Core overview: **11 passed**; core typecheck/build pass. Only introductory punctuation changed
  in core here, removing an em dash from prompt copy to follow DESIGN.md. The preceding full
  core run was **971 passed / 46 skipped**.
- `git diff --check` passes.
- Logs: `/private/tmp/blobot-individual-ui-desktop-tests.log` and
  `/private/tmp/blobot-individual-ui-build.log`.

## Built renderer in Electron

From `apps/desktop`, after the normal renderer build:

```sh
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron ../../.scratch/machines/research/45-individual-team-ui-fixture.cjs
```

[Fixture](45-individual-team-ui-fixture.cjs) and [synthetic preload](45-individual-team-ui-preload.cjs)
load the actual built renderer in an isolated temporary Electron user-data directory. They
open Your agents, open the chooser, inspect its narrow layout, start the normal creation form,
verify no mutation occurred, cancel, then select the named Team. The only recorded operation
is `selectIndividualTeam` with `mara-profile` and `solo`; `results.json` reports `passed: true`.

Final output directory:
`/var/folders/_w/scx5nsn90499n4jspcb5lrb00000gn/T/blobot-individual-ui-1guwqG`.
It contains `agents.png`, `chooser.png`, `chooser-narrow.png`, `new-team.png`, `continued.png`
and `results.json`. Run log: `/private/tmp/blobot-individual-ui-fixture.log`.
Equivalent screenshots from the successful prior fixture run were visually inspected at
`/private/tmp/blobot-individual-ui-check.bUEWSO`: labels fit, the narrow chooser does not
overflow horizontally, creation discloses the folder, and selection opens the Agent pane.

This is renderer integration evidence with a synthetic API. It runs no real main-process IPC,
provider inference, CLI login or host workspace creation. The creation submit is tested by the
component suite, not pressed in this visual fixture. No claim about box readiness follows.
