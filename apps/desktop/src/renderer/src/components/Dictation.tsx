import { useCallback, useEffect, useRef, useState } from 'react';
import { describeRtf } from '@blobot/core/domain';
import {
  SPEECH_TRYOUT_PLACE,
  type UiDictationSettings,
  type UiSpeechFileState,
  type UiSpeechProvider,
  type UiSpeechTarget,
} from '../../../shared/api.js';
import { startRecording, type Recording } from '../dictation/recording.js';
import { sizeOf } from './Attached.js';
import { Wave } from './Composer.js';

/**
 * *Dictation*, the settings screen's fourth section, and **the section is the flow** (ticket 10):
 * rows appear by state, no wizard. The switch; readiness with its figure and *check again*; the
 * engine and the three speech models, each with `download` / `downloading · 412 MB of 574 MB` /
 * `remove · recovers about 574 MB`; the *say something* row that measures a real sentence; the
 * three providers with a key field that never echoes the key; and the disclosure at the foot,
 * stated and never consented to.
 *
 * The renderer draws words and figures main composed. It never learns which Transcriber the
 * composer will get, only that the section is set up so that it will get one.
 */
export function Dictation(): React.JSX.Element {
  const [view, setView] = useState<UiDictationSettings | undefined>(undefined);

  const load = useCallback((): void => {
    void window.blobot.dictationSettings().then(setView);
  }, []);

  useEffect(() => {
    load();
    // A file moved on disk — a figure changed, a download landed — so the rows say what is true.
    return window.blobot.onSpeechFile(() => load());
  }, [load]);

  if (view === undefined) return <div className="note muted">reading…</div>;

  const act = (promise: Promise<UiDictationSettings>): void => {
    void promise.then(setView);
  };

  const engineReady = view.engine.state === 'installed';
  const chosenModel = view.models.find((model) => model.id === view.modelId);
  const localReady = engineReady && chosenModel?.state.state === 'installed';
  const provider = view.providers.find((entry) => entry.id === view.providerId);

  return (
    <>
      <div className="note muted">
        Speak into the composer and get text there. Transcribed on this machine, or by one
        provider you name with your own key. Nothing leaves the machine until you choose one.
      </div>

      <div className="roster dictation">
        <SwitchRow view={view} onChange={(enabled) => act(window.blobot.setDictation({ enabled }))} onRemoveAll={() => act(window.blobot.removeAllSpeech())} />

        {view.enabled && (
          <>
            <ReadinessRow view={view} onCheck={() => act(window.blobot.checkSpeechReadiness())} />

            {view.readiness.word !== 'unfit' && (
              <>
                <div className="subhead sm muted">Speech model</div>
                <FileRow
                  label="Engine"
                  sub="whisper.cpp"
                  state={view.engine}
                  target="engine"
                  onAct={act}
                />
                {view.models.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    chosen={view.modelId === model.id && view.transcriber === 'local'}
                    recommended={view.readiness.recommended === model.id}
                    engineReady={engineReady}
                    onChoose={() => act(window.blobot.setDictation({ modelId: model.id }))}
                    onAct={act}
                  />
                ))}
                {view.transcriber === 'local' && !localReady && (
                  <div className="note muted">no speech model · choose one</div>
                )}
                {localReady && <SaySomething view={view} onMeasured={load} />}
              </>
            )}

            <div className="subhead sm muted">Remote</div>
            {view.providers.map((entry) => (
              <ProviderRow
                key={entry.id}
                provider={entry}
                chosen={view.providerId === entry.id && view.transcriber === 'remote'}
                onChoose={() => act(window.blobot.setDictation({ providerId: entry.id }))}
                onSaved={setView}
                onRemoved={() => act(window.blobot.removeSpeechKey(entry.id))}
              />
            ))}

            {/* Stated rather than consented to, like the creation flow's. Two sentences by
                choice; the remote one names the provider, because this is the one thing in the
                app that sends something of the user's off the machine. */}
            <div className="note muted disclosure">
              {view.transcriber === 'remote' && provider !== undefined ? (
                <>
                  Your voice is sent to {provider.label} to be transcribed, and to nobody else. The
                  audio is discarded here once it is text. {provider.retention}
                </>
              ) : (
                <>
                  Your voice is transcribed on this machine. The audio is discarded once it is
                  text; the text is what goes to an agent.
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** The switch, and what turning it off keeps: priced first, the delete-team treatment. */
function SwitchRow({
  view,
  onChange,
  onRemoveAll,
}: {
  view: UiDictationSettings;
  onChange: (enabled: boolean) => void;
  onRemoveAll: () => void;
}): React.JSX.Element {
  const { footprint } = view;
  const kept =
    footprint.bytes === 0
      ? ''
      : ` · keeping ${footprint.models === 0 ? '' : `${footprint.models} speech model${footprint.models === 1 ? '' : 's'}`}${
          footprint.models > 0 && footprint.engine ? ' and ' : ''
        }${footprint.engine ? 'the engine' : ''} · ${sizeOf(footprint.bytes)}`;
  return (
    <div className="listrow tall">
      {/* No name on it. The heading over this list is the word this row would carry, and the
          `.who` column and the spacer were both `flex:1`, so a row saying `Dictation` twice was
          wrapping its one true line into a third of the width it had. */}
      <span className="who">
        <span className="sub mono muted">
          {view.enabled ? 'on' : `off${kept}`}
        </span>
      </span>
      {!view.enabled && footprint.bytes > 0 && (
        <button className="btn tiny" onClick={onRemoveAll}>
          remove all · recovers about {sizeOf(footprint.bytes)}
        </button>
      )}
      <button
        className={`switch${view.enabled ? ' on' : ''}`}
        role="switch"
        aria-checked={view.enabled}
        aria-label="Dictation"
        onClick={() => onChange(!view.enabled)}
      >
        <i />
      </button>
    </div>
  );
}

/** Four words, a figure, and the way out of each (ticket 08). */
function ReadinessRow({ view, onCheck }: { view: UiDictationSettings; onCheck: () => void }): React.JSX.Element {
  const { readiness } = view;
  const line = ((): string => {
    switch (readiness.word) {
      case '':
        return 'not checked';
      case 'unfit':
        return `unfit · ${readiness.figure} · remote only`;
      case 'untested':
        return `untested · ${readiness.figure}`;
      case 'fit':
        return `fit · ${readiness.measuredRtf === undefined ? readiness.figure : describeRtf(readiness.measuredRtf)}`;
      case 'slow':
        return `slow · ${readiness.measuredRtf === undefined ? readiness.figure : describeRtf(readiness.measuredRtf)} · try a smaller model`;
    }
  })();
  return (
    <div className="listrow tall">
      <span className="who">
        <span className="nm">
          <b>This machine</b>
        </span>
        <span className="sub mono muted">
          {line}
          {readiness.reason === undefined ? '' : ` · ${readiness.reason}`}
        </span>
      </span>
      <span style={{ flex: 1 }} />
      <button className="btn tiny" onClick={onCheck}>
        check again
      </button>
    </div>
  );
}

/** A figure that knows its end, and never a bar (DESIGN.md, the download amendment). */
function fileWord(state: UiSpeechFileState): string {
  switch (state.state) {
    case 'absent':
      return 'not downloaded';
    case 'downloading':
      return `downloading · ${sizeOf(state.received)}${state.total === undefined ? '' : ` of ${sizeOf(state.total)}`}`;
    case 'paused':
      return `paused · ${sizeOf(state.received)}${state.total === undefined ? '' : ` of ${sizeOf(state.total)}`}`;
    case 'failed':
      return state.error;
    case 'installed':
      return `installed · ${sizeOf(state.bytes)}`;
    case 'unavailable':
      return state.reason;
  }
}

function FileControls({
  state,
  target,
  onAct,
  removable = true,
}: {
  state: UiSpeechFileState;
  target: UiSpeechTarget;
  onAct: (promise: Promise<UiDictationSettings>) => void;
  removable?: boolean;
}): React.JSX.Element | null {
  switch (state.state) {
    case 'absent':
      return (
        <button className="btn tiny" onClick={() => onAct(window.blobot.downloadSpeech(target))}>
          download
        </button>
      );
    case 'downloading':
      return (
        <button className="btn tiny" onClick={() => onAct(window.blobot.cancelSpeechDownload(target))}>
          cancel
        </button>
      );
    case 'paused':
    case 'failed':
      return (
        <>
          <button className="btn tiny" onClick={() => onAct(window.blobot.downloadSpeech(target))}>
            {state.state === 'paused' ? 'resume' : 'try again'}
          </button>
          {state.received > 0 && (
            <button className="btn tiny" onClick={() => onAct(window.blobot.removeSpeech(target))}>
              discard
            </button>
          )}
        </>
      );
    case 'installed':
      return removable ? (
        <button className="btn tiny" onClick={() => onAct(window.blobot.removeSpeech(target))}>
          remove · recovers about {sizeOf(state.bytes)}
        </button>
      ) : null;
    case 'unavailable':
      return null;
  }
}

function FileRow({
  label,
  sub,
  state,
  target,
  onAct,
}: {
  label: string;
  sub: string;
  state: UiSpeechFileState;
  target: UiSpeechTarget;
  onAct: (promise: Promise<UiDictationSettings>) => void;
}): React.JSX.Element {
  return (
    <div className="listrow tall">
      <span className="who">
        <span className="nm">
          <b>{label}</b>
          <span className="mono muted">{sub}</span>
        </span>
        <span className="sub mono muted">{fileWord(state)}</span>
      </span>
      <span style={{ flex: 1 }} />
      {/* The engine goes with *remove all*, not on its own: nothing works without it. */}
      <FileControls state={state} target={target} onAct={onAct} removable={target !== 'engine'} />
    </div>
  );
}

/** One size: a picker row while it is on disk, a download row while it is not. */
function ModelRow({
  model,
  chosen,
  recommended,
  engineReady,
  onChoose,
  onAct,
}: {
  model: UiDictationSettings['models'][number];
  chosen: boolean;
  recommended: boolean;
  engineReady: boolean;
  onChoose: () => void;
  onAct: (promise: Promise<UiDictationSettings>) => void;
}): React.JSX.Element {
  const installed = model.state.state === 'installed';
  return (
    <div
      className={`listrow tall pick${chosen ? ' on' : ''}`}
      role="radio"
      aria-checked={chosen}
      aria-disabled={!installed || !engineReady}
      onClick={() => {
        if (installed && engineReady) onChoose();
      }}
    >
      <span className={`tick${chosen ? ' on' : ''}`} aria-hidden>
        {chosen ? '✓' : ''}
      </span>
      <span className="who">
        <span className="nm">
          <b>{model.label}</b>
          <span className="mono muted">{sizeOf(model.bytes)}</span>
          {recommended && <span className="mono muted">recommended</span>}
        </span>
        <span className="sub mono muted">{fileWord(model.state)}</span>
      </span>
      <span style={{ flex: 1 }} />
      <span onClick={(event) => event.stopPropagation()}>
        <FileControls state={model.state} target={model.id} onAct={onAct} />
      </span>
    </div>
  );
}

/**
 * Ticket 08's measured stage: a real sentence, through the real microphone and the chosen
 * model, with the transcription shown so the person sees the quality and not only the speed.
 * `warming up` while the first segment decodes, because Metal's first run builds its shader
 * cache here rather than mid-sentence in the composer.
 */
function SaySomething({ view, onMeasured }: { view: UiDictationSettings; onMeasured: () => void }): React.JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'decoding' | 'done' | 'failed'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [heard, setHeard] = useState<{ text: string; rtf: number; word: 'fit' | 'slow' } | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);
  const recording = useRef<Recording | undefined>(undefined);
  const level = useCallback(() => recording.current?.level() ?? 0, []);

  const stop = useCallback(async (): Promise<void> => {
    const it = recording.current;
    recording.current = undefined;
    await it?.stop();
    await window.blobot.stopDictation();
  }, []);

  useEffect(() => {
    const offEvents = window.blobot.onDictation((place, event) => {
      if (place !== SPEECH_TRYOUT_PLACE) return;
      if (event.type === 'failed') {
        setPhase('failed');
        setNote(`stopped · the engine ${event.cause === 'engine_exited' ? 'exited' : 'failed'}`);
        void stop();
      }
    });
    const offMeasured = window.blobot.onSpeechMeasured((measurement) => {
      setHeard(measurement);
      setPhase('done');
      void stop();
      onMeasured();
    });
    return () => {
      offEvents();
      offMeasured();
      void stop();
    };
  }, [stop, onMeasured]);

  useEffect(() => {
    if (phase !== 'listening' && phase !== 'decoding') return;
    const began = performance.now();
    const ticker = window.setInterval(() => {
      const elapsed = (performance.now() - began) / 1000;
      setSeconds(elapsed);
      // Nothing said within fifteen seconds leaves it untested, returnable.
      if (elapsed >= 15 && phase === 'listening') {
        setPhase('idle');
        setNote('nothing heard · untested');
        void stop();
      }
    }, 250);
    return () => window.clearInterval(ticker);
  }, [phase, stop]);

  const start = async (): Promise<void> => {
    setNote(undefined);
    setHeard(undefined);
    const started = await window.blobot.startSpeechTryout();
    if (!started.ok) return setNote(started.error);
    try {
      recording.current = await startRecording({ takes: started.takes });
    } catch (error) {
      await window.blobot.stopDictation();
      return setNote(error instanceof Error ? error.message : 'the microphone could not be opened');
    }
    setSeconds(0);
    setPhase('listening');
  };

  const finish = async (): Promise<void> => {
    // The microphone closes and the last segment goes to the engine; the text comes back on
    // its own event, timed.
    const it = recording.current;
    recording.current = undefined;
    await it?.stop();
    setPhase('decoding');
  };

  return (
    <div className="listrow tall saysomething">
      <span className="who">
        <span className="nm">
          <b>Say something</b>
          <span className="mono muted">
            {view.modelId === '' ? '' : `with the ${view.models.find((m) => m.id === view.modelId)?.label ?? ''} model`}
          </span>
        </span>
        <span className="sub mono muted">
          {phase === 'listening' && (
            <>
              <Wave read={level} /> listening · {Math.floor(seconds)}s
            </>
          )}
          {phase === 'decoding' && 'warming up…'}
          {phase === 'done' && heard !== undefined && `measured · ${describeRtf(heard.rtf)} · ${heard.word}`}
          {(phase === 'idle' || phase === 'failed') && (note ?? 'a real sentence, through the real microphone, timed')}
        </span>
        {heard !== undefined && <span className="heard">{heard.text === '' ? '(nothing recognised)' : heard.text}</span>}
      </span>
      <span style={{ flex: 1 }} />
      {phase === 'listening' ? (
        <button className="btn tiny" onClick={() => void finish()}>
          done
        </button>
      ) : phase === 'decoding' ? null : (
        <button className="btn tiny" onClick={() => void start()}>
          {phase === 'done' ? 'again' : 'say something'}
        </button>
      )}
    </div>
  );
}

/**
 * One provider: a picker row, a key field that never echoes the key, and the honest sentence
 * for the form the key took (ADR-0005 clause 6).
 */
function ProviderRow({
  provider,
  chosen,
  onChoose,
  onSaved,
  onRemoved,
}: {
  provider: UiSpeechProvider;
  chosen: boolean;
  onChoose: () => void;
  onSaved: (view: UiDictationSettings) => void;
  onRemoved: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [rejected, setRejected] = useState<string | undefined>(undefined);
  const hasKey = provider.key.state !== 'none';

  const save = async (): Promise<void> => {
    if (draft.trim() === '') return;
    setChecking(true);
    setRejected(undefined);
    const answer = await window.blobot.saveSpeechKey(provider.id, draft);
    setChecking(false);
    // The field is emptied either way: a key is not something to leave on screen.
    setDraft('');
    if (answer.rejected !== undefined) return setRejected(answer.rejected);
    onSaved(answer);
  };

  const keyLine = ((): string => {
    if (checking) return 'checking…';
    if (rejected !== undefined) return rejected;
    switch (provider.key.state) {
      case 'none':
        return 'no key · paste one';
      case 'saved':
        return provider.key.form === 'encrypted'
          ? 'key saved · encrypted with a key your OS keychain holds; the encrypted key is kept in blobot’s data folder'
          : 'key saved · kept as plain text in blobot’s data folder, readable by anything running as you — the same way your CLIs keep their own logins';
      case 'environment':
        return `from ${provider.key.variable} · unset it in the shell that launched blobot to stop using it`;
    }
  })();

  return (
    <div
      className={`listrow tall pick provider${chosen ? ' on' : ''}`}
      role="radio"
      aria-checked={chosen}
      aria-disabled={!hasKey}
      onClick={() => {
        if (hasKey) onChoose();
      }}
    >
      <span className={`tick${chosen ? ' on' : ''}`} aria-hidden>
        {chosen ? '✓' : ''}
      </span>
      <span className="who">
        <span className="nm">
          <b>{provider.label}</b>
        </span>
        <span className="sub mono muted">{keyLine}</span>
      </span>
      <span style={{ flex: 1 }} />
      <span className="keyfield" onClick={(event) => event.stopPropagation()}>
        {provider.key.state !== 'environment' && (
          <input
            className="field narrow"
            type="password"
            autoComplete="off"
            value={draft}
            placeholder={hasKey ? 'replace the key' : 'paste a key'}
            aria-label={`${provider.label} API key`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
            }}
          />
        )}
        {provider.key.state !== 'environment' && (
          <button className="btn tiny" disabled={draft.trim() === '' || checking} onClick={() => void save()} title={`Checks the key against ${provider.label} once, with no audio. That is the first time it leaves this machine.`}>
            save
          </button>
        )}
        {provider.key.state === 'saved' && (
          <button className="btn tiny" onClick={onRemoved}>
            remove
          </button>
        )}
      </span>
    </div>
  );
}
