Type: grilling
Status: open
Blocked by: 01, 02, 03

# How messageAgent reaches an agent

## Question

Given what the research established about client-exposed tools, decide the actual mechanism
by which Alice can call `messageAgent` and by which Bob is woken.

Covers: how the tool is declared to each runtime; how the orchestrator intercepts the call;
what Alice sees as the tool's *result* (an ack? a message id? nothing?) given that she does
not wait for Bob; how Bob's mailbox turns into a prompt when he is idle versus mid-turn; and
whether a reply is a new message or a threaded response.

Must work for both runtimes without the orchestrator knowing which is which.
