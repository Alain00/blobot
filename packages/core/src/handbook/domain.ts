/**
 * A **Handbook**: what an Agent knows about *this team's* work.
 *
 * Held at `<team>/<agent>` — the same identity the AgentWorkspace branch is named for and a
 * Routine belongs to. The contrast with standing instructions is the whole of the word:
 * standing instructions are about the person and travel with them; a Handbook is about the
 * work and stays with the team. Nobody takes a handbook to a new job.
 *
 * See `.scratch/handbooks/`.
 */

/**
 * Where an entry came from, in the agent's own answer: *did someone tell you this, or did you
 * work it out?*
 *
 * Not derived, and it cannot be. The agent calls `record_entry` in **every** case, including
 * the one that looks like the user's — *add one* in the panel opens the composer rather than a
 * text field, precisely so the tool stays the single path into a Handbook — so there is no call
 * blobot makes itself and nothing from which an author could be inferred. Inferring it from
 * whether the user's message contained an instruction is inference blobot does not provide.
 *
 * A teammate telling an agent something records as `noticed`, never as `told`: a peer carries no
 * operator authority.
 *
 * It is load-bearing rather than bookkeeping. An agent may withdraw an entry it authored as
 * `noticed` and may never touch a `told` one, because removing the user's words is editing the
 * user. See `.scratch/handbooks/issues/10`.
 */
export type EntrySource = 'told' | 'noticed';

/** One thing in a Handbook. Not a *fact*: an Agent recording something it inferred is not asserting one. */
export interface HandbookEntry {
  readonly id: string;
  /**
   * What the agent calls this entry: the number it is drawn under in the persona, and the
   * number `record_entry`'s `replaces` names.
   *
   * **Counted over every entry this Handbook ever had, removed ones included, so it never
   * changes.** The obvious alternative is to number the live list one to n, and it is wrong in a
   * way that is quiet: an entry removed in the pane mid-session renumbers everything under it,
   * while the agent is still reading the persona it was given at session start. It would then
   * correct entry 3 and withdraw what used to be entry 4. Numbering that holds still costs a
   * gap in the sequence after a removal, which is honest, and it is the same act being visible.
   *
   * A column rather than a position derived on read, for a second reason the first version got
   * wrong: `record_entry` takes a list and writes all of it in one millisecond, so any ordering
   * by time and id scrambles the entries *inside* a call and a briefing comes back in an order
   * nobody wrote it in.
   */
  readonly ordinal: number;
  /**
   * The team half of the key. The team's id and never its name, because a team can be renamed
   * and its id cannot.
   */
  readonly teamId: string;
  /**
   * The agent half, as a **name** rather than a row id, so the Handbook outlives the row.
   * Removing somebody from a roster and putting them back is the ordinary way a user fixes a
   * mistake, and `editTeamRoster` mints a fresh id every time it does.
   */
  readonly agentName: string;
  readonly text: string;
  readonly source: EntrySource;
  readonly createdAt: number;
  /** When it was removed, by the user or withdrawn by the agent that authored it. */
  readonly removedAt?: number;
}

/**
 * An entry on its way in. The ordinal is not the caller's to give: it is a position in a list
 * the store owns, and a writer that could choose one could renumber somebody else's.
 */
export type NewHandbookEntry = Omit<HandbookEntry, 'ordinal'>;

/**
 * What the transcript is told when an agent writes to its own Handbook.
 *
 * One channel with two shapes rather than two channels, because they are the same event to the
 * reader: *your agent touched its own persona, here is what it did*. Ticket 08 draws both as a
 * collapsed system line in `Compaction`'s shape.
 *
 * `full` is the only refusal in the app that leaves the room. Every other one in `bounds.ts` has
 * a fix the caller can perform; this one's remedy is a person removing an entry, and the agent
 * will hit the same wall on every turn until somebody does.
 */
export type HandbookWrite =
  | {
      readonly kind: 'recorded';
      readonly agentId: string;
      readonly entries: readonly HandbookEntry[];
      /** Entries withdrawn by a `replaces` in the same call, which is one act and one line. */
      readonly withdrew: readonly HandbookEntry[];
      readonly at: number;
    }
  | { readonly kind: 'full'; readonly agentId: string; readonly at: number };
