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
