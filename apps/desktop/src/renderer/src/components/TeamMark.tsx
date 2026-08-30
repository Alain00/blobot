import { Blobatar } from '@blobatar/react';
import type { AgentStatus } from '@blobot/core/domain';

interface Slot {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * A team's mark: its members packed into one square, arranged by how many there are. One fills
 * the box, a pair sits corner to corner, three make a triangle, four a square, and past four
 * the fourth cell becomes a `+N`.
 *
 * Two things it deliberately does not do.
 *
 * It does not pack the members into the old overlapped row's 28px footprint. The blobatar is
 * ticket 09's motion channel, and breathing at `scale(1.035)` on a 13px blob is half a pixel:
 * that is exactly the regression the 26→34 pass fixed. The box grows instead, and it can,
 * because the agent rows beneath it already carry 34px.
 *
 * And it animates the *folded* team status once, for the whole mark, rather than each member
 * separately. Four members bobbing out of phase is four things fidgeting; one animation over
 * the cluster is one thing moving, which is what a team mark is.
 */
export function TeamMark({
  agents,
  status,
  size = 46,
}: {
  agents: readonly { readonly id: string; readonly name: string; readonly hue?: number }[];
  status: AgentStatus;
  size?: number;
}): React.JSX.Element {
  const { slots, more } = markLayout(agents.length, size);
  const drawn = agents.slice(0, more === undefined ? slots.length : slots.length - 1);

  return (
    <span className={`mark b-${status}`} style={{ width: size, height: size }}>
      {drawn.map((agent, index) => {
        const slot = slots[index] as Slot;
        return (
          <span
            key={agent.id}
            className="blob"
            style={{ left: slot.x, top: slot.y, width: slot.size, height: slot.size }}
          >
            <Blobatar
              name={agent.name}
              size={slot.size}
              {...(agent.hue === undefined ? {} : { hue: agent.hue })}
            />
          </span>
        );
      })}
      {more !== undefined && (
        <span className="more mono" style={boxOf(slots[slots.length - 1] as Slot)}>
          +{more}
        </span>
      )}
    </span>
  );
}

function boxOf(slot: Slot): React.CSSProperties {
  return { left: slot.x, top: slot.y, width: slot.size, height: slot.size };
}

/**
 * Where the members sit, and how many the last slot stands in for. One fills the box, a pair
 * sits corner to corner, three make a triangle, four a square. Past four the last slot is a
 * `+N`, so a team of six draws three members and `+3` rather than four and a lie about there
 * being no more.
 */
export function markLayout(count: number, size: number): { slots: Slot[]; more?: number } {
  // Cells two thirds of the box, so members overlap by about a third of their width and the
  // mark reads as one clump rather than a constellation. A gutter between them leaves air an
  // irregular silhouette cannot fill, and even the earlier few-pixel overlap still scattered.
  const cell = Math.round(size * 0.66);
  const far = size - cell;
  const middle = (size - cell) / 2;

  if (count <= 1) {
    const only = Math.round(size * 0.72);
    return { slots: [{ x: (size - only) / 2, y: (size - only) / 2, size: only }] };
  }
  if (count === 2) {
    return {
      slots: [
        { x: 0, y: 0, size: cell },
        { x: far, y: far, size: cell },
      ],
    };
  }
  if (count === 3) {
    return {
      slots: [
        { x: middle, y: 0, size: cell },
        { x: 0, y: far, size: cell },
        { x: far, y: far, size: cell },
      ],
    };
  }
  const square: Slot[] = [
    { x: 0, y: 0, size: cell },
    { x: far, y: 0, size: cell },
    { x: 0, y: far, size: cell },
    { x: far, y: far, size: cell },
  ];
  return count === 4 ? { slots: square } : { slots: square, more: count - 3 };
}
