import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime, type ScenarioScript } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import type { Agent, Team } from '../orchestrator/domain.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { InMemoryMessageStore } from '../orchestrator/message-store.js';
import { composeProfileOverview, PROFILE_OVERVIEW_LIMITS } from '../orchestrator/profile-overview.js';
import type { HandoffRecord } from '../orchestrator/compaction.js';
import type { Prompt } from '../runtime.js';
import { openDatabase, type OpenedDatabase } from './database.js';
import { SqliteStore } from './sqlite-store.js';

const website: Team = {
  id: 'website', name: 'Website', workspacePath: '/PRIVATE/website',
  workspaceKind: 'git', turnBudget: 10,
};
const api: Team = { ...website, id: 'api', name: 'API', workspacePath: '/PRIVATE/api' };
const alice: Agent = {
  id: 'alice-web', profileId: 'alice', teamId: website.id, name: 'Alice',
  role: 'frontend', workspacePath: '/PRIVATE/alice', instructions: 'PRIVATE instructions',
};
const bob: Agent = { id: 'bob', teamId: website.id, name: 'Bob', role: 'reviewer', workspacePath: '/PRIVATE/bob' };
let opened: OpenedDatabase;
let store: SqliteStore;

beforeEach(() => {
  opened = openDatabase({ path: ':memory:' });
  store = new SqliteStore(opened.db);
  store.createProfile({ id: 'alice', name: 'Alice', role: 'frontend', runtimeId: 'mock', createdAt: 0 });
  for (const team of [website, api]) store.createTeam({ ...team, createdAt: 0 });
  for (const agent of [alice, bob, { ...alice, id: 'alice-api', teamId: api.id, role: 'architect' }]) {
    store.createAgent({ ...agent, runtimeId: 'mock', createdAt: 0 });
  }
  store.commit({ id: 'private-message', teamId: api.id, fromAgentId: null, toAgentId: 'alice-api', body: 'PRIVATE conversation', at: 0 });
  store.recordHandbookEntries([{
    id: 'private-entry', teamId: api.id, agentName: 'Alice', text: 'PRIVATE handbook',
    source: 'told', createdAt: 0,
  }]);
});
afterEach(() => opened.close());

describe('profile overview source', () => {
  it('selects membership facts without exposing work fields or unrelated teams', () => {
    store.createTeam({ ...website, id: 'secret', name: 'PRIVATE unrelated team', createdAt: 0 });
    expect(store.profileOverviewOf('alice')).toEqual({
      teams: [
        { name: 'API', role: 'architect', teammates: [], omittedTeammates: 0 },
        { name: 'Website', role: 'frontend', teammates: [{ name: 'Bob', role: 'reviewer' }], omittedTeammates: 0 },
      ], omittedTeams: 0,
    });
    expect(JSON.stringify(store.profileOverviewOf('alice'))).not.toContain('PRIVATE');
    expect(store.profileOverviewOf('unknown')).toEqual({ teams: [], omittedTeams: 0 });
  });

  it('reflects changes and deletions while retirement leaves active memberships intact', () => {
    store.restateAgent('alice-api', { role: 'maintainer' });
    store.tombstoneAgent(bob.id, 1);
    store.tombstoneProfile('alice', 1);
    expect(store.profileOverviewOf('alice').teams).toEqual([
      { name: 'API', role: 'maintainer', teammates: [], omittedTeammates: 0 },
      { name: 'Website', role: 'frontend', teammates: [], omittedTeammates: 0 },
    ]);
    // A team can be tombstoned while membership rows remain for historical references.
    store.tombstoneTeam(api.id, 2);
    expect(store.profileOverviewOf('alice').teams.map((team) => team.name)).toEqual(['Website']);
    store.tombstoneAgent(alice.id, 3);
    expect(store.profileOverviewOf('alice')).toEqual({ teams: [], omittedTeams: 0 });
  });

  it('bounds rows and columns at the database boundary and counts omissions', () => {
    for (let n = 0; n < 20; n += 1) {
      const id = `extra-${n}`;
      store.createTeam({ ...website, id, name: id + 't'.repeat(1000), createdAt: 1 });
      store.createAgent({ ...alice, id, teamId: id, role: 'r'.repeat(10_000), runtimeId: 'mock', createdAt: 1 });
      store.createAgent({ ...bob, id: `peer-${n}`, name: `Peer-${n}`, teamId: api.id, runtimeId: 'mock', role: 'r'.repeat(10_000), createdAt: 1 });
    }
    const result = store.profileOverviewOf('alice');
    expect(result.teams).toHaveLength(PROFILE_OVERVIEW_LIMITS.teams);
    expect(result.omittedTeams).toBe(22 - result.teams.length);
    expect(result.teams[0]?.teammates).toHaveLength(PROFILE_OVERVIEW_LIMITS.teammates);
    expect(result.teams[0]?.omittedTeammates).toBe(20 - PROFILE_OVERVIEW_LIMITS.teammates);
    for (const team of result.teams) {
      expect(team.name.length).toBeLessThanOrEqual(PROFILE_OVERVIEW_LIMITS.name + 1);
      expect(team.role.length).toBeLessThanOrEqual(PROFILE_OVERVIEW_LIMITS.role + 1);
    }
  });
});

