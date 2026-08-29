Type: grilling
Status: open
Blocked by: 04, 06, 09, 10

# The SQLite schema for the demo

## Question

Fix the persisted shape for exactly the demo's scope: teams, agents, conversations, messages,
sessions, runtime config, and worktree references. No API keys, ever.

Decide the aggregate boundaries and the identity scheme; whether the event stream is
persisted or only its outcomes; how a message that crossed between agents is distinguished
from one a user sent; how runtime config is stored without becoming a credential store; and
the migration approach given the schema will churn hard for weeks.

Deliberately last: every earlier ticket changes what needs storing.
