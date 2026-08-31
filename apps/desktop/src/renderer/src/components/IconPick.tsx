import type { UiTeamIcon } from '../../../shared/api.js';
import { TeamMark } from './TeamMark.js';

/**
 * The team's icon, shown as what it will actually be: the mark, with the icon on it.
 *
 * A preview rather than a thumbnail. Somebody deciding whether to keep a detected favicon is
 * deciding how a rail row will read, so the rail row is what they are shown — the icon where
 * there is one, and the plain folder every other team wears where there is not.
 */
export function IconPick({
  icon,
  onChoose,
  onClear,
}: {
  icon?: UiTeamIcon;
  onChoose: () => void;
  onClear: () => void;
}): React.JSX.Element {
  return (
    <div className="iconpick">
      <div className="fieldlabel mono">THE TEAM&apos;S ICON</div>
      <div className="row">
        <TeamMark {...(icon === undefined ? {} : { icon: icon.dataUrl })} size={46} />
        <span className="note muted">
          {icon === undefined
            ? 'Nothing found in this folder. The team is drawn as a plain folder.'
            : `From ${icon.from}. It is what the team is drawn as.`}
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
