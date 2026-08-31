/**
 * When blobot chooses the moment, and what it asks for when it does.
 *
 * The spec's rule was "blobot does not compact", and the larger half of it still holds: blobot
 * provides no inference, writes no summary of its own, and never rewrites an agent's history.
 * It could not in any case — `session/prompt` carries a session id and this turn's blocks, so
 * the transcript we would rewrite lives inside the CLI and was never ours. TanStack's
 * compaction middleware, which is what prompted this, is unavailable to us on the merits.
 *
 * What *is* ours is a **session boundary**. We call `session/new`, we compose the persona, we
 * hold the mailbox. So blobot chooses the moment and the runtime does the work: its own
 * compaction command first, and where that is missing or insufficient, the agent writes a
 * handoff and starts again in a fresh session.
 *
 * The reason a restart is survivable here at all is architectural rather than clever. **An
 * agent's real state is a git worktree, not a conversation.** A chat app that drops a session
 * loses everything; an agent that drops one still has its branch, its commits, its working
 * tree and a `WORKSPACE` line that says so. The handoff carries intent and what was learned. It
 * does not have to carry the work.
 *
 * See `.scratch/transcript-scale/issues/10-compaction-by-handoff.md`.
 */

/**
 * How full a session has to get, as a fraction of ticket 09's working ceiling.
 *
 * **Fire with margin, because the handoff turn is the risk.** Only the agent can write its own
 * handoff, so it costs one turn at the worst moment available — maximum occupancy, and the turn
 * most likely to stop on `max_tokens`. A truncated handoff plus a discarded session is worse
 * than either alone, so the trigger sits well below the ceiling rather than at it, and leaves
 * room for a compaction turn *and* a handoff turn underneath it.
 *
 * Against the working ceiling, never against the advertised window: a fraction of the size the
 * runtime reports fires at 750k on a million-token model and at 150k on a 200k one, and only
 * one of those is a threshold worth having. See `context-ceiling.ts`.
 */
export const COMPACTION_TRIGGER = 0.8;

/**
 * Whether this agent is full enough to be worth a moment, given what it reported.
 *
 * `used` is the runtime's own occupancy reading and `ceiling` is what blobot reckons usable.
 * A ceiling of zero is a runtime that has reported no window, and the answer there is no: an
 * unknown denominator is not a reason to restart somebody's session.
 */
export function overCompactionThreshold(used: number, ceiling: number): boolean {
  if (ceiling <= 0) return false;
  return used >= ceiling * COMPACTION_TRIGGER;
}

/**
 * What blobot asks for, when it asks.
 *
 * Addressed to the agent as a colleague rather than as a subject, in the same voice the wake
 * prompt uses, because it arrives down the same channel and an agent that reads it as the
 * user's instruction will answer the user with it.
 *
 * Three things are deliberate. It says the successor **is** this agent, so the handoff is
 * written in the first person and not as a report about somebody else. It says the worktree
 * survives, because an agent told only that it is about to lose its memory will spend the turn
 * transcribing code it still has. And it asks for **no summary of the conversation**: a retelling
 * of the transcript is the one thing the fresh session does not need and the thing an agent will
 * default to producing.
 *
 * The Handbook clause is the same argument once more, and it is safe to promise because the
 * fresh session's persona is composed by the same function from the same entries: nothing is
 * dropped in the hope it is recoverable, it is already there. An agent spending 1,500 of its
 * 6,000 characters repeating entries has burned the most expensive turn in the app on knowledge
 * that was never at risk.
 *
 * No length limit is stated. One is enforced instead — `HANDOFF_LIMIT` — because a number in the
 * prompt is a target an agent writes up to, and a refusal at the boundary is the shape this repo
 * already uses for what blobot injects. See `bounds.ts`.
 */
