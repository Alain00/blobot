import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, X } from 'lucide-react';
import { describeFrequency, describeSchedule } from '@blobot/core/domain';
import type { NewRoutineSpec, Schedule, UiRoutine, UiRoutineTarget } from '../../../shared/api.js';
import { Blob } from './Blob.js';

/**
 * A Routine's definition, in a dialog: writing one, and restating one that exists.
 *
 * A modal per `DESIGN.md`, because the Routine outlives the screen that opened it, and the same
 * fields either way for the same reason the agent form has one set: an edit is a restatement, not
 * a patch.
 *
 * **The schedule is three shapes and a time, never an expression.** That is issue 04's cost
 * ceiling and it is deliberately a vocabulary: the runaway case is not bounded, it is not
 * offered. There is no field to type `cron` into because there is no cron to store, and the word
 * appears nowhere on this screen.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** Quarter hours. A minute-by-minute list is sixty rows answering a question nobody has. */
const MINUTES = [0, 15, 30, 45];

const pad = (value: number): string => String(value).padStart(2, '0');

export function RoutineForm({
  routine,
  targets,
  onClose,
  onSaved,
}: {
  /** The Routine being restated, or nothing at all, which is the one writing a new one. */
  routine?: UiRoutine;
  targets: readonly UiRoutineTarget[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}): React.JSX.Element {
  const [name, setName] = useState(routine?.name ?? '');
  const [prompt, setPrompt] = useState(routine?.prompt ?? '');
  const [schedule, setSchedule] = useState<Schedule>(
    routine?.schedule ?? { kind: 'daily', hour: 9, minute: 0 },
  );
  // The agent is fixed on an edit. A Routine is `<team>/<agent>` — the identity its branch is
  // named for — so moving one to somebody else would be a new Routine wearing an old one's
  // run history, which is why this dialog does not offer it.
  const [agentId, setAgentId] = useState(routine?.agentId ?? targets[0]?.agentId ?? '');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const spec: NewRoutineSpec = { agentId, name, prompt, schedule };
    const result = await window.blobot.saveRoutine(spec, routine?.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await onSaved();
  };

  const hour = schedule.kind === 'hourly' ? 9 : schedule.hour;
  const weekday = schedule.kind === 'weekly' ? schedule.weekday : 1;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <header className="modalhead">
            <div>
              <div className="eyebrow mono">{routine === undefined ? 'NEW ROUTINE' : 'ROUTINE'}</div>
              <Dialog.Title className="display sm">
                {routine === undefined ? 'Something on a clock' : routine.name}
              </Dialog.Title>
            </div>
            <Dialog.Close className="iconbtn" aria-label="Close">
              <X size={17} aria-hidden />
            </Dialog.Close>
          </header>

          <div className="fields">
            <label className="labelled">
              <span className="fieldlabel mono">NAME</span>
              <input
                className="field"
                value={name}
                placeholder="nightly typecheck"
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            {/* Who it is for, and it is one agent on one team. Never a team and never a lead:
                a turn needs an AgentWorkspace, a session and a mailbox, and none of those are a
                Team's to lend. On an edit the answer is stated rather than offered. */}
            <div className="labelled">
              <span className="fieldlabel mono" id="routinewho">
                WHOSE
              </span>
              {routine === undefined ? (
                <Select.Root value={agentId} onValueChange={setAgentId}>
                  <Select.Trigger className="field selecttrigger" aria-labelledby="routinewho">
                    <Select.Value className="selectvalue" placeholder="nobody yet" />
                    <Select.Icon>
                      <ChevronDown size={14} aria-hidden />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="selectmenu" position="popper" sideOffset={6}>
                      <Select.Viewport>
                        {targets.map((target) => (
                          <Select.Item
                            key={target.agentId}
                            value={target.agentId}
                            className="selectitem"
                          >
                            <Blob name={target.agentName} size={18} hue={target.agentHue} />
                            <Select.ItemText>
                              {target.agentName} · {target.teamName}
                            </Select.ItemText>
                            <Select.ItemIndicator className="selecttick">
                              <Check size={13} aria-hidden />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              ) : (
                <div className="whostated">
                  <Blob name={routine.agentName ?? '?'} size={20} hue={routine.agentHue} />
                  <span>
                    {routine.agentName ?? 'nobody'}
                    {routine.teamName === undefined ? '' : ` · ${routine.teamName}`}
                  </span>
                </div>
              )}
            </div>

            <div className="labelled">
              <span className="fieldlabel mono" id="routinewhen">
                WHEN
              </span>
              <div className="scheduleline">
                <Select.Root
                  value={schedule.kind}
                  onValueChange={(kind) =>
                    setSchedule(
                      kind === 'hourly'
                        ? { kind: 'hourly', minute: schedule.minute }
                        : kind === 'weekly'
                          ? { kind: 'weekly', weekday, hour, minute: schedule.minute }
                          : { kind: 'daily', hour, minute: schedule.minute },
                    )
                  }
                >
                  <Select.Trigger className="field selecttrigger" aria-labelledby="routinewhen">
                    <Select.Value className="selectvalue" />
                    <Select.Icon>
                      <ChevronDown size={14} aria-hidden />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="selectmenu" position="popper" sideOffset={6}>
                      <Select.Viewport>
                        {(['hourly', 'daily', 'weekly'] as const).map((kind) => (
                          <Select.Item key={kind} value={kind} className="selectitem">
                            <Select.ItemText>{kind}</Select.ItemText>
                            <Select.ItemIndicator className="selecttick">
                              <Check size={13} aria-hidden />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>

                {schedule.kind === 'weekly' && (
                  <Picker
                    label="Day"
                    value={String(weekday)}
                    options={DAYS.map((day, index) => ({ value: String(index), label: day }))}
                    onChange={(value) =>
                      setSchedule({ ...schedule, weekday: Number.parseInt(value, 10) })
                    }
                  />
                )}
                {schedule.kind !== 'hourly' && (
                  <Picker
                    label="Hour"
                    value={String(schedule.hour)}
                    options={HOURS.map((value) => ({ value: String(value), label: pad(value) }))}
                    onChange={(value) =>
                      setSchedule({ ...schedule, hour: Number.parseInt(value, 10) })
                    }
                  />
                )}
                <Picker
                  label="Minute"
                  value={String(schedule.minute)}
                  options={MINUTES.map((value) => ({ value: String(value), label: pad(value) }))}
                  onChange={(value) =>
                    setSchedule({ ...schedule, minute: Number.parseInt(value, 10) })
                  }
                />
              </div>
              {/* What the shape costs, beside the shape, at the moment it is chosen. Issue 10's
                  scenario 5 measured a twenty-four-fold difference between these two answers and
                  neither number was anywhere on screen. A count, never a price: blobot provides
                  no inference and has no price to quote. */}
              <div className="note muted">
                {describeSchedule(schedule)} · {describeFrequency(schedule)}
              </div>
            </div>

            <label className="labelled">
              <span className="fieldlabel mono">WHAT TO DO</span>
              <textarea
                className="field"
                rows={4}
                value={prompt}
                placeholder="run the typecheck and say what broke"
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
          </div>

          {error !== undefined && <div className="refusal">{error}</div>}

          <div className="modalfoot">
            <Dialog.Close className="btn">cancel</Dialog.Close>
            <button
              className="btn primary"
              disabled={name.trim() === '' || prompt.trim() === '' || agentId === '' || busy}
              onClick={() => void save()}
            >
              {busy ? 'saving…' : 'save'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** One small select. The schedule line is three of these and it is the same control each time. */
function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger className="field selecttrigger sm" aria-label={label}>
        <Select.Value className="selectvalue" />
        <Select.Icon>
          <ChevronDown size={13} aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="selectmenu" position="popper" sideOffset={6}>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item key={option.value} value={option.value} className="selectitem">
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="selecttick">
                  <Check size={13} aria-hidden />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
