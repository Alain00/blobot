import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import type { UiRoutine, UiRoutineRun, UiRoutineTarget } from '../../../shared/api.js';
import { lastActive, nextRun } from '../time.js';
import { Blob } from './Blob.js';
import { RoutineForm } from './RoutineForm.js';

/**
 * Routines: everything that runs on a clock, over the working surface.
 *
 * Reached from a `ROUTINES` row above TEAMS, beside the door to *your agents*, because that is
 * the order the model reads in: an agent exists before a team, and a Routine belongs to an agent.
 * The rail is one list and gets a **row** here rather than a second list, and that row carries no
 * count and no status — a number of armed Routines is not something the user can act on from the
 * rail, and a status there would compete with the `waiting` inversion that is how a parked run
 * reaches them.
 *
 * A **working** surface, like *your agents* and unlike the creation flow: no hand face, no
 * standfirst, no numerals. `DESIGN.md` says that page works because it is the only one.
 *
 * **Sorted by last run, most recent first.** That is issue 07's *what happened while I was away*,
 * answered without a digest screen: the things that ran overnight are at the top in the morning,
 * in order, already. A sort is cheaper than a surface and cannot go stale. Main does the sorting,
 * because the key is a `routine_runs` row.
 */
export function Routines({
  onClose,
  writingAtOnce,
}: {
  onClose: () => void;
  /** `--screen=new-routine` only: the dialog a screenshot cannot click its way to. */
  writingAtOnce?: boolean;
}): React.JSX.Element {
  const [rows, setRows] = useState<readonly UiRoutine[]>([]);
  const [targets, setTargets] = useState<readonly UiRoutineTarget[]>([]);
  const [writing, setWriting] = useState(writingAtOnce === true);
  /** Which Routine a dialog is about, by id: the row it came from is replaced on every reload. */
  const [editing, setEditing] = useState<string | undefined>();
  /** Which row has its run history open. One at a time, and closed is the resting state. */
  const [showing, setShowing] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async (): Promise<void> => {
    setRows(await window.blobot.listRoutines());
  }, []);

  useEffect(() => {
    void reload();
    void window.blobot.routineTargets().then(setTargets);
    // A firing writes a row, a proposal arrives without anybody saying anything, and both reach
    // the renderer on the same channel a team change does. Nothing here polls a clock.
    return window.blobot.onTeamChanged(() => void reload());
  }, [reload]);

  const dialogOpen = writing || editing !== undefined;
  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen, onClose]);

  // **Not a proposal any more, and it must not draw like a Routine the user made either.**
  //
  // Issue 05's 2026-08-30 amendment: an agent arms what it schedules, so nothing here is waiting
  // for permission. What is still true is that a person has not looked at it, and that is the
  // second half of the control that pays for the amendment — the first half is the block in the
  // transcript. `proposedByName` is present only while `reviewed_at` is unset, so the ink edge
  // is *you have not seen this*, never *this is waiting for you*: it has been running the whole
  // time it has been sitting there.
  const proposals = rows.filter((row) => row.proposedByName !== undefined);
  const scheduled = rows.filter((row) => row.proposedByName === undefined);
  const editingRoutine = rows.find((row) => row.id === editing);

  const act = async (run: Promise<unknown>): Promise<void> => {
    await run;
    await reload();
  };

  return (
    <div className="agentspage">
      <div className="agentssheet">
        <header className="agentshead">
          <div>
            <div className="eyebrow mono">ROUTINES</div>
            <h1 className="subhead lg">
              {rows.length === 0 ? 'Nothing on a clock' : 'What runs without you'}
            </h1>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => setWriting(true)} disabled={targets.length === 0}>
            new routine
          </button>
          <button className="iconbtn" onClick={onClose} title="Close" aria-label="Close">
            <X size={17} aria-hidden />
          </button>
        </header>

        {/* The one place the limitation is stated, and it is stated rather than apologised for.
            blobot is a desktop app and not a daemon: a schedule it cannot keep is worse than one
            it can, and this is the sentence that keeps the promise honest. */}
        <div className="note muted">
          blobot runs these while it is open. It does not run them in the background.
        </div>

        {error !== undefined && <div className="refusal">{error}</div>}

        {/* Above the list rather than sorted into it, with an ink edge, until a person answers.
            Two verbs and only two, and under the amendment they are `keep` and `disarm` rather
            than `arm` and `discard`: the question changed from *may this run* to *should it go
            on running*, and both answers are answers. Removing it outright is on the row, once
            it has joined the list. */}
        {proposals.map((row) => (
          <div key={row.id} className="proposal">
            {/* **The prompt is the user's to change.** An agent wrote these words and the person
                reading them is the one who has to live with what they do every hour, so the way
                out of a prompt that is nearly right must not be *disarm it and write it again*.
                Main has always allowed it — a save on a proposal marks it reviewed, because
                editing one is answering it — and it was only ever missing from this block.

                Shown rather than revealed on hover, which is the one place this departs from
                the rail's rule. That rule exists because a delete button on every row of a quiet
                column would be the loudest thing in it; a proposal is not a quiet column, it is
                a block asking for a decision, and this is the third thing a person can do about
                it. It stays an icon, so the two *verbs* below are still the only two verbs. */}
            <span className="rowacts on">
              <button
                className="iconbtn sm"
                onClick={() => setEditing(row.id)}
                title={`Edit ${row.name}`}
                aria-label={`Edit ${row.name}`}
              >
                <Pencil size={13} aria-hidden />
              </button>
            </span>
            {/* It gave itself this. The state is said plainly beside that, because the whole
                point of the ink edge is that it has been running while you were not looking. */}
            <div className="mono muted">
              {row.proposedByName} scheduled this · {row.armed ? 'running' : 'not running'}
            </div>
            <div className="routinename">
              <b>{row.name}</b>
              {/* The shape and what the shape costs, together, because this is the moment a
                  person decides: an hourly Routine spends twenty-four times what a daily one
                  does against the same per-run ceiling. A count, never a price. */}
              <span className="mono muted">
                {row.scheduleLabel} · {row.frequencyLabel}
              </span>
            </div>
            <Whose row={row} />
            {/* A peek, with the rest one press away. It was shown in full on the argument that
                a person is being asked to read it; a real prompt is thirty lines, and the block
                that asks the question then holds its two answers below the fold. */}
            <ProposedPrompt prompt={row.prompt} />
            <div className="proposalacts">
              {/* `keep` answers without changing anything, which is why it is not the loud one:
                  the loud control is the one that grants authority, and the authority was
                  already taken. What a person does here is let it stand or take it back. */}
              <button
                className="btn"
                onClick={() => void act(window.blobot.setRoutineArmed(row.id, row.armed))}
              >
                keep
              </button>
              <button
                className="btn primary"
                onClick={() => void act(window.blobot.setRoutineArmed(row.id, false))}
                disabled={!row.armed}
              >
                disarm
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 ? (
          <div className="note muted">
            A routine is one instruction to one agent, delivered on a clock instead of by you.
            {targets.length === 0 ? ' Put somebody on a team first.' : ''}
          </div>
        ) : (
          <div className="roster">
            {scheduled.map((row) => (
              <Row
                key={row.id}
                row={row}
                open={showing === row.id}
                onToggleRuns={() => setShowing(showing === row.id ? undefined : row.id)}
                onEdit={() => setEditing(row.id)}
                onArm={(armed) => void act(window.blobot.setRoutineArmed(row.id, armed))}
                onDelete={() => void act(window.blobot.deleteRoutine(row.id))}
                onRunNow={() => {
                  setError(undefined);
                  void window.blobot.runRoutineNow(row.id).then((result) => {
                    if (result.ok) void reload();
                    else setError(result.error ?? 'It would not run.');
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {writing && (
        <RoutineForm
          targets={targets}
          onClose={() => setWriting(false)}
          onSaved={async () => {
            await reload();
            setWriting(false);
          }}
        />
      )}
      {editingRoutine !== undefined && (
        <RoutineForm
          routine={editingRoutine}
          targets={targets}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            await reload();
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}

/**
 * The prompt an agent wrote for itself: five lines, then the rest on a press.
 *
 * Clamped rather than full, which is a reversal. The words still have to be readable — that is
 * the whole of what the ink edge used to promise and the whole of what a person is answering —
 * but `keep` and `disarm` have to be on screen with them, and an unbounded paragraph puts them
 * anywhere. The control says how much is being withheld by saying nothing about it: it is
 * `more` and then `less`, never a line count nobody can act on.
 */
function ProposedPrompt({ prompt }: { prompt: string }): React.JSX.Element {
  const [all, setAll] = useState(false);
  // Five lines of this width is roughly where a paragraph stops being a peek. Measuring the
  // clamp to decide whether to offer the control would be a layout read on every render; the
  // length of the text answers the same question and cannot be wrong in the direction that
  // matters, since a short prompt with a `more` on it opens to itself.
  const long = prompt.length > 320 || prompt.split('\n').length > 5;
  return (
    <>
      <div className={all ? 'proposedprompt all' : 'proposedprompt'}>{prompt}</div>
      {long && (
        <button className="morepr mono muted" onClick={() => setAll(!all)}>
          {all ? 'less' : 'more'}
        </button>
      )}
    </>
  );
}

/** The face and the name of the agent this belongs to, and the team that gives it one. */
function Whose({ row }: { row: UiRoutine }): React.JSX.Element {
  if (row.agentName === undefined) {
    // Kept and disarmed rather than reassigned: blobot does not decide who a message is for.
    return <span className="sub mono muted">its agent is no longer on a team</span>;
  }
  return (
    <span className="sub mono muted whose">
      <Blob name={row.agentName} size={16} hue={row.agentHue} />
      {row.agentName}
      {row.teamName === undefined ? '' : ` · ${row.teamName}`}
    </span>
  );
}

function Row({
  row,
  open,
  onToggleRuns,
  onEdit,
  onArm,
  onDelete,
  onRunNow,
}: {
  row: UiRoutine;
  open: boolean;
  onToggleRuns: () => void;
  onEdit: () => void;
  onArm: (armed: boolean) => void;
  onDelete: () => void;
  onRunNow: () => void;
}): React.JSX.Element {
  return (
    <div className={`routinewrap${row.armed ? '' : ' off'}`}>
      <div className="routinerow">
        <span className="who">
          <span className="routinename">
            <b>{row.name}</b>
            <span className="mono muted">{row.scheduleLabel}</span>
          </span>
          <Whose row={row} />
          {/* Where the next-run line would be, plain and not an error: a laptop that was shut is
              the ordinary condition, not a fault. `Run now` beside it is the whole remedy. */}
          <span className="sub mono muted">
            {row.missedFirings !== undefined
              ? `missed ${row.missedFirings} firing${row.missedFirings === 1 ? '' : 's'}`
              : row.nextRunAt !== undefined
                ? `next run ${nextRun(row.nextRunAt)}`
                : 'not running'}
          </span>
          {/* Clamped to two lines, the way standing instructions are on *your agents*: it is a
              paragraph the user wrote, and one verbose Routine would push the rest off screen. */}
          <span className="standing muted">{row.prompt}</span>
        </span>

        <span className="routineacts">
          {/* The loudest control here, because it is the only one that grants authority. */}
          <button
            className={row.armed ? 'btn' : 'btn primary'}
            onClick={() => onArm(!row.armed)}
            disabled={row.agentName === undefined}
            title={
              row.agentName === undefined ? 'Its agent is no longer on a team' : undefined
            }
          >
            {row.armed ? 'disarm' : 'arm'}
          </button>
          {/* Not a debug affordance. Issue 02 made this the whole of the missed-firing remedy,
              which makes it the second most important verb on the screen. */}
          <button className="btn" onClick={onRunNow} disabled={row.agentName === undefined}>
            run now
          </button>
        </span>
      </div>

      <div className="routinefoot">
        <button className="lastrun mono muted" onClick={onToggleRuns}>
          {row.lastRun === undefined
            ? 'never run'
            : `${outcomeWord(row.lastRun)} · ${lastActive(row.lastRun.firedAt)}`}
        </button>
      </div>

      {open && <Runs routineId={row.id} />}

      <span className="rowacts">
        <button
          className="iconbtn sm"
          onClick={onEdit}
          title={`Edit ${row.name}`}
          aria-label={`Edit ${row.name}`}
        >
          <Pencil size={13} aria-hidden />
        </button>
        <button
          className="iconbtn sm"
          onClick={onDelete}
          title={`Delete ${row.name}`}
          aria-label={`Delete ${row.name}`}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </span>
    </div>
  );
}

/**
 * What this Routine has actually done. **The surface that says whether the automation is real.**
 *
 * Fetched when it is opened rather than carried on every row: a screen of ten Routines is ten
 * histories nobody asked for, and the row already carries the one line that matters.
 */
function Runs({ routineId }: { routineId: string }): React.JSX.Element {
  const [runs, setRuns] = useState<readonly UiRoutineRun[] | undefined>();
  useEffect(() => {
    void window.blobot.routineRuns(routineId).then(setRuns);
  }, [routineId]);
  if (runs === undefined) return <div className="runs" />;
  if (runs.length === 0) return <div className="runs mono muted">nothing yet</div>;
  return (
    <div className="runs">
      {runs.map((run) => (
        <div key={run.id} className="runrow mono muted">
          <span className="when">{lastActive(run.firedAt)}</span>
          <span>{outcomeWord(run)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * One firing in words. The outcome is a closed set of three and the reason is prose for the
 * user, so this joins them rather than translating an enum: `skipped · blobot was not open`.
 */
function outcomeWord(run: UiRoutineRun): string {
  return run.reason === undefined ? run.outcome : `${run.outcome} · ${run.reason}`;
}
