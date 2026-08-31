Type: task
Status: open
Blocked by: 01

# The persona has no ACP channel

## Problem

`new_session(cwd, mcp_servers, **kwargs)` in `acp_adapter/server.py:1590` is the whole signature.
No `_meta`, no `instructions`, no `systemPrompt`. Hermes builds its system prompt itself, in
`agent/system_prompt.py`, out of config, memory, skills and the coding context.

blobot has solved this three times and each answer came from a different door:

- Claude: `_meta.claudeCode.options`, handed on `session/new`.
- OpenCode: `OPENCODE_CONFIG_CONTENT`, an environment variable carrying the whole config, so
  blobot writes nothing into the user's repository.
- Codex: `CODEX_CONFIG.developer_instructions`, which Codex stores **on the session**, so it
  survives a resume and a compaction, and an edited persona does not take on a resumed session
  (`.scratch/codex-runtime/` issue 06).

Hermes has no environment variable that carries config content. The doors are:

1. **`<HERMES_HOME>/config.yaml`, key `agent.system_prompt`.** The config example calls it "your
   manual system prompt" and is explicit that it is not the personality selector. Per home, so
   this door only exists if ticket 01 gives each agent its own home. It is a file blobot writes,
   but outside the user's repository, which is the line that matters.
2. **`AGENTS.md` or `CLAUDE.md` in the cwd**, loaded by `agent/coding_context.py`. The cwd is the
   AgentWorkspace, which is a checkout of the user's repository. **Refused**, for ticket 14's
   reason: a file left there can be committed home. This is not a close call.
3. **The first prompt.** Costs nothing, works under a shared home, and is wrong for the same
   reason it was wrong everywhere else: it is a user turn in the transcript, it does not survive a
   compaction, and Hermes compacts itself (ticket 05).

## What to decide

Whether door 1 is available at all (ticket 01), and if it is not, whether a Hermes agent can be a
team member without a persona that survives. A lead's brief is composed fresh every turn and can
ride the prompt; a persona cannot, because a persona is what the agent *is* between turns.

Note the counterpart question: whatever door is chosen, the persona has to be re-stated when the
roster changes, because a persona names the roster. Claude and Codex both take that at the team's
next start. If the persona is a file in the home, the same rule holds with no new mechanism.
