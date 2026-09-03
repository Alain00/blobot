Type: grilling
Status: open
Blocked by: 02, 09, 10, 11, 12, 13

# What an Agent can access, and how that is said

## Question

The author wants to "definirle a qué MCP puede acceder, a qué agent puede acceder, a qué tools
puede acceder, definir environments". Today every runtime loads what the operator configured
(ADR-0003: *the settings scope decides what an agent can do; the palette decides what blobot
offers*), and restricting per agent was named a future cross-runtime effort. This is that
effort's decision, taken on the facts tickets 09 to 13 bring back. The author declined to
choose a mechanism before the research: *"requiere el research primero de posibles approachs y
entonces decidimos"*.

Decide, with the author, reading the five research files first:

- **The mechanism.** (a) The anchor or generalist folder carries project-scope config that
  blobot writes, per runtime, so an Agent's access is *files in its own folder*; (b) a blobot
  allowlist per Agent, translated by each adapter from the opposite end the way `trust` is; (c)
  both, (a) as mechanism and (b) as vocabulary. Which runtimes make (a) impossible because a
  project file cannot deny an operator server, and does that sink (a) or only mean the word for
  it is *add* and never *restrict*?
- **The committable-file problem.** An anchored Agent's AgentWorkspace is a checkout of the
  user's repository. `adapters/claude/permissions.ts` refused a settings file for that reason.
  Anything blobot writes into a worktree for access can be committed home; anything in the
  generalist folder cannot. Does the answer differ by anchor kind?
- **The vocabulary.** blobot's own words, few, provider-agnostic, on the Agent's definition:
  what the user picks from (the operator's MCP servers by name? skills by name? tools?), and
  what *nothing picked* means (everything, as today).
- **Environments.** What the author meant: env vars per Agent, a container, or the runtime.
  Ask, then decide whether it is in this ticket, a new one, or the fog.
- **Agent-to-agent.** Whether "a qué agent puede acceder" is anything beyond the Chat's roster.
  Recommendation: it is the roster, and the sentence in the glossary says so.
- **ADR-0003 amendment**, and whether this needs its own ADR.

The answer is the mechanism, the words, and the ADR text.
