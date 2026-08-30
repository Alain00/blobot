import { describe, expect, it } from 'vitest';
import type { Agent } from './domain.js';
import { namesMentioned } from './roster.js';

const roster: Agent[] = [
  { id: 'agent_alice', teamId: 't', name: 'Alice', role: 'frontend', workspacePath: '/a' },
  { id: 'agent_bob', teamId: 't', name: 'Bob', role: 'reviewer', workspacePath: '/b' },
];

const names = (text: string): string[] =>
  namesMentioned(text, roster).map((agent) => agent.name);

describe('which teammates a piece of prose names', () => {
  it('reads a name in prose and a mention as the same thing', () => {
    expect(names('I will ask Bob to review it')).toEqual(['Bob']);
    expect(names('@bob is on it')).toEqual(['Bob']);
  });

  it('is case-insensitive and finds several', () => {
    expect(names('alice and BOB are both on this')).toEqual(['Alice', 'Bob']);
  });

  it('does not find a name inside a longer word', () => {
    // The whole of blobot's reading of an answer is this match, so a loose one would put a
    // system line under a sentence that never mentioned anybody.
    expect(names('the bobbin is stuck and malice is not a teammate')).toEqual([]);
  });

  it('does not read an address as a mention', () => {
    expect(names('mail it to bob@example.com')).toEqual([]);
  });

  it('finds nobody in a sentence about nobody', () => {
    expect(names('the retry loop has no backoff')).toEqual([]);
  });
});
