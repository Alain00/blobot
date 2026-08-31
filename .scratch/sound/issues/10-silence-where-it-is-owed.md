Type: task
Status: resolved
Blocked by: 09

# Demo mode, screenshots and tests must be silent

## Problem

Three places run the app with nobody in front of it, and each would be wrong in a different way if
it made noise. `--screenshot=<path>` renders a scripted turn and writes a PNG. The suite mounts
components in jsdom. And `--demo` plays a scripted two-agent team, which is the genuinely ambiguous
one, because a demo is the product being shown.

## Answer

**Resolved 2026-08-31.**

### Screenshot mode is silent, and the switch cannot override it

`--screenshot` already crosses to the renderer, and a screenshot run is exactly the context where
nobody is present and something may be capturing. The renderer treats it as a hard mute above the
settings switch, because a switch someone set on their own machine should not make an automated
capture noisy.

This is the only place this effort touches main, and it touches it by reading a flag that already
exists rather than adding one.

### Tests are silent because nothing constructs a context

`AudioContext` is created lazily on the first real `play`, per ticket 07's first obligation, and
jsdom has no `AudioContext`. The guard that makes the app robust on a machine with no output device
is the same guard that makes the suite silent, with no test-only branch.

`player.ts` is unit-testable without audio: the enabled map, the persistence, the debounce and the
refusals are all decidable without producing a sound. Whether an oscillator was constructed is not
a useful assertion.

### `--demo` sounds

It is the product. A silent demo of an app that makes sound shows the wrong app.

The demo's own turns produce no interaction sounds, because nobody committed an act: the scripted
prompt fires itself. That falls out of ticket 09's seam with no special case, since interaction
sounds are called at the act and there is no act.

### Live runtime flags are ordinary

`--live-claude`, `--live-codex`, `--live-fx`, `--live-mixed` and `--live-fx-mixed` are a person at
the screen driving real agents. They are the app, and they sound like it.
