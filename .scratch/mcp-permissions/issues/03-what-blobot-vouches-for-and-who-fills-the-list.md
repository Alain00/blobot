Type: grilling
Status: open
Blocked by: 01

# What blobot vouches for on an MCP server, and who fills the list

## Question

Given a runtime that prompts (ticket 01 says which do), what is the unit blobot vouches for, and
how does the list get filled?

## The three shapes on the table

- **Per server.** One tick: vouch for everything on it. Cheapest, expressible on Claude today as
  the existing `mcp__<server>` rule with no new mechanism -- `preApprovedTools` already emits
  exactly that string. But it pre-approves `ads_create_campaign` alongside `ads_get_ad_accounts`,
  and the read/write split is the whole reason the user is annoyed rather than alarmed.
- **Per tool, authored up front.** The user names tools when configuring. Precise, and nobody
  will ever do it: the author's own meta-ads server has ~130 tools.
- **Per tool, learned by answering.** The list starts empty and grows when the user picks a third
  button on the permission block. This is the shape that fits how the annoyance is actually
  experienced -- you find out which tools you need by being asked -- and it is the one that
  **reopens `first-demo/14`**, which shipped saying *exactly* **Allow once** and **Reject**, with
  `allow_always` having no path to the UI.

## What to establish

- **Which shape, and the reopen written honestly if it is the third.** `CLAUDE.md`: *"If you
  believe one is wrong, say so and reopen its ticket. Do not quietly contradict it."* An
  amendment on `first-demo/14` with the argument on both sides, not an edit.
- **Whether `allow_always` is even the mechanism.** It need not be. blobot could answer
  `allow_once` itself on a call matching its own stored list -- which is precisely what
  `#isOwnMailboxCall` does today for the mailbox, on structure, in three adapters. Then
  `allow_always` never reaches the UI, `first-demo/14`'s sentence stays literally true, and the
  third button writes to **blobot's** list rather than to the runtime's. **This is probably the
  answer**: it keeps the decision inside blobot, survives a resume, is per agent like every other
  posture, and is uniform across runtimes in a way a per-runtime `allow_always` is not.
- **Where the list lives and when it takes effect.** Trust, model and effort ride the profile,
  are copied onto the Agent at team creation, and take at next start. An MCP vouch list answered
  by blobot mid-turn does **not** have to wait for a restart, which makes it the first posture
  that can change live. Decide whether that is a feature or an inconsistency.
- **What the read/write split is made of.** Not `annotations.readOnlyHint` -- `docs/adr/0003`
  refused exactly this class of input, a vendor asserting a property about its own surface. So
  either the user makes the split by answering, or blobot does not claim there is one.
- **Whether a trust level moves it.** `careful` vouching for nothing is consistent with
  `vouchedTools` returning `[]`. Whether `trusting` should pre-vouch anything on a server the
  user never answered for is a real question and the answer is probably no.

## Out of scope

A screen listing every agent's current permissions. `first-demo/14` and `sandboxing/spec.md` both
draw that line and it is not moved here.
