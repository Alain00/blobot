import { Blobatar } from '@blobatar/react';
import type { AgentStatus } from '@blobot/core/domain';

interface Slot {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * A team's mark: a folder, monochrome, with its members peeking over the front.
 *
 * The folder is the container and the faces are the only colour in it, which is the governing
 * rule made into an object rather than merely obeyed. It also gives the rail's one structural
 * fact — the open team's members are listed beneath it — something to be true *of*: the team
 * you are looking at is the one whose folder is open, and its agents are out of it.
 *
 * Three things it deliberately does.
 *
 * The faces are **cropped, never shrunk**. A folder eats about half the box, and fitting whole
 * faces into what is left would put them back at the 13px the 26→34 pass was fixed to escape,
 * where breathing at `scale(1.035)` is half a pixel. The front panel occludes their lower half
 * instead, so a face stays the size it needs to be to read as a face.
 *
 * At most three peek, and the rest are a `+N` on the front. A folder showing the first few of
 * what is inside is what a folder does; four faces crushed into 46px is mush.
 *
 * And it animates the *folded* team status once, as the folder, rather than per face. Four
 * members bobbing out of phase is four things fidgeting; a folder that moves is one thing
 * moving, and it is the right one, because the fold is a claim about the team and not about
 * anybody in it.
 */
export function TeamMark({
  agents,
  status,
  size = 46,
  open = false,
}: {
  agents: readonly { readonly id: string; readonly name: string; readonly hue?: number }[];
  status: AgentStatus;
  size?: number;
  /**
   * This team is the one on screen, so the folder is open and its agents are the rows beneath
   * it rather than cargo.
   */
  open?: boolean;
}): React.JSX.Element {
  const { slots, more } = peekLayout(agents.length, size);
  // An open folder is empty. Keeping one face in it was tried and is a worse lie than the one
  // it was meant to prevent: a folder with a single face in it reads as *a team of one*, and
  // the team it is drawn for is precisely the one whose whole roster is listed underneath.
  const drawn = open ? [] : agents.slice(0, slots.length);

  return (
    <span
      className={`mark folder b-${status}${open ? ' open' : ''}`}
      style={{ width: size, height: size }}
    >
      {/* Back panel and tab. Inline SVG rather than two bordered boxes, because the open front
          is a trapezoid and a `clip-path` on a bordered box loses the stroke down every slanted
          edge — the shape would be a filled wedge with a hairline on two sides of four. The
          stroke is `non-scaling`, so it is one physical pixel at 46px and still one at 138. */}
      <svg className="back" viewBox="0 0 100 100" aria-hidden>
        <path d={BACK} vectorEffect="non-scaling-stroke" />
      </svg>
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
      <svg className="front" viewBox="0 0 100 100" aria-hidden>
        <path d={open ? FRONT_OPEN : FRONT_SHUT} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* On the front panel, where a folder is labelled, and only while it is shut: an open
          folder's members are enumerated in full on the rows underneath it. */}
      {more !== undefined && !open && <span className="more mono">+{more}</span>}
    </span>
  );
}

/**
 * The folder, in a 100-unit square. Three paths, and the geometry is the ordinary folder icon
 * rather than anything invented here: a tab stepping down to the right along the back, and a
 * front that is a plain panel when it is shut and a **flared pocket** when it is open.
 *
 * The flare is what makes *open* unmistakable. Everything gentler that was tried — a tapered
 * clip-path, a dropped panel, a rotated flap — read as a folder that was merely *empty*, and
 * empty already means something in this column: the dashed ghost of a team with nobody on it.
 * A pocket wider at the top than the box and narrower at the bottom cannot be read as anything
 * but a container standing open.
 *
 * **The back ends at y=58, well above the bottom of either front.** It is a back: none of it
 * below the fold is ever meant to be seen, and the first version ran it to y=84, where its two
 * bottom corners came out past the sides of the narrowing pocket and read as a misalignment.
 * The number is not arbitrary — the open pocket's edges pass the back's at y≈59, so anything
 * lower is visible again.
 *
 * The whole folder sits inside x 4..96 and y 21..79 rather than filling the box. It is chrome
 * around the only saturated thing on the page, and a folder drawn to the edges made the faces
 * the smaller half of their own mark.
 *
 * The front's top edge sits at y=50 in both states, so a face is cropped at the same line
 * whether the folder is shut or open. `peekLayout` is written against that number.
 */
const BACK =
  'M8 58 V25 a3.5 3.5 0 0 1 3.5-3.5 h20 a3.5 3.5 0 0 1 2.47 1.02 l5.56 5.56 ' +
  'a3.5 3.5 0 0 0 2.47 1.02 H88.5 a3.5 3.5 0 0 1 3.5 3.5 V58 Z';
const FRONT_SHUT = 'M8 50 H92 V75.5 a3.5 3.5 0 0 1-3.5 3.5 H11.5 a3.5 3.5 0 0 1-3.5-3.5 Z';
const FRONT_OPEN =
  'M4 50 H96 L81.9 76 a3.5 3.5 0 0 1-3.22 2.1 H21.32 a3.5 3.5 0 0 1-3.22-2.1 Z';

/**
 * Where the peeking members sit, and how many the `+N` stands in for.
 *
 * A row of at most three, overlapping by most of a face, high enough that the front panel crops
 * them rather than hides them, and **never wider than the folder they are in**. The folder runs
 * from x=8 to x=92 of the box's 100 units, so that is the width to fit into: at full size three
 * faces came to 98 units and the outer two hung past the folder's sides, reading as faces
 * standing beside a container rather than in one.
 *
 * They fit because a peeking face may be small. The 26px floor that governs a blobatar elsewhere
 * is a floor on *motion* — below it, breathing at `scale(1.035)` is half a pixel — and these
 * faces do not move: the folder carries the team's folded status, and they are its cargo. All
 * they have to do is be identifiable, which a blob with its own hue manages well under that.
 */
export function peekLayout(count: number, size: number): { slots: Slot[]; more?: number } {
  const face = Math.round(size * 0.52);
  /** The width the folder actually gives them: `BACK` runs from x=8 to x=92. */
  const inner = Math.round(size * 0.84);
  // Between a quarter and a third of a face apart, so they read as a clump in a pocket rather
  // than as three separate things that happen to share a container — and never so far apart
  // that the outer ones leave the folder, whatever the rounding does.
  const step = Math.min(Math.round(face * 0.28), Math.floor((inner - face) / 2));
  // High enough to rise clear of the back panel's top edge at y=21, and low enough that the
  // front at y=50 crops about a quarter of a face away. Both together are what make them read
  // as *in* the folder rather than as sitting on top of one.
  const top = Math.round(size * 0.12);
  const shown = Math.min(count, 3);
  const total = face + Math.max(shown - 1, 0) * step;
  const left = Math.round((size - total) / 2);

  const slots = Array.from({ length: shown }, (_, index) => ({
    x: left + index * step,
    y: top,
    size: face,
  }));
  return count > 3 ? { slots, more: count - 3 } : { slots };
}
