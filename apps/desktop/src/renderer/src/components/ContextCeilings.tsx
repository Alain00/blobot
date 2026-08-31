import { useEffect, useState } from 'react';
import { COMPACTION_TRIGGER, UNMEASURED_CAP, UNMEASURED_FRACTION } from '@blobot/core/domain';
import type { UiContextCeiling } from '../../../shared/api.js';
import { RuntimeMark } from './RuntimeMark.js';

/**
 * *Context*, the settings screen's second section: where each model stops being worth more room.
 *
 * The gauge in the activity column is drawn against the window the runtime reports, and that
 * number answers one question honestly, which is when the turn hard-stops. This is the other
 * number: the point past which more context stops buying better answers. It is what the mark on
 * the gauge sits at, and it is what compaction measures against, so it is the one figure in the
 * app that decides when an agent is asked for a handoff.
 *
 * It is here because it is knowledge, not a preference. blobot ships a table of what it has been
 * told, and the table ages on somebody else's release cadence, which is the hazard ADR-0003
 * fought from the other end. The person who can actually watch a model go vague is the one
 * sitting in front of it, and until this screen they had nowhere to write down what they saw.
 *
 * **The renderer still cannot tell which runtime is which.** A row arrives with a label, a model
 * string and a number, exactly as the runtimes section's rows do, and the mark beside it is the
 * one vendor path in the app. Nothing here branches on a provider.
 */
export function ContextCeilings(): React.JSX.Element {
  const [rows, setRows] = useState<readonly UiContextCeiling[]>([]);

  useEffect(() => {
    void window.blobot.contextCeilings().then(setRows);
  }, []);

  const percent = Math.round(COMPACTION_TRIGGER * 100);
  return (
    <>
      {/* Stated where the numbers are, because a figure somebody is about to change should say
          what it does before they change it. The second sentence is the one that matters: this
          is not the window, and mistaking the two is the whole reason the concept exists. */}
      <div className="note muted">
        The gauge is drawn against the window a runtime reports. This is the other number: where
        a model stops being worth more context, which is what compaction measures against. blobot
        asks an agent for a handoff at {percent}% of it, and never rewrites what the agent
        remembers. Set one if you have watched a model hold up longer, or go wrong sooner, than
        blobot assumes. It reaches teams that are already running.
      </div>

      <div className="roster">
        {rows.map((row) => (
          <CeilingRow
            key={`${row.runtimeId} ${row.model ?? ''}`}
            row={row}
            onSet={(tokens) =>
              void window.blobot
                .setContextCeiling(row.runtimeId, row.model, tokens)
                .then(setRows)
            }
          />
        ))}
        {rows.length === 0 && (
          <div className="note muted">
            Nothing to set yet. A model appears here once an agent is hired on it.
          </div>
        )}
      </div>
    </>
  );
}

/** The floor and the roof main will store, repeated here so the button is honest before the
 *  round trip. Not a judgement about a model: it is the range in which a token count is one. */
const FLOOR = 10_000;
const ROOF = 5_000_000;

function CeilingRow({
  row,
  onSet,
}: {
  row: UiContextCeiling;
  onSet: (tokens: number | undefined) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(row.tokens === undefined ? '' : String(row.tokens));

  // The list is replaced whole after every write, so a row that was not the one edited still
  // gets a new object. Following the value keeps a stale draft out of a row nobody touched.
  useEffect(() => setDraft(row.tokens === undefined ? '' : String(row.tokens)), [row.tokens]);

  const typed = Number(draft.replace(/[\s,]/g, ''));
  const valid = draft !== '' && Number.isInteger(typed) && typed >= FLOOR && typed <= ROOF;
  const changed = valid && typed !== row.tokens;

  return (
    <div className="listrow tall ceilingrow">
      <RuntimeMark runtimeId={row.runtimeId} />
      <span className="who">
        <span className="nm">
          {/* The model as the runtime names it, in mono, because it is a literal string and it
              is what the ceiling is keyed on. A runtime that offers no model to choose gets the
              sentence instead: the row is about an agent that let the runtime pick, which is a
              real thing to hold a number for and not a guess about which model that is. */}
          {row.model === undefined ? (
            <b>{row.runtimeLabel}, whichever model it picks</b>
          ) : (
            <>
              <b className="mono">{row.model}</b>
              <span className="mono muted">{row.runtimeLabel}</span>
            </>
          )}
        </span>
        <span className="sub mono muted">
          {describe(row)}
          {row.used.length > 0 && ` · ${row.used.join(', ')}`}
        </span>
      </span>
      <span style={{ flex: 1 }} />
      <input
        className="field narrow"
        value={draft}
        inputMode="numeric"
        placeholder="tokens"
        aria-label={`Working ceiling for ${row.model ?? row.runtimeLabel}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && changed) onSet(typed);
        }}
      />
      <button className="btn tiny" disabled={!changed} onClick={() => onSet(typed)}>
        set
      </button>
      {/* Only where there is something to take back. A *reset* beside a number blobot chose
          would be offering to undo something the user never did. */}
      {row.source === 'yours' && (
        <button className="btn tiny" onClick={() => onSet(undefined)}>
          unset
        </button>
      )}
    </div>
  );
}

/**
 * What the number is and where it came from, in one line.
 *
 * The unmeasured case draws the *rule* rather than a figure, and that is the honest answer: the
 * fallback is a fraction of a window that nobody is reporting for a model nobody is running, so
 * a number here would be a claim about a session that does not exist.
 */
function describe(row: UiContextCeiling): string {
  if (row.tokens === undefined) {
    return `${Math.round(UNMEASURED_FRACTION * 100)}% of the window, up to ${count(UNMEASURED_CAP)} · blobot's fallback`;
  }
  const handoff = Math.round(row.tokens * COMPACTION_TRIGGER);
  const source = row.source === 'yours' ? 'yours' : 'blobot ships this one';
  return `${count(row.tokens)} tokens · handoff at ${count(handoff)} · ${source}`;
}

function count(tokens: number): string {
  return tokens.toLocaleString('en-US');
}
