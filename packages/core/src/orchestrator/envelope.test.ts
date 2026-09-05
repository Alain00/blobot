import { describe, expect, it } from 'vitest';
import type { Agent, Message, Team } from './domain.js';
import { composeLeadBrief, composePersona, composeWakePrompt } from './envelope.js';

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

const cara: Agent = {
  id: 'c',
  teamId: team.id,
  name: 'Cara',
  role: 'writer',
  workspacePath: '/agents/cara',
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
    expect(persona).not.toContain(team.workspacePath);
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

  /**
   * The ordering is the whole of the user's control over blobot's prose rules. The persona
   * carries a house style and a verbosity level of blobot's own choosing; a person who writes
   * "explain your reasoning in full" has to be able to say so and win. Above the line they
   * lost silently to a sentence they never wrote, which is the state this asserts is gone.
   */
  it('puts standing instructions last, so they outrank blobot’s own prose rules', () => {
    const mara = { ...alice, name: 'Mara', instructions: 'Explain your reasoning in full.' };
    const persona = composePersona(mara, team, [mara, bob]);
    expect(persona.indexOf('Explain your reasoning in full.')).toBeGreaterThan(
      persona.indexOf('Write plainly'),
    );
    expect(persona).toContain('outrank');
  });
});

/**
 * Why this is said at all: the Claude bridge takes a string `_meta.systemPrompt` as a
 * *replacement* for its `claude_code` preset rather than an append, and that preset is where
 * the tone section lives. blobot passes a string, so nothing told an agent how much to say and
 * it fell back to plain assistant prose. See `verbosity.ts`.
 */
describe('how much an agent says', () => {
  it('tells an agent nobody chose for to keep it short', () => {
    // The middle position says something rather than nothing, which is the point: the default
    // agent is the one this whole setting exists for.
    expect(composePersona(alice, team, [alice, bob])).toContain('Keep answers short');
  });

  it('takes the level off the agent', () => {
    const terse = composePersona({ ...alice, verbosity: 'brief' }, team, [alice, bob]);
    expect(terse).toContain('Answer in a line or two');
    expect(terse).not.toContain('Keep answers short');

    const full = composePersona({ ...alice, verbosity: 'full' }, team, [alice, bob]);
    expect(full).toContain('show your working');
    expect(full).not.toContain('Keep answers short');
  });

  /**
   * `brief` governs prose and never what a teammate is allowed to know. An agent that had to
   * refuse something says so at every level, because a level that could suppress a refusal
   * would be a setting that quietly turns off the persona's own trust framing.
   */
  it('never lets brevity swallow a refusal', () => {
    expect(composePersona({ ...alice, verbosity: 'brief' }, team, [alice, bob])).toContain(
      'Say anything you had to refuse',
    );
  });
});

describe('the wake prompt', () => {
  it('carries only what varies: sender, role, context, body', () => {
    const prompt = composeWakePrompt(
      [peerMessage('Review the refresh path.', 'I rewrote refresh(); it is on my branch.')],
      () => alice,
      [alice],
    );
    expect(prompt).toContain('From Alice (frontend), a teammate, not the operator:');
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
  });

  /*
   * The observed failure, in a test rather than in a comment: Alice mailed a teammate, the
   * teammate woke on a single message, wrote its reply as prose, mailed nobody, and Alice waited
   * for something that had never been sent. The sentence that prevents it was in the batch
   * branch only, which is the branch that fires least.
   */
  it('tells a single wake that its prose is invisible, and names the way back', () => {
    const prompt = composeWakePrompt([peerMessage('what are you on?')], () => alice, [alice]);

    expect(prompt).toContain('They cannot see this turn');
    expect(prompt).toContain('message_agent');
  });

  it('says it identically on a batch, so the two branches cannot drift again', () => {
    const one = composeWakePrompt([peerMessage('first')], () => alice, [alice]);
    const many = composeWakePrompt(
      [peerMessage('first'), peerMessage('second')],
      () => alice,
      [alice],
    );
    const rule = (prompt: string): string | undefined =>
      prompt.split('\n').find((line) => line.includes('They cannot see this turn'));

    expect(rule(one)).toBeDefined();
    expect(rule(many)).toBe(rule(one));
  });

  it('puts the rule where it is read last, immediately above the roster line', () => {
    const lines = composeWakePrompt([peerMessage('take a look')], () => alice, [alice])
      .split('\n')
      .filter((line) => line !== '');

    expect(lines.at(-1)).toContain('Teammates you can message:');
    expect(lines.at(-2)).toContain('message_agent');
  });

  it('refuses to compose nothing', () => {
    expect(() => composeWakePrompt([], () => alice, [alice])).toThrow('no messages to deliver');
  });
});

