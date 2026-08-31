Type: task
Status: resolved
Blocked by: 03

# Three words of trust, three modes of fx

## Problem

`core/trust.ts` names three words -- `careful`, `normal`, `trusting` -- and each adapter
translates them from the opposite end, so the renderer names the decision and never learns which
runtime is behind it. fx has to be translated too, and its vocabulary does not divide the same
way.

fx has modes, set per process by `FX_PERMISSION_MODE` or over ACP by `session/set_mode`:

| Mode | Behavior |
| --- | --- |
| `ask` | Prompt before unresolved sensitive tool calls. |
| `auto` | Apply rules, then have a model automatically review unresolved calls. The default. |
| `yolo` | Disable fx permission checks. |

Over ACP the modes are named `ask` and `code`; `code` is the reviewing one.

Three problems with the obvious mapping:

- **`yolo` is `bypassPermissions` by another name** and ticket 14 refuses it at every level. It
  is not the ceiling of `trusting`; there is no path to it from the UI.
- **`auto` is not blobot vouching.** It sends a second, billed model request per unresolved call,
  on a reviewer the provider fixes and the user cannot change (`moonshotai/kimi-k3` on Gateway,
  `gpt-5.4-mini` on Codex, the session model on Grok). blobot would be paying another model to
  make the decision blobot claims to be making. It also costs more than `ask` for the same call,
  which the user did not ask for by picking a word about trust.
- **That leaves `ask` for all three words**, which is honest and is also a regression: an agent
  editing a file inside its own worktree will prompt, and ticket 14's amendment exists precisely
  to stop that happening on Claude. Under `ask`, fx's only lever for settling ordinary work is
  a permission rule, and rules live in `~/.fx/settings.json` -- which is ticket 03.

## What to do

Decide the mapping after 03 answers whether rules are available.

If rules are available: `careful` and `normal` map to `ask` with a narrow rule set, `trusting`
maps to `ask` with a wider one, and the closed list of commands that ask at every level (`rm`,
`sudo`, `chmod`, `chown`, `ssh`, `scp`, `docker`, `git push`, `git remote`) becomes `deny`-shaped
or stays unruled so it prompts. Write the counterpart to `adapters/claude/permissions.ts` and
`adapters/opencode`'s config posture, and note that fx's rules are wildcard-matched with the last
match winning, which is the opposite of a prefix allowlist and needs its own tests.

If rules are not available: all three map to `ask`, every request reaches the inline **Allow
once** / **Reject** block, and the answer says out loud that on fx the three words currently
choose the same thing. Do not invent a fourth behaviour to make the picker look busy, and do not
reach for `auto` to fill the gap.

Either way `allow_always` still has no path to the UI. fx offers "Yes, and don't ask again" as a
session grant that is never written to settings; blobot drops it, as it already does.


## Answer

**Measured against a real `fx` 0.0.7, 2026-08-31** (`../research/01-acp-surface.md` has the frames).
The ticket was charted against the documentation and the documentation is wrong about this.

**There are two modes over ACP, not three.** `session/new` answers:

    "modes": { "currentModeId": "ask", "availableModes": [
      { "id": "code", "name": "Code", "description": "Write and modify code with full tool access" },
      { "id": "ask",  "name": "Ask",  "description": "Request permission before making any changes" } ] }

`auto` and `yolo` have no ACP door. `fx status --json` does report `permission_mode: auto`, which is
the **CLI's** mode and a different thing from the ACP session's `mode`; the ACP one is the only one
blobot chooses. So ticket 14's usual refusal costs nothing here -- there is nothing to refuse,
because the dangerous rung is not offered on this surface at all.

**The default is the safe one.** A fresh `session/new` comes back `currentModeId: "ask"`.

**The mapping.**

| blobot | fx | why |
| --- | --- | --- |
| `careful` | `ask` | every tool call raises a permission request |
| `normal` | `ask` | same, because fx has no middle rung and blobot will not round upward |
| `trusting` | `code` | full tool access inside the workspace, and see the caveat |

`normal` and `trusting` differing is the whole of what this runtime can express, and `normal`
resolving to the same mode as `careful` is an honest under-promise rather than a bug: fx has two
rungs and blobot has three, and the level that gets rounded is the one where rounding *down* costs
the user nothing but a prompt. The alternative -- `normal` to `code` -- would make blobot's middle
word mean *full tool access* on fx and *ask before edits* on Claude, which is the renderer learning
which runtime is behind it by the way the app behaves.

**The caveat on `code`, and it is the reason ticket 03 stays open.** `code` is described as "full
tool access", and fx's own allow/deny rules live in `~/.fx/settings.json`, which is the user's file.
On Claude, `trusting` still asks for `rm`, `sudo`, `chmod`, `git push` and the rest, because
`allowedTools` is a `session/new` parameter blobot composes. fx gives blobot no per-process
equivalent, so `code` is coarser than `trusting` is anywhere else. Ticket 03 decides whether that is
shippable or whether `trusting` on fx has to mean `ask` too.

**The mode does not survive a resume.** Set `mode` to `code` with `session/set_config_option`, then
`session/load` or `session/resume`, and it comes back `ask`. This is exactly the lesson the OpenCode
adapter already carries, arrived at independently by a second runtime, and it means the adapter
re-asserts on all three of `session/new`, `session/load` and `session/resume`.

**The lever is `session/set_config_option`, not `session/set_mode`.** `mode` is advertised twice --
in the `modes` block and as a config option in category `mode`. `set_config_option` works and
returns the updated set; `set_mode` answers with neither a result nor an error. Read `modes`, write
`set_config_option`.
