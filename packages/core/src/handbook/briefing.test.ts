import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import type { Agent, Team } from '../orchestrator/domain.js';
import { InMemoryMessageStore } from '../orchestrator/message-store.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import type { AgentRuntime } from '../runtime.js';
import { BRIEFING_KNOCK } from './persona.js';

/**
 * *brief them*: the turn behind the notice card, and the one turn in the app a person starts
 * that carries none of their words.
 *
 * The rule it exists to keep is the author's own and it is binding: **there is no third party in
 * the room**. Nothing blobot composed may enter the conversation the user reads, so the knock
 * rides the wire and the first words on screen are the agent's. Ticket 02 measured why a
 * genuinely wordless turn is not available: fx refuses an empty prompt outright, before any
 * model call, and OpenCode fills the vacuum by inventing a task.
 */

const team: Team = {
  id: 'team_1',
  name: 'demo',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};
const mara: Agent = {
  id: 'agent_mara',
  teamId: team.id,
  name: 'Mara',
  role: 'writer',
  workspacePath: '/agents/mara',
};

async function harness() {
  const clock = new VirtualClock();
  const store = new InMemoryMessageStore();
  const runtimes = new Map<string, AgentRuntime>();
  const prompts: string[] = [];

  runtimes.set(
    mara.id,
    new MockAgentRuntime({
      agentId: mara.id,
      clock,
      startupMs: 0,
      script: (prompt) => {
        prompts.push(prompt.text);
        return scenario('opening').say('Hello. What is the work here?').end() as never;
      },
    }),
  );

  const orchestrator = new Orchestrator({ team, agents: [mara], runtimes, store, clock });
  const starting = orchestrator.start();
  await clock.runAll();
  await starting;

  return {
    orchestrator,
    store,
    prompts,
    async brief(): Promise<void> {
      const turn = orchestrator.promptForBriefing(mara.id);
      await clock.runAll();
      await orchestrator.settled();
      await turn;
    },
  };
}

describe('brief them', () => {
  it('puts the knock on the wire', async () => {
    const h = await harness();
    await h.brief();

    // A minimal instruction rather than nothing at all. It is only the knock on the door: the
    // persona's empty-state block is the mechanism, and it already knows what to do with a turn
    // that arrives carrying no work.
    expect(h.prompts).toHaveLength(1);
    expect(h.prompts[0]).toContain(BRIEFING_KNOCK);
  });

  it('writes no message row, so the transcript opens with the agent', async () => {
    const h = await harness();
    await h.brief();

    // The whole of *there is no third party in the room*. A row here would draw in the user's
    // voice as a sentence they never wrote, which is the version of this control the author
    // threw out.
    expect(h.store.forAgent(mara.id)).toEqual([]);
  });

  it('is a turn the agent answers in its own words', async () => {
    const h = await harness();
    await h.brief();

    expect(h.orchestrator.statusOf(mara.id)).toBe('idle');
  });

  it('does nothing while the agent is mid-turn', async () => {
    const h = await harness();
    // A session runs one turn at a time and there is no mailbox to fall back on: a knock is a
    // knock, and one that arrives while the agent is working is not a thing to deliver later.
    // The card the user pressed is still there and still true.
    const first = h.brief();
    const second = h.orchestrator.promptForBriefing(mara.id);
    await first;
    await second;

    expect(h.prompts).toHaveLength(1);
  });
});
