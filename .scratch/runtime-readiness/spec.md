# A runtime that is not ready, handled rather than reported

Raised by the author, 2026-08-30: *"some runtimes may not be installed or need a sign in, can we
handle that for the user when needed?"* — and, when the first answer was too cautious about how:
*"with sign in i don't mean we storing the token, i mean we spawning the cli and executing the
interactive cli to sign in, cli might want to open a browser, let it be, the user will
authenticate and get back to the cli. Also installing is not a big deal if the user confirms it."*

Nothing here was broken. Ticket 11 works exactly as specified: `detectRuntimes` locates a
runnable binary through its three-layer cascade, reads the version, probes the login, and reports
one of four honest states. What it never had was a **way out of the state it reports**. The
picker said *not installed* and the user was left to go and find the vendor's documentation.

## What was decided

- **The sign-in is the CLI's own.** blobot spawns `claude auth login` or `opencode auth login` on
  a pseudo-terminal and gets out of the way. The CLI prints its code, opens its browser, waits,
  and writes wherever it keeps its credentials. Keystrokes pass through and bytes come back;
  blobot reads none of it. **This is how the no-credential-storage rule is kept while still
  helping** — by not participating, rather than by refusing.
- **A PTY, not a pipe.** Both commands are written for a person. On a pipe a CLI sees no TTY,
  drops to a non-interactive path, and either fails or hangs with nothing on screen. Verified
  against the real `opencode auth login`, which draws its provider select, its search field and
  its arrow-key hints correctly through this.
- **Embedded, not the user's terminal emulator.** Chosen by the author over spawning
  `gnome-terminal` / `Terminal.app` / `wt.exe`. The emulator would have been a per-platform guess
  on top of research that covers only Linux, and blobot would not have known when the user was
  done. Here the process exits, and that exit is the moment to ask the machine again.
- **Installing runs the vendor's own published command**, shown in full and confirmed first:
  `curl -fsSL https://claude.ai/install.sh | bash`, `curl -fsSL https://opencode.ai/install | bash`
  (both verified live 2026-08-30). Running something else would install a build the vendor does
  not support, in a place its own updater will not find. Both land in `~/.local/bin`, which the
  detection cascade already searches.
- **argv is core's, never the renderer's.** The renderer sends a `runtimeId` and a `kind`, and
  `remedyFor` looks the command up in `detect/remedies.ts` against detection as it stands. No
  string a user can reach becomes part of a command line, and a stale renderer cannot ask to sign
  in to something that is no longer there.
- **The ending is detection asked again, never the exit code.** An installer can exit 0 having
  put a binary somewhere nothing looks; a login can be abandoned in a browser tab with the
  command exiting cleanly. So the screen closes on the picker's own four words.

## What this does not change

- **Detection still gates nothing.** Ticket 11's rule holds: a runtime that says *not installed*
  is still selectable, and the button beside that sentence is an offer. The one addition is a
  launch-time refusal for `not_installed` **only**, which is not a gate on trying — there is no
  binary, the spawn was going to fail, and the only question was whether the user read
  `spawn opencode ENOENT` or read which runtime is missing and whose agent needs it. A
  signed-out runtime still starts and still says so itself, because that probe's positive was
  never proof and its negative is not blobot's to act on.
- **The word *authenticated* still does not appear**, and neither does a claim that a login
  worked. `settledLine` reports what the machine holds now.
- **The governing rule survives contact with a terminal.** xterm is handed a monochrome
  sixteen-colour palette, so a vendor's greens and cyans do not become the only saturated thing
  on screen that is not a blobatar. Structure survives in the channels a terminal has besides
  hue: bold, dim, inverse, and the glyphs. This is the same line the transcript already holds by
  rendering markdown with no syntax colour.

## Out of scope, and why

- **Signing in to a runtime that is already ready.** No remedy is offered on `ready`, so
  switching accounts is not reachable from here. A door labelled *sign in* beside a runtime that
  works reads as blobot doubting the answer it just gave. If somebody wants it, it is a separate
  decision about what that button says.
- **Windows.** `remediesFor` returns nothing there, by absence rather than by a button that
  fails. Ticket 11's research covers no Windows, and neither install command is a Windows one.
- **Gemini.** It has no auth probe at all (ticket 11), so it has no state to remedy.
- **Anything that reads what passes through the terminal.** Not logged, not parsed, not scraped
  for success. The moment blobot reads that stream it is in the credential business.

## The one bug that got through

The pane is a React effect that owns a process, and **React runs effects twice in development**.
An unaddressed `closeRuntimeStep()` in the first mount's cleanup raced the second mount's start
and killed the surviving process; because a deliberate stop reports no exit, the screen sat on a
login that had printed one line. So **every step call names its session** with an id the pane
mints: start, input, resize, close, and both streams back. A stop that names a session which is
no longer live does nothing. The id names one visit and carries no authority — the command is
still core's.

Worth keeping: the screenshot harness runs a production build, where React does not double
invoke, so **the harness structurally could not see this**. A surface whose effect owns a
process wants a `pnpm dev` pass too.

A second one followed from the fix rather than from the feature: adding `stepId` as the first of
three positional IPC arguments made a **stale preload** legible as a question about a runtime
called `sign_in`. A preload only reloads when the app restarts. `startRuntimeStep` takes one
named object now, checked on arrival, so a window newer than the bridge under it says so and
names the fix instead of blaming the user's machine.

## Unverified

- **`claude auth login` was not run live.** The command and its flags were read from
  `claude auth login --help` on this machine, and the subcommand contract is the same shape as
  OpenCode's, but running it would have started a real login flow and opened a browser on the
  author's machine. The OpenCode login was verified end to end, in the app, on screen.
- **macOS and Windows, as ever.** Neither the PTY environment nor the install scripts have been
  run on either.
