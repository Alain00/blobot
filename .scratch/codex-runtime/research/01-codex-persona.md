# 01 — Is the persona an environment variable?

Research findings for `issues/01-is-the-persona-an-environment-variable.md`.
Date: 2026-08-30. **codex-cli 0.148.0** behind **`@agentclientprotocol/codex-acp` 1.7.0**, already
signed in (`codex login status` → *Logged in using ChatGPT*, from a `~/.codex/auth.json` dated
August). Every prompt below is a real model turn on the author's own account.

The binary is the one that **arrived as a transitive dependency of the bridge** —
`node_modules/.pnpm/node_modules/.bin/codex` — because `codex` is not on this machine's `PATH`.
That is enough to answer this ticket, and it is *not* how blobot will run: `CODEX_PATH` must
point at the user's own install (ticket 03). Nothing here depends on which of the two answered.

Tags:

- **[OBS]** — observed in a captured transcript in `01-transcripts/`.
- **[DOC]** — from the installed package's own README.
- **[INF]** — inferred.

The driver `01-transcripts/acp.mjs` is `16-transcripts/acp.mjs` with the child changed to
`process.execPath dist/index.js`, so all three runtimes are probed by one shape of script.

| File | Scenario |
|---|---|
| `t0-initialize.jsonl` | `initialize` alone: capabilities, auth methods, extensions |
| `t1-new-plain.jsonl` | `session/new` alone: models, modes, config options |
| `t2-persona-env.jsonl` | `CODEX_CONFIG.developer_instructions`, three turns, with an `AGENTS.md` present |
| `t3-load-withenv.jsonl` | `session/load` in a second process, env still set |
| `t4-load-noenv.jsonl` | the same load with **no** `CODEX_CONFIG` |
| `t5-secret-new.jsonl` | a persona carrying a fact the conversation never mentions |
| `t6-secret-load-noenv.jsonl` | that session loaded with no env, asked for the fact |
| `t7-secret-load-withenv.jsonl` | the same, env set |
| `t8-load-changed-persona.jsonl` | the same session loaded with a **different** persona in the env |
| `t9-*.jsonl` | what else `CODEX_CONFIG` carries, `session/new` only |
| `t10-*.jsonl` | `INITIAL_AGENT_MODE`, an invalid value, malformed JSON |
| `t11-compact.jsonl` | a real compaction, then the fact asked again |

---

## Short answer

**Yes. `CODEX_CONFIG={"developer_instructions":"<persona>"}` is the persona, and it is better
than the ticket hoped for.** It is an environment variable that dies with the process, writes
nothing into the user's repository, needs no `AGENTS.md` anywhere, and it is **durable**: Codex
stores it on the session, so it survives a second turn, a `session/load` in a different process,
and a real compaction. Of the three runtimes this is the best-behaved persona mechanism blobot
has found.

1. The persona is live on turn 1. `t2` turn 1: *"ALICE-OK. I'm Alice, the backend engineer on
   the two-person PELICAN team, working alongside Bob on frontend."* The token it was told to
   emit, the name, the role and the teammate, all from the environment variable. [OBS]
2. It holds across turns. Turn 2 *"Bob"*, turn 3 *"PELICAN"*. [OBS]
3. **It is additive to `AGENTS.md`, not a replacement.** The workspace's `AGENTS.md` said the
   codename is PELICAN, the env var said nothing about a codename, and turn 1 used both in one
   sentence. ADR-0003's rule survives: the repository's own instructions still work.
   `model_instructions_file` was not reached for and should not be. [OBS]
4. **It survives `session/load` in a second process with the environment variable unset.**
   `t5` put a fact in the persona that the conversation never mentioned — a build command — and
   asked one unrelated question. `t6` loaded that session in a fresh process with **no**
   `CODEX_CONFIG` at all and asked for the build command: `make-pelican-42`. So the instructions
   are stored on the session, not merely injected per process, and the answer cannot be the
   replayed transcript, which never contained the fact. [OBS]
5. **It survives compaction.** `t11` ran `/compact` — a real one, `tool_call` of kind `think`
   with `_meta.contextCompaction` — and the build command came back correct afterwards. [OBS]
6. **A loaded session keeps the persona it was created with, and a different one in the
   environment does not take.** `t8` loaded the Alice session with a Carol persona and a
   different build command in `CODEX_CONFIG`; the answer was still `make-pelican-42`. This is the
   one consequence worth carrying into ticket 05: for Codex, an **edited persona takes effect on
   a new session and not on a resumed one**, which ADR-0002's "at the team's next start" does not
   by itself guarantee once `TeamPool` resumes with `session/load`. [OBS]

