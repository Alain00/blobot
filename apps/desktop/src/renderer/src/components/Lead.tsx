import type { UiAgentProfile } from '../../../shared/api.js';
import { Blob } from './Blob.js';

/**
 * Who leads the team: the agent the team pane writes to when the user names nobody.
 *
 * It sits under the roster on both screens that decide a roster, because the lead is a fact
 * about *this* team rather than about the agent — the same agent leads one team and not
 * another, so it cannot live on the agent's own definition.
 *
 * A picker, which is a word this app is careful with. Ticket 12 removed a `to Alice ▾` from
 * the composer because a per-message recipient control implied a broadcast surface that does
 * not exist. This is not that control: it is chosen once, where the team is composed, and what
 * it decides is which single session an unaddressed message lands in. Everything the composer
 * then does with it is said out loud there, on the send control.
 *
 * It is faces rather than a select, because the answer is an agent and the agent's face is how
 * this app says which one, everywhere else.
 */
export function LeadPicker({
  chosen,
  lead,
  onPick,
}: {
  /** The agents currently on the roster, in the order the screen lists them. */
  chosen: readonly UiAgentProfile[];
  /** Undefined is a real answer: a team may have no lead, and then the pane asks for an `@`. */
  lead?: string;
  onPick: (profileId: string) => void;
}): React.JSX.Element | null {
  if (chosen.length === 0) return null;
  return (
    <div className="leadpick">
      <div className="eyebrow mono">WHO LEADS</div>
      <div className="faces">
        {chosen.map((agent) => (
          <button
            key={agent.id}
            className={`leadface${agent.id === lead ? ' on' : ''}`}
            aria-pressed={agent.id === lead}
            onClick={() => onPick(agent.id)}
          >
            <Blob name={agent.name} size={24} hue={agent.hue} shape={agent.shape} />
            <span className="nm">{agent.name}</span>
          </button>
        ))}
      </div>
      <div className="note mono muted">
        the team pane writes to the lead when you name nobody · @ still says who
      </div>
    </div>
  );
}
