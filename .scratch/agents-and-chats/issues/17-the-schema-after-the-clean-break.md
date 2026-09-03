Type: grilling
Status: open
Blocked by: 01, 02, 03, 04, 05

# The schema after the clean break

## Question

No migration: a new schema, decided on the model tickets. `packages/core/src/store/schema.ts`
has `teams` (workspace, icon, budget, lead), `agent_profiles`, `agents` (a frozen copy of a
profile plus workspace and branch), and everything keyed on `team_id`: sessions, messages,
turns, routines, handbook_entries, context_ceilings. What are the tables now?

Decide, with the author, and write the Drizzle schema as the answer (schema only, no store
code; this is the one ticket whose answer is code, because a schema is the model said
precisely):

- **`agents`**: the definition (name, hue, role, runtime, executable, runtime options, model,
  trust, compaction, verbosity, standing instructions, **purpose**, **anchor** path, kind,
  scope), created and deleted. Is the profile/instance split gone entirely, or does a Chat
  membership still freeze the runtime columns (ADR-0002 kept the runtime and name frozen
  because the branch and the session belong to them)?
- **`chats`**: kind (`dm`, `group`, `routine`), name, description, icon, turn budget, lead;
  the DM's uniqueness per agent enforced where?
- **`chat_members`** (or the word ticket 01 chose): agent, chat, the AgentWorkspace path and
  branch, joined and left.
- **`handbook_entries`** keyed on agent; **`routines`** keyed on chat member; **`sessions`** on
  chat member; **`messages`** on chat; **`context_ceilings`** unchanged; the identity-rewrite
  history for ticket 05's revert.
- **The two invariants** in the schema header stay: no credential column anywhere, no SQL time
  defaults.
- **Where the old data goes.** The file is `userData/blobot.db`; a clean break means a new file
  name or a destructive migration that says so once. Recommendation: a new file, the old one
  left in place and never read.

The answer is the schema file's content, in the ticket, plus the one-paragraph note for
`build.md` on the clean break.

## From ticket 01, 2026-09-03

Fixed by the glossary: `agents` is the definition (with `slug`, unique, immutable; `name`, unique,
mutable; anchor path and kind; purpose), `chats` (with `slug` and `kind` DM/group, description,
lead, turn budget), **`members`** (`agent_id`, `chat_id`, AgentWorkspace path, branch, joined,
left; copies nothing), and sessions, messages, turns, events keyed on the Member or the Chat; the
Handbook on `agent_id`, the Routine on the Member. No `team_id` anywhere.

## From ticket 02, 2026-09-03

On the Agent: anchor path, kind (`git`/`nested`/`plain`), origin (`chosen`/`made`), scope (JSON,
`nested` only), and the missing state derived at launch, not stored. On the Member: AgentWorkspace
path and branch (NULL in place and on a copy). No `copies/` versus `worktrees/` distinction in the
schema; the provider decides from the kind.
