import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { UiRuntimeChoice } from '../../../shared/api.js';
import { READINESS_WORD } from './readiness.js';
import { RuntimeMark } from './RuntimeMark.js';
import { RuntimeSetup } from './RuntimeSetup.js';
import { ContextCeilings } from './ContextCeilings.js';
import { Dictation } from './Dictation.js';
import { useSoundSettings } from '../sound/useSound.js';

/**
 * Settings: the third door at the foot of the rail, and a screen with a column of its own.
 *
 * **It is not a lid over the other two doors.** *Your agents* is the roster — ADR-0001's whole
 * point is that an agent exists before any team does, and hiring one is the first thing anybody
 * here does — and a Routine is standing work that produces turns in a transcript and can put an
 * unread mark on a rail row. Neither is a preference you set once, so neither is in here. What
 * is in here is the machine: which runtimes it has and whether they are ready.
 *
 * That is the thing this screen exists for. Detection had no place of its own before: it was
 * reachable only from inside the hire dialog, which meant the answer to "is Codex signed in?"
 * was behind a decision about an agent the user had not decided to hire.
 *
 * A **working** surface with a list of sections down its left edge, the same shape *your agents*
 * and *routines* take on the right of it. Four sections, all of them about the machine rather
 * than about a screen: which runtimes it has, how much room each model is worth, whether it
 * makes a sound, and how it turns speech into text. A section gets added here when there is
 * something true to configure, never to fill the column out — which is the test **Sound** had
 * to pass, and the reason it is here rather than behind a lid over the other two doors.
 * *2026-08-31, `.scratch/sound/issues/06`.*
 */
export type Section = 'runtimes' | 'context' | 'sound' | 'dictation';

const SECTIONS: readonly { readonly id: Section; readonly label: string }[] = [
  { id: 'runtimes', label: 'Runtimes' },
  { id: 'context', label: 'Context' },
  { id: 'sound', label: 'Sound' },
  { id: 'dictation', label: 'Dictation' },
];

/** `--screen=settings:<section>`, for a screenshot, or nothing. */
export function settingsSectionOf(screen: string | undefined): Section | undefined {
  if (screen === undefined || !screen.startsWith('settings:')) return undefined;
  const asked = screen.slice('settings:'.length);
  return SECTIONS.some((entry) => entry.id === asked) ? (asked as Section) : undefined;
}

