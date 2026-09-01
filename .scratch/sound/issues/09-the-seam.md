Type: task
Status: resolved
Blocked by: 06, 07, 08

# The seam: where the player lives and what it must never know

## Problem

Sound could be wired the cheap way: a `play('send')` in the composer's submit handler, another in
the permission block's buttons, another in the delete dialog. Twelve call sites scattered through
components, each one a place a future change silently loses a sound or gains one nobody decided on.

Two permanent rules apply directly and neither is optional:

- **The UI is provider-agnostic.** No provider-specific logic in React components, ever.
- **Runtime implementations sit behind interfaces.**

## Answer

**Resolved 2026-08-31. One renderer module, and the notification half is subscribed rather than
called.**

### Renderer-only, and that is forced rather than chosen

Web Audio exists in the renderer. Main has no audio, and shelling out to a system player would be
a process spawn per sound, a platform matrix, and a dependency on tools that may not be installed.
So `apps/desktop/src/renderer/src/sound/`, and main is not touched.

That also settles what ticket 04 half-answered: the state is renderer preference in `localStorage`,
so no IPC surface, no preload method and no `shared/api.ts` change is needed. The one exception is
ticket 10's screenshot flag, which already crosses.

### Four files, split by what changes

- `voice.ts` — the synthesis engine and the one voice. Takes notes and a time, makes sound. Knows
  nothing about blobot.
- `vocabulary.ts` — the twelve events as data: id, group, note sequence. Ticket 02's table in code,
  and the only place a pitch appears.
- `player.ts` — `SoundPlayer`: the lazily created `AudioContext`, the enabled map and its
  persistence, ticket 08's debounce, and `play(id)`. The single place anything is refused.
- `useSound.ts` — the React seam: one context provider, `usePlaySound()` for call sites and
  `useSoundSettings()` for the Settings screen.

`vocabulary.ts` is deliberately separable from the other three: it is the file a design change
edits, and the rest is machinery.

### Notification sound is subscribed, never called

`waiting` does not come from a component. It hangs off `window.blobot.onPermission` in `App.tsx`,
beside the dispatch already there, because that callback receives **every** team rather than only
the open one, which is exactly what ticket 08 needs:

```
window.blobot.onPermission((teamId, request) => {
  if (mine(teamId)) dispatch({ type: 'permission', request, at: Date.now() });
  if (!mine(teamId) || !document.hasFocus()) play('waiting');
})
```

Ticket 08's *never for what is already on screen*, expressed once at the seam rather than as a
condition every call site has to remember. `handoff` hangs off the compaction channel the same way.

### Interaction sound is called at the act

There is no event stream for *the user clicked a thing*, and inventing one would be a layer for its
own sake. So interaction sounds are called where the act is committed, which is a small stable set:
the composer's submit, the permission block's three buttons, the Routines screen's arm and disarm,
the delete dialog's confirm.

What keeps this from sprawling is ticket 01's test, written into the module's own doc comment:
**did the person cause this sound in the last 200ms by an act they committed?** A hover handler
cannot answer yes and is therefore not a call site.

### What it must never know

`vocabulary.ts` has no runtime id, no provider name, no adapter import and no branch on any of
them. A `send` sounds the same whether the agent behind it is Claude, Codex, OpenCode or fx, and
the permission sounds are identical across all four despite the four postures behind them being
genuinely different.

Sound is an easy place to break the provider-agnostic rule by accident: an fx-only diagnostic or a
Codex-only permission shape is a tempting thing to sound differently. Refused in the same sentence
that refuses per-agent voices.

### Failure is silent

Every entry point is guarded. No output device, a refused context, a platform that says no: the
call returns and nothing is reported. Ticket 07's second obligation, and the reason nothing in the
app may depend on a sound having been heard.
