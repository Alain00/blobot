# Plan limits in the details popover

Raised 2026-09-11 from a screenshot of the details popover (`components/Details.tsx`), which
draws `CONTEXT` and nothing about the account: *"i want to see here the usage of runtimes that
provides that"*. Grilled the same day, sixteen questions, all settled. Glossary: **Plan limit**
and its **windows** in `CONTEXT.md`, with *usage* and *rate limit* under *Avoid*.

## What it is

A **Plan limit** is the vendor's metered allowance on the login behind an Agent: a five hour
window and a weekly one, each a utilization and a reset time. It is **not** the context gauge
(occupancy, per Agent) and **not** cost. `costUsd` stays carried and undrawn; ticket 05's
*"a billing decision nobody has made"* is not reopened by this.

It is a **reading and nothing else**, the gauge's own register (DESIGN.md: *it does not
advise*). No threshold, no warning state, no colour, no motion on update, no sound. A limit that
actually blocks a turn already says so in the transcript as a failed turn, which is where an
action is taken.

## What the runtimes send (measured, not assumed)

| Runtime  | Plan limits on the wire | Where |
| -------- | ----------------------- | ----- |
| Claude   | **Yes, dropped today.** Roughly once per turn, on an ordinary `usage_update` that also carries `used`/`size`: `_meta["_claude/rateLimit"].unifiedWindows = { five_hour: {utilization: 0.41, resetsAt: 1788021600}, seven_day: {utilization: 0.14, resetsAt: 1788242400} }`, plus `status`, `overageStatus`, `isUsingOverage`, `overageDisabledReason`. | `first-demo/research/15-transcripts/cc1.jsonl:24` (and cc3, cc4, cc5); bridge `acp-agent.js:3335-3346` |
| Codex    | **Held by the bridge, never forwarded.** codex-acp receives `account/rateLimits/updated`, stores it and returns `null`; it surfaces only as prose in its own `/status` reply. | `codex-acp dist/index.js:24380-24382`, `:30040-30130` |
| OpenCode | No. `cost` is always 0. | `agent-media/research/transcripts/opencode-*.jsonl:77` |
| fx       | No. Money appears only as a failed turn, `insufficient_funds`. | `fx-runtime/issues/04` |
| Cursor   | Unmeasured; nothing in the adapter. | |

`adapters/acp/session-updates.ts:119-129` translates `usage_update` and never reads `_meta`.

## Decisions

1. **Plan limits, as a reading.** Not spend, not a token breakdown. (Q1, Q2)
2. **Named Plan limit, made of windows.** *Usage* stays the context gauge's word. (Q3)
3. **Claude only for now.** Codex is not parsed out of `/status` prose: guessing at a vendor's
   wording is what was refused for fx's diagnostics. It joins when codex-acp forwards
   `account/rateLimits`; the request is drafted in `codex-acp-upstream-request.md` and **not
   filed** without the author. A runtime that sends nothing has no row, never an empty one. (Q4)
4. **A `PLAN LIMITS` block under `CONTEXT` in the same popover.** Absent when it has no rows. (Q5)
5. **The rows follow CONTEXT.** One row per login behind an agent CONTEXT is currently listing:
   in an agent's pane, that agent's login; in the team pane, every distinct login behind the
   members. (Q13)
6. **A login on this computer is one row for all its Agents**, labelled by the runtime's display
   name (`claude`), **with no face**, because no Agent owns it. It is filled from the **freshest
   reading anywhere in the app**, since a reading taken on team A is equally true on team B. (Q5,
   Q14)
7. **A sandbox login is that Agent's**, because the vendor CLI stores its login in that Agent's
   guest home (`docs/machines.md:31`), so its row carries **the Agent's face and name** and is
   filled only from that Agent's own readings, never across teams. Two sandboxed Agents signed
   into one account draw the same figures twice: **accepted, not solved**, because telling them
   apart means reading the account identity, which `first-demo/research/11` says to discard. No
   suffixes on either kind: a face means *this Agent's login*, no face means *shared*. (Q9, Q14)
8. **Order**: shared logins first, then sandboxed Agents in roster order. A shared row belongs
   to no single place in the roster. (Q15)
9. **Layout**: a head line per login, then one line per window, in CONTEXT's columns. (Q8)
   ```
   PLAN LIMITS
   claude
     5h      41%   resets 14:00
     week    14%   resets Fri 09:00
   ◐ Antonio2
     5h       8%   resets 16:00
   ```
10. **Only the two windows.** Utilization and reset time. No plan name, no overage, no
    `allowed_warning` (that is advice), no `rejected` (that is a failed turn). (Q7)
11. **A closed window vocabulary.** blobot's event describes a window **by its duration in
    minutes** (300, 10,080), never by a vendor key, so Codex's `windowDurationMins` fits later
    with no new type. The adapter maps the keys it knows (`five_hour`, `seven_day`); any other
    window is dropped, the way the `/` palette fails closed. Adding one is a one-line change in
    the adapter. No `+1 window not shown` line: that would be advice. (Q16)
12. **Absolute times.** `resets 14:00` today, `resets Fri 09:00` on a later day. Nothing
    relative, because a relative time is a moving thing in a popover. (Q10)
13. **A reading past its reset has no figure.** Once `resetsAt` is behind the clock the line
    reads `reset 14:00` with no percent: we know it reset and do not know the new figure. Never a
    number known to be false. (Q6)
14. **In memory only, never persisted.** After a restart the row is absent until a turn sends a
    reading, which is the honest state. Not in `SqliteRecorder`'s durable subset. (Q6)
15. **Demo mode sends it.** Every mock scenario carries a reading, so the block draws in demo mode
    and in `--screen=details` screenshots; one trap carries a five hour window already past its
    reset. The reading rides the same update as the context reading and must not disturb the
    gauge. (Q11)

No ADR: easy to reverse, and unsurprising with this file beside it.
