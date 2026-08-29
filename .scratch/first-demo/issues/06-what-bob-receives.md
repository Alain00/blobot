Type: grilling
Status: open
Blocked by: 05

# What Bob actually receives

## Question

The rule is compact context: never copy Alice's conversation into Bob's. So what *is* in the
prompt Bob wakes up to?

Decide the payload: who is asking, their role, the message, the team and repository, Bob's
own worktree path, and how much history (none? the last exchange? a summary?). Decide what
happens on the second and third message in a thread — does Bob accumulate a conversation
with Alice, and if so where does it live relative to his own session.

The failure mode to design against is Bob answering well the first time and incoherently the
third because he has no idea what he already said.
