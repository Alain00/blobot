Type: grilling
Status: open

# The permission posture in an agent worktree

## Question

Surfaced by the OpenCode research: **default permissions auto-allow everything**, including
`bash` and `write`. Implementing `session/request_permission` buys nothing unless blobot
writes an `opencode.json` with `permission: ask` into each worktree.

An approvals *UI* is out of scope for this map, but the posture is not — worktrees are in
scope and they contain the user's real code, so on night one two agents will be running with
unrestricted shell and write access in a real repository.

Decide the demo's posture: what each runtime is configured to allow by default; whether
blobot writes runtime config into a worktree (and how that interacts with a repo that already
has an `opencode.json` the user owns); which operations are hard-blocked regardless of
runtime rather than merely prompted; and what the user is told about the trust boundary they
are accepting.

This is a decision about defaults and honesty, not an approvals feature. Do not let it grow
into one — that is the out-of-scope line.

## Corrections to this ticket's premise (from ticket 16)

Research since this ticket was written changes two of its assumptions:

- **`edit` gates `write`** — there is no separate `write` permission key.
- **`external_directory` already defaults to `ask`.** So the uncontrolled default surface is *not*
  access outside the worktree, as this ticket assumed. It is **bash, and edits inside the
  worktree**.
- Scalar `"permission": "ask"` is a trap — it makes `read` ask too, which would make every agent
  unusable.
- The mechanism is **`OPENCODE_CONFIG_CONTENT`** (inline JSON in an env var), not a file written
  into the workspace — so this ticket no longer shares a file write with ticket 16, and blobot
  writes nothing into the user's repo.
- `opencode debug agent <name>` prints the resolved permission list, which is the verification tool
  for whatever this ticket decides.
