/**
 * What blobot is allowed to put into an agent's context, and what it says when something is
 * over the line.
 *
 * The permanent rule is "the orchestrator owns agent-to-agent communication, and never a full
 * context copy between agents — always compact context". Until this file, nothing enforced it:
 * `message_agent`'s schema calls `context` a one-line description and checks nothing, and the
 * body had no bound at all, so one agent could paste its whole transcript into another's
 * window and blobot would carry it, commit it and replay it on every relaunch.
 *
 * These are the parts of an agent's context that are *ours*. The rest of it belongs to the CLI
 * behind the adapter, which is why blobot does not compact and does not truncate: see
 * `.scratch/transcript-scale/spec.md`.
 */

/**
 * A peer message body, in characters.
 *
 * Roughly a thousand tokens, which is a long paragraph and a short document. It is generous on
 * purpose: the bound exists to stop a transcript being pasted, not to make teammates terse.
 */
export const PEER_MESSAGE_LIMIT = 4_000;

/**
 * The sender's context line, in characters. The tool calls it one line and this is what one
 * line means, with room for a sentence that ran long.
 */
export const PEER_CONTEXT_LIMIT = 500;

/**
 * How many queued messages fold into a single wake prompt.
 *
 * The whole mailbox used to arrive as one numbered prompt, on the argument that delivering one
 * and requeuing the rest doubles the turn count against a budget of ten. That argument is still
 * true and this is still a trade: past a handful, a numbered list is not a prompt an agent
 * answers, it is a context dump with numbers on it. The overflow is not dropped and not
 * delivered late by accident. It stays in the mailbox and the agent is woken again the moment
 * the turn ends, which is the same path a mid-turn arrival already takes.
 */
export const WAKE_BATCH_LIMIT = 5;

/**
 * Why a peer message was refused, addressed to the agent that sent it.
 *
 * A refusal rather than a truncation, decided with the author 2026-08-30: a rejected peer
 * message is already a *tool failure* rather than a turn failure, so the sender reads this,
 * stays alive, and gets to write the short version. Truncating would hand the recipient half a
 * request with no way to know what the other half said, and teach the sender nothing.
 *
 * It says the number, the limit and what to do instead, because a refusal that does not carry
 * the fix is a wall.
 */
export function tooLongToSend(length: number, limit = PEER_MESSAGE_LIMIT): string {
  return (
    `that message is ${length.toLocaleString('en-US')} characters and the limit is ` +
    `${limit.toLocaleString('en-US')}. a teammate gets your summary, not your transcript: ` +
    'commit your work, say which branch it is on, and send the short version.'
  );
}

/** The same, for the context line, which is one line by definition. */
export function contextTooLong(length: number, limit = PEER_CONTEXT_LIMIT): string {
  return (
    `your context line is ${length.toLocaleString('en-US')} characters and the limit is ` +
    `${limit.toLocaleString('en-US')}. it is one line about what you are working on. ` +
    'anything longer belongs in the message itself, in the short version.'
  );
}

/**
 * An attached image, in bytes of the original file.
 *
 * Two constraints meet at roughly this number. Providers stop accepting a single image somewhere
 * around five megabytes, and a prompt crosses the wire as **one line** — `child.stdin.write`,
 * with the return value ignored — inflated about a third by base64 on the way.
 *
 * blobot does not resize its way under the line. Silently downscaling a screenshot of a stack
 * trace to save tokens is a wrong line number with no visible cause; see ADR-0004.
 */
export const IMAGE_ATTACHMENT_LIMIT = 4_000_000;

/**
 * An attached text file, in characters.
 *
 * An order of magnitude above `PEER_MESSAGE_LIMIT`, and that gap is the decision. The peer bound
 * exists to stop agents handing each other transcripts; this is the operator speaking with the
 * operator's own authority, and a file they chose to send is not a context dump.
 */
export const TEXT_ATTACHMENT_LIMIT = 50_000;

/**
 * Why a file was refused, addressed to the person who picked it up.
 *
 * Said at the moment of attaching rather than at send, which is the difference between a rule
 * and a trap: nobody writes a paragraph against a file that was never going to travel. It names
 * the size and the limit, because a refusal that does not carry the fix is a wall.
 *
 * Never a truncation. Half a text file with no marker is the failure `tooLongToSend` was written
 * against, and it is worse here, where the other half was a thing the user could see.
 */
