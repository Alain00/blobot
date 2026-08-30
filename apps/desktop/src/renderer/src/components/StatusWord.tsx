import type { AgentStatus } from '@blobot/core/domain';

/**
 * Status, in the one place the app says it: the rail. A coloured dot is exactly what the palette
 * forbids — the blobatars are the only saturated thing on the page — so this is a shape and a
 * word, and **never both at once**.
 *
 * **Three dots while a turn is in flight, and no word.** `starting`, `thinking`, `working` and
 * `responding` are all one fact to a person glancing at a column: this one is busy. Printing
 * WORKING beside three dots that are already saying so is the same claim twice, in the row of an
 * interface with the least room for it, and the word is the half a glance does not read. It also
 * outlived what it was for: it used to be the only thing separating four body animations that
 * turned out to be sub-pixel, and now the dots separate nothing because there is nothing to
 * separate. Which *kind* of busy is a question the transcript answers concretely, in tool lines
 * and text arriving, rather than as an abstraction over them.
 *
 * The dots are the transcript's pending dots — the same glyph, the same keyframes — because that
 * shape already means "still coming" one column over.
 *
 * **The word survives exactly where the dots would lie.** `waiting` is not busy, it is stopped
 * until a human looks, and it takes the word *and* the one inversion on the page: on a
 * backgrounded team's row that is the only way a permission request reaches anybody. `failed` is
 * not busy either, and keeps its struck word. `idle` says nothing at all, here or anywhere: it
 * is the resting state of a quiet app.
 *
 * A `label` is a fold ("2 waiting"), and it is honoured only where a word is printed. In flight
 * there is no count, because there is no word for a count to qualify.
 */
export function StatusWord({
  status,
  label,
}: {
  status: AgentStatus;
  label?: string;
}): React.JSX.Element {
  if (inFlight(status)) {
    // The label is dropped with the word, not rendered invisibly: `aria-label` carries the state
    // for anyone not reading the shape, so nothing is lost to a screen reader by the row being
    // quieter to look at.
    return (
      <span className={`stat is-${status}`} role="status" aria-label={label ?? status}>
        <span className="dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </span>
    );
  }

  return <span className={`stat is-${status}`}>{label ?? status}</span>;
}

/** Busy, whatever kind of busy. The states the dots say everything about, and the word nothing. */
function inFlight(status: AgentStatus): boolean {
  return (
    status === 'starting' ||
    status === 'thinking' ||
    status === 'working' ||
    status === 'responding'
  );
}
