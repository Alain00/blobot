import { Folder } from 'lucide-react';

/**
 * A team's mark: **its project icon when it has one, and a folder when it does not.**
 *
 * It used to be a drawn folder with the members' faces peeking over the front, then the faces
 * alone. Both were answering *who is on this team* in the rail's smallest slot, and both were
 * wrong for the same reason: the same agents are on several teams, which is ADR-0001's whole
 * point, so two teams sharing a roster drew an identical stack. Faces are the worst
 * discriminator available exactly where the rail is worst — a column of similarly-named teams.
 *
 * So the slot answers one question, *which project is this*, and it answers it twice over: the
 * project's own icon where there is one, and otherwise a folder, which is what a team is — a
 * Workspace with people working in it. The folder is quiet by construction: one stroked glyph
 * at the row's own ink weight, identical down the column, so a row with an icon is the only
 * one that says anything and the eye goes there.
 *
 * Who is on a team is answered one click away, by the rows the team opens into, and by the
 * navigator.
 */
export function TeamMark({
  icon,
  size = 46,
}: {
  /**
   * The team's own icon, as a `data:` URL, when it has one. It *is* the mark, greyed, because
   * the blobatars are the only saturated thing on screen and a column of full-colour favicons
   * would put the loudest thing in the rail on the chrome.
   */
  icon?: string;
  size?: number;
}): React.JSX.Element {
  return (
    <span className="mark" style={{ width: size, height: size }}>
      {icon === undefined ? (
        <Folder className="teamfolder" size={Math.round(size * 0.72)} aria-hidden />
      ) : (
        <img className="teamicon" src={icon} alt="" aria-hidden />
      )}
    </span>
  );
}
