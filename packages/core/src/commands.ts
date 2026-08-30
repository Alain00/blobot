import type { AvailableCommand } from './runtime.js';

/**
 * Whether two advertisements are the same menu.
 *
 * Every runtime that caches commands needs this, because a provider re-advertising is not the
 * same thing as a provider changing its mind: OpenCode resends the identical array after every
 * prompt, and the Claude bridge compares by `JSON.stringify` before it re-advertises at all.
 * Without the check, every turn would wake the renderer for nothing.
 *
 * Order is significant, which is the cheap and correct reading: the list is a menu the user
 * will see in order, so a reordering is a change worth redrawing.
 */
export function sameCommands(
  a: readonly AvailableCommand[],
  b: readonly AvailableCommand[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((command, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      command.name === other.name &&
      command.description === other.description &&
      command.hint === other.hint
    );
  });
}
