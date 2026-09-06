Type: grilling
Status: resolved

# A per-agent composition root: config, MCP servers, skills

## Answer — 2026-09-06

Use the existing per-Agent launch composition, not another domain entity named
Machine. `runtimeFor` combines identity, workspace, instructions, runtime options,
posture and the Agent's named mailbox MCP servers. Each adapter owns its native
configuration. Profile fields remain profile fields; sessions, mailbox identity
and guest state remain per Agent. No generic configuration directory is moved
over the native CLI's authentication store.

The accepted box home is the user-scope root for that Agent, with its own CLI
login. Project/local scope is the mounted worktree. Only the existing scoped
operator skills directory is mounted read-only; host global settings, hooks,
credentials and MCP configuration are not imported. Shared repository Git config
and hooks remain the explicit accepted exception. This is exactly the composition
already implemented by the kit, adapter configuration and box palette.

On local, native user/project/local inheritance stays intact. Cursor's existing
config namespace remains adapter-owned. The historical assertion that a composition
root cannot be a private home applies to relocating a local login, not to the
already accepted box with its own login. [Pinned-source research](../research/70-per-agent-composition.md)
finds that Claude, Codex and fx couple authentication to home/config relocation;
OpenCode separates some paths but still merges inherited sources. There is no
portable exclusion switch worth presenting as a universal control.

The user chooses placement/limits at Team membership creation, and uses the existing
profile/persona/options/posture controls for Agent behavior. A selectable per-Agent
MCP/skills/rules inheritance editor is a separate capability effort; it is not needed
to implement the already accepted local/box composition. This bounded scope decision
uses Guillermo's completion delegation and is recorded in ADR-0003. Palette filtering
continues to mean what is offered, not a boundary on files or typed commands.

## Question

Raised by the author, 2026-09-04, as what survives the fork in `23`: *"where machines stands are
in per agent config/mcps/skills isolated."*

That is a third axis, and it is the one nothing in blobot answers.

| axis | question | who answers it |
| --- | --- | --- |
| **location** | which computer | `23` |
| **reach** | what the process can touch | `03`, `04`, `09`, `10` |
| **composition** | what this agent **loads** | nothing |

A server gives config isolation **per server**. Three agents on one server still share
`~/.claude/`, the operator's skills, the operator's MCP servers and `~/.fx/settings.json`. The
axis is orthogonal to where the box is, which is why this ticket does not wait on `23`.

## The prototype that already exists, on one runtime

`CURSOR_CONFIG_DIR` is this, shipped. `adapters/cursor/stdio.ts:56` calls it "what makes the
process one agent's", carrying `cli-config.json` and `acp-sessions/` and nothing else — **and the
login deliberately lives outside it**, which the same comment calls "exactly the split blobot
needs". It was built for the identity argument (the loopback token *is* the agent) and nobody
generalised it.

And blobot already composes MCP per agent — **additively only**. It supplies `mcpServers` on
`session/new` across four adapters, and `claude-agent-runtime.ts:122` states the limit outright:
blobot's injected servers are pre-approved by name, "never the user's own inherited servers,
which keep prompting exactly as ticket 14 describes." The lever exists everywhere. Subtracting
with it has never been tried.

## The prior this amends rather than contradicts

**ADR-0003 tried per-agent isolation and reversed it the same day.** The original decision was
`project` + `local` with no `user` scope, and it was walked back because it killed the author's
37 skills. Read the reason: the 223-command flood was **140 commands from a single plugin**, and
the 37 skills were the author's own. The recorded lesson is *do not isolate bluntly*, not *do not
isolate* — and a per-agent composition set is exactly the instrument that would have kept the
skills and dropped the plugin, instead of forcing one scope switch to decide both.

Its own **Not decided here** already gestures at the gap: whether blobot should ever offer to
load `user` scope for an operator who wants it, "nobody has asked, the flag is one option away."
Somebody has now asked, from the other direction.

**Whatever this concludes lands as an amendment to ADR-0003 with its reason stated**, not as a
new effort quietly contradicting it.

## What must come out of it

1. **The noun, and it is probably not *Machine*.** A composition root is not a place. Under `23`'s
   instance model the server is the machine, and putting a location word on a composition object
   makes `01`'s grain question unanswerable. Cursor's code already has a better one.
2. **What it contains.** Config, MCP servers, skills, rules, the palette allowlist, the posture.
   Some of those are already per agent by other means and should not be moved for tidiness.
3. **Per runtime, whether the seam exists at all.** Five runtimes, and only Cursor is known to
   have it. See the constraint below.
4. **What the user chooses, and where.** ADR-0002 keeps the agent form deliberately short, and
   this is the second control in a row (`04` raises the same worry about the trust selector) that
   wants a place on it.

## Two things that will bite

**A composition root cannot be a per-agent `$HOME`.** Every runtime reads config from a
home-shaped directory, so the tempting move is one fake home per agent — and that is
`research/01` §2 restated exactly: `--ro-bind / /` leaves reads wide open, and adding
`--tmpfs $HOME` closes them **and takes the CLI's own credential with it**. *Same file, two
consumers, opposite requirements.* Cursor's login lives outside its config dir and survives the
relocation, measured. Whether the other four have that seam is **unmeasured**, and where they do
not, this axis is unavailable on that runtime — which is `first-demo` ticket 14's asymmetry rule and will need
the same answer.

**It is not a boundary, and the disclosure must not imply one.** A skill that was not loaded is a
skill still on disk that the agent can `Read` and follow, and ADR-0003 already wrote this down
about the palette: "keeping them off a menu is not enforcement — they still work when typed."
Composition decides **what an agent is**. Reach decides **what it can do**. Conflating the two is
how `09`'s third and worst overstatement gets made, and it is the one users cannot detect.

## Not this ticket

Restricting what an agent may reach (`04`). Whether the composition root is *also* where `map.md`
and the standing instructions live (`06`) — that is the same directory asked about from the other
end, and the two answers have to agree.

## Integration note, 2026-09-05

Imported from main's `a185df4`, where this was ticket 14; renumbered to keep the implemented
engine interface's identity. The server fork is outside this effort. This question remains
open for local/box composition, subject to the already accepted per-Agent box home and CLI
login, scoped read-only operator skills, shared Git exception and ADR-0003 amendments. Those
answers are not proposals to reopen. Any additional product controls or inheritance changes
still require the author's decision with the home and disclosure tickets.
