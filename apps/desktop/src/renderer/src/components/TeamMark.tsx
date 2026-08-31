import { Blobatar } from '@blobatar/react';
import { SHAPE_TRAITS } from '../blobatar-shapes';

interface Slot {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * A team's mark: **its project icon when it has one, and its members' faces when it does not.**
 *
 * It used to be a drawn folder with the faces peeking over the front and the icon stuck on the
 * panel, which answered both of the rail's questions at once — *who is on this team* and *which
 * project is this* — and paid for it in density. At the 34px a row draws, a back panel, a front
 * panel, three cropped faces, a `+N` and a straddling sticker is five things inside one 34px
 * box, repeated down a column whose whole job is to be quiet. The container was the noise, and
 * the two answers stacked in one slot were what made the container necessary.
 *
 * So the slot answers one question, and the icon wins it where there is one. That is the
 * reversal of `DESIGN.md`'s old rule rather than a softening of it: **an icon is the better
 * discriminator.** A column of similarly-named teams is exactly what the rail is worst at, and
 * faces cannot help there — the same agents are on several teams, which is ADR-0001's whole
 * point, so two teams sharing a roster draw an identical stack. A project icon is unique to the
 * project by construction.
 *
 * What is given up is said plainly: on a team with an icon, the rail no longer says who is on
 * it. That is answered one click away, by the rows the team opens into, and by the navigator.
 *
 * The faces are the fallback and not a lesser state — a team without an icon is not a team
 * missing one, and there is no placeholder in either direction.
 */
export function TeamMark({
  agents,
  icon,
  size = 46,
}: {
  agents: readonly { readonly id: string; readonly name: string; readonly hue?: number }[];
  /**
   * The team's own icon, as a `data:` URL, when it has one. It *is* the mark, greyed, because
   * the blobatars are the only saturated thing on screen and a column of full-colour favicons
   * would put the loudest thing in the rail on the chrome.
   */
  icon?: string;
  size?: number;
}): React.JSX.Element {
  if (icon !== undefined) {
    return (
      <span className="mark" style={{ width: size, height: size }}>
        <img className="teamicon" src={icon} alt="" aria-hidden />
      </span>
    );
  }

  const { slots, more } = peekLayout(agents.length, size);
  // The last slot is the `+N` when there is one, so it is not a face's to fill.
  const drawn = agents.slice(0, more === undefined ? slots.length : slots.length - 1);

  return (
    <span className="mark" style={{ width: size, height: size }}>
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
              traits={SHAPE_TRAITS}
              {...(agent.hue === undefined ? {} : { hue: agent.hue })}
            />
          </span>
        );
      })}
      {/* The rest of the team, in the last slot rather than beside the stack. It is one of the
          things being counted and sits where one would, which is what stops it reading as a
          label about the group. */}
      {more !== undefined && (
        <span
          className="more mono"
          style={countBox(slots[slots.length - 1] as Slot)}
          aria-hidden
        >
          +{more}
        </span>
      )}
    </span>
  );
}

/** The `+N` fills the slot it was given, so it is the same object as the faces beside it. */
function countBox(slot: Slot): React.CSSProperties {
  return { left: slot.x, top: slot.y, width: slot.size, height: slot.size };
}

/**
 * Where the faces sit, and how many the `+N` stands in for.
 *
 * A centred row of at most three, overlapping by most of a face, filling the box. There is no
 * folder to fit inside any more — the faces *are* the mark — so they take the whole width, and
 * a face is drawn whole rather than cropped at the halfway line.
 *
 * **Past three, the last slot is the count and not a face.** The old folder could show three and
 * label a fourth on its panel, because the panel was a surface the faces did not occupy. A bare
 * stack has no such surface: a `+N` hung beside it reads as a caption on the row, and one laid
 * over the third face hides the thing it is counting. So a team of five draws two faces and a
 * `+2`, and the slot arithmetic is unchanged — the count is one of the three.
 *
 * They may be small. The 26px floor that governs a blobatar elsewhere is a floor on *motion* —
 * below it, breathing at `scale(1.035)` is half a pixel — and these do not move: the row carries
 * the team's folded status in the same word and dots the agent rows use.
 */
export function peekLayout(count: number, size: number): { slots: Slot[]; more?: number } {
  const face = Math.round(size * 0.54);
  const shown = Math.min(count, 3);
  // Whatever is left of the box after one face, split between the gaps. Three faces exactly
  // span it; one sits in the middle.
  const step = shown > 1 ? Math.floor((size - face) / (shown - 1)) : 0;
  const total = face + Math.max(shown - 1, 0) * step;
  const left = Math.round((size - total) / 2);
  const top = Math.round((size - face) / 2);

  const slots = Array.from({ length: shown }, (_, index) => ({
    x: left + index * step,
    y: top,
    size: face,
  }));
  return count > 3 ? { slots, more: count - 2 } : { slots };
}
