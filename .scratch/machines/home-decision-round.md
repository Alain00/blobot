# What lives in an agent's home — focused proposal

Owner: [What lives in an agent's home, and what map.md may say](issues/06-what-lives-in-an-agents-home.md).
Prepared after the completed boundary ticket, commit `2e779ec`.
**Accepted by Guillermo with “ok”, 2026-09-06.** The question below is the accepted proposal,
not a pending approval. Implementation and validation continue on the owning ticket.

## Proposed product boundary

Start with a profile overview, not a shared writable directory. It says which active teams the
profile belongs to, its declared role in each, and the names/roles of its teammates. These are
membership facts already owned by blobot. It supplies no host paths, inferred project
descriptions, conversations, Handbooks, handoffs, diffs or files from another team's work.
Knowing that another team exists grants no new execution or messaging authority.

For example, Mara can know that she belongs to “Website” as frontend and “API” as reviewer,
and who is on each team. Her current session still belongs to one team. The overview does not
bring the other team's conversation or working folder into it. On local execution, withholding
paths is not an OS read fence and must not be described as one.

The app composes a bounded, current overview at the start of each turn from its existing
profile/membership records. It is supplied as context on either Machine kind, never mounted
into a box or written as `map.md` in a checkout. Existing standing instructions stay in the
profile editor. No new agent tool is offered to rewrite its profile or a shared personal
memory; existing team Handbook tools keep their current scope. A physical home file and broader
shared memory would require an explicit separate product choice.

This is the smallest implementation of the author's proposed map: membership awareness plus
the existing profile definition, without a second persistent copy of the index. The later
profile-conversation ticket still decides what a direct message can do; this proposal does not
remove that requested conversation or silently grant cross-team actions.

## Facts already checked

- `AgentProfile` already owns standing instructions; `Agent.profileId` identifies each team
  membership. `SqliteStore.membershipsOf` reads non-deleted memberships. A projection must
  additionally exclude deleted teams and avoid reaching for paths or message/Handbook rows.
- `composePersona` runs at session start; the orchestrator's `composeLeadBrief` demonstrates
  an independent, per-turn context input. Core can receive a provider-agnostic lookup rather
  than depend on SQLite or Electron. The exact bounded format and invalidation are delegated
  engineering details once the information boundary is accepted.
- The supposed outstanding handoff conflict is already settled: the September 5 amendment
  to [What a Machine is, and what grain it hangs at](issues/01-what-a-machine-is.md) struck
  archived handoffs from the profile-home list. They remain scoped to the team/agent pair.
  Do not ask the author to decide that again or reopen it unnecessarily.

## Question

Does the author accept this minimum profile home: an app-maintained membership overview
supplied as context, with the contents/scope above, without a physical shared `map.md` or new
agent-authored personal memory? Recommendation: yes. This is a real cross-team information
choice, so await the author rather than treating it as a storage refactor.
