import { readChanges } from './changes.js';
import type { CommandRunner } from './status.js';

/**
 * How much has changed in an AgentWorkspace since its last commit, in lines.
 *
 * The count a person reads before deciding whether to commit, and the one thing the old tray's
 * `3 changed` could not say: a file touched is not a measure of anything, and *+412 −7* and
 * *+4 −3* are two different afternoons wearing the same word.
 *
 * **It is the sum of `changes.ts`, not a second reader.** The rows moved there when the git
 * panel needed them one at a time; this is what is left, and keeping one read is what makes it
 * impossible for the panel's total and the tray's figure to disagree. Everything about *how* the
 * numbers are found — against `HEAD`, untracked as all additions, the ceiling — is stated there.
 */

export interface Churn {
  readonly added: number;
  readonly removed: number;
  /** Files with something in them, tracked and untracked together. */
  readonly files: number;
  /** More untracked files than the ceiling, so the additions are a floor and not a total. */
  readonly partial?: boolean;
}

export async function readChurn(cwd: string, exec: CommandRunner): Promise<Churn | undefined> {
  const changes = await readChanges(cwd, exec);
  if (changes === undefined) return undefined;
  const { added, removed, files } = changes;
  return { added, removed, files, ...(changes.partial === true ? { partial: true } : {}) };
}
