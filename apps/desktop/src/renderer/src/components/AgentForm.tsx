import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as Select from '@radix-ui/react-select';
import { ArrowRight, Check, ChevronDown, Plus, Shuffle, X } from 'lucide-react';
import type {
  EditAgentResult,
  NewAgentSpec,
  CompactionSetting,
  TrustLevel,
  UiAgentProfile,
  VerbosityLevel,
  UiRuntimeChoice,
  UiTeamDiskUsage,
} from '../../../shared/api.js';
import { ATTENDED_TRUST_LEVELS } from '@blobot/core/domain';
import { Blob, SEEN } from './Blob.js';
import { SHAPE_NAMES } from '../blobatar-shapes.js';
import { READINESS_WORD } from './readiness.js';
import { RuntimeMark } from './RuntimeMark.js';
import { RuntimeOptions } from './RuntimeOptions.js';
import { TrustPick } from './TrustPick.js';
import { sizeLine } from './TeamEdits.js';
import { CompactionPick } from './CompactionPick.js';
import { VerbosityPick } from './VerbosityPick.js';
import { RuntimeSetup } from './RuntimeSetup.js';

/**
 * An agent's definition, on its own, in a bar: hiring one, and restating one that exists.
 *
 * They are the same surface because they are the same thing — an AgentProfile is a definition,
 * and hiring is stating it for the first time. What differs is where it lands afterwards, and
 * only the edit has to say so: see `docs/adr/0002-editing-an-agents-definition.md`.
 *
 * **Rewritten 2026-09-07 in the shape of team creation's own bar**, from a prototype the author
 * picked out of four. It was a modal read top to bottom: a 112px face over 13 hues and 9
 * silhouettes laid out flat, then eight stacked fields. Every one of those had a reason and the
 * reasons still hold; what did not hold is the sum. It asked eight questions where seven already
 * had an answer nobody argues with, and it spent its first third on the one part of an agent the
 * name decides by itself.
 *
 * So: one field and an arrow, and the seven answers stated as a row of chips under it. A chip is
 * a thing you press if you disagree; none of them is a step, and the bar is complete the moment
 * there is a name. Nothing was dropped — the face, the runtime's own option groups, the three
 * words that are blobot's, the standing instructions, ticket 11's readiness line and its remedy
 * are all still here, and the edit still says where it lands before the arrow is pressed.
 *
 * It is `.navsheet.pickbar`'s sibling rather than a lookalike: the same sheet, the same field
 * with its hairline, the same addressed `Hire:`, the same 28px arrow that inverts only when it
 * is armed. `NewTeam` is the other one, and the two are opened by the same gesture from the same
 * places, so a second bar shape would have been a second answer to a question already settled.
 *
 * Still a modal, per `DESIGN.md`, because the agent outlives the screen that opened it: Radix
 * keeps the dialog even though it no longer looks like one. That is the half nobody screenshots
 * — a focus trap, focus returned to the trigger, Escape, `aria-modal` — and it is worth more
 * here than the centred box ever was. Select keeps the listbox with its arrow keys and
 * type-ahead; Popover holds the face.
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

/**
 * The face, and the two rows that are the whole of what a person chooses about one.
 *
 * A popover hanging off the face itself, rather than a third of the surface above the fields.
 * The default costs nothing to skip, which is what it is: almost every agent wears the face its
 * name gives it. And a bar that grew by 90px when you glanced at the face would have moved the
 * arrow you were about to press.
 *
 * The blobatar here is the one in the app that follows the pointer unconditionally, and the one
 * drawn live without carrying a status. Both are the same reason: this is the moment the user
 * meets this agent, so the face is the subject rather than a status carrier, and a face that
 * looks back is the difference between a picture the name produced and somebody who was hired.
 */
