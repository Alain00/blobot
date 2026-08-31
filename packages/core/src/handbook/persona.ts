import type { HandbookEntry } from './domain.js';

/**
 * The Handbook as it reaches the agent, and the sentence that decides when it writes one.
 *
 * Composed here rather than in `envelope.ts` only for room to explain it; it is folded into
 * the persona by `composePersona`, immediately before standing instructions, and it is one
 * string with **no adapter changes on any of the four**. See `.scratch/handbooks/issues/04`.
 */

/**
 * An entry's date, short and absolute: `2026-03-11`.
 *
 * **Never relative, and this must not be "improved" later.** The persona is pinned as a cached
 * system prefix, so *4 months ago* would change on every composition and invalidate that cache
 * on every session, for a fact nobody needed to the day. Local, because the day an entry was
 * written is the user's day and not UTC's.
 */
export function shortDate(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * When to reach for `record_entry`, in four lines. Ticket 09's words, and the length is part of
 * the answer: this is paid per session on three runtimes and **per turn on fx**, so a careful
 * paragraph about when to record would itself be a permanent context cost on every team forever.
 *
 * The test is *durable, and not in the files*. Durable kills *the build is broken*; not in the
 * files kills the expensive failure nobody predicts, which is an agent transcribing the README
 * into its own persona and paying for it on every session to say something it could have read.
 *
 * The agent is **not** told the character bound. One that knows its budget starts economising in
 * ways nobody asked for, and the refusal carries the fix when it arrives.
 */
const WHEN_TO_RECORD = [
  'Record something with record_entry when it will still be true next month and is not in the',
  'files, and say whether you were told it or worked it out. Do it whenever someone asks you to',
  'remember something. A teammate telling you something counts as working it out. When you are',
  'unsure, leave it out: you can record it tomorrow, and what you record is in every session',
  'until a person removes it.',
];

/**
 * What an **unbriefed** agent reads, and it is the entire mechanism.
 *
 * One sentence in a cached prefix has to produce two opposite behaviours: woken with nothing to
 * do it must open the conversation, and given work it must do the work. So the trigger is named
 * explicitly rather than described as a mood. Unconditional wording was rejected because it
 * interrogates somebody who wanted a task done.
 */
const EMPTY = [
  'Your Handbook for this team is empty. Nobody has told you about the work here yet.',
  'If you are started with nothing to do, introduce yourself and ask about the work: what it',
  'is, who it is for, and what you would need to know that is not in the files. If you are',
  'given work, do the work.',
];

/**
 * What *brief them* actually sends, and it is the whole of ticket 02's answer.
 *
 * **A wordless turn is not available.** Measured against all four real runtimes: the ACP schema
 * permits an empty `prompt` array, Claude and Codex answer gracefully, OpenCode **confabulates**
 * — it invented a task, read files and raised two permission requests — and fx refuses outright
 * with `-32602 "Empty prompt"`, before any model call. One hard refusal is enough: blobot does
 * not ship a mechanism three runtimes support and the fourth cannot, and a control whose
 * behaviour depends on which runtime is behind it is provider knowledge above the adapter.
 *
 * So this goes **on the wire and is never drawn**. It reaches the agent's context; it does not
 * enter the `messages` row and it does not appear in the transcript. That is `composeLeadBrief`'s
 * arrangement exactly, already accepted for the lead: the author's binding rule is that **there
 * is no third party in the room**, and that rule is about the conversation the user reads.
 * Nothing here appears in it, so the first words on screen are still the agent's own.
 *
 * It is one sentence because it is only the knock on the door. {@link EMPTY} is the mechanism:
 * the persona already knows what to do with a turn that arrives carrying no work, and this says
 * nothing about introducing yourself or what to ask, on purpose. A whitespace-only block was
 * rejected as the worst of both — it satisfies the letter of *no words* by passing fx's
 * validation on a technicality and leaves OpenCode in precisely the vacuum that was measured.
 *
 * See `.scratch/handbooks/research/02-empty-prompt.md`, with versions and raw transcripts.
 */
export const BRIEFING_KNOCK = 'You are starting with nothing to do.';


/**
 * The Handbook block: the entries if there are any, the empty state if there are not, and in
 * both cases the test for when to add one.
 *
 * Entries are **numbered**, which is ticket 10's price and is paid knowingly: a couple of
 * characters each, on every session, so that an agent can name the one it later found wrong.
 * Without a number there is no way to correct anything at all.
 */
export function composeHandbookBlock(entries: readonly HandbookEntry[]): string[] {
  if (entries.length === 0) return [...EMPTY, '', ...WHEN_TO_RECORD];
  return [
    'Your Handbook for this team, which is what you have been told about the work here. It does',
    'not follow you to any other team you are on.',
    // The entry's own ordinal, never its position in this list. A gap means something was
    // removed, and a number an agent read last week still names what it named then.
    ...entries.map((entry) => `${entry.ordinal}. [${shortDate(entry.createdAt)}] ${entry.text}`),
    '',
    // Ticket 10's narrowing, said to the agent that has to live with it. The numbers above are
    // only useful if it knows what they are for, and the asymmetry between the two kinds is the
    // decision itself: withdrawing your own conclusion is retracting yourself, and removing what
    // the user said is editing the user.
    'If something you worked out is no longer true, record the correction and name the number it',
    'replaces. You cannot withdraw something you were told; say so instead and let the person',
    'decide.',
    '',
    ...WHEN_TO_RECORD,
  ];
}
