Type: task
Status: open
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
