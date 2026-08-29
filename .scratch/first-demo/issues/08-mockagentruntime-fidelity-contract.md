Type: grilling
Status: open
Blocked by: 04

# MockAgentRuntime's fidelity contract

## Question

The mock exists so the UI can be finished for $0 — but a mock that is too kind produces a UI
that shatters on first contact with a real agent.

Decide exactly what it simulates and, more importantly, what it simulates *badly on purpose*:
streaming with realistic chunking and latency, tool calls, agent-to-agent messages, and the
ugly cases — a turn that errors halfway, a runtime that dies, a cancellation that arrives
late, an agent that takes ninety seconds to say anything.

Decide also how it is driven: scripted scenarios, deterministic seeds, or live control.
