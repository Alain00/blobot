Type: research
Status: resolved

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


## Answer

**Measured against a real `fx` 0.0.7 on 2026-08-31, and the leading candidate is dead.**

| candidate | result |
| --- | --- |
| `AGENTS.md` in the worktree's **parent** | **not read.** The agent answered `NO-MARKER`, with and without a git repository at the workspace root |
| `AGENTS.md` **inside** the workspace | read, and refused. See below |
| `--add-dir <path>` | fx's own string: *"These directories do not contribute AGENTS.md or other project instructions."* |
| an environment variable | none exists. Every `FX_*` string in the binary was enumerated; there is no system-prompt or instructions-file override |
| the loopback MCP server's `instructions` | connected, delivered, and **the model did not see it**, though fx has a `mcp_server_instructions_bytes` context limit implying it injects them somewhere |
| `~/.fx/AGENTS.md` | global, so not per agent. Rejected on sight, unchanged |

The parent-directory candidate was the ticket's own preferred answer and the reason it looked
tractable, so its failure is the finding. *Launch-ancestor* in fx's documentation does not mean an
ancestor of the workspace root.

**The one channel that works is refused twice over.** Ticket 14's reason first: an AgentWorkspace
is a checkout of the user's repository and a file left there can be committed home. And a second
reason specific to this runtime, which is worse and which the ticket did not anticipate -- **the
repository may already have an `AGENTS.md`**, the user's own file with the user's own content,
which fx reads because it is meant to. Writing a persona there destroys it.

### What an fx agent's persona is, in one sentence

**An fx agent's persona is a block of standing instructions sent above the user's words on every
turn, because fx will not take one any other way.**

Three properties make that a tolerable degradation rather than a shrug, and they are in
`adapters/fx/persona.ts` with the reasoning:

1. **Every turn, not only the first.** That is `composeLeadBrief`'s shape -- composed fresh on
   every turn the lead holds -- and it buys immunity to the one thing a first-turn-only persona
   cannot survive: fx compacting its own history, which blobot neither controls nor observes.
2. **It never enters the `messages` row.** The adapter adds the block at the wire, below
   everything core composed, so the transcript still shows what the user said and nothing they
   did not.
3. **A separate content block**, not glued to the user's sentence, with a header saying these are
   standing instructions and the request follows.

The price is stated rather than hidden: the persona's tokens are spent once per turn for the life
of the session.

**Verified live.** `live.test.ts` asks *"Who are you, and what is your role?"* against a real fx on
a real subscription, and it answers **"I'm Alice, the team's backend engineer."**
