Type: task
Status: resolved
Blocked by: 03

# Getting a file in

## Problem

Three routes, and they hand you different things:

- **Paperclip** → a native dialog. Gives a **path**.
- **Drop** → a `File` in the renderer. Electron 44 removed `File.path` (gone since 32), so a path
  comes from `webUtils.getPathForFile()` in the preload or it does not come at all.
- **Paste** → clipboard bytes. **No path and no filename**, which is the author's own case.

And underneath: who reads the bytes? Every filesystem operation blobot has is in main —
`chooseWorkspace`, `chooseTeamIcon`, `inspectWorkspace` — and the renderer has never read a file.

## Answer

**All three, and the renderer never touches the filesystem.**

Paperclip and drop send a **path** over IPC; main reads the bytes. That keeps issue 03's size
ceiling and type check on the side that can enforce them *before* anything crosses. Paste is the
exception by necessity — there is no path — so the renderer hands over the bytes it already
holds, and main applies the same two checks on arrival.

Paperclip is the discoverable one, paste is the one that gets used, drop is nearly free once the
other two exist.

## The draft's lifetime

An unsent Attachment lives exactly as long as the draft text does. They are one message, and
splitting their lifetimes — words surviving a team switch while the image does not — is the most
confusing option available.

**Which means it inherits an existing oddity, named here rather than fixed here.** There is one
`Composer`, mounted once with no `key` (`App.tsx:277`), so `draft` already survives switching
panes *and* switching teams: you can type at Alice, switch to another team entirely, and your
words are still there addressed to a stranger. Nobody decided that; it just happens. An
attachment makes it heavier, since a few megabytes now follow the user around in renderer memory.

Per-team drafts — a draft belonging to the team you were writing to, restored when you return —
is the correct answer and its own ticket. Changing draft lifetime inside a commit about files
would be a behaviour change riding in unannounced.
