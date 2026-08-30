import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, Shuffle, X } from 'lucide-react';
import type {
  EditAgentResult,
  NewAgentSpec,
  UiAgentProfile,
  UiRuntimeChoice,
} from '../../../shared/api.js';
import { Blob } from './Blob.js';

/**
 * An agent's definition, on its own, in a dialog: hiring one, and restating one that exists.
 *
 * They are the same fields because they are the same thing — an AgentProfile is a definition,
 * and hiring is stating it for the first time. What differs is where it lands afterwards, and
 * only the edit has to say so: see `docs/adr/0002-editing-an-agents-definition.md`.
 *
 * A modal, per `DESIGN.md`, because the agent outlives the screen that opened it. That is true
 * of the creation flow's *hire* button, which is where this started, and it is just as true of
 * the agents screen: an edit reaches teams this dialog is not about.
 *
 * Radix owns the dialog and the select. Not for the look, every rule below is this app's own,
 * but for the half nobody screenshots: a focus trap, focus returned to the trigger, Escape,
 * `aria-modal`, and a listbox that answers to arrow keys and type-ahead.
 */

/**
 * The colours an agent can be given, as a ring of hues rather than a continuum.
 *
 * A slider offered 360 answers to a question with about a dozen useful ones, and two agents a
 * few degrees apart are two agents the user cannot tell apart in a 20px rail. These are spaced
 * far enough that every pair is distinguishable at blobatar size, which is the only size that
 * matters. Warm to cool, so the row reads as a spectrum and not as a bag of colours.
 */
const HUES = [0, 22, 42, 62, 96, 145, 172, 194, 215, 245, 275, 310, 335] as const;

const READINESS_WORD: Record<UiRuntimeChoice['readiness'], string> = {
  ready: 'ready',
  needs_sign_in: 'needs sign-in',
  not_installed: 'not installed',
  unknown: 'status unknown',
};

