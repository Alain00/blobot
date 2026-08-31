/**
 * The persona on a runtime that has nowhere to put one.
 *
 * Every other adapter has a first-class channel: Claude takes `_meta.claudeCode.options`,
 * OpenCode takes an agent definition through `OPENCODE_CONFIG_CONTENT`, Codex takes
 * `CODEX_CONFIG.developer_instructions` and stores it on the session. fx has none, and this is
 * not for want of looking. Measured against a real `fx` 0.0.7 on 2026-08-31, every candidate
 * ticket 01 listed and two it did not:
 *
 * | candidate | result |
 * | --- | --- |
 * | `AGENTS.md` **above** the workspace | **not read.** `NO-MARKER`, with and without a git repo at the workspace root |
 * | `AGENTS.md` **inside** the workspace | read, and refused: see below |
 * | `--add-dir <path>` | fx's own string: *"These directories do not contribute AGENTS.md or other project instructions."* |
 * | an environment variable | none exists. No `FX_SYSTEM_PROMPT`, no instructions file override |
 * | the loopback MCP server's `instructions` | delivered and connected, and the model did not see it |
 * | `~/.fx/AGENTS.md` | global, so not per agent. Rejected on sight |
 *
 * The one channel that works is a file inside the AgentWorkspace, and it is refused twice over.
 * Ticket 14's reason first: an AgentWorkspace is a checkout of the user's repository and a file
 * left there can be committed home. And a second reason that is specific to this runtime and
 * worse — **the repository may already have an `AGENTS.md`**, which is the user's own file with
 * the user's own content, and which fx reads because it is meant to. Writing a persona there
 * destroys it.
 *
 * So on fx the persona **rides the prompt**, which is what ticket 01 named as the fallback and
 * as a degradation. Three things make it a tolerable one rather than a shrug:
 *
 * 1. **It is sent on every turn**, not only the first. That is the same shape as
 *    `composeLeadBrief`, which is composed fresh on every turn the lead holds, and it buys
 *    immunity to the thing a first-turn-only persona cannot survive: fx compacting its own
 *    history, which blobot neither controls nor observes.
 * 2. **It never enters the `messages` row.** The adapter adds this block at the wire, below
 *    everything core composed, so the transcript still shows what the user said and nothing
 *    the user did not. Again `composeLeadBrief`'s rule, for the same reason.
 * 3. **It is a separate content block**, not glued to the front of the user's sentence, so a
 *    model reading the turn sees standing instructions and a request rather than one run-on
 *    prompt.
 *
 * The price is paid honestly and stated rather than hidden: the persona's tokens are spent once
 * per turn for the life of the session. On a long conversation that is real money, and it is
 * the cost of a runtime that will not take standing instructions any other way.
 */

/** What a turn on fx carries above the user's own words. Empty persona, no block. */
export function fxPersonaBlocks(persona: string | undefined): readonly unknown[] {
  if (persona === undefined || persona.trim() === '') return [];
  return [{ type: 'text', text: `${PERSONA_HEADER}\n\n${persona}` }];
}

/**
 * The frame around it, so the model can tell standing instructions from this turn's request.
 *
 * fx's own system prompt already says *"Direct user instructions take precedence over project
 * instructions"* and treats assistant text, tool output and repository content as untrusted.
 * This block is none of those — it is the client's own framing of who the agent is — and it
 * says so plainly rather than impersonating a system prompt it cannot reach.
 */
const PERSONA_HEADER =
  'Standing instructions from blobot, which is running you as a member of a team. These apply ' +
  'to every turn in this session, not only this one. The request that follows them is the ' +
  'turn to act on.';
