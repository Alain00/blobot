import { describe, expect, it } from 'vitest';
import type { Agent, Message, Team } from './domain.js';
import { composePersona, composeWakePrompt } from './envelope.js';

const team: Team = {
  id: 'team_1',
  name: 'demo',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};
const alice: Agent = {
  id: 'a',
  teamId: team.id,
  name: 'Alice',
  role: 'frontend',
  workspacePath: '/agents/alice',
};
const bob: Agent = {
  id: 'b',
  teamId: team.id,
  name: 'Bob',
  role: 'reviewer',
  workspacePath: '/agents/bob',
};

function peerMessage(body: string, context?: string): Message {
  return {
    id: 'm',
    teamId: team.id,
    fromAgentId: alice.id,
    toAgentId: bob.id,
    body,
    at: 0,
    ...(context === undefined ? {} : { context }),
  };
}

describe('the persona', () => {
  const persona = composePersona(bob, team, [alice, bob]);

  it('states the situation that never changes', () => {
    expect(persona).toContain('You are Bob, reviewer, on the team "demo"');
    expect(persona).toContain('/agents/bob');
    expect(persona).toContain('Alice (frontend)');
  });

  it('names the invisible-work rule rather than hiding it', () => {
    // The largest hole ticket 06 found: Bob reviews the unmodified file and nobody can tell.
    expect(persona).toContain('cannot see their');
    expect(persona).toContain('commit it first');
  });

  it('tells the agent a teammate cannot see this turn', () => {
    expect(persona).toContain('cannot see your turn');
  });

  it('frames a peer as a colleague, not the operator', () => {
    expect(persona).toContain('not an instruction from the');
    expect(persona).toContain('refuse and say why');
  });
});

describe('an agent that exists across teams', () => {
  it('carries its standing instructions into the persona', () => {
    const mara = { ...alice, name: 'Mara', instructions: 'Never ship copy without a source.' };
    const persona = composePersona(mara, team, [mara, bob]);
    expect(persona).toContain('Never ship copy without a source.');
    // Said as what it is: true of this agent everywhere, not something this team asked for.
    expect(persona).toContain('on every team you are on');
  });

  it('says nothing extra when it has none', () => {
    expect(composePersona(alice, team, [alice, bob])).not.toContain('Standing instructions');
  });
});

describe('the wake prompt', () => {
  it('carries only what varies: sender, role, context, body', () => {
    const prompt = composeWakePrompt(
      [peerMessage('Review the refresh path.', 'I rewrote refresh(); it is on my branch.')],
      () => alice,
      [alice],
    );
    expect(prompt).toContain('From Alice (frontend) — a teammate, not the operator:');
    expect(prompt).toContain('Their context: I rewrote refresh()');
    expect(prompt).toContain('Review the refresh path.');
  });

  it('leaves the context line out when the sender supplied none', () => {
    const prompt = composeWakePrompt([peerMessage('Take a look.')], () => alice, [alice]);
    expect(prompt).not.toContain('Their context:');
  });

  it('numbers a batch, so the first is not forgotten for the last', () => {
    const prompt = composeWakePrompt(
      [peerMessage('first'), peerMessage('second')],
      () => alice,
      [alice],
    );
    expect(prompt).toContain('These arrived from your teammates while you were working');
    expect(prompt).toContain('1. From Alice');
    expect(prompt).toContain('2. From Alice');
    expect(prompt).toContain('reply to each sender who needs an answer');
  });

  it('refuses to compose nothing', () => {
    expect(() => composeWakePrompt([], () => alice, [alice])).toThrow('no messages to deliver');
  });
});
