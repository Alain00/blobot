import { Folder } from 'lucide-react';
import { Blob } from './Blob.js';
import type { UiTeamMember } from '../../../shared/api.js';

/**
 * A team's mark: **its members' faces, clustered, with its project icon as a sticker.**
 *
 * This file has reverted faces-as-mark twice, and the reason it recorded both times was real: the
 * same agents are on several teams, which is ADR-0001's whole point, so two teams sharing a
 * roster drew an identical stack. What changed in `.scratch/rail/` is not that argument but what
 * the mark is now *for*. It sits beside an agent's own face in one mixed list, so it has to say
 * *this is a team* rather than *this is a folder*; and `08` needed it to say **who is waiting**
 * on a backgrounded team, which a folder cannot. Two teams with the same roster and no icon draw
 * the same mark, and that is accepted: the name and the last line are what a reader uses, and the
 * mark is no longer identifying on its own.
 *
 * **Capped at three.** Drawn to six and to twelve first (`.scratch/rail/prototype.png`): at mark
 * size four faces are texture and twelve are a pattern. Members past three are a `+N` in mono on
 * the row's second line, which the row drops whenever there is a status to show — a stack capped
 * at three must never be the thing claiming a team of nine is three people.
 *
 * The icon stays, greyed, as a sticker rather than as the mark: `DESIGN.md`'s rule survives
 * intact in the same box — the faces say who is on the team, the icon says which project. A team
 * with nobody on it keeps the folder, because a team with no members is still a folder.
 */
export function TeamMark({
  icon,
  members = [],
  size = 46,
}: {
  /**
   * The team's own icon, as a `data:` URL, when it has one. Greyed, because the blobatars are
   * the only saturated thing on screen and a column of full-colour favicons would put the
   * loudest thing in the rail on the chrome.
   */
  icon?: string;
  members?: readonly UiTeamMember[];
  size?: number;
}): React.JSX.Element {
  const faces = members.slice(0, LAYOUT.length);
  const places = LAYOUT[faces.length - 1] ?? [];
  return (
    <span className="mark" style={{ width: size, height: size }}>
      {faces.length === 0 ? (
        <Folder className="teamfolder" size={Math.round(size * 0.72)} aria-hidden />
      ) : (
        faces.map((member, index) => {
          const place = places[index] ?? [0, 0, 1];
          const [x, y, scale] = place;
          return (
            <span
              key={member.id}
              className="markface"
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${scale * 100}%`,
                height: `${scale * 100}%`,
              }}
            >
              {/* Unposed and unanimated, deliberately. The mark folds its members' statuses into
                  one word on the right of the row, and a pose is per face — so posing these
                  would draw three faces each asserting what the fold only ever claimed of
                  somebody. */}
              <Blob
                name={member.name}
                size={Math.round(size * scale)}
                hue={member.hue}
                shape={member.shape}
              />
            </span>
          );
        })
      )}
      {icon !== undefined && <img className="teamicon" src={icon} alt="" aria-hidden />}
    </span>
  );
}

/**
 * Where each face sits, as `[x, y, scale]` fractions of the mark box.
 *
 * The prototype's own table, kept as data rather than as three branches of CSS: it is the
 * decision `03` made, and the overlaps were tuned by eye at 34px against five hand-cut faces.
 * One face fills the box; two and three are smaller and offset so each silhouette keeps an edge
 * of its own, which is what makes them countable at a glance rather than a blob of blobs.
 */
const LAYOUT: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0.0, 0.0, 1.0]],
  [
    [0.0, 0.16, 0.7],
    [0.34, -0.1, 0.7],
  ],
  [
    [0.3, -0.14, 0.7],
    [-0.02, 0.14, 0.7],
    [0.34, 0.26, 0.7],
  ],
];