export const HANDOFF_PROMPT =
  'Your context is nearly full, so blobot is about to start you a fresh session. You will ' +
  'still be you, on the same branch, in the same working tree, with every commit and every ' +
  'uncommitted change exactly where you left it. Nothing of your work is lost. What is lost ' +
  'is this conversation.\n\n' +
  'Write yourself a handoff, in the first person, as the note you would want to find. Say what ' +
  'you are trying to do and why, what you have already established, what you tried that did ' +
  'not work, and what you were about to do next. Name the files and the branches you care ' +
  'about. Do not summarize this conversation and do not restate code you can read again. ' +
  'Do not restate your Handbook: the fresh session already has it. ' +
  'Answer with the handoff and nothing else.';

/**
 * What the fresh session is opened with.
 *
 * The handoff text, not a path to it. A path would be an ungated read outside the agent's
 * AgentWorkspace, which is the exact refusal in `docs/adr/0004-attachments-are-embedded-not-linked.md`
 * and the reason attachments travel as bytes. The file under `~/.local/share/blobot/` is the
 * user's record of what was carried, not the agent's route to it.
 */
export function resumeFromHandoff(handoff: string): string {
  return (
    'This is a fresh session. You are continuing work you were already doing, and this is the ' +
    'handoff you wrote for yourself before the last session was closed. Pick it up from here. ' +
    'You do not need to reply to this: read it, and wait for your next instruction.\n\n' +
    handoff
  );
}

/**
 * How much handoff blobot will carry into a fresh session, in characters.
 *
 * The same shape and roughly the same size as `PEER_MESSAGE_LIMIT`, and for the same reason: a
 * handoff that is a transcript defeats the entire point of the restart, which was to get the
 * occupancy down. Generous enough for a page of real notes.
 *
 * Over it, blobot **refuses to restart** rather than truncating. A handoff cut off mid-sentence
 * plus a discarded session is the worst of the available outcomes, and this repo's rule for
 * what it injects is a refusal at the boundary, never a silent trim.
 */
export const HANDOFF_LIMIT = 6_000;

/**
 * Why blobot kept the session it had, in words a reader can act on.
 *
 * Every one of these is a refusal to restart, and each one leaves the agent exactly as it was.
 * They are the strings the transcript draws, so they say what happened and offer no remedy:
 * `/compact` is in the palette and the user may still type it.
 */
export const HANDOFF_STOPPED = 'the handoff turn did not finish, so the session was kept';
export const HANDOFF_EMPTY = 'the agent wrote no handoff, so the session was kept';
export function handoffTooLong(length: number, limit = HANDOFF_LIMIT): string {
  return (
    `the handoff was ${length.toLocaleString('en-US')} characters and the limit is ` +
    `${limit.toLocaleString('en-US')}, so the session was kept`
  );
}
export const RESTART_FAILED = 'the fresh session could not be opened, so the session was kept';

/**
 * Where a handoff is kept, so the user can read what was carried.
 *
 * Injected rather than done here, for the reason `TurnRecorder` is injected: the orchestrator
 * has no business knowing a filesystem exists, and a test should be able to collect handoffs in
 * an array. The implementation writes under `~/.local/share/blobot/`, beside the worktrees and
 * **never inside an AgentWorkspace** — that is a checkout of the user's repository, and an agent
 * running `git add -A` would commit blobot's notes home. It is the same reason
 * `adapters/claude/permissions.ts` hands `allowedTools` over the wire instead of writing a
 * settings file.
 */
export interface HandoffArchive {
  /**
   * Keep this handoff, and answer with where it went.
   *
   * `undefined` for an archive that could not write, which is **not** a reason to abandon the
   * restart: the handoff itself travels in the fresh session's first prompt and is in the
   * transcript either way. A full disk should not cost an agent its compaction.
   */
  write(record: HandoffRecord): Promise<string | undefined>;
}

export interface HandoffRecord {
  readonly teamId: string;
  readonly agentId: string;
  readonly agentName: string;
  /** The session being left behind, so a file can be matched to a transcript. */
  readonly sessionId: string;
  readonly at: number;
  readonly handoff: string;
}
