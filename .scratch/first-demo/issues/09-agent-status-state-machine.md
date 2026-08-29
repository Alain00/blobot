Type: grilling
Status: open
Blocked by: 04

# The agent status state machine

## Question

The plan names seven statuses — idle, starting, thinking, working, waiting, failed, done —
but not the transitions, and not who owns them.

Decide the machine: which transitions are legal, which events drive each one, what
distinguishes `thinking` from `working` and `waiting` from `idle` in a way an adapter can
actually determine, whether `done` is an agent state at all or a property of a turn, and
what happens to status when the app is closed and reopened.

Status is what the UI renders and what makes two blobatars look alive, so a status the
adapter can only guess at is worse than one status fewer.
