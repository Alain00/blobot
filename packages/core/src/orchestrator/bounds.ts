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
