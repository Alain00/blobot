import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { UiRuntimeChoice } from '../../../shared/api.js';
import { READINESS_WORD } from './readiness.js';
import { RuntimeMark } from './RuntimeMark.js';
import { RuntimeSetup } from './RuntimeSetup.js';
import { ContextCeilings } from './ContextCeilings.js';

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
 * and *routines* take on the right of it. Two sections, and both are about the machine rather
 * than about a screen: which runtimes it has, and how much room each model is worth. A section
 * gets added here when there is something true to configure, never to fill the column out.
 */
type Section = 'runtimes' | 'context';

const SECTIONS: readonly { readonly id: Section; readonly label: string }[] = [
  { id: 'runtimes', label: 'Runtimes' },
  { id: 'context', label: 'Context' },
];

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