## What else `CODEX_CONFIG` carries (step 3)

The merge reaches the **real Codex configuration**, and it is validated: `sandbox_mode` set to a
nonsense value fails `session/new` outright with *"failed to load configuration: unknown variant
`nonsense-not-a-mode`, expected one of `read-only`, `workspace-write`, `danger-full-access`"*.
So the keys are not a small allowlist — this is Codex's own config loader. [OBS — `t10-bad-sandbox-value`]

- `model` and `model_reasoning_effort` **take**: `{"model":"gpt-5.4-mini","model_reasoning_effort":"low"}`
  comes back as the `model` and `reasoning_effort` config options' `currentValue`. [OBS]
- `sandbox_mode` and `approval_policy` are **accepted and validated, but the mode the bridge
  reports does not move**: it stays `agent` whatever they say. The mode ids are the bridge's own
  preset layer over both axes, and `INITIAL_AGENT_MODE` is what moves them — `read-only` and
  `agent-full-access` both come back as `currentModeId`. Which of the two wins at the point where
  a command actually runs is **not answered here**, and ticket 02 must answer it behaviourally
  rather than by reading a reported value. [OBS]
- **An unknown key is accepted silently.** `{"blobot_not_a_key":"zz"}` starts a session normally.
  A typo in blobot's posture would therefore fail open and invisibly, which is an argument for
  asserting the posture against what comes back rather than trusting the write. [OBS]
- **Malformed JSON kills the bridge before `initialize`**, exit 1 with a `SyntaxError` on stderr.
  Loud and early, which is the good failure. [OBS]

## Free facts the ticket did not ask for

Captured at zero token cost, and each belongs to a later ticket.

- **`initialize` advertises exactly one auth method under `NO_BROWSER=1`: `api-key`** — the one
  ticket 04 says blobot must never take. The ChatGPT method is hidden by that variable as
  documented, so a signed-out user sees blobot offering nothing at all over the protocol, which
  is correct: the way in is `codex login` on a PTY. Being signed in already, no auth was
  demanded at any point. [OBS]
- `loadSession: true`, and **`session/load` replays the transcript** — three user and three agent
  chunks for a three-turn session, plus `session_info_update` and `available_commands_update`.
  `TeamPool` must mute the replay exactly as the Claude adapter does. [OBS]
- `promptCapabilities: { embeddedContext: true, image: true }` — ADR-0004's attachments travel;
  no audio. `mcpCapabilities: { acp: false, http: true, sse: false }` — ticket 15's loopback MCP
  server is HTTP, so it travels. [OBS]
- `sessionCapabilities` offers `subagents`, and `_meta` offers `goal`, `steering` and a
  `jetbrains` block. All opt-in, all declined by default, which is what the spec already decided.
- **`usage_update` is `{ used, size }`** — `{"used":5068,"size":258400}` — which is the exact
  shape the CONTEXT gauge already reads off the other two. [OBS]
- **The palette measurement, ticket 05's, already made**: `available_commands_update` carries
  **52 commands** — the ten built-ins the spec listed (`plan`, `mcp`, `skills`, `status`,
  `review`, `review-branch`, `review-commit`, `compact`, `goal`, `logout`) and **42 `$`-prefixed
  skills**, every one of them from the author's own `~/.codex`. No plugin flood: Codex prefixes a
  skill with `$`, so the allowlist ADR-0003 asks for is a cheaper filter here than it was for
  Claude. `logout` and `goal` are the two to drop. [OBS]
- Config option groups at `session/new`: `mode`, `collaboration_mode`, `model`,
  `reasoning_effort`, `fast-mode`. ADR-0002 keeps the last three and subtracts `mode` (ticket 14
  decides it); `collaboration_mode` is a `plan`/`default` toggle and is ticket 02's to judge.
  Note that `fast-mode` is absent for some models — the group list is per model, not fixed. [OBS]
- 29 models are advertised on `session/new` as the **cross product** of six models and their
  effort levels (`gpt-5.6-sol[medium]`), while `configOptions` splits the same thing into two
  clean groups. blobot should read the groups and ignore `availableModels`. [OBS]

## What this closes

The ladder in the ticket is not needed. `model_instructions_file` is not reached for, and
**`CODEX_HOME` is not touched**, which was the rung that would have put blobot near a credential
file. The persona is one environment variable, per process, and the login stays entirely the
CLI's.
