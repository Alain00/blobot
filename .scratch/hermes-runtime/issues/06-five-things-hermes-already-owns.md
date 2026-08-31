Type: grilling
Status: open
Blocked by: 01

# Five things Hermes already owns that blobot owns too

## Problem

The Codex adapter met a small version of this: Codex ships a subagent vocabulary that competes
with the mailbox, so the adapter tells it in words that it has none. Hermes is that five times
over, and the answer cannot be the same five times.

| blobot owns | Hermes brings | Can prose decline it? |
| --- | --- | --- |
| the mailbox, `message_agent` | `delegate_task`: subagents with roles, spawn depth, background delegation | yes, it is a tool |
| AgentWorkspaces | `tools/subagent_worktree.py`, worktrees under `<repo>/.worktrees/` | yes, it is off by default and only reachable through delegation |
| Routines | the `cronjob` tool and `cron/`, which survive the turn | yes for the tool, **no** for jobs already in the home |
| the handoff at 80% | `agent/context_compressor.py` | **no**, see ticket 05 |
| nothing yet | `MEMORY.md` / `USER.md`, agent-created skills, the curator | **no**, they run without the model asking |

Two of these are not declinable by prose, and one of the two is a genuinely new question for
blobot rather than a porting problem.

## The tools

`toolsets.py` defines the toolset table and the ACP path expands `hermes-acp` through
`_expand_acp_enabled_toolsets`. So the toolset a blobot team member gets is **choosable**, and
this is the same decision ADR-0003 already made once: the settings scope decides what an agent can
do, the palette decides what blobot offers. Here they are the same knob, which makes it easier and
sharper.

Provisional shape: a team member gets file, terminal, search, web and the loopback MCP server. It
does not get `delegation`, `cronjob`, `messaging`, `kanban`, `discord`, `tts`, `video`, `image_gen`
or `browser`. The reasons are not uniform and each needs writing down:

- `delegation` and `kanban` because agent-to-agent communication is the orchestrator's concern,
  which is a permanent architectural rule and not a preference.
- `cronjob` because blobot has Routines, and `.scratch/routines/` issue 05 spent a whole amendment
  on what it costs to let an agent arm one: it opens inline in the transcript, it keeps an ink edge
  until a person answers it, and an agent may hold at most three. A `cronjob` tool would arm
  something off screen with none of that, which is the version of this that must not exist.
- `messaging` and the platform tools because an agent that can send a Telegram message has left the
  app, and nothing in blobot's transcript would show it.

## The memory, and the thing blobot has never decided

`MEMORY.md` and `USER.md` are injected into the system prompt as a frozen snapshot at session
start, and `agent/background_review.py` forks the agent after each turn to decide what to write
into them. That runs whether or not blobot approves, and it means **a Hermes agent on a blobot team
accumulates a persistent self**.

blobot has no position on this. An AgentProfile carries a role, standing instructions and a face;
an Agent carries a workspace, a session, a mailbox and a status. Nothing in the model says what
happens when an agent *learns* something across teams, and ADR-0001 said an agent can be on several
teams at once, which makes it worse: a memory Alice writes while on the parking-lot team is in her
system prompt on the billing team tomorrow.

The three honest answers, and this ticket is a grilling because none is obviously right:

1. **Let it happen and surface it.** The learning is the point of Hermes and hiding it would be
   dishonest. But blobot would then be shipping cross-team memory with no UI and no delete.
2. **Turn it off** (drop the `memory` toolset, disable background review) and take a diminished
   Hermes, which is most of what makes Hermes worth having.
3. **Scope it to the Agent, not the AgentProfile** -- a `HERMES_HOME` per Agent rather than per
   profile, so what Alice learns on the parking-lot team stays there. That is coherent with
   everything blobot already believes (a workspace, a session, a mailbox and a status are per
   Agent) and it is the most work.

Whichever wins, `curator` is a separate small mercy: it only touches skills with
`created_by: "agent"` provenance, never deletes, and archives to a restorable directory. That
provenance rule is worth copying regardless of what happens here.
