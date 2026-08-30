Type: research
Status: open

# Is the persona an environment variable?

## Problem

Everything else in this effort is a translation exercise. This is the one fact the plan rests on,
and it is assembled from two documents that do not reference each other.

- `codex-acp`'s README lists `CODEX_CONFIG` as "JSON object merged into the Codex session config".
- Codex's configuration reference carries `developer_instructions`, "additional developer
  instructions injected into the session (optional)", alongside `model_instructions_file`, which
  is a *replacement* for the built-in instructions rather than an addition.

If `CODEX_CONFIG={"developer_instructions":"<persona>"}` reaches the session, the persona is an
environment variable that dies with the process, and Codex is the best-behaved of the four
runtimes on the question fx has no answer to at all. If the merge is restricted to a
allowlist of keys, or if the App Server ignores the key on a session it did not create, the
fallback ladder is worse at every rung.

## What to do

1. Install Codex and the pinned bridge. Launch it with `CODEX_CONFIG` carrying
   `developer_instructions`, start a session, and ask the agent to state its role. The persona is
   present or it is not; this is one turn.
2. If it is present, check that it survives what the persona has to survive: a second turn, a
   compaction, and a `session/load` or resume. A persona that is only true on turn 1 is the
   turn-1-prompt fallback wearing a better name, and should be recorded as such.
3. Check what else `CODEX_CONFIG` will carry, because ticket 02 wants `approval_policy` and
   `sandbox_mode` through the same door. If the merge is general, the whole posture is one env
   var. If it is not, find out what the filter is before ticket 02 designs around it.
4. Note whether `developer_instructions` is additive to `AGENTS.md` or competes with it.
   ADR-0003's rule is that the settings scope decides what an agent *can do* and the repository's
   own instructions still work; a persona that silently replaces the user's `AGENTS.md` would
   break that, and `model_instructions_file` is the key that does exactly that. Do not reach for it.

## The ladder if it fails

- **`model_instructions_file` pointed at a blobot-owned file.** Replaces Codex's built-in
  instructions, which is a much larger claim than blobot wants to make, and the file lives
  outside the repository but is still a file to clean up. Only if 1 fails outright.
- **A `CODEX_HOME` per agent.** Codex reads its config, and its `auth.json`, from `$CODEX_HOME`.
  Pointing it at a blobot-owned directory would give a per-agent `config.toml` -- and would take
  the user's login away with it, since the credential lives in the same directory. Any version of
  this that works involves blobot arranging for a credential file to be found, which is the
  no-credential-storage rule at its edge. Answer 03 in the fx effort first; this is the same
  question with higher stakes.
- **The persona in the first prompt.** Always available, always the weakest, and the one to
  choose over anything that touches a credential.
