Type: grilling
Status: open

# Trust, approval, and a sandbox the other runtimes do not have

## Problem

`core/trust.ts` has three words -- `careful`, `normal`, `trusting` -- and each adapter translates
them from the opposite end. Claude's translation is an allowlist of tools and `Bash(<prefix>:*)`
rules. OpenCode's is a permission block in its config. Codex has **two axes and a real sandbox**,
which is a different kind of thing:

| Axis | Values |
| --- | --- |
| `approval_policy` | `untrusted`, `on-request`, `never`, or a granular table |
| `sandbox_mode` | `read-only`, `workspace-write`, `danger-full-access` |

The bridge collapses both into three mode ids over ACP: `read-only`, `agent`,
`agent-full-access`, with `INITIAL_AGENT_MODE` choosing the first one.

The trap is that these look like blobot's three words and are not. blobot's words say **how much
of the agent's work blobot vouches for** at the prompt. Codex's sandbox says **what the operating
system will permit**, which is a stronger and different claim. Mapping one onto the other by
position gives two bad answers:

- `careful` to `read-only` produces an agent that cannot edit a file in its own worktree. That is
  not a careful agent, it is a broken one, and blobot would have shipped a trust level that
  cannot do the job the product exists for.
- `trusting` to `agent-full-access` is `danger-full-access`, which is `bypassPermissions` with a
  different spelling. Ticket 14 refuses it, and its 2026-08-30 amendment says why: `trusting` is
  the ceiling and the step above it is not offered.

There is also a real asymmetry worth naming rather than smoothing over. `sandbox_workspace_write`
takes `writable_roots` and `network_access`, so `workspace-write` scoped to the AgentWorkspace is
a **better** enforcement of ticket 10's isolation than either other runtime can offer: not a
promise that the agent stays in its worktree, but a kernel that will not let it leave. That is an
argument for using the sandbox, not against it. It is not an argument for exposing it as a trust
level.

## What to do

Grill it and write the mapping down, with the reason beside it, in an `adapters/codex/permissions.ts`
that is the counterpart to `adapters/claude/permissions.ts`.

The expected answer, to be argued with:

- **`sandbox_mode` is not a trust level. It is a constant.** `workspace-write`, with
  `writable_roots` set to the AgentWorkspace and `network_access` decided once, on every agent at
  every trust level. It implements ticket 10, not ticket 14.
- **`approval_policy` is the trust level**, because it is the axis that is actually about asking.
  Map the three words onto `untrusted` / `on-request` / the granular table, and keep the closed
  list that asks at every level -- `rm`, `sudo`, `chmod`, `chown`, `ssh`, `scp`, `docker`,
  `git push`, `git remote` -- expressible in whatever Codex's granular rules can say. If they
  cannot say it, that is a finding and this ticket says so rather than quietly dropping the list.
- **`never` is not offered**, at any level, for the same reason `bypassPermissions` is not.

Then decide what the picker shows. Codex advertises approval and sandbox as config options
alongside model, effort and fast mode. ADR-0002's rule is that blobot subtracts the options it
decides itself, so approval and sandbox come out and the other three stay. A user who could pick
`agent-full-access` from a dropdown would have gone around ticket 14 without ever seeing the word.

One thing to verify while there: whether the posture can travel through `CODEX_CONFIG` (ticket 01,
step 3) or whether it needs `INITIAL_AGENT_MODE` plus `session/set_mode`. Both are per process,
so either is acceptable; which one it is decides where the code goes.