function FacePop({
  seed,
  hue,
  setHue,
  shape,
  setShape,
}: {
  seed: string;
  hue: number | undefined;
  setHue: (value: number | undefined) => void;
  shape: string | undefined;
  setShape: (value: string | undefined) => void;
}): React.JSX.Element {
  return (
    <Popover.Root>
      {/* No ring and no box: a blobatar is a silhouette, so the pointer is answered by the face
          lifting. It is the one pressable thing in the app that already has a body of its own. */}
      <Popover.Trigger className="facetrigger" aria-label="Change this face">
        <Blob name={seed} size={34} hue={hue} shape={shape} animated lookAt="pointer" travel={SEEN} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="selectmenu facepop" sideOffset={10} align="start">
          <div className="fieldlabel mono">FACE</div>
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
          {/* The same row again, one variable along. Every cell is a real blobatar rather than an
              icon of one, seeded by the name being typed and wearing the hue chosen above, so the
              only thing that differs across the row is the thing being chosen.

              Still faces, and the only unanimated blobatars here: nine gaze drivers under the one
              face that is *meant* to look back would be nine faces competing with it. */}
          <div className="swatches shapes" role="radiogroup" aria-label="Shape">
            <button
              role="radio"
              aria-checked={shape === undefined}
              aria-label="the shape its name gives it"
              title="the shape its name gives it"
              className={`swatch auto${shape === undefined ? ' on' : ''}`}
              onClick={() => setShape(undefined)}
            >
              <Shuffle size={12} aria-hidden />
            </button>
            {SHAPE_NAMES.map((choice) => (
              <button
                key={choice}
                role="radio"
                aria-checked={shape === choice}
                aria-label={choice}
                title={choice}
                className={`swatch face${shape === choice ? ' on' : ''}`}
                onClick={() => setShape(choice)}
              >
                <Blob name={seed} size={34} hue={hue} shape={choice} />
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Everything one agent's definition is, and the only place it is laid out. */
interface Definition {
  readonly name: string;
  readonly role: string;
  readonly instructions: string;
  readonly runtimeId: string;
  readonly hue: number | undefined;
  readonly shape: string | undefined;
  readonly runtimeOptions: Readonly<Record<string, string>>;
  readonly trust: TrustLevel;
  readonly compaction: CompactionSetting;
  readonly verbosity: VerbosityLevel;
}

/**
 * The bar itself: the field, the chips, and whatever the caller has to say at the foot.
 *
 * Hiring and editing differ in three strings and one sentence, so they are one component and not
 * two that drift. What the caller owns is the word in the field, what the arrow does, and the
 * foot — which is where an edit says where it lands and a hire says nothing.
 */
function AgentBar({
  word,
  definition,
  onChange,
  runtimes,
  onRuntimesChanged,
  armed,
  busy,
  onGo,
  onClose,
  goLabel,
  foot,
  error,
  seedFallback,
}: {
  word: string;
  definition: Definition;
  onChange: <K extends keyof Definition>(key: K, value: Definition[K]) => void;
  runtimes: readonly UiRuntimeChoice[];
  /** The machine changed under the bar: a runtime was signed in to, or installed. */
  onRuntimesChanged?: () => void;
  armed: boolean;
  busy: boolean;
  onGo: () => void;
  onClose: () => void;
  goLabel: string;
  foot?: React.ReactNode;
  error?: string | undefined;
  /** The name's face until there is a name. An edit always has one; hiring does not yet. */
  seedFallback: string;
}): React.JSX.Element {
  const runtime = runtimes.find((entry) => entry.runtimeId === definition.runtimeId);
  /**
   * The way out of the state the foot reports, when there is one.
   *
   * At most one, and often none: core decides what a state is worth offering, and a runtime that
   * is `ready` offers nothing. The renderer draws the button and sends back the two ids it was
   * given; it never learns what command that runs.
   */
  const remedy = runtime?.remedies[0];
  const [fixing, setFixing] = useState(false);
  /** Open once there is something in it, so an edit shows what the agent already stands on. */
  const [standing, setStanding] = useState(definition.instructions !== '');
  // The face is seeded by the name being typed, so it changes as the agent is named. Before
  // there is a name there is still a blobatar: an empty seed is a valid one, and a blank square
  // would read as a broken image rather than as "nothing yet".
  const seed = definition.name.trim() === '' ? seedFallback : definition.name.trim();

  /**
   * Enter commits, from anywhere in the bar that is not prose.
   *
   * The creation bar's own rule, and it can be there for the same reason: with a name typed
   * there is nothing else Enter could mean. In the standing instructions it stays a newline,
   * because that field is paragraphs. Escape is Radix's, on the dialog.
   */
  const keys = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    if (armed && !busy) onGo();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="navscrim" />
        <Dialog.Content className="navsheet pickbar agentbar" aria-describedby={undefined} onKeyDown={keys}>
          {/* The title is the word and the name being typed, which is the field itself. Radix
              wants one for the focus scope, so it is here and read rather than drawn twice. */}
          <Dialog.Title className="offscreen">
            {word} {definition.name.trim() === '' ? 'an agent' : definition.name.trim()}
          </Dialog.Title>

          <div className="pickfield">
            {/* At the head of the field, where the creation bar puts the team it is about. */}
            <FacePop
              seed={seed}
              hue={definition.hue}
              setHue={(value) => onChange('hue', value)}
              shape={definition.shape}
              setShape={(value) => onChange('shape', value)}
            />
            <span className="pickto">{word}</span>
            {/* Two inputs, both sized to their own content, so the field reads as one line of
                writing rather than as two boxes at opposite ends of a bar. The role is quieter
                because it is apposition and not a second question. */}
            <div className="pickitems">
              <input
                className="pickinput agentname"
                autoFocus
                size={definition.name === '' ? 7 : definition.name.length + 1}
                value={definition.name}
                placeholder="a name"
                onChange={(event) => onChange('name', event.target.value)}
              />
              <input
                className="agentrole"
                size={Math.max(11, definition.role.length + 1)}
                value={definition.role}
                placeholder="what they do"
                onChange={(event) => onChange('role', event.target.value)}
              />
            </div>
            {/* The one control that commits, so it is the one that inverts when it is armed,
                exactly as the creation bar's does and as the composer's send does. Three dots
                while it is working: "occupied, no estimate" is the truth, and it is the glyph
                this app already uses for it. */}
            <button className="pickgo" disabled={!armed || busy} aria-label={goLabel} onClick={onGo}>
              {busy ? (
                <span className="dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <ArrowRight size={15} aria-hidden />
              )}
            </button>
          </div>

          {/* Every answer this agent already has, stated: what it runs on, in the runtime's own
              vocabulary, then how it works, in blobot's. Where the row breaks is the width's to
              decide. */}
          <div className="agentchips">
            <Select.Root
              value={definition.runtimeId}
              onValueChange={(value) => onChange('runtimeId', value)}
            >
              <Select.Trigger className="chip" aria-label="Runtime">
                <span className="mono">RUNTIME</span>
                <RuntimeMark runtimeId={definition.runtimeId} size={13} />
                {/* Detection takes a second and a half and the bar opens before it answers. An
                    empty chip in the meantime is a chip with nothing in it rather than one that
                    has not been told yet. */}
                <Select.Value className="selectvalue" placeholder="asking…" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="selectmenu" position="popper" sideOffset={8}>
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
                        <RuntimeMark runtimeId={entry.runtimeId} />
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
            {/* Beside the runtime and not inside it, because it is a different question with the
                same subject: change the chip to its left and this is a different control. */}
            <RuntimeOptions
              chip="MODEL"
              runtimeId={definition.runtimeId}
              value={definition.runtimeOptions}
              onChange={(value) => onChange('runtimeOptions', value)}
            />
            {/* blobot's own three words: the two above print what a runtime advertises, these
                three mean the same thing on every runtime because the adapters translate them
                from the opposite end. */}
            <TrustPick
              chip="TRUST"
              value={definition.trust}
              available={runtime?.trustLevels ?? ATTENDED_TRUST_LEVELS}
              onChange={(value) => onChange('trust', value)}
            />
            <VerbosityPick
              chip="VERBOSITY"
              value={definition.verbosity}
              onChange={(value) => onChange('verbosity', value)}
            />
            <CompactionPick
              chip="COMPACTION"
              value={definition.compaction}
              onChange={(value) => onChange('compaction', value)}
            />
            {/* Not a chip: the five before it carry an answer and this one opens a field. It is
                outlined rather than filled, which is the difference `.listrow.pick` already
                draws between a row and a chosen one, and last because it is the only optional
                thing on the bar. */}
            <button
              className={`chip ghost${standing ? ' on' : ''}`}
              aria-expanded={standing}
              onClick={() => setStanding(!standing)}
            >
              <Plus size={12} aria-hidden />
              standing instructions
            </button>
          </div>

          {standing && (
            <div className="agentstanding">
              <textarea
                className="field"
                rows={2}
                autoFocus
                value={definition.instructions}
                placeholder="anything true of this agent on every team it joins"
                onChange={(event) => onChange('instructions', event.target.value)}
              />
            </div>
          )}

          {error !== undefined && <div className="refusal">{error}</div>}

          {/* The foot, in the creation bar's two registers. A fact about the machine in mono,
              because that is what it is; what an edit is about to reach, in prose, because that
              is what the user is taking on. Ticket 11's line is never a gate: the runtime stays
              pickable while it says this, which is why the remedy is a button in the sentence it
              answers rather than a block over the bar. */}
          {runtime !== undefined && (
            <div className="pickfoot mono">
              {READINESS_WORD[runtime.readiness]}
              {runtime.version === undefined ? '' : ` · ${runtime.version}`} · {runtime.detail}
              {remedy !== undefined && (
                <button className="btn tiny" onClick={() => setFixing(true)}>
                  {remedy.kind === 'install' ? 'install it' : 'sign in'}
                </button>
              )}
            </div>
          )}
          {foot}

          {fixing && runtime !== undefined && remedy !== undefined && (
            <RuntimeSetup
              runtime={runtime}
              remedy={remedy}
              onClose={() => setFixing(false)}
              // Asked again on the way out, so the line above says what the machine holds now
              // rather than what it held when this bar opened.
              onSettled={() => onRuntimesChanged?.()}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Hiring an agent.
 *
 * Its own surface rather than a step of making a team: the agent exists afterwards whether or
 * not that team is ever created, and it can join any other.
 */
export function HireAgent({
  runtimes,
  onClose,
  onHired,
  onRuntimesChanged,
}: {
  runtimes: readonly UiRuntimeChoice[];
  onClose: () => void;
  onHired: (profileId: string) => Promise<void> | void;
  onRuntimesChanged?: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<Definition>({
    name: '',
    role: '',
    instructions: '',
    runtimeId: '',
    /** Undefined means the name decides, which is the default and stays the default. */
    hue: undefined,
    /** And the same for the silhouette, for the same reason. */
    shape: undefined,
    /** Empty means the runtime's own defaults, which is what storing nothing means. */
    runtimeOptions: {},
    /** Where an agent nobody has thought about this for starts, and where most will stay. */
    trust: 'normal',
    /** The middle position. See `DEFAULT_VERBOSITY`. */
    verbosity: 'normal',
    /** On, the documented default. See `DEFAULT_COMPACTION`. */
    compaction: 'auto',
  });
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const preferred = runtimes.find((runtime) => runtime.supported)?.runtimeId ?? '';
  const definition: Definition = {
    ...draft,
    runtimeId: draft.runtimeId === '' ? preferred : draft.runtimeId,
  };

  const hire = async (): Promise<void> => {
    setBusy(true);
    const result = await window.blobot.hireAgent(specOf(definition, definition.runtimeId));
    setBusy(false);
    if (!result.ok || result.profileId === undefined) {
      setError(result.error ?? 'The agent could not be hired.');
      return;
    }
    await onHired(result.profileId);
  };

  return (
    <AgentBar
      word="Hire"
      definition={definition}
      onChange={(key, value) => setDraft((was) => ({ ...was, [key]: value }))}
      runtimes={runtimes}
      armed={definition.name.trim() !== ''}
      busy={busy}
      onGo={() => void hire()}
      onClose={onClose}
      goLabel="Hire"
      seedFallback="new agent"
      error={error}
      {...(onRuntimesChanged === undefined ? {} : { onRuntimesChanged })}
    />
  );
}

/**
 * Restating an agent's definition.
 *
 * The half of this that is not the bar is the sentence about where the change lands, and it is
 * written *before* the arrow is pressed rather than only reported after it. An edit does not
 * reach a team uniformly: the role, the standing instructions and the face are restated on every
 * team the agent is on and take effect when that team next starts; the name and the runtime stay
 * as they were, because a branch is under the old name and a session belongs to the provider
 * that opened it. ADR-0002 has the reasoning.
 *
 * Nothing here restarts a team. That is the difference from editing a roster, which does: a
 * persona names the roster, so a live team whose membership changed disagrees with itself, while
 * a live team whose definition changed is simply mid-conversation under the old one.
 */
export function EditAgent({
  agent,
  runtimes,
  onClose,
  onSaved,
  onRuntimesChanged,
}: {
  agent: UiAgentProfile;
  runtimes: readonly UiRuntimeChoice[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onRuntimesChanged?: () => void;
}): React.JSX.Element {
  const was: Definition = {
    name: agent.name,
    role: agent.role,
    instructions: agent.instructions ?? '',
    runtimeId: agent.runtimeId,
    hue: agent.hue,
    shape: agent.shape,
    runtimeOptions: agent.runtimeOptions ?? {},
    trust: agent.trust ?? 'normal',
    verbosity: agent.verbosity ?? 'normal',
    compaction: agent.compaction ?? 'auto',
  };
  const [definition, setDefinition] = useState<Definition>(was);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  /** What the save actually did, once it has done it. Kept open to be read. */
  const [result, setResult] = useState<EditAgentResult | undefined>();

  const renamed = definition.name.trim() !== was.name && definition.name.trim() !== '';
  const runtimeChanged = definition.runtimeId !== was.runtimeId;
  const changed =
    renamed ||
    runtimeChanged ||
    definition.role.trim() !== was.role ||
    definition.instructions.trim() !== was.instructions ||
    definition.hue !== was.hue ||
    definition.shape !== was.shape ||
    !sameOptions(definition.runtimeOptions, was.runtimeOptions) ||
    definition.trust !== was.trust ||
    definition.compaction !== was.compaction ||
    definition.verbosity !== was.verbosity;

  const save = async (): Promise<void> => {
    setBusy(true);
    const edit = await window.blobot.editAgent(
      agent.id,
      specOf(definition, definition.runtimeId),
    );
    setBusy(false);
    if (!edit.ok) {
      setError(edit.error ?? 'The agent could not be changed.');
      return;
    }
    await onSaved();
    // A change that reached nothing but the definition has nothing to report: the list behind
    // this already shows the new name, the new role and the new face.
    if ((edit.keepingName ?? []).length === 0 && !(edit.runtimeChanged ?? false)) {
      onClose();
      return;
    }
    setResult(edit);
  };

  // What the save did, in the same sheet it was pressed in. The bar itself goes: the fields are
  // saved, and leaving them under a report of their own saving invites a second press.
  if (result !== undefined) {
    return (
      <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="navscrim" />
          <Dialog.Content className="navsheet pickbar agentbar" aria-describedby={undefined}>
            <Dialog.Title className="offscreen">{agent.name} is changed</Dialog.Title>
            <div className="agentsaid">
              <EditNotes result={result} />
              <button className="btn primary" onClick={onClose}>
                done
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <AgentBar
      word="Edit"
      definition={definition}
      onChange={(key, value) => setDefinition((held) => ({ ...held, [key]: value }))}
      runtimes={runtimes}
      // The arrow answers "will this do anything?" before it is read, which on an edit means
      // *has anything changed?* — the rule `.btn.primary` already followed as a button.
      armed={changed && definition.name.trim() !== ''}
      busy={busy}
      onGo={() => void save()}
      onClose={onClose}
      goLabel="Save"
      seedFallback={agent.name}
      error={error}
      foot={
        <WhereItLands
          teams={agent.teams}
          renamedTo={renamed ? definition.name.trim() : undefined}
          runtimeChanged={runtimeChanged}
        />
      }
      {...(onRuntimesChanged === undefined ? {} : { onRuntimesChanged })}
    />
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
        The face reaches <b>{on}</b> straight away. The role, the standing instructions and how
        it answers reach {teams.length === 1 ? 'it' : 'them'} the next time{' '}
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
  const [error, setError] = useState<string | undefined>();
  /**
   * The acknowledgement, and it is never ticked when the dialog opens.
   *
   * Retiring is two acts with two costs: the agent stops being somebody you can put on a team,
   * and **their conversation with you is deleted** — the Team, the folder, the branch and the
   * history. That second one is not a side effect and is never silent, so the retire does not
   * proceed until the user has said yes to it in a control of its own.
   * `.scratch/rail/issues/06-retiring-an-agent.md`.
   */
  const [acknowledged, setAcknowledged] = useState(false);
  /** What the conversation's folder is holding. `undefined` while it is still being counted. */
  const [usage, setUsage] = useState<UiTeamDiskUsage | undefined>();
  const threadId = agent.threadId;

  // Measured as the dialog opens rather than on the tick: the size is part of what is being
  // acknowledged, so it has to be on screen before the decision and not after.
  useEffect(() => {
    if (threadId === undefined) return;
    let live = true;
    void window.blobot
      .teamDiskUsage(threadId)
      .then((measured) => {
        if (live) setUsage(measured);
      })
      .catch(() => {
        if (live) setUsage({ bytes: null, workBytes: null, stateBytes: null, agents: [] });
      });
    return () => {
      live = false;
    };
  }, [threadId]);

  const retire = async (): Promise<void> => {
    setBusy(true);
    // `true` because the dialog above says the folder goes and prices exactly that. A workspace
    // blobot cannot reach is not a refusal: the ordinary reason to retire somebody whose folder
    // is gone is that the folder is gone.
    const result = await window.blobot.retireAgent(agent.id, threadId !== undefined);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That agent could not be retired.');
      return;
    }
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

          {/* Drawn as the tick this app already has, and never ticked on open. Absent when there
              is no conversation to end, because a control asking about nothing is worse than
              no control. */}
          {threadId !== undefined && (
            <button
              className={`listrow pick${acknowledged ? ' on' : ''}`}
              aria-pressed={acknowledged}
              disabled={busy}
              onClick={() => setAcknowledged(!acknowledged)}
            >
              <span className="who">
                <span className="nm">
                  <b>end your conversation</b>{' '}
                  <span className="muted">its folder and history go with it</span>
                </span>
                <span className="sub mono muted">{sizeLine(usage)}</span>
              </span>
              <span className={`tick${acknowledged ? ' on' : ''}`}>
                {acknowledged && <Check size={14} aria-hidden />}
              </span>
            </button>
          )}

          {error !== undefined && <div className="refusal">{error}</div>}
          <div className="modalfoot">
            <Dialog.Close className="btn">keep</Dialog.Close>
            <button
              className="btn primary"
              disabled={busy || (threadId !== undefined && !acknowledged)}
              onClick={() => void retire()}
            >
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
  form: {
    name: string;
    role: string;
    instructions: string;
    hue: number | undefined;
    shape: string | undefined;
    runtimeOptions: Readonly<Record<string, string>>;
    trust: TrustLevel;
    compaction: CompactionSetting;
    verbosity: VerbosityLevel;
  },
  runtimeId: string,
): NewAgentSpec {
  return {
    name: form.name.trim(),
    role: form.role.trim(),
    runtimeId,
    ...(form.instructions.trim() === '' ? {} : { instructions: form.instructions.trim() }),
    ...(form.hue === undefined ? {} : { hue: form.hue }),
    ...(form.shape === undefined ? {} : { shape: form.shape }),
    // Always sent, even empty: an edit restates the definition, so a picker cleared back to
    // the runtime's defaults has to be able to say so.
    runtimeOptions: form.runtimeOptions,
    // `normal` is sent rather than omitted, for the same reason: an agent lowered back from
    // `trusting` has to be able to say `normal` and not merely stop saying `trusting`.
    trust: form.trust,
    // Sent whichever way it is set, again for the same reason: an agent switched back on has
    // to be able to say `auto` rather than merely stop saying `off`.
    compaction: form.compaction,
    // And once more. Every one of blobot's own words is sent rather than omitted, because an
    // edit restates the definition: coming back down from `full` has to be sayable as
    // `normal`, not as silence about `full`.
    verbosity: form.verbosity,
  };
}

/** Whether two sets of choices say the same thing, so `save` stays armed only on a change. */
function sameOptions(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}