/** What both dialogs are made of, and the only place these fields are laid out. */
function AgentFields({
  runtimes,
  name,
  setName,
  role,
  setRole,
  instructions,
  setInstructions,
  runtimeId,
  setRuntimeId,
  hue,
  setHue,
  /** The name's face until there is a name. An edit always has one; hiring does not yet. */
  seedFallback,
}: {
  runtimes: readonly UiRuntimeChoice[];
  name: string;
  setName: (value: string) => void;
  role: string;
  setRole: (value: string) => void;
  instructions: string;
  setInstructions: (value: string) => void;
  runtimeId: string;
  setRuntimeId: (value: string) => void;
  hue: number | undefined;
  setHue: (value: number | undefined) => void;
  seedFallback: string;
}): React.JSX.Element {
  const runtime = runtimes.find((entry) => entry.runtimeId === runtimeId);
  // The preview is seeded by the name being typed, so the face changes as the agent is named.
  // Before there is a name there is still a blobatar: an empty seed is a valid one, and a blank
  // square here would read as a broken image rather than as "nothing yet".
  const seed = name.trim() === '' ? seedFallback : name.trim();

  return (
    <>
      {/* The blobatar is this size because a dialog is the only moment the user meets this
          agent's face. Everywhere else it is 20 to 34 pixels beside a name. It stands on the
          page rather than in a card, and carries no name under it: the name is in the field two
          rows down, being typed, and printing it twice makes the preview look like a record. */}
      <div className="hirepreview">
        <Blob name={seed} size={112} hue={hue} />
        {/* A radiogroup, because that is what it is: one colour out of a fixed set, and the
            first cell is the default rather than a reset button parked to one side. */}
        <div className="swatches" role="radiogroup" aria-label="Colour">
          <button
            role="radio"
            aria-checked={hue === undefined}
            aria-label="the colour its name gives it"
            title="the colour its name gives it"
            className={`swatch auto${hue === undefined ? ' on' : ''}`}
            onClick={() => setHue(undefined)}
          >
            <Shuffle size={12} aria-hidden />
          </button>
          {HUES.map((choice) => (
            <button
              key={choice}
              role="radio"
              aria-checked={hue === choice}
              aria-label={`colour ${choice}`}
              className={`swatch${hue === choice ? ' on' : ''}`}
              style={{ background: `hsl(${choice} 68% 56%)` }}
              onClick={() => setHue(choice)}
            />
          ))}
        </div>
      </div>

      <div className="fields">
        <label className="labelled">
          <span className="fieldlabel mono">NAME</span>
          <input
            className="field"
            value={name}
            placeholder="Alice"
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="labelled">
          <span className="fieldlabel mono">ROLE</span>
          <input
            className="field"
            value={role}
            placeholder="frontend"
            onChange={(event) => setRole(event.target.value)}
          />
        </label>
        <div className="labelled">
          <span className="fieldlabel mono" id="runtimelabel">
            RUNTIME
          </span>
          <Select.Root value={runtimeId} onValueChange={setRuntimeId}>
            <Select.Trigger className="field selecttrigger" aria-labelledby="runtimelabel">
              <Select.Value />
              <Select.Icon>
                <ChevronDown size={14} aria-hidden />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="selectmenu" position="popper" sideOffset={6}>
                <Select.Viewport>
                  {runtimes.map((entry) => (
                    <Select.Item
                      key={entry.runtimeId}
                      value={entry.runtimeId}
                      // Never gated on detection: an unsupported *runtime* is ours to refuse,
                      // a signed-out one is not.
                      disabled={!entry.supported}
                      className="selectitem"
                    >
                      <Select.ItemText>
                        {entry.label}
                        {entry.supported ? '' : ' (no adapter yet)'}
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
          {runtime !== undefined && (
            <span className="note mono muted">
              {READINESS_WORD[runtime.readiness]}
              {runtime.version === undefined ? '' : ` · ${runtime.version}`} · {runtime.detail}
            </span>
          )}
        </div>
        <label className="labelled">
          <span className="fieldlabel mono">STANDING INSTRUCTIONS</span>
          <textarea
            className="field"
            rows={3}
            value={instructions}
            placeholder="anything true of this agent on every team it joins (optional)"
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
      </div>
    </>
  );
}

/**
 * Hiring an agent.
 *
 * It is a modal rather than a row that unfolds because hiring is not a step of making a team:
 * the agent exists afterwards whether or not that team is ever created, and it can join any
 * other. A dialog says "this is its own thing" in the one language every user already reads.
 */
export function HireAgent({
  runtimes,
  onClose,
  onHired,
}: {
  runtimes: readonly UiRuntimeChoice[];
  onClose: () => void;
  onHired: (profileId: string) => Promise<void> | void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [instructions, setInstructions] = useState('');
  const [runtimeId, setRuntimeId] = useState('');
  /** Undefined means the name decides, which is the default and stays the default. */
  const [hue, setHue] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const preferred = runtimes.find((runtime) => runtime.supported)?.runtimeId ?? '';
  const selected = runtimeId === '' ? preferred : runtimeId;

  const hire = async (): Promise<void> => {
    setBusy(true);
    const result = await window.blobot.hireAgent(specOf({ name, role, instructions, hue }, selected));
    setBusy(false);
    if (!result.ok || result.profileId === undefined) {
      setError(result.error ?? 'The agent could not be hired.');
      return;
    }
    await onHired(result.profileId);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <header className="modalhead">
            <div>
              <div className="eyebrow mono">HIRE AN AGENT</div>
              <Dialog.Title className="display sm">Somebody new</Dialog.Title>
            </div>
            <Dialog.Close className="iconbtn" aria-label="Close">
              <X size={17} aria-hidden />
            </Dialog.Close>
          </header>

          <AgentFields
            runtimes={runtimes}
            name={name}
            setName={setName}
            role={role}
            setRole={setRole}
            instructions={instructions}
            setInstructions={setInstructions}
            runtimeId={selected}
            setRuntimeId={setRuntimeId}
            hue={hue}
            setHue={setHue}
            seedFallback="new agent"
          />

          {error !== undefined && <div className="refusal">{error}</div>}

          <div className="modalfoot">
            <Dialog.Close className="btn">cancel</Dialog.Close>
            <button
              className="btn primary"
              disabled={name.trim() === '' || busy}
              onClick={() => void hire()}
            >
              {busy ? 'hiring…' : 'hire'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Restating an agent's definition.
 *
 * The half of this screen that is not the form is the sentence about where the change lands,
 * and it is written *before* the save rather than only reported after it. An edit does not
 * reach a team uniformly: the role, the standing instructions and the face are restated on
 * every team the agent is on and take effect when that team next starts; the name and the
 * runtime stay as they were, because a branch is under the old name and a session belongs to
 * the provider that opened it. ADR-0002 has the reasoning.
 *
 * Nothing here restarts a team. That is the difference from editing a roster, which does: a
 * persona names the roster, so a live team whose membership changed disagrees with itself,
 * while a live team whose definition changed is simply mid-conversation under the old one.
 */
export function EditAgent({
  agent,
  runtimes,
  onClose,
  onSaved,
}: {
  agent: UiAgentProfile;
  runtimes: readonly UiRuntimeChoice[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}): React.JSX.Element {
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [instructions, setInstructions] = useState(agent.instructions ?? '');
  const [runtimeId, setRuntimeId] = useState(agent.runtimeId);
  const [hue, setHue] = useState<number | undefined>(agent.hue);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  /** What the save actually did, once it has done it. Kept open to be read. */
  const [result, setResult] = useState<EditAgentResult | undefined>();

  const renamed = name.trim() !== agent.name && name.trim() !== '';
  const runtimeChanged = runtimeId !== agent.runtimeId;
  const changed =
    renamed ||
    runtimeChanged ||
    role.trim() !== agent.role ||
    instructions.trim() !== (agent.instructions ?? '') ||
    hue !== agent.hue;

  const save = async (): Promise<void> => {
    setBusy(true);
    const edit = await window.blobot.editAgent(
      agent.id,
      specOf({ name, role, instructions, hue }, runtimeId),
    );
    setBusy(false);
    if (!edit.ok) {
      setError(edit.error ?? 'The agent could not be changed.');
      return;
    }
    await onSaved();
    // A change that reached nothing but the definition has nothing to report: the list behind
    // the dialog already shows the new name, the new role and the new face.
    if ((edit.keepingName ?? []).length === 0 && !(edit.runtimeChanged ?? false)) {
      onClose();
      return;
    }
    setResult(edit);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <header className="modalhead">
            <div>
              <div className="eyebrow mono">EDIT AN AGENT</div>
              <Dialog.Title className="display sm">{agent.name}</Dialog.Title>
            </div>
            <Dialog.Close className="iconbtn" aria-label="Close">
              <X size={17} aria-hidden />
            </Dialog.Close>
          </header>

          {result !== undefined ? (
            <>
              <EditNotes result={result} />
              <div className="modalfoot">
                <Dialog.Close className="btn primary">done</Dialog.Close>
              </div>
            </>
          ) : (
            <>
              <AgentFields
                runtimes={runtimes}
                name={name}
                setName={setName}
                role={role}
                setRole={setRole}
                instructions={instructions}
                setInstructions={setInstructions}
                runtimeId={runtimeId}
                setRuntimeId={setRuntimeId}
                hue={hue}
                setHue={setHue}
                seedFallback={agent.name}
              />

              <WhereItLands
                teams={agent.teams}
                renamedTo={renamed ? name.trim() : undefined}
                runtimeChanged={runtimeChanged}
              />

              {error !== undefined && <div className="refusal">{error}</div>}

              <div className="modalfoot">
                <Dialog.Close className="btn">cancel</Dialog.Close>
                <button
                  className="btn primary"
                  disabled={!changed || name.trim() === '' || busy}
                  onClick={() => void save()}
                >
                  {busy ? 'saving…' : 'save'}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Where this edit lands, said before the button is pressed.
 *
 * Silent for an agent on no team, because then there is only one place for it to land and a
 * paragraph explaining that would be a paragraph about nothing.
 */
function WhereItLands({
  teams,
  renamedTo,
  runtimeChanged,
}: {
  teams: readonly string[];
  renamedTo: string | undefined;
  runtimeChanged: boolean;
}): React.JSX.Element | null {
  if (teams.length === 0) {
    return runtimeChanged ? (
      <div className="note mono muted">on no team · nothing is running on the old runtime</div>
    ) : null;
  }
  const on = teams.join(', ');
  return (
    <div className="note">
      <span className="muted">
        The role, the standing instructions and the face reach <b>{on}</b> the next time{' '}
        {teams.length === 1 ? 'it starts' : 'each starts'}.
      </span>
      {renamedTo !== undefined && (
        <span className="muted">
          {' '}
          The name does not: each of those teams gave this agent a branch under the name it
          joined with, so there it stays. New teams get <b>{renamedTo}</b>.
        </span>
      )}
      {runtimeChanged && (
        <span className="muted">
          {' '}
          Nor does the runtime: a session belongs to the runtime that opened it, and the next
          team this agent joins is the first one to run on the new one.
        </span>
      )}
    </div>
  );
}

/** The same facts after the fact, from the main process rather than from the form. */
function EditNotes({ result }: { result: EditAgentResult }): React.JSX.Element {
  const keeping = result.keepingName ?? [];
  return (
    <div className="removals">
      {keeping.length > 0 && (
        <div className="note">
          <b>{keeping.join(', ')}</b>{' '}
          <span className="muted">
            {keeping.length === 1 ? 'still calls' : 'still call'} this agent{' '}
            <b>{result.formerName}</b>, which is the name its branch is under there.
          </span>
        </div>
      )}
      {(result.runtimeChanged ?? false) && (
        <div className="note">
          <span className="muted">
            The runtime is the one the next team will use. Sessions that are already open stay
            with the runtime that opened them.
          </span>
        </div>
      )}
    </div>
  );
}

/** Retiring an agent. It stops being somebody you can put on a team; teams keep working. */
export function RetireAgent({
  agent,
  onClose,
  onRetired,
}: {
  agent: UiAgentProfile;
  onClose: () => void;
  onRetired: () => Promise<void> | void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const retire = async (): Promise<void> => {
    setBusy(true);
    await window.blobot.retireAgent(agent.id);
    setBusy(false);
    await onRetired();
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <header className="modalhead">
            <div>
              <div className="eyebrow mono">RETIRE AN AGENT</div>
              <Dialog.Title className="display sm">{agent.name}</Dialog.Title>
            </div>
            <Dialog.Close className="iconbtn" aria-label="Close">
              <X size={17} aria-hidden />
            </Dialog.Close>
          </header>

          <div className="prose">
            <p>
              {agent.name} stops being somebody you can put on a team. Nothing stops working:{' '}
              {agent.teams.length === 0
                ? 'this agent is on no team.'
                : `${agent.teams.join(', ')} keep${agent.teams.length === 1 ? 's' : ''} running with ${agent.name} on ${agent.teams.length === 1 ? 'it' : 'them'}, with the workspace and the conversation ${agent.teams.length === 1 ? 'it has' : 'they have'}. Ending a team is a separate decision.`}
            </p>
            <p>
              The name is not released, because the teams above still point at it. Everything{' '}
              {agent.name} said stays in the transcript.
            </p>
          </div>

          <div className="modalfoot">
            <Dialog.Close className="btn">keep</Dialog.Close>
            <button className="btn primary" disabled={busy} onClick={() => void retire()}>
              {busy ? 'retiring…' : 'retire'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The form's four fields as the main process wants them. Trimming is this side's job. */
function specOf(
  form: { name: string; role: string; instructions: string; hue: number | undefined },
  runtimeId: string,
): NewAgentSpec {
  return {
    name: form.name.trim(),
    role: form.role.trim(),
    runtimeId,
    ...(form.instructions.trim() === '' ? {} : { instructions: form.instructions.trim() }),
    ...(form.hue === undefined ? {} : { hue: form.hue }),
  };
}
