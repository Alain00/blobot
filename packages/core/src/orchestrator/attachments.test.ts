import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import type { AgentRuntime, AttachmentSupport } from '../runtime.js';
import type { Agent, AttachmentContent, Team } from './domain.js';
import { InMemoryMessageStore } from './message-store.js';
import { Orchestrator } from './orchestrator.js';

const team: Team = {
  id: 'team_1',
  name: 'demo',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};
const alice: Agent = {
  id: 'agent_alice',
  teamId: team.id,
  name: 'Alice',
  role: 'frontend',
  workspacePath: '/agents/alice',
};
const bob: Agent = {
  id: 'agent_bob',
  teamId: team.id,
  name: 'Bob',
  role: 'reviewer',
  workspacePath: '/agents/bob',
};

const png: AttachmentContent = {
  id: 'att_1',
  kind: 'image',
  mimeType: 'image/png',
  bytes: 4,
  data: new Uint8Array([1, 2, 3, 4]),
  at: 0,
};

async function harness(accepts: Record<string, AttachmentSupport> = {}) {
  const clock = new VirtualClock();
  const store = new InMemoryMessageStore();
  const runtimes = new Map<string, AgentRuntime>();
  const mocks = new Map<string, MockAgentRuntime>();
  for (const agent of [alice, bob]) {
    const runtime = new MockAgentRuntime({
      agentId: agent.id,
      clock,
      startupMs: 0,
      script: scenario('quiet').say('ok').end(),
      ...(accepts[agent.id] === undefined ? {} : { accepts: accepts[agent.id] }),
    });
    runtimes.set(agent.id, runtime);
    mocks.set(agent.id, runtime);
  }
  const orchestrator = new Orchestrator({ team, agents: [alice, bob], runtimes, store, clock });
  const starting = orchestrator.start();
  await clock.runAll();
  await starting;
  return { orchestrator, clock, store, mocks };
}

describe('an attachment on the user’s prompt', () => {
  it('reaches the runtime as bytes, and the transcript as a record', async () => {
    const h = await harness();
    h.store.putAttachment(png);

    const done = h.orchestrator.promptFromUser([alice.id], 'what is wrong here?', [png.id]);
    await h.clock.runAll();
    await done;

    // The bytes travel. A path would not: see ADR-0004.
    const [prompt] = h.mocks.get(alice.id)?.prompts ?? [];
    expect(prompt?.attachments).toHaveLength(1);
    expect(prompt?.attachments?.[0]?.data).toEqual(png.data);

    // The row carries the record and never the bytes, so a snapshot of two hundred messages
    // does not carry two hundred images.
    const [message] = h.store.forAgent(alice.id);
    expect(message?.attachments).toEqual([
      { id: 'att_1', kind: 'image', mimeType: 'image/png', bytes: 4 },
    ]);
  });

  it('goes to everybody the user addressed, from one stored copy', async () => {
    const h = await harness();
    h.store.putAttachment(png);

    const done = h.orchestrator.promptFromUser([alice.id, bob.id], 'look at this', [png.id]);
    await h.clock.runAll();
    await done;

    for (const agent of [alice, bob]) {
      expect(h.mocks.get(agent.id)?.prompts[0]?.attachments).toHaveLength(1);
      expect(h.store.forAgent(agent.id)[0]?.attachments).toHaveLength(1);
    }
    // One thing typed once is one blob, whatever the fan-out cost in context.
    expect(h.store.attachment(png.id)).toBeDefined();
  });

  it('is refused for the whole fan-out when one runtime will not take it', async () => {
    const h = await harness({ [bob.id]: { images: false, textFiles: true } });
    h.store.putAttachment(png);

    await expect(
      h.orchestrator.promptFromUser([alice.id, bob.id], 'look at this', [png.id]),
    ).rejects.toThrow(/Bob runs on a runtime that does not take images/);

    // Not delivered to two of three: blobot never narrows a set the user typed, so nobody got
    // it and no row was written.
    expect(h.mocks.get(alice.id)?.prompts).toHaveLength(0);
    expect(h.store.forAgent(alice.id)).toHaveLength(0);
  });

  it('counts what it has sent into a session, cumulatively', async () => {
    const h = await harness();
    h.store.putAttachment(png);
    h.store.putAttachment({ ...png, id: 'att_2', bytes: 10 });

    for (const ids of [[png.id], ['att_2']]) {
      const done = h.orchestrator.promptFromUser([alice.id], 'again', ids);
      await h.clock.runAll();
      await done;
    }

    // Cumulative, because an embedded image stays in the session's history for the life of the
    // session. Every other figure under the gauge is per-turn.
    expect(h.orchestrator.injectionOf(alice.id)).toMatchObject({
      attachmentCount: 2,
      attachmentBytes: 14,
    });
  });
});