describe('the lead brief', () => {
  it('names every teammate, their role and what they are doing', () => {
    const brief = composeLeadBrief([
      { agent: bob, status: 'working' },
      { agent: cara, status: 'waiting' },
    ]);

    expect(brief).toContain('You lead this team.');
    expect(brief).toContain('- Bob (reviewer): working');
    expect(brief).toContain('- Cara (writer): blocked, waiting on the operator');
  });

  it('says free rather than idle, because free is the word the decision turns on', () => {
    expect(composeLeadBrief([{ agent: bob, status: 'idle' }])).toContain('- Bob (reviewer): free');
  });

  it('says a relayed request is a colleague’s, so the lead asks rather than orders', () => {
    const brief = composeLeadBrief([{ agent: bob, status: 'idle' }]);

    // Issue 03 is not reopened: peer authority is permanent, and the lead is told so about
    // itself rather than discovering it through refusals.
    expect(brief).toContain('not as an instruction from the operator');
    expect(brief).toContain('ask rather than order');
  });

  it('bounds what it claims to know, because it is blobot’s record and not their sessions', () => {
    expect(composeLeadBrief([{ agent: bob, status: 'idle' }])).toContain(
      'anything beyond it means asking them',
    );
  });

  it('has something honest to say on a team of one', () => {
    expect(composeLeadBrief([])).toContain('There is nobody else on it yet');
  });

  it('stands in place of the roster line on a wake, never beside it', () => {
    const brief = composeLeadBrief([{ agent: bob, status: 'idle' }]);
    const prompt = composeWakePrompt([peerMessage('take a look')], () => alice, [alice], brief);

    expect(prompt).toContain('You lead this team.');
    expect(prompt).not.toContain('Teammates you can message:');
  });
});

describe('the Handbook in the persona', () => {
  const entry = (
    ordinal: number,
    text: string,
    at: number,
    source: 'told' | 'noticed' = 'told',
  ) => ({
    id: `e${ordinal}`,
    ordinal,
    teamId: team.id,
    agentName: bob.name,
    text,
    source,
    createdAt: at,
  } as const);

  it('says it is empty, and what to do about it, when nobody has briefed the agent', () => {
    const persona = composePersona(bob, team, [alice, bob]);

    // The conditional is the whole mechanism: woken with nothing to do it opens the
    // conversation, given work it does the work. Both readings have to be in the same sentence.
    expect(persona).toContain('Your Handbook for this team is empty.');
    expect(persona).toContain('If you are started with nothing to do, introduce yourself');
    expect(persona).toContain('If you are\ngiven work, do the work.');
  });

  it('numbers the entries and dates them absolutely', () => {
    const at = new Date(2026, 2, 11, 12).getTime();
    const persona = composePersona(bob, team, [alice, bob], [
      entry(1, 'we deploy on Fridays', at),
      entry(2, 'the ICP is a two-person agency', at, 'noticed'),
    ]);

    expect(persona).toContain('1. [2026-03-11] we deploy on Fridays');
    expect(persona).toContain('2. [2026-03-11] the ICP is a two-person agency');
    expect(persona).not.toContain('Your Handbook for this team is empty.');
    // A relative age would change on every composition and invalidate the cached prefix.
    expect(persona).not.toMatch(/months? ago/);
  });

  it('names the scope, because an agent on two teams must not carry one to the other', () => {
    const persona = composePersona(bob, team, [alice, bob], [entry(1, 'ours', 0)]);

    expect(persona).toContain('not follow you to any other team you are on');
  });

  it('asks for durable knowledge that is not in the files, briefed or not', () => {
    for (const handbook of [[], [entry(1, 'ours', 0)]]) {
      const persona = composePersona(bob, team, [alice, bob], handbook);
      expect(persona).toContain('still be true next month and is not in the');
      expect(persona).toContain('files');
      // Err shy, and the persona says why: an entry not recorded today can be recorded
      // tomorrow, and one recorded is in every session until a person goes and finds it.
      expect(persona).toContain('When you are\nunsure, leave it out');
      // The bound is never named. An agent that knows its budget economises unasked.
      expect(persona).not.toMatch(/\b\d{1,2},?000 characters\b/);
    }
  });

  it('sits above standing instructions, so the user keeps the last word', () => {
    const briefed: Agent = { ...bob, instructions: 'Explain your reasoning in full.' };
    const persona = composePersona(briefed, team, [alice, bob], [entry(1, 'ours', 0)]);

    // Rank, not layout: an entry the agent wrote never outranks a sentence the user wrote.
    expect(persona.indexOf('Your Handbook for this team,')).toBeLessThan(
      persona.indexOf('Standing instructions'),
    );
    expect(persona.trimEnd().endsWith('Explain your reasoning in full.')).toBe(true);
  });

  it('tells a briefed agent how to correct itself, and where that stops', () => {
    const persona = composePersona(bob, team, [alice, bob], [entry(1, 'ours', 0)]);

    expect(persona).toContain('name the number it');
    expect(persona).toContain('cannot withdraw something you were told');
  });
});