export function attachmentTooLarge(name: string, bytes: number, limit: number): string {
  return (
    `${name} is ${formatSize(bytes)} and the limit is ${formatSize(limit)}. ` +
    'blobot sends the file as it is, so a smaller one is the only way through.'
  );
}

/** What blobot cannot send at all, said by kind rather than by extension. */
export function attachmentNotSupported(name: string): string {
  return `${name} is not an image or a text file, and blobot can only send those two.`;
}

/** What this agent's runtime will not take, said without naming the runtime. */
export function attachmentNotAccepted(agentName: string, kind: 'image' | 'text'): string {
  return kind === 'image'
    ? `${agentName} runs on a runtime that does not take images.`
    : `${agentName} runs on a runtime that does not take text files.`;
}

/** Sizes as a person says them. Kept here so every surface says a size the same way. */
export function formatSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * How many turns one Routine run may spend.
 *
 * The team's `turnBudget` is per *user prompt*, and its release valve is a person answering
 * *continue?*. A Routine has no person, so the valve is shut and the budget stops being a
 * precaution: it is the only thing between an hourly firing and a bill.
 *
 * Three, and a **constant rather than a column**. A per-Routine turn number is a knob nobody can
 * set correctly in advance, and the unit a person actually reasons about is firings — which the
 * schedule's closed set of three shapes already bounds by refusing to offer anything finer than
 * hourly. A Routine that genuinely needs ten turns of agents waking each other at 03:00 is a
 * workflow, and `.scratch/routines/spec.md` refused to build one in its second paragraph.
 *
 * `message_agent` stays available inside a run and this is what bounds it. Refusing peer messages
 * to a Routine was considered and rejected: agents already ping-pong unattended whenever the user
 * walks off mid-turn, so it is not new authority, and a second class of turn with different rules
 * is the kind of split an adapter forgets about six months later.
 */
export const ROUTINE_TURN_BUDGET = 3;

/**
 * How many firings in a row may end in anything other than `ran` before the Routine disarms
 * itself.
 *
 * Issue 08's shared rule, written once here and referenced by the cases rather than restated in
 * each: the permission that expired, the budget that was spent, the folder that is gone and the
 * runtime that is no longer installed all end the same way. An instruction whose every firing
 * dies the same death is not automation, it is a process leak with a schedule attached.
 *
 * Firings **nobody was there for** are not counted. They write no run and they are not failures:
 * a laptop that was shut is the ordinary condition of a laptop, and counting it here would
 * disarm every Routine on a machine that spent a long weekend in a bag.
 */
export const ROUTINE_DISARM_AFTER = 3;

/**
 * The longest a Routine run may sit on an unanswered permission request before the request is
 * cancelled and the run is stopped.
 *
 * Issue 03: a parked run holds a session, a bridge process and a pool slot, and `team-pool.ts`
 * never evicts a working team, so four nights of parking is a pool that can no longer start the
 * team the user is trying to open. The expiry is the earlier of this and the Routine's own next
 * due moment, because a Routine that has come round again has answered the question itself.
 *
 * **A user's own turn never expires.** The timer belongs to the run's origin and not to the
 * request: the person who started that turn is the person who can answer it.
 */
export const ROUTINE_PERMISSION_CEILING_MS = 30 * 60_000;

/**
 * The longest a firing waits for an agent that is mid-turn before it gives up.
 *
 * A firing that lands on a busy agent is not skipped: a session runs one turn at a time, so the
 * run waits and starts when the agent is free. What it may not do is wait forever, because the
 * firing it is holding back is its own next one.
 */
export const ROUTINE_BUSY_CEILING_MS = 15 * 60_000;

/**
 * How many Routines an agent may propose in one turn, and how many of its proposals may stand
 * unreviewed at once.
 *
 * Issue 05, and the same reasoning as {@link WAKE_BATCH_LIMIT}: the number nobody estimates
 * correctly is the number of times a model will do a thing it can do. Both are **refused at the
 * tool boundary rather than trimmed**, in this file's posture, so a fourth proposal comes back to
 * the model as an answer it has to account for instead of vanishing.
 *
 * **Standing means armed and proposed by this agent** — issue 05's 2026-08-30 amendment, and the
 * third of the four compensating controls it names. It counted *unreviewed* proposals, which was
 * right while nothing an agent proposed could fire; under the amendment nothing is ever unreviewed
 * in that sense, so the cap would have gone dead at the exact moment it started to matter.
 *
 * It now bounds the thing that costs: how much recurring, unattended work an agent can give
 * itself. Disarming one frees a slot, because a disarmed Routine spends nothing, and so does
 * removing it. Waiting frees nothing, and the refusal says so rather than implying a queue.
 */
