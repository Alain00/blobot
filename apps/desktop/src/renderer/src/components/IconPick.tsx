import type { UiAgentProfile, UiTeamIcon } from '../../../shared/api.js';
import { TeamMark } from './TeamMark.js';

/**
 * The team's icon, shown as what it will actually be: the mark, with the icon on it.
 *
 * A preview rather than a thumbnail, because the icon is not a picture of the team — the faces
 * are, and this is a label on the folder they are in. Somebody deciding whether to keep a
 * detected favicon is deciding how a rail row will read, so the rail row is what they are shown.
 *
 * The faces are whoever has been ticked so far, which is often nobody yet. An empty folder is
 * the honest preview of a team with nobody on it, and it fills in as the roster below is picked.
 */
export function IconPick({
  agents,
  icon,
  onChoose,
  onClear,
}: {
  agents: readonly UiAgentProfile[];
  icon?: UiTeamIcon;
  onChoose: () => void;
  onClear: () => void;
}): React.JSX.Element {
  return (
    <div className="iconpick">
      <div className="fieldlabel mono">THE TEAM&apos;S ICON</div>
      <div className="row">
        <TeamMark
          agents={agents}
          {...(icon === undefined ? {} : { icon: icon.dataUrl })}
          size={46}
        />
        <span className="note muted">
          {icon === undefined
            ? 'Nothing found in this folder. The team is drawn from the faces of the agents on it.'
            : `From ${icon.from}. It goes on the folder, and the faces stay.`}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onChoose}>
          choose an image…
        </button>
        {icon !== undefined && (
          <button className="btn" onClick={onClear}>
            no icon
          </button>
        )}
      </div>
    </div>
  );
}
