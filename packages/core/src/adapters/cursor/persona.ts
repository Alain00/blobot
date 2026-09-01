/**
 * The persona on Cursor, which measured out with no channel blobot may use.
 *
 * The candidates and how each died (tickets 01 and 08, 2026-08-31):
 *
 * | candidate | result |
 * | --- | --- |
 * | `rules/*.mdc` in `CURSOR_CONFIG_DIR` | **not read.** An `alwaysApply` rule there never reached the model — the PR's mechanism, measured dead |
 * | `AGENTS.md` in the workspace root | read, and refused: an AgentWorkspace is a checkout of the user's repository, the file can be committed home, and the repository may already have one with the user's own content |
 * | project `.cursor/rules/` | inside the same checkout; same refusal |
 * | user-level rules / account User Rules | one surface for every agent at once, and the user's own (ticket 07 leaves them loaded, untouched) |
 *
 * So the persona **rides the prompt, every turn** — fx's answer and `composeLeadBrief`'s
 * shape: a separate content block above the user's words, never in the `messages` row,
 * recomposed each turn, immune to a compaction blobot cannot see. One consequence ticket 08
 * holds: the account-level User Rules also ride into the session, so the persona coexists
 * with them rather than replacing them — what a person wrote outranks what blobot composed,
 * the same precedence picture as everywhere else.
 */

/** What a turn on Cursor carries above the user's own words. Empty persona, no block. */
export function cursorPersonaBlocks(persona: string | undefined): readonly unknown[] {
  if (persona === undefined || persona.trim() === '') return [];
  return [{ type: 'text', text: `${PERSONA_HEADER}\n\n${persona}` }];
}

/**
 * The frame around it, so the model can tell standing instructions from this turn's request.
 * The client's own framing of who the agent is, said plainly rather than impersonating a
 * system prompt it cannot reach.
 */
const PERSONA_HEADER =
  'Standing instructions from blobot, which is running you as a member of a team. These apply ' +
  'to every turn in this session, not only this one. The request that follows them is the ' +
  'turn to act on.';
