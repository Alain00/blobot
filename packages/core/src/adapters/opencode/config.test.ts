import { describe, expect, it } from 'vitest';
import {
  agentKeyFor,
  opencodeConfigContent,
  permissionPosture,
  PERMISSION_POSTURE,
} from './config.js';

describe('the agent key', () => {
  it('is the name, lowercased into something a config key and a mode picker can hold', () => {
    expect(agentKeyFor('Alice')).toBe('alice');
    expect(agentKeyFor('Mara O’Neill')).toBe('mara-o-neill');
    expect(agentKeyFor('  spaced  out  ')).toBe('spaced-out');
  });

  it('never takes over one of OpenCode’s own primary agents', () => {
    // `build` and `plan` exist in every session. Defining an agent under one of those keys
    // replaces it for the process, which is a surprise nobody asked for.
    expect(agentKeyFor('build')).toBe('blobot-build');
    expect(agentKeyFor('Plan')).toBe('blobot-plan');
  });

  it('has an answer for a name that slugs to nothing', () => {
    expect(agentKeyFor('***')).toBe('blobot-agent');
  });
});

describe('the config content', () => {
  it('is one primary agent, made default, carrying the persona and the posture', () => {
    const config = JSON.parse(
      opencodeConfigContent({ agentKey: 'alice', description: 'Alice, a blobot teammate.', persona: 'You are Alice.' }),
    ) as Record<string, any>;

    expect(config['default_agent']).toBe('alice');
    expect(config['agent']['alice']['mode']).toBe('primary');
    expect(config['agent']['alice']['prompt']).toBe('You are Alice.');
    // The object form, never the scalar: `"permission": "ask"` makes `read` ask too, and an
    // agent that prompts before reading a file is an agent nobody can use.
    expect(typeof config['permission']).toBe('object');
    expect(config['permission']['bash']['rm *']).toBe('ask');
    expect(config['permission']['bash']['npm install*']).toBe('ask');
    // `npm test` and friends are deliberately not on the list: that is how an agent works.
    expect(config['permission']['bash']['*']).toBe('allow');
    // Already `ask` by default in 1.18.4, so blobot does not restate it.
    expect(config['permission']).not.toHaveProperty('external_directory');
  });

  it('names no model, because that lever is session/set_config_option on both runtimes', () => {
    const config = JSON.parse(
      opencodeConfigContent({ agentKey: 'bob', description: 'Bob.', persona: 'You are Bob.' }),
    ) as Record<string, any>;
    expect(config['agent']['bob']).not.toHaveProperty('model');
  });
});

/**
 * The same three levels, expressed from the other end: OpenCode subtracts from an allow-all,
 * where Claude adds to an allow-nothing. That the two arrive at the same three words is the
 * point of putting the vocabulary in core rather than in either adapter.
 */
describe('the trust levels', () => {
  it('asks about everything when the agent is careful, and never as a scalar', () => {
    const posture = permissionPosture('careful');
    expect(posture.edit).toBe('ask');
    // The trap from research 16 section 8: a scalar `"permission": "ask"` makes `read` ask too
    // and the agent unusable. Careful is a posture, not a broken agent.
    expect(typeof posture.bash).toBe('object');
    expect(posture.bash['*']).toBe('ask');
  });

  it('is ticket 14 verbatim when the agent is normal', () => {
    expect(permissionPosture('normal')).toEqual(PERMISSION_POSTURE);
  });

  it('allows the network and the installers when the agent is trusting', () => {
    const bash = permissionPosture('trusting').bash;
    expect(bash['curl *']).toBe('allow');
    expect(bash['npm install*']).toBe('allow');
    // And still asks about the ones no level reaches.
    expect(bash['rm *']).toBe('ask');
    expect(bash['sudo *']).toBe('ask');
    expect(bash['git push*']).toBe('ask');
    expect(bash['docker *']).toBe('ask');
    // `gh` is one of those now: writing to a forge is the user's action at every level.
    expect(bash['gh *']).toBe('ask');
  });

  it('vouches for reading GitHub at every level above careful, and never for writing to it', () => {
    for (const trust of ['normal', 'trusting'] as const) {
      const bash = permissionPosture(trust).bash;
      expect(bash['gh pr view*']).toBe('allow');
      expect(bash['gh issue list*']).toBe('allow');
      expect(bash['gh run view*']).toBe('allow');
      // The blanket rule still covers every verb the reads did not name, `gh api` included,
      // because `gh api -X POST` writes and a glob on the command cannot see the flag.
      expect(bash['gh *']).toBe('ask');
      expect(bash['gh pr create*']).toBeUndefined();
      expect(bash['gh api*']).toBeUndefined();

      // Later rules win, so the reads have to be emitted after the blanket ask or they are
      // dead. This is the whole mechanism and it is invisible in the values.
      const order = Object.keys(bash);
      expect(order.indexOf('gh pr view*')).toBeGreaterThan(order.indexOf('gh *'));
    }
  });

  it('asks before anything reaches the display server, at every level', () => {
    for (const trust of ['normal', 'trusting'] as const) {
      const bash = permissionPosture(trust).bash;
      for (const pattern of ['grim*', 'scrot*', 'import *', 'screencapture*', 'xdotool*', 'ffmpeg*']) {
        expect(bash[pattern]).toBe('ask');
      }
    }
    // Careful is the scalar-free allow-nothing, so the class is covered by `*` there.
    expect(permissionPosture('careful').bash['*']).toBe('ask');
  });

  it('asks about reading GitHub when the agent is careful', () => {
    expect(permissionPosture('careful').bash).toEqual({ '*': 'ask' });
  });

  it('carries the level into the config the process is handed', () => {
    const config = JSON.parse(
      opencodeConfigContent({ agentKey: 'alice', description: 'Alice', persona: 'x', trust: 'careful' }),
    ) as { permission: { edit: string }; agent: Record<string, { permission: { edit: string } }> };
    // Written twice, globally and on the agent, because a session switched off the persona for
    // any reason has to keep its permissions.
    expect(config.permission.edit).toBe('ask');
    expect(config.agent['alice']?.permission.edit).toBe('ask');
  });
});
