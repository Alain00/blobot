import { detectRuntimes, type RuntimeDetection } from '@blobot/core';

/**
 * Detection, asked once per launch instead of once per question.
 *
 * `detectRuntimes` locates each binary, reads its version and probes its login, and it was
 * measured at **1.5 seconds on this machine, every call**. Five handlers were awaiting it, one
 * of them the options picker, which meant the picker paid a second and a half before it could
 * even look at what it had remembered.
 *
 * **Never persisted, unlike the option lists.** Detection is a claim about this machine right
 * now — installed, signed in, which binary — and a remembered tick that says *signed in* about
 * a CLI that has since been logged out is exactly the confident false answer ticket 11 refuses.
 * A process-lifetime memo is as far as it can honestly go.
 *
 * It is refreshed where the user is looking at the answer: opening a dialog that lists the
 * runtimes re-detects, because installing a CLI and coming back is the one moment this changes.
 * Everything else reads what that gave, or triggers the first detection if nothing has yet.
 */
let known: Promise<readonly RuntimeDetection[]> | undefined;

/** What was detected, detecting only if nobody has yet this launch. */
export function knownRuntimes(): Promise<readonly RuntimeDetection[]> {
  known ??= detectRuntimes();
  return known;
}

/** Ask the machine again. For the surfaces that *show* readiness, and only those. */
export function refreshKnownRuntimes(): Promise<readonly RuntimeDetection[]> {
  known = detectRuntimes();
  return known;
}

/** The one detection a caller usually wants, by id. */
export async function knownRuntime(runtimeId: string): Promise<RuntimeDetection | undefined> {
  return (await knownRuntimes()).find((detection) => detection.runtimeId === runtimeId);
}
