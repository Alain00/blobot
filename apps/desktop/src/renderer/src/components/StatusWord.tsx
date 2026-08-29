import type { AgentStatus } from '@blobot/core/ui';

/**
 * Status, spelled out. Seven states cannot be inferred from a shape, and a coloured dot is
 * exactly what the palette forbids — the blobatars are the only saturated thing on the page.
 *
 * The hairline sweeps only while a turn is in flight: it is the "something is happening" tell
 * that survives being glanced at. `waiting` inverts, the one inversion on the page, spent on
 * the single state where an agent sits forever until a human looks.
 */
export function StatusWord({
  status,
  label,
}: {
  status: AgentStatus;
  label?: string;
}): React.JSX.Element {
  return (
    <span className={`stat is-${status}`}>
      <span className="dotline" />
      {label ?? status}
    </span>
  );
}
