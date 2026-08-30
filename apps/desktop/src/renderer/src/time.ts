/**
 * The transcript and the rail both print times, and they want different things from them: the
 * transcript separates sittings, the rail says which stopped team you were last in. Both live
 * here so there is one place the app's time copy is written.
 */

/** Long enough to be a separate sitting. A burst of replies inside one turn gets no rule. */
const GAP_MS = 15 * 60 * 1000;

/**
 * The rule above a message, or undefined when it belongs to the cluster before it. There was no
 * time anywhere in the transcript before this: a launch restores a persisted conversation
 * verbatim, so yesterday's was indistinguishable from one thirty seconds old, and the agent does
 * not remember it either.
 */
export function timeRule(at: number, previous: number | undefined, now = Date.now()): string | undefined {
  if (previous !== undefined && at - previous < GAP_MS && sameDay(new Date(at), new Date(previous))) {
    return undefined;
  }
  const when = new Date(at);
  const clock = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = dayWord(when, new Date(now));
  return day === undefined ? clock : `${day} ${clock}`;
}

/**
 * How long a stopped team has been quiet. Terse on purpose: it shares a rail row with the
 * count and the status word, and `ago` is the word that gets it truncated.
 */
export function lastActive(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const when = new Date(at);
  if (sameDay(when, new Date(now))) return `${Math.floor(minutes / 60)}h`;
  return dayWord(when, new Date(now)) ?? when.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** `undefined` means today, which needs no word at all. */
function dayWord(when: Date, now: Date): string | undefined {
  if (sameDay(when, now)) return undefined;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(when, yesterday)) return 'yesterday';
  return when.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}
