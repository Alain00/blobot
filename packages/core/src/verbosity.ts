/**
 * How much an agent says when it answers.
 *
 * The third of blobot's own three-word vocabularies, beside `trust.ts` and the compaction
 * setting, and here for the same reason both of those are: no runtime advertises it, so the
 * renderer names the decision and still cannot tell which provider is behind it. It rides the
 * same path as the model and the effort — chosen on the profile, copied onto the Agent at team
 * creation, taken by a running team at its next start (ADR-0002), because the persona is a
 * `session/new` parameter on every adapter blobot has.
 *
 * **Why it has to be said at all.** The Claude bridge treats a string `_meta.systemPrompt` as a
 * *replacement* for its `{type:"preset",preset:"claude_code"}` default, not an append, and that
 * preset is where the tone section lives. blobot passes a string, so the preset's "answer
 * concisely" went with it, and nothing put it back: an agent fell back to plain assistant prose,
 * with headings, a restatement of the question and a summary at the end. Appending to the preset
 * instead was the other way out and is refused — it re-asserts "You are Claude Code" over "You
 * are Alice, a reviewer", costs a large fixed slice of the very context window the gauge is
 * measuring, and is Claude-only, so three runtimes would be terse to different degrees for a
 * reason no user could see. Saying it ourselves is the version that is true on all of them.
 *
 * There is no fourth position. `brief` is a floor rather than a gag: an agent that has to refuse
 * something, or that is blocked, says so at any level, because the levels govern prose and never
 * what a teammate is allowed to know.
 *
 * **Known limit: this applies better to a new session than to a resumed one, and that is
 * accepted.** *Measured 2026-08-31.* An agent set to `brief` answered at 1,005 characters on a
 * resumed session. The persona was correct and reached the model — the persisted session row
 * carried these lines, the bridge passes `systemPrompt` beside `resume`, and no CLAUDE.md was in
 * scope to compete. What beat it was the conversation: that provider session had been resumed 17
 * times into a 763 KB transcript holding 50 of the agent's own prior answers, mean 413
 * characters and several past 1,500. One sentence of style guidance loses to fifty worked
 * examples in the agent's own voice.
 *
 * The fix that would work is restating the level in the **envelope**, per turn, which is the
 * argument `composePersona`'s neighbour already makes for the trust framing: what has to survive
 * contact with the conversation goes in the turn and not in the cached prefix. **The author
 * declined it on cost**, and the decision is recorded rather than argued: a per-turn line is
 * spend on every turn of every agent forever, against a setting that works correctly the moment
 * a session is fresh — which compaction makes routine. If this is revisited, the reason to
 * revisit it is a long-lived agent that never compacts.
 */
export type VerbosityLevel = 'brief' | 'normal' | 'full';

/**
 * What an agent is when nobody has chosen. Stored as nothing: an absent column is `normal`, the
 * way an absent `trust` is, so every agent hired before this existed reads as the middle
 * position rather than as a migration artefact.
 */
export const DEFAULT_VERBOSITY: VerbosityLevel = 'normal';

const LEVELS: readonly VerbosityLevel[] = ['brief', 'normal', 'full'];

/** A stored string that is no longer a level blobot knows is `normal`, never a guess either way. */
export function verbosityLevelOf(value: string | null | undefined): VerbosityLevel {
  return LEVELS.includes(value as VerbosityLevel) ? (value as VerbosityLevel) : DEFAULT_VERBOSITY;
}

/**
 * The persona lines for a level, in blobot's voice rather than a provider's.
 *
 * Written as a rule about prose and never as a rule about work, which is the same line the
 * house style is held to: none of these may be read as permission to leave something out, so
 * each says what to do with the words and nothing about what to do with the task.
 *
 * `normal` says something rather than nothing. An empty middle would mean the default agent
 * gets no guidance at all, which is the state this whole file exists to end.
 */
export function verbosityInstruction(level: VerbosityLevel): readonly string[] {
  switch (level) {
    case 'brief':
      return [
        'Answer in a line or two. No preamble, no summary at the end, no headings, and no',
        'restating what you were asked. If the answer is a single fact, it is a single sentence.',
        'Say anything you had to refuse or could not do, however short the answer gets.',
      ];
    case 'normal':
      return [
        'Keep answers short. Lead with the answer, skip the preamble and the closing summary,',
        'and let a reply grow only when the work genuinely needs the room.',
      ];
    case 'full':
      return [
        'Explain your reasoning and show your working. Say what you considered and rejected,',
        'not only what you did.',
      ];
  }
}
