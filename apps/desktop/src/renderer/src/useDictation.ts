import { useCallback, useEffect, useRef, useState } from 'react';
import { DICTATION_RECORDING_LIMIT_MS, describeTranscriberFailure } from '@blobot/core/domain';
import type { UiDictationState } from '../../shared/api.js';
import type { DictationView } from './components/Composer.js';
import { MicrophoneRefused } from './dictation/capture.js';
import { simulatedLevel, startRecording, type Recording } from './dictation/recording.js';

/**
 * Dictation, from the composer's side (`.scratch/dictation/`, tickets 06, 07, 11).
 *
 * The renderer opens the microphone, cuts segments from the level it measures and ships bytes;
 * main holds the Transcriber and sends four kinds of event back. This folds both into the one
 * view the composer draws: a state, a level, a clock, a ghost, a note. The composer never learns
 * which Transcriber is behind it, and neither does this.
 *
 * One recording at a time, for the team on screen. Switching teams stops it — a sentence begun
 * in one team's composer does not land in another's — and so does the switch in Settings going
 * off under it.
 */
interface Live {
  readonly teamId: string;
  readonly began: number;
  recording?: Recording;
  level: () => number;
  lastDrop: number;
  ticker: number;
}

interface View {
  readonly listening: boolean;
  readonly seconds: number;
  readonly paused: boolean;
  readonly partial?: string | undefined;
  readonly note?: string | undefined;
  readonly committed?: { readonly text: string; readonly at: number } | undefined;
}

const REST: View = { listening: false, seconds: 0, paused: false };

/** How long a dropped chunk keeps `paused` on the word line. */
const PAUSED_FOR_MS = 1_500;
/** How long a note stays under the pill once the recording is over. */
const NOTE_FOR_MS = 12_000;

export function useDictation({
  state,
  teamId,
  simulate = false,
}: {
  readonly state: UiDictationState;
  readonly teamId: string | undefined;
  /**
   * `--screen=dictation`: no microphone, a spoken-sentence envelope for the level, and the
   * recording started on arrival — so the mic, the wave, the word and the ghost can be reviewed
   * through `--screenshot` on a machine with nobody talking to it.
   */
  readonly simulate?: boolean;
}): DictationView | undefined {
  const enabled = state === 'ready' && teamId !== undefined;
  const [view, setView] = useState<View>(REST);
  const live = useRef<Live | undefined>(undefined);
  const commits = useRef(0);
  const noteTimer = useRef<number | undefined>(undefined);
  const level = useCallback(() => live.current?.level() ?? 0, []);

  const note = useCallback((sentence: string | undefined) => {
    window.clearTimeout(noteTimer.current);
    setView((held) => ({ ...held, note: sentence }));
    if (sentence !== undefined) {
      noteTimer.current = window.setTimeout(() => setView((held) => ({ ...held, note: undefined })), NOTE_FOR_MS);
    }
  }, []);

  /** Close the microphone and the clock. Main is not told; the caller decides that. */
  const closeCapture = useCallback(async (): Promise<Live | undefined> => {
    const it = live.current;
    if (it === undefined) return undefined;
    live.current = undefined;
    window.clearInterval(it.ticker);
    await it.recording?.stop();
    return it;
  }, []);

  const stop = useCallback(async (): Promise<void> => {
    const it = await closeCapture();
    if (it === undefined) return;
    await window.blobot.stopDictation();
  }, [closeCapture]);

  const start = useCallback(async (): Promise<void> => {
    if (live.current !== undefined || teamId === undefined) return;
    note(undefined);
    setView((held) => ({ ...held, partial: undefined }));
    const started = await window.blobot.startDictation(teamId);
    if (!started.ok) return note(`stopped · ${started.error}`);
    const entry: Live = { teamId, began: performance.now(), level: () => 0, lastDrop: 0, ticker: 0 };
    live.current = entry;
    if (simulate) {
      entry.level = simulatedLevel(entry.began);
    } else {
      try {
        const recording = await startRecording({
          takes: started.takes,
          onDrop: () => {
            entry.lastDrop = performance.now();
          },
        });
        if (live.current !== entry) return void recording.stop();
        entry.recording = recording;
        entry.level = recording.level;
      } catch (error) {
        live.current = undefined;
        await window.blobot.stopDictation();
        return note(error instanceof MicrophoneRefused ? error.sentence : 'stopped · the microphone could not be opened');
      }
    }
    setView((held) => ({ ...held, listening: true, seconds: 0, paused: false }));
    entry.ticker = window.setInterval(() => {
      const now = performance.now();
      setView((held) => ({
        ...held,
        seconds: (now - entry.began) / 1000,
        paused: now - entry.lastDrop < PAUSED_FOR_MS,
      }));
    }, 250);
  }, [teamId, simulate, note]);

  // What main says about the recording. Filtered to the team it was started for: a switch
  // mid-sentence must not draw one team's words into another's composer.
  useEffect(
    () =>
      window.blobot.onDictation((forTeam, event) => {
        if (forTeam !== teamId) return;
        switch (event.type) {
          case 'partial':
            setView((held) => ({ ...held, partial: event.text }));
            return;
          case 'committed':
            commits.current += 1;
            setView((held) => ({
              ...held,
              partial: undefined,
              committed: { text: event.text, at: commits.current },
            }));
            return;
          case 'ended':
            void closeCapture();
            setView((held) => ({ ...held, listening: false, partial: undefined, paused: false }));
            if (event.reason === 'ceiling')
              note(`stopped · ${Math.round(DICTATION_RECORDING_LIMIT_MS / 60_000)} min`);
            return;
          case 'failed':
            // The far side is already gone; only the microphone is ours to close.
            void closeCapture();
            setView((held) => ({ ...held, listening: false, partial: undefined, paused: false }));
            note(describeTranscriberFailure(event.cause));
            return;
        }
      }),
    [teamId, closeCapture, note],
  );

  // A recording belongs to the team it started on. Leaving that team, or dictation going off
  // under it, ends it.
  useEffect(() => {
    if (!enabled) void stop();
    return () => void stop();
  }, [enabled, teamId, stop]);

  // The keyboard gesture, beside the button: ctrl/⌘ + shift + M, a window listener because the
  // composer holds focus almost all the time and this must not be a control you first have to
  // click away from — the same reasoning as the navigator's ctrl+k.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'm' || !event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      void (live.current === undefined ? start() : stop());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, start, stop]);

  useEffect(() => {
    if (simulate && enabled) void start();
  }, [simulate, enabled, start]);

  if (!enabled) return undefined;
  return {
    state: view.listening ? 'listening' : 'ready',
    level,
    seconds: view.seconds,
    paused: view.paused,
    ...(view.partial === undefined ? {} : { partial: view.partial }),
    ...(view.note === undefined ? {} : { note: view.note }),
    ...(view.committed === undefined ? {} : { committed: view.committed }),
    onToggle: () => void (live.current === undefined ? start() : stop()),
  };
}
