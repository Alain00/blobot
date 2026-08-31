Type: grilling
Status: open
Blocked by: 02

# What a sandbox lets blobot say

## Question

Everything the app tells the user is built to be true under *prompting only*. A sandbox changes
what is true, so it changes the copy, and the copy is the part this repo has got wrong twice
already.

The creation flow's disclosure ends: **blobot is not a sandbox.** If one ships, that sentence is
either false or is the most important sentence in the product, and which one it is depends on
answers that are not in yet.

## What to decide

- **The disclosure.** It has been rewritten twice for overstating — once for naming commands
  blobot could not name, once for promising freedom an agent did not have. A sandbox invites the
  third and worst version: overstating *protection*, which is the failure ticket 14 named first
  and the one users cannot detect. srt says of itself that domain filtering does not inspect
  traffic, that a broad allow is an exfiltration route, and that it is not a boundary against
  inherited descriptors. Whatever is claimed has to survive being read next to that.
- **Whether the word appears at all.** *Sandbox* is a word users arrive with a definition for,
  and theirs is stronger than ours would be. Describing what it does — *this agent can only read
  its own copy and reach these hosts* — may be both truer and more useful than the noun.
- **What the permission block says when it is inside one.** Today it says blobot did not vouch
  for this and the agent is stopped. Inside a fence, some of what it would have asked about is
  now impossible rather than unvouched, and those are different events.
- **Whether a failed fence is a refusal to start.** Codex's `INITIAL_AGENT_MODE=read-only` is
  already asserted and **fatal if it cannot be confirmed**, because the bridge's default wrote to
  the user's home once. A sandbox that silently did not engage is the same defect and should
  probably take the same answer.

## The rule that decides most of it

Ticket 14: blobot claims the thing that is true on both runtimes. If the fence is real on Claude
and absent on OpenCode, the claim is still *prompting*, and the sandbox is an unadvertised
improvement rather than a feature. That is an unsatisfying answer and it may well be the right
one.
