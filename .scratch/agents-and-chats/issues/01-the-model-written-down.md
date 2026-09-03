Type: grilling
Status: open
Blocked by: none

# The model, written down and stress-tested: Agent, Chat, anchor

## Question

The charting session settled a new model (see *Settled while charting* on `map.md`). Nothing in
`CONTEXT.md` says it yet, and the code still says the opposite: `teams` owns `workspace_path`,
`agents` is a frozen copy of a profile plus a workspace, the Persona opens with a team name, the
Handbook lives at `<team>/<agent>`.

Does the settled model hold when pushed with concrete scenarios against the code, and what are
the exact words? Resolve by:

1. Reading `CONTEXT.md`, `docs/adr/0001` to `0003`, `packages/core/src/store/schema.ts`,
   `packages/core/src/orchestrator/envelope.ts` (`composePersona`) and the roster lookup in
   `@blobot/core/domain`.
2. Stress-testing with the author (grilling + domain-modeling): an Agent in three Chats at once,
   one of them a group; a generalist and an anchored Agent in one group; an Agent whose anchor
   folder was deleted outside blobot; deleting an Agent that is on a group chat someone else is
   mid-turn in; renaming a group chat when branches are `blobot/<chat>/<agent>`; the lead of a
   DM; what the roster lookup answers for a DM.
3. Writing the glossary: **Agent**, **Chat** (DM, group chat), **anchor**, **generalist**,
   **purpose**, **card**, the retirement of **Team** and **AgentProfile**, and what happens to
   **Agent** as the instantiated-on-a-team word (it may need a new name, since *Agent* is now
   the definition; candidates: **Member**, **Seat**). Update `CONTEXT.md` inline, including the
   *Avoid* list (*bot*, *team*, *artifact*).
4. Writing **ADR-0006** (the agent is the unit; a chat is where it works with you), since this
   is hard to reverse, surprising later, and a real trade-off against ADR-0001's grain. Amend
   ADR-0001 rather than superseding it: it was right and this extends it.

The answer is the glossary text and the ADR, plus the list of scenarios that made anything
change. Tickets 02 to 05 zoom on the parts that have mechanism behind them.
