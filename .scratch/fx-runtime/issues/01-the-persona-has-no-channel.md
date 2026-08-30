Type: research
Status: open

# The persona has no channel

## Problem

blobot composes a persona out of a Team and a roster and hands it to the runtime as the agent's
standing identity. Both existing adapters have a first-class place to put it. fx has none:
`session/new` takes `cwd` and `mcpServers`, the system prompt is compiled into the binary
(`src/core/config/prompt_policy.zig`), and the docs say fx "does not expose the exact internal
system prompt as a user setting". Without an answer here an fx agent does not know it is on a
team, which is the whole product.

## The candidates

**An `AGENTS.md` in the worktree's parent directory.** fx gathers "global instructions from
`~/.fx/AGENTS.md`, launch-ancestor and primary-workspace `AGENTS.md` files, and more specific
`AGENTS.md` files for files or directories targeted by a tool call". A git AgentWorkspace lives
at `~/.local/share/blobot/worktrees/<team>/<agent>/`, so a file one level up is **blobot's own
directory, per agent, outside the checkout**, and therefore cannot be committed home. That is
precisely the objection ticket 14 raised against writing a settings file into the workspace, and
this candidate answers it rather than working around it.

**Fold the persona into the first prompt.** No new machinery, works today. But it lands in the
transcript where fx's own compaction can eat it, and it makes the persona a message rather than
an identity. A degradation from what the other two runtimes give, and it should be named as one
if it is chosen.

**`~/.fx/AGENTS.md`.** Global, so it cannot be per agent, and it edits the user's own fx for
every project they use it in. Rejected on sight; listed so the next reader does not re-derive it.

## What to do

Research first, because the ranking depends on a fact nobody has checked.

1. Install fx, put an `AGENTS.md` **above** a directory, launch `fx acp` with that directory as
   cwd, and see whether its contents reach the model. "Launch-ancestor" is the documented phrase;
   whether an ancestor above the workspace root counts is the question.
2. Check the same for a `plain` (copy) AgentWorkspace and for `nested`, where the parent
   directory may be the user's folder of repositories rather than blobot's. If the parent is the
   user's, this candidate is only available for `git` and `plain`, and that changes the answer.
3. Check what `context_limits` does to a persona-sized instruction file, and whether truncation
   is reported. The docs say truncated context is reported to the runtime rather than silently
   treated as complete, which would be usable.

Then decide, and say in the answer what an fx agent's persona *is*, in one sentence, the way
ADR-0001 says what an AgentProfile is.
