Type: grilling
Status: resolved
Blocked by: 01

# What a thread strips, and what its persona is

## Question

The author's constraint is *"there should not be context of a team for the agent, no members, no
lead"*. Four things arrive by default in an ordinary Agent's turn and are false in a thread; the
grilling agreed to strip all four, and this ticket is where each is actually traced to its code
and the seam is chosen.

- **The roster line and `composeLeadBrief`.** The lead brief *is* the live status fold and is
  composed fresh on every turn the lead holds. A one-member team makes its member the lead by
  construction, so a thread would tell an agent it leads a team of one and list its own status
  back to it. The persona's roster line has the same problem.
- **The `message_agent` tool.** The loopback MCP server, its per-agent bearer token, and
  `orchestrator/bounds.ts`'s wake batching all exist to carry mail between members. Whether the
  tool is unregistered, registered and refusing, or left alone because a tool with no valid
  recipient is harmless — and what the agent is told, since a runtime that advertises a tool it
  cannot use is the *"blobot tells it in words that it has none"* problem the Codex adapter
  already solved once.
- **The `@mention` composer.** Addressing with no one to address.
- **The fan-out cost line** under the composer, which prices a message going to N members.

And two the grilling deliberately **kept**, which need their reasons written onto the ticket
rather than assumed: the **Handbook**, on the grounds that it is what this agent knows about
*your* work with them and says nothing about members; and **Routines**, keyed `<team>/<agent>`
and therefore already legal here, a scheduled daily briefing from one agent being the most
obvious thing a thread is for.

The test for each: does the surface make a claim about *members*? If yes it goes. If it makes a
claim about the work, it stays.

## Answer

Decided with the author, 2026-09-06. The test held: a surface that makes a claim about *members*
goes, one that makes a claim about the work stays.

**`message_agent` is not advertised.** Absent, not refusing: `peer-message-server.ts:459` already
makes `propose_routine` and `record_entry` conditional on a handler being supplied, and
`message_agent` becomes the third. Its own comment carries the reason it matters — *its size is
context*, sent to every agent on every turn — and Codex already taught the alternative's cost: a
runtime that advertises a capability the situation cannot honour produces an agent that tries it,
and that adapter had to spend a paragraph telling Codex in words that it had no subagents.

**The persona names no team.** `composePersona` on a branch, not a second function: the opening
becomes *working directly with the operator* rather than *on the team "X"* — X being `01`'s
disambiguated string that nobody has ever seen — and the teammates line and the three teammate
bullets go with it. The workspace lines, the Routine bullet, the house style, the verbosity, the
Handbook fold and the standing instructions all stay, which is why it is a branch: a
`composeThreadPersona` would be four things to keep in sync for one differing paragraph. The
empty-roster branch that exists today is not reusable here, and its wording is why —
*"You have no teammates on this team yet"* promises teammates that cannot arrive, which is the
*lies by arrangement* failure this repo has now written down three times.

**The lead brief never composes in a thread**, nor does `composeWakePrompt`'s roster line.
`lead_agent_id` still points at the one member, because an unaddressed prompt has to route and a
NULL lead is a real state that disables send until an `@mention` resolves — which in a thread
would be a composer that never enables. So the designation stays and everything the word implies
is suppressed: without this the agent would be told it leads a team, read its own status back off
the roster, and be instructed to hand work over with a tool it does not have.

**The composer loses the `@mention` menu and the fan-out cost line**, both being counts of members.

**The Handbook stays**, the same per-Agent object, with copy that says the work rather than the
team. Making it the *profile's* was considered and refused outright: that is durable state on an
AgentProfile, which is ADR-0001's line and this map's out-of-scope list. A thread's Handbook is
what this agent knows about the work you do with it directly, which is a per-Agent fact exactly
like every other Handbook. **Routines stay** for the same reason, keyed `<team>/<agent>` and
already legal here, a scheduled briefing from one agent being the most obvious thing a thread is
for.