async function running(options: { agent?: Agent; script?: ScenarioScript; lead?: boolean } = {}) {
  const clock = new VirtualClock();
  const prompts: Prompt[] = [];
  const messages = new InMemoryMessageStore();
  const archived: HandoffRecord[] = [];
  const agent = options.agent ?? alice;
  const runtime = new MockAgentRuntime({
    agentId: agent.id, clock, startupMs: 0,
    script: (prompt, turn) => {
      prompts.push(prompt);
      const script = options.script;
      return typeof script === 'function' ? script(prompt, turn) : scenario('reply').say('ok').end();
    },
  });
  const orchestrator = new Orchestrator({
    team: { ...website, ...(options.lead ? { leadAgentId: agent.id } : {}) },
    agents: [agent, bob], runtimes: new Map([[agent.id, runtime]]),
    store: messages, profileOverviews: store, clock,
    handoffs: { async write(record) { archived.push(record); return undefined; } },
  });
  const start = orchestrator.start();
  await clock.runAll();
  await start;
  return {
    orchestrator, clock, prompts, messages, archived,
    async finish(done: Promise<unknown>) {
      await clock.runAll();
      await orchestrator.settled();
      await done;
    },
  };
}

describe('profile overview delivery', () => {
  it('refreshes each direct turn, preserves the lead brief and never stores injected text', async () => {
    const h = await running({ lead: true });
    await h.finish(h.orchestrator.promptFromUser([alice.id], 'first'));
    expect(h.prompts[0]?.text).toContain('You lead');
    expect(h.prompts[0]?.text).toContain('"team":"API"');
    const firstInjection = h.orchestrator.injectionOf(alice.id).lastWakeChars;
    expect(firstInjection).toBeGreaterThan(composeProfileOverview(store.profileOverviewOf('alice')).length);
    store.tombstoneTeam(api.id, 1);
    await h.finish(h.orchestrator.promptFromUser([alice.id], 'second'));
    expect(h.prompts[1]?.text).not.toContain('"team":"API"');
    expect(h.prompts[1]?.text.match(/Profile overview/g)).toHaveLength(1);
    expect(h.orchestrator.injectionOf(alice.id).lastWakeChars).toBeLessThan(firstInjection);
    expect(h.messages.forAgent(alice.id).map((message) => message.body)).toEqual(['first', 'second']);
    h.orchestrator.dispose();
  });

  it('reads queued user and peer mail at delivery and clears injection counts on the next direct turn', async () => {
    const h = await running({ script: () => scenario('held').wait(100).say('ok').end() });
    const first = h.orchestrator.promptFromUser([alice.id], 'working');
    await h.orchestrator.promptFromUser([alice.id], 'queued user');
    await h.orchestrator.handleMessageAgent({ from: bob.id, agent: alice.name, message: 'queued peer', idempotencyKey: 'peer' });
    store.restateAgent('alice-api', { role: 'maintainer' });
    store.tombstoneAgent(bob.id, 1);
    await h.finish(first);
    expect(h.prompts).toHaveLength(3);
    expect(h.prompts[0]?.text).toContain('architect');
    expect(h.prompts[1]?.text).toContain('maintainer');
    expect(h.prompts[1]?.text).toContain('queued user');
    expect(h.prompts[2]?.text).toContain('queued peer');
    expect(h.prompts[2]?.text).toContain('maintainer');
    expect(h.prompts[1]?.text).toContain('"teammates":[]');
    expect(h.orchestrator.injectionOf(alice.id).lastWakeChars).toBe(h.prompts[2]?.text.length);
    expect(h.orchestrator.injectionOf(alice.id).lastWakeMessages).toBe(1);
    await h.finish(h.orchestrator.promptFromUser([alice.id], 'next'));
    expect(h.orchestrator.injectionOf(alice.id).lastWakeChars)
      .toBe(composeProfileOverview(store.profileOverviewOf('alice')).length + 2);
    expect(h.orchestrator.injectionOf(alice.id).lastWakeMessages).toBe(0);
    h.orchestrator.dispose();
  });

  it('refreshes both compaction turns, without appending the overview to the archived handoff', async () => {
    const h = await running({ script: (_prompt, turn) => {
      if (turn === 0) {
        store.restateAgent('alice-api', { role: 'handoff-role' });
        return scenario('full').say('done').usage(190_000, 200_000).end();
      }
      if (turn === 1) {
        store.tombstoneTeam(api.id, 2);
        return scenario('handoff').say('Continue this team work.').end();
      }
      return scenario('resume').say('ready').end();
    } });
    await h.finish(h.orchestrator.promptFromUser([alice.id], 'work'));
    expect(h.prompts).toHaveLength(3);
    expect(h.prompts[0]?.text).toContain('architect');
    expect(h.prompts[1]?.text).toContain('handoff-role');
    expect(h.prompts[2]?.text).not.toContain('"team":"API"');
    for (const prompt of h.prompts) expect(prompt.text.match(/Profile overview/g)).toHaveLength(1);
    expect(h.archived[0]?.handoff).toBe('Continue this team work.');
    expect(h.orchestrator.injectionOf(alice.id).lastWakeChars).toBe(h.prompts[2]?.text.length);
    h.orchestrator.dispose();
  });

  it('supplies current metadata on routine and briefing turns while preserving user attachments', async () => {
    const h = await running();
    await h.finish(h.orchestrator.promptFromRoutine(alice.id, 'routine', { runId: 'run', permissionExpiryMs: 1_000 }));
    store.restateAgent('alice-api', { role: 'briefing-role' });
    await h.finish(h.orchestrator.promptForBriefing(alice.id));
    expect(h.prompts[0]?.text).toContain('architect');
    expect(h.prompts[1]?.text).toContain('briefing-role');
    expect(h.prompts[1]?.text.match(/Profile overview/g)).toHaveLength(1);
    h.messages.putAttachment({ id: 'attachment', kind: 'text', mimeType: 'text/plain', bytes: 3, data: new Uint8Array([97, 98, 99]), at: 0 });
    await h.finish(h.orchestrator.promptFromUser([alice.id], 'attached', ['attachment']));
    expect(h.prompts[2]?.attachments).toEqual([{ kind: 'text', mimeType: 'text/plain', data: new Uint8Array([97, 98, 99]) }]);
    expect(h.prompts[2]?.text).toContain('Profile overview');
    h.orchestrator.dispose();
  });

  it('does not infer a legacy membership from a matching name', async () => {
    const lookup = vi.spyOn(store, 'profileOverviewOf');
    const { profileId: _, ...legacy } = alice;
    const h = await running({ agent: legacy });
    await h.finish(h.orchestrator.promptFromUser([alice.id], 'work'));
    expect(h.prompts[0]?.text).toBe('work');
    expect(lookup).not.toHaveBeenCalled();
    h.orchestrator.dispose();
  });
});