export const ROUTINE_PROPOSALS_PER_TURN = 1;
export const ROUTINE_PROPOSALS_STANDING = 3;

/** A Routine's name is a label on a row, not a place to put the instruction. */
export const ROUTINE_NAME_LIMIT = 60;

export function tooManyProposalsThisTurn(): string {
  return (
    'You have already proposed a Routine this turn. Propose one at a time, and only after the ' +
    'person you are working with has seen the last one.'
  );
}

export function tooManyProposalsStanding(standing: number): string {
  return (
    `You already have ${standing} Routines of your own running, which is the limit. Disarm or ` +
    'have one removed before you add another. This is a limit on how much recurring work you ' +
    'can give yourself, not a queue: waiting will not clear it.'
  );
}

/**
 * One Handbook entry, in characters.
 *
 * An entry is a note about the work, not the work. This is generous enough for a paragraph
 * somebody dictated and short enough that a model cannot file a document under it.
 *
 * **Provisional.** Ticket 03 set both of these deliberately unmeasured, to be checked against a
 * real Handbook after the first live briefing interview and moved only if that contradicts them.
 * Record the measurement either way. See `.scratch/handbooks/build.md`.
 */
export const HANDBOOK_ENTRY_LIMIT = 1_000;

/**
 * A whole Handbook, in characters, and this is the bound that matters.
 *
 * It is what lands in the persona on every session on three runtimes, and on **every turn** on
 * fx, whose persona has no channel. About five percent of what an agent already pays per turn.
 */
export const HANDBOOK_LIMIT = 8_000;

/**
 * Why one entry was refused, addressed to the agent that wrote it.
 *
 * It carries the fix, like every other refusal here, and the fix is the agent's own: the entry
 * ran long and it can write the short one in the same turn.
 */
export function entryTooLong(length: number, limit = HANDBOOK_ENTRY_LIMIT): string {
  return (
    `that entry is ${length.toLocaleString('en-US')} characters and the limit is ` +
    `${limit.toLocaleString('en-US')}. an entry is a note about the work, not the work: ` +
    'write the one sentence you would want to find in six months.'
  );
}

/**
 * Why nothing was recorded, addressed to the agent, and **the first refusal in this file whose
 * fix belongs to somebody who is not in the room.**
 *
 * Every other one here can be acted on by the caller: send the short version, pick a smaller
 * file, disarm a Routine. This one cannot. The Handbook is full, the remedy is a person removing
 * an entry from the pane, and the wording has to be honest about that rather than implying the
 * agent can try again. Ticket 08 is what puts it in front of the person as well, because an
 * agent paraphrasing a limit it hit is exactly what users read as the agent being confused.
 */
export function handbookFull(would: number, limit = HANDBOOK_LIMIT): string {
  return (
    `your handbook would be ${would.toLocaleString('en-US')} characters and the limit is ` +
    `${limit.toLocaleString('en-US')}, so nothing was recorded. this is not something you can ` +
    'fix: an entry has to be removed, and only the person you are working with can do that. ' +
    'say so if it matters, and carry on.'
  );
}

/**
 * How many `record_entry` calls an agent may make in one turn.
 *
 * One **call**, not one entry, and the difference is ticket 03 reversing its own charting. The
 * cap that makes a Routine proposal safe would make a Handbook useless: an agent that has just
 * been told the positioning, the ICP, the tone and who signs off on copy would be able to record
 * one of them, and briefing would become five turns of an agent asking permission to keep
 * listening. A Routine proposal is a commitment and an entry is a note.
 *
 * So the tool takes a list, and what is bounded is interruptions, which is what the Routine cap
 * was about anyway. Knowledge stays bounded only by characters, which is where a context cost
 * honestly belongs.
 */
export const HANDBOOK_CALLS_PER_TURN = 1;

export function alreadyRecordedThisTurn(): string {
  return (
    'You have already recorded this turn. record_entry takes a list, so write everything you ' +
    'learned in one call.'
  );
}
