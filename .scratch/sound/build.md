# Sound: build status and session handoff

**The map is complete and the code is written.** Ten tickets, all resolved, frontier empty. Read
`map.md`'s *Decisions so far* to judge relevance, then zoom into only the tickets your task
touches. Decisions are binding: if one is wrong, reopen its ticket and say so on it rather than
quietly contradicting it.

## What is built

- **`apps/desktop/src/renderer/src/sound/`**, four files, per ticket 09.
  - `voice.ts` — the one voice, ticket 03: triangle plus third harmonic, a 20ms highpassed noise
    transient, lowpass at 8.2kHz, 85ms decay, level 0.32. Synthesized per play with per-note
    jitter, so no two are identical. Knows nothing about blobot.
  - `vocabulary.ts` — ticket 02's twelve events as data. One pentatonic set, the fifth up for yes
    and the same fifth down for no, a whispered repeat for a standing rule. **No runtime id
    appears in this file and none may.**
  - `player.ts` — the lazily created `AudioContext`, the enabled map, its persistence, ticket 08's
    two second app-wide debounce on `waiting`, and every refusal. Guarded end to end: no output
    device is not an error.
  - `useSound.ts` — `SoundProvider`, `usePlaySound`, `useSoundSettings`.
- **Settings gains a third section**, ticket 06: master, interaction, notifications, with the one
  stated line and no level slider and no voice picker.
- **The seam**, ticket 09: `waiting` and `handoff` subscribed in `App.tsx` off channels that
  already carry every team; interaction sounds called at the committed act and nowhere else.
- **`DESIGN.md` amended**, ticket 05. The Routines bullet keeps its sentence and gains a pointer;
  the new rule sits with the motion budgets.

## What was decided while building that no ticket covers

- **The compaction handoff rides `onEvent`, not a channel of its own.** There is no
  `onCompaction`: `context_compacted` arrives on the generic event stream, which the renderer
  already subscribes to for every team. So `handoff` needed no new plumbing, and it is the one
  notification with **no focus test**, unlike `waiting`. It reports rather than requests, so
  *never for what is already on screen* has nothing to protect there.
- **Turning a group on plays its own example; turning one off is silent.** In `useSoundSettings`,
  because a switch whose effect you can only hear by going and finding the act that triggers it is
  a switch you set blind. Silence is what off asked for, so off says nothing.
- **The disabled group rows are dimmed rather than removed** while the master is off. A row that
  vanishes takes the fact that the choice exists with it.
- **`--screen=settings:sound` was added** beside `settings:context`, so the section is reviewable
  by screenshot. The screenshot itself is silent, which is ticket 10 working: the same run that
  captures the switches makes none of the sounds they are about.
- **Settings' own doc comment said "Two sections".** Updated to three. It is the file that states
  the rule about not inventing sections, so a stale count there is the rule contradicting itself.

## Known gaps

- **Nothing has been heard in the real app by a person other than through the prototype.** The
  vocabulary was tuned in `prototype.html` against a simulated session, not against a real team
  doing real work. The number most likely to be wrong is ticket 08's two second debounce, which
  was reasoned from the longest sound's tail rather than measured against real `waiting` traffic.
- **`handoff` is the weakest member of the set** and ticket 02 says so on its own comments. It
  reports rather than requests, which is the hardest kind of notification to justify. If one sound
  comes back out, it is this one.
- **`waitingPatient` ships unarmed.** It is the alternative to `waiting` for someone who works
  across a room, and nothing in the app exposes it, because ticket 06 refuses a per-event list.
  Whether it should be what `waiting` *is* wants one person working with it for a day.

## The prototype

`.scratch/sound/prototype.html`, opened in a browser. It stays: tickets 02, 03 and 04 were
resolved by listening to it, and any reopen should be listened to the same way rather than argued.
It carries three voices and per-event switches that the app deliberately does not.
