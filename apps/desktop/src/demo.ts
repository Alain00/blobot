/**
 * A throwaway harness for watching `MockAgentRuntime` run: two agents, one peer message,
 * printed as they happen.
 *
 * It is deliberately *not* the orchestrator. The mailbox, the wake policy, the turn budget
 * and persistence belong to ticket 05 and ticket 13; what this file exists to show is that
 * the mock emits the event vocabulary and that a peer message reaches an injected handler.
 *
 *   pnpm demo
 */
import {
  MockAgentRuntime,
  SystemClock,
  scenarios,
  type AgentEvent,
  type PeerMessageAck,
  type PeerMessageCall,
} from '@blobot/core';

const clock = new SystemClock();
const started = clock.now();

function print(event: AgentEvent): void {
  const at = String(event.at - started).padStart(6, ' ');
  const who = event.agentId.padEnd(5, ' ');
  process.stdout.write(`${at}ms ${who} ${describe(event)}\n`);
}

function describe(event: AgentEvent): string {
  switch (event.type) {
    case 'agent_thought_delta':
      return `thought   ${JSON.stringify(event.text)}`;
    case 'agent_message_delta':
      return `delta     ${JSON.stringify(event.text)}`;
    case 'agent_message_completed':
      return `message   ${JSON.stringify(event.text)}`;
    case 'tool_call_started':
      return `tool      ${event.title} (${event.kind}) started`;
    case 'tool_call_updated':
      return `tool      ${event.toolCallId} ${event.status}${event.exit === null ? ' exit=null' : ''}${event.error === undefined ? '' : ` error=${event.error}`}`;
    case 'agent_message_sent':
      return `peer      → ${event.to}: ${event.message}`;
    case 'usage_updated':
      return `usage     ${event.used}/${event.size}`;
    case 'turn_ended':
      return `turn      ${event.turnId} ${event.stopReason}`;
    case 'error':
      return `error     ${event.message}`;
  }
}

const bob = new MockAgentRuntime({
  agentId: 'bob',
  clock,
  script: scenarios['bob-reviews'],
  peerMessageHandler: async (call: PeerMessageCall): Promise<PeerMessageAck> => {
    process.stdout.write(`       ${call.from} → ${call.agent}: ${call.message}\n`);
    return { delivered: true, recipient: call.agent, status: 'started' };
  },
});

const alice = new MockAgentRuntime({
  agentId: 'alice',
  clock,
  script: scenarios['alice-asks-bob'],
  // Stand-in for the orchestrator's tool handler: wake Bob, drain his turn, ack "started".
  peerMessageHandler: async (call: PeerMessageCall): Promise<PeerMessageAck> => {
    void (async () => {
      for await (const event of bob.sendPrompt({ text: call.message, from: 'peer' })) {
        print(event);
      }
    })();
    return { delivered: true, recipient: call.agent, status: 'started' };
  },
});

await alice.start();
await bob.start();

for await (const event of alice.sendPrompt({ text: 'Review the auth change with Bob.', from: 'user' })) {
  print(event);
}
