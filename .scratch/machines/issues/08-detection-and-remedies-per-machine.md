Type: grilling
Status: open
Blocked by: 01

# Detection, and its remedies, when the runtime is not on this computer

## Question

Ticket 11's four honest states — and, since `runtime-readiness`, the way out of each — are
written as facts about **the app's machine**. `claude`, `opencode`, `cursor-agent` and `fx` are
looked for on `PATH`; `fx status --json` and `cursor-agent status --format json` are spawned
here; the remedy runs the vendor's own `auth login` or install command on a real pseudo-terminal
inside the app, and the CLI opens its own browser.

Every one of those sentences is about the wrong computer once a Machine is not this one.

## What to decide

- **Detection runs where the agent runs.** Which means a probe over the transport, a result that
  can be *stale* in a way a local probe never is, and a fifth state that is not one of the four:
  **we could not ask.** The four states were chosen to be honest and to gate nothing; a fifth
  must not quietly become a gate either.
- **What the remedy is off-machine.** `claude auth login` over ssh gets a pty and works; the
  browser it opens is on the far side, in front of nobody. The vendor's device-code flow may
  rescue this and may not, per vendor. Establish it rather than assuming, because
  `runtime-readiness` made a point of never concluding from an exit code and this is the same
  trap in a new place.
- **Where a credential ends up.** blobot stores none and proxies none, and that rule does not
  weaken by distance: a runtime signed in on a remote box is signed in **there**, in the user's
  own account on the user's own machine, exactly as `gh` is the user's own login spawned. What
  must be decided is whether blobot may *offer* to sign in over there, or whether that is a
  thing the user does themselves before handing blobot the box.
- **Caching.** Detection today is asked fresh and gates nothing. Over a network, asking fresh on
  every screen is a cost, and caching an answer is how a screen comes to assert something that
  stopped being true.
- **The refusal that already exists.** A launch whose agent's runtime is `not_installed` is
  refused by name rather than surfacing as `spawn opencode ENOENT`. The off-machine version of
  that error is worse and more varied, and it is the one the user will actually hit.

## Where the argument has already been had

`.scratch/runtime-readiness/` decided the local shape and its reasons are binding here: two ids
travel and the command is looked up on the far side, argv is core's and never the renderer's,
nothing concludes from an exit code, and the screen ends on detection asked again in the same
four words. All four survive the move in principle. Check each one rather than inheriting it.