export function Settings({
  onClose,
  section: opened,
}: {
  onClose: () => void;
  /** `--screen=settings:<section>` only, so a screenshot can land on one. */
  section?: Section;
}): React.JSX.Element {
  const [section, setSection] = useState<Section>(opened ?? 'runtimes');
  const [runtimes, setRuntimes] = useState<readonly UiRuntimeChoice[]>([]);
  /** Which runtime has its remedy running, by id. One at a time: it is a modal. */
  const [fixing, setFixing] = useState<string | undefined>();

  /** Ask the machine. The same call the picker makes, so the two never disagree. */
  const rescan = useCallback((): void => {
    void window.blobot.detectRuntimes().then(setRuntimes);
  }, []);

  useEffect(() => rescan(), [rescan]);

  const fixingRuntime = runtimes.find((entry) => entry.runtimeId === fixing);
  const remedy = fixingRuntime?.remedies[0];

  // Escape closes, as it does on every other layer in this app. Not while the terminal is up:
  // that dialog answers the key itself, and both would go at once.
  useEffect(() => {
    if (fixingRuntime !== undefined) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fixingRuntime, onClose]);

  return (
    <div className="setpage">
      {/* The screen's own column. It is not the rail and must not look like one: no marks, no
          status, no faces. A list of section names, one of them current. */}
      <nav className="setrail">
        <div className="railhead">
          <span className="mono muted">SETTINGS</span>
        </div>
        {SECTIONS.map((entry) => (
          <button
            key={entry.id}
            className={`setrailrow${section === entry.id ? ' sel' : ''}`}
            onClick={() => setSection(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="setbody">
        <div className="agentssheet">
          <header className="agentshead">
            {/* No eyebrow. The column beside this one already says SETTINGS, and the section
                it has selected is the word under it: an eyebrow here would be the same label
                printed twice, eleven pixels apart. */}
            <div>
              <h1 className="subhead lg">
                {SECTIONS.find((entry) => entry.id === section)?.label}
              </h1>
            </div>
            <span style={{ flex: 1 }} />
            {/* Detection, asked again, by hand. The same four words come back either way: this
                does not conclude anything the automatic scan would not, it just answers the
                user who has signed in somewhere else since the screen opened. */}
            {/* Detection's own control, so it belongs to detection's own section. */}
            {section === 'runtimes' && (
              <button className="btn" onClick={rescan}>
                check again
              </button>
            )}
            <button className="iconbtn" onClick={onClose} title="Close" aria-label="Close">
              <X size={17} aria-hidden />
            </button>
          </header>

          {section === 'runtimes' && (
            <>
              {/* Stated where the states are read, because the states are weaker than they look
                  and a user reading a column of the word `ready` deserves to know what it was
                  measured with. It is also the answer to why nothing here is a gate. */}
              <div className="note muted">
                blobot asks each CLI whether it is installed and whether a credential is present.
                It stores no credential of its own, and signing in runs the runtime's own command
                on a terminal in this window. Nothing here decides what you can do: an agent can
                be hired on a runtime that is not ready yet.
              </div>

              <div className="roster">
                {runtimes.map((entry) => (
                  <div key={entry.runtimeId} className="listrow runtimerow">
                    <RuntimeMark runtimeId={entry.runtimeId} />
                    <span className="who">
                      <span className="nm">
                        <b>{entry.label}</b>
                        {/* About us and not about the machine, so it is worded as ours. */}
                        {!entry.supported && (
                          <span className="mono muted">no adapter yet</span>
                        )}
                      </span>
                      <span className="sub mono muted">
                        {READINESS_WORD[entry.readiness]}
                        {entry.version === undefined ? '' : ` · ${entry.version}`} · {entry.detail}
                      </span>
                    </span>
                    <span style={{ flex: 1 }} />
                    {/* At most one, and often none: a door labelled *sign in* beside a runtime
                        that works reads as blobot doubting the answer it just gave. */}
                    {entry.remedies[0] !== undefined && (
                      <button className="btn tiny" onClick={() => setFixing(entry.runtimeId)}>
                        {entry.remedies[0].kind === 'install' ? 'install it' : 'sign in'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {section === 'context' && <ContextCeilings />}

          {section === 'sound' && <SoundSection />}

          {section === 'dictation' && <Dictation />}
        </div>
      </div>

      {fixingRuntime !== undefined && remedy !== undefined && (
        <RuntimeSetup
          runtime={fixingRuntime}
          remedy={remedy}
          onClose={() => setFixing(undefined)}
          // Detection asked again on the way out, so the row says what the machine holds now
          // rather than what it held when this screen opened.
          onSettled={() => rescan()}
        />
      )}
    </div>
  );
}

/**
 * The third section. `.scratch/sound/issues/06-the-mute-and-the-default.md`.
 *
 * Three switches and nothing else. **No level slider and no voice picker**: those are `issues/03`'s
 * decisions, and offering either would be blobot asking the user to do design work. **No per-event
 * list either** — thirteen sounds persist under these three and are deliberately not exposed, on
 * the `bounds.ts` principle that blobot states its own ceilings in words a person can hold.
 *
 * All three default on, and the notification default is the argued one: the single notification
 * that ships reports the one state where silence itself loses work, because a permission request
 * with nobody listening is cancelled, never allowed. A default of off would make the failure this
 * sound exists to prevent the default experience.
 *
 * **Stated, never consented to.** No first-run prompt: ticket 14's permission disclosure closes the
 * creation flow the same way, and a consent dialog for something one click reverses trains people
 * to dismiss dialogs.
 */
function SoundSection(): React.JSX.Element {
  const { settings, set } = useSoundSettings();
  const rows: readonly {
    readonly id: 'interaction' | 'notifications';
    readonly label: string;
    readonly detail: string;
  }[] = [
    {
      id: 'interaction',
      label: 'when you act',
      detail: 'you caused it, so it never interrupts',
    },
    {
      id: 'notifications',
      label: 'when an agent is waiting on you',
      detail: 'only for a team you are not looking at',
    },
  ];

  return (
    <>
      {/* The complete specification, in one sentence. That it fits in one is the test of whether
          the vocabulary stayed small enough. */}
      <div className="note muted">
        blobot plays a short sound when you commit an action, and one when an agent is waiting on
        you from a team you are not looking at. Nothing else makes a sound. With nobody listening
        a permission request is cancelled rather than allowed, which is the one thing silence
        costs here. It plays on this machine only: blobot sends nothing anywhere else.
      </div>

      <div className="roster">
        <button
          className={`listrow pick${settings.on ? ' on' : ''}`}
          aria-pressed={settings.on}
          onClick={() => set({ ...settings, on: !settings.on })}
        >
          <span className="who">
            <span className="nm">
              <b>sound</b>
            </span>
            <span className="sub mono muted">remembered on this machine</span>
          </span>
          <span style={{ flex: 1 }} />
          <span className={`tick${settings.on ? ' on' : ''}`}>
            {settings.on && <Check size={14} aria-hidden />}
          </span>
        </button>

        {rows.map((row) => (
          <button
            key={row.id}
            className={`listrow pick${settings[row.id] ? ' on' : ''}`}
            aria-pressed={settings[row.id]}
            /* Dimmed rather than removed while the master is off: a row that vanishes takes the
               fact that the choice exists with it, and these two are what the master is over. */
            style={settings.on ? undefined : { opacity: 0.4 }}
            disabled={!settings.on}
            onClick={() => set({ ...settings, [row.id]: !settings[row.id] })}
          >
            <span className="who">
              <span className="nm">
                <b>{row.label}</b>
              </span>
              <span className="sub mono muted">{row.detail}</span>
            </span>
            <span style={{ flex: 1 }} />
            <span className={`tick${settings[row.id] ? ' on' : ''}`}>
              {settings[row.id] && <Check size={14} aria-hidden />}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
