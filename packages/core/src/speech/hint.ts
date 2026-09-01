import { SPEECH_HINT_CHARS, SPEECH_HINT_MESSAGES, SPEECH_HINT_TERMS } from '../orchestrator/bounds.js';
import type { SpeechHint } from './domain.js';

/**
 * The vocabulary hint, composed per recording and never persisted (ticket 06).
 *
 * Ticket 02's measurement: with `--prompt "AgentRuntime, session/new, pnpm demo"` even the
 * smallest model got every identifier exactly inside a Spanish sentence; without it only the
 * largest came close. So the hint is the whole game, and what goes in it is what the user is
 * likely to say: the teammates' names and the team's, then anything identifier-shaped they
 * typed recently — a path, a `snake_case`, a `dotted.name`, a `camelCase`, an `@mention`.
 *
 * Most recent first, so the ceiling trims the oldest. Composed like `composeLeadBrief`: pure,
 * from what the store already holds, called from main. Nothing here reads a file.
 */
export function composeSpeechHint(
  rosterNames: readonly string[],
  teamName: string,
  lastUserMessages: readonly string[],
  limits: { readonly terms?: number; readonly chars?: number } = {},
): SpeechHint {
  const maxTerms = limits.terms ?? SPEECH_HINT_TERMS;
  const maxChars = limits.chars ?? SPEECH_HINT_CHARS;
  const seen = new Set<string>();
  const terms: string[] = [];
  let chars = 0;
  const take = (term: string): boolean => {
    const key = term.toLowerCase();
    if (term === '' || seen.has(key)) return true;
    if (terms.length >= maxTerms || chars + term.length + 2 > maxChars) return false;
    seen.add(key);
    terms.push(term);
    chars += term.length + 2;
    return true;
  };

  for (const name of rosterNames) take(name);
  take(teamName);
  // Newest message first, and within a message in the order it was written.
  const recent = lastUserMessages.slice(-SPEECH_HINT_MESSAGES).reverse();
  for (const message of recent) {
    for (const token of identifiersIn(message)) if (!take(token)) return { terms };
  }
  return { terms };
}

/**
 * Tokens a speech model would not guess and a developer says all day. A word is an identifier
 * when it carries a `/`, `_`, `.` or `@`, or changes case inside itself; plain words are left
 * to the model, which knows them.
 */
export function identifiersIn(text: string): readonly string[] {
  const found: string[] = [];
  for (const raw of text.split(/\s+/)) {
    // Trailing punctuation belongs to the sentence, not the token.
    const token = raw.replace(/^[("'`[{<]+/, '').replace(/[)"'`\]}>,;:!?.]+$/, '');
    if (token.length < 2 || token.length > 60) continue;
    if (/^https?:\/\//.test(token)) continue;
    const shaped =
      /[/_.@]/.test(token) ||
      /[a-z][A-Z]/.test(token) ||
      /^[A-Z][a-z]+[A-Z]/.test(token);
    if (shaped && /[A-Za-z]/.test(token)) found.push(token);
  }
  return found;
}
