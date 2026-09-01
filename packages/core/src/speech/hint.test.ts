import { describe, expect, it } from 'vitest';
import { composeSpeechHint, identifiersIn } from './hint.js';

describe('the vocabulary hint', () => {
  it('leads with the roster and the team, then what the user typed', () => {
    const hint = composeSpeechHint(['Alice', 'Bob'], 'checkout', [
      'Revisa el session/new del adapter de Cursor',
    ]);
    expect(hint.terms).toEqual(['Alice', 'Bob', 'checkout', 'session/new']);
  });

  it('takes identifier-shaped tokens and leaves plain words to the model', () => {
    expect(identifiersIn('mira AgentRuntime y runtime_for.ts en packages/core, luego pnpm demo')).toEqual([
      'AgentRuntime',
      'runtime_for.ts',
      'packages/core',
    ]);
    expect(identifiersIn('a message with @alice in it (and useState).')).toEqual(['@alice', 'useState']);
    expect(identifiersIn('nothing shaped here at all')).toEqual([]);
  });

  it('is newest first, so the ceiling trims the oldest', () => {
    const hint = composeSpeechHint([], 't', ['old_one', 'mid_one', 'new_one']);
    expect(hint.terms).toEqual(['t', 'new_one', 'mid_one', 'old_one']);
  });

  it('is trimmed rather than refused at the ceiling', () => {
    const many = Array.from({ length: 60 }, (_, i) => `term_${i}`).join(' ');
    const hint = composeSpeechHint([], 'team', [many], { terms: 5 });
    expect(hint.terms).toHaveLength(5);
    expect(hint.terms[0]).toBe('team');
  });

  it('never repeats a term, case-insensitively', () => {
    const hint = composeSpeechHint(['Alice'], 'alice', ['@Alice said session/new twice: session/new']);
    expect(hint.terms).toEqual(['Alice', '@Alice', 'session/new']);
  });

  it('honours the character ceiling', () => {
    const hint = composeSpeechHint([], 'x', ['a_very_long_identifier_indeed another_one'], { chars: 40 });
    expect(hint.terms).toEqual(['x', 'a_very_long_identifier_indeed']);
  });
});
