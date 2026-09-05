import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
// The one vendor stylesheet in the app. It is not a design system arriving through the back
// door: it is the geometry xterm needs to place its own rows, the same trade as Radix's
// behaviour, and every colour it draws with is handed to it from the tokens below.
import '@xterm/xterm/css/xterm.css';
import type { RuntimeStepOutcome, UiRuntimeChoice, UiRuntimeRemedy } from '../../../shared/api.js';

/**
 * A runtime that is not ready, and the runtime's own way out of it, on a real terminal.
 *
 * **blobot does not sign anybody in.** It spawns the CLI's own `auth login`, gives it a
 * pseudo-terminal to be interactive on, and lets it do what it does: print a code, open a
 * browser, wait for the user to come back. Keystrokes go from this pane to that process and
 * bytes come back. Nothing is read on the way through, nothing is stored, and there is no
 * credential in blobot at the end of it, which is the `CLAUDE.md` rule kept by not
 * participating rather than by refusing to help.
 *
 * Installing is the same shape with a confirm in front of it: the vendor's own published
 * command, shown in full, run only after the user has read it and said yes. It is the command
 * they would have pasted into a terminal themselves, in a terminal they can watch.
 *
 * **A modal, per DESIGN.md**, and for that file's own reason: what happens here outlives the
 * screen that opened it. A signed-in CLI is signed in for every team, and an installed one is
 * installed for the machine.
 *
 * The one thing this screen refuses to do is *conclude*. The exit code says the command ended,
 * not that it worked: an installer can exit 0 having put a binary where nothing looks, and a
 * login can be abandoned in a browser tab with the command exiting cleanly. So the ending is
 * detection asked again, in the same four words the picker uses.
 */
export function RuntimeSetup({
  runtime,
  remedy,
  onClose,
  onSettled,
}: {
  runtime: UiRuntimeChoice;
  remedy: UiRuntimeRemedy;
  onClose: () => void;
  /** The machine, asked again, once the command has ended. The owner redraws its picker. */
  onSettled?: (runtime: UiRuntimeChoice | undefined) => void;
}): React.JSX.Element {
  // An install is confirmed before it runs and a sign-in is not: one of these puts software on
  // the machine, and the other runs a program that is already there and does nothing but ask
  // the user who they are.
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>(
    remedy.kind === 'install' ? 'confirm' : 'running',
  );
  const [outcome, setOutcome] = useState<RuntimeStepOutcome | undefined>();
  const [error, setError] = useState<string | undefined>();

  const done = phase === 'done';

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content
          className="modal termmodal"
          aria-describedby={undefined}
          // Escape belongs to the terminal while something is running in it: these are TUIs,
          // and a key the program is waiting on must not close the window instead. Same for a
          // click on the scrim, which would otherwise kill a login halfway through a browser
          // round trip. The close button is the way out, and it says what it will do.
          onEscapeKeyDown={(event) => {
            if (!done) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (!done) event.preventDefault();
          }}
        >
          {/* Named for a screen reader and for nothing else. **The terminal is the dialog**: the
              program inside it opens by saying who it is and what it wants, and a title, an
              eyebrow and a paragraph stacked above that were blobot narrating over the top of
              something already speaking. What survives is the confirm, which is the one thing
              the terminal cannot say for itself, since it has not run yet. */}
          <Dialog.Title className="offscreen">
            {remedy.kind === 'install' ? `Install ${runtime.label}` : `Sign in to ${runtime.label}`}
          </Dialog.Title>

          {phase === 'confirm' && (
            <div className="prose">
              <p className="mono termcommand">{remedy.shown}</p>
              <p className="note muted">{remedy.note}</p>
            </div>
          )}

          {phase !== 'confirm' && (
            <TerminalPane
              onExit={(step) => {
                setOutcome(step);
                setPhase('done');
                onSettled?.(step.runtime);
              }}
              start={async (stepId) => {
                const result = await window.blobot.startRuntimeStep(
                  stepId,
                  runtime.runtimeId,
                  remedy.kind,
                );
                if (!result.ok) {
                  setError(result.error ?? 'That could not be started.');
                  setPhase('done');
                }
              }}
            />
          )}

          {error !== undefined && <div className="refusal">{error}</div>}
          {outcome !== undefined && error === undefined && (
            <div className="note muted">{settledLine(outcome)}</div>
          )}

          <div className="modalfoot">
            {phase === 'confirm' ? (
              <>
                <Dialog.Close className="btn">cancel</Dialog.Close>
                <button className="btn primary" onClick={() => setPhase('running')}>
                  run it
                </button>
              </>
            ) : (
              <Dialog.Close className="btn">{done ? 'close' : 'stop and close'}</Dialog.Close>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * What the machine says now, which is the only ending this screen is entitled to write.
 *
 * It never says *signed in*. Detection's positive was never proof — that is ticket 11's whole
 * finding — so this reports the state in the picker's four words and lets a `needs sign-in`
 * after a login that exited cleanly stand as the honest and useful answer it is.
 */
function settledLine(outcome: RuntimeStepOutcome): string {
  const readiness = outcome.runtime?.readiness;
  if (readiness === 'ready') {
    return outcome.kind === 'install'
      ? `Installed. ${outcome.runtime?.label ?? 'It'} reports a credential too, so agents can use it now.`
      : 'Done. A credential is on this machine now.';
  }
  if (readiness === 'needs_sign_in') {
    return outcome.kind === 'install'
      ? 'Installed. It has no credential yet, so sign in next.'
      : 'It ended with no credential on this machine. Nothing was changed.';
  }
  if (readiness === 'not_installed') {
    return 'Nothing was installed. The command ended without leaving a binary blobot can find.';
  }
  return 'It ended. blobot could not read what state that runtime is in now.';
}


/**
 * The sixteen ANSI colours, spent as two levels of grey.
 *
 * DESIGN.md's governing rule has no exception for a program blobot is only quoting: the
 * blobatars are the only saturated thing on the page, and this pane would otherwise put a
 * vendor's greens and cyans on screen beside them. The transcript already holds this line the
 * same way, rendering markdown with no syntax colour at all.
 *
 * Nothing is lost that these logins actually use. Structure survives in the channels a terminal
 * has besides hue: bold, dim, inverse, and the glyphs themselves — the provider list marks its
 * selection with a filled circle against empty ones, and reads exactly as it does in a real
 * terminal. What goes is only the claim that green means good, which is the claim this app does
 * not make anywhere else either.
 *
 * Two tiers rather than one flat grey: the normal six are secondary text and the bright six are
 * emphasis, which is the same pair of weights the rest of the interface runs on.
 */
const MONOCHROME_ANSI = {
  black: '#1a1c1e',
  red: '#969896',
  green: '#969896',
  yellow: '#969896',
  blue: '#969896',
  magenta: '#969896',
  cyan: '#969896',
  white: '#b0b3b1',
  brightBlack: '#5c6065',
  brightRed: '#c5c8c6',
  brightGreen: '#c5c8c6',
  brightYellow: '#c5c8c6',
  brightBlue: '#c5c8c6',
  brightMagenta: '#c5c8c6',
  brightCyan: '#c5c8c6',
  brightWhite: '#c5c8c6',
} as const;

/** `cmd` on a Mac, `ctrl+shift` everywhere else, which is what each platform's terminals use. */
const isMac = navigator.platform.toLowerCase().includes('mac');

/**
 * xterm, wired to the main process both ways.
 *
 * The size is measured and sent, rather than assumed: a terminal that is never told how wide it
 * is draws its first line wrapped at eighty columns and never redraws it, which is how a
 * perfectly working login looks broken.
 */
function TerminalPane({
  start,
  onExit,
}: {
  start: (stepId: string) => Promise<void>;
  onExit: (outcome: RuntimeStepOutcome) => void;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  /**
   * This visit's id, minted here and sent with everything.
   *
   * React runs an effect twice in development — mount, clean up, mount again — and this effect
   * owns a process. Unaddressed, the first mount's cleanup raced the second mount's start and
   * killed the process that was left, which showed as a login that printed its first line and
   * then hung forever: a deliberate stop reports no exit, so nothing on screen ever changed.
   * With an id in every call, whichever order those two land in, each one acts on the session it
   * actually meant.
   */
  const stepId = useRef(crypto.randomUUID());
  // The callback is read through a ref because the effect below runs once, on purpose: a
  // re-registered listener would mean a second process, and a re-created terminal would throw
  // away everything the first one had printed.
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    const style = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string): string =>
      style.getPropertyValue(name).trim() || fallback;
    const term = new Terminal({
      fontFamily: token('--mono', 'monospace'),
      fontSize: 12,
      // A terminal is a lifted surface like every other one here, so it takes `--raised` and
      // not the page. The cursor is ink, which is this app's one emphasis and is exactly what a
      // cursor is for.
      theme: {
        background: token('--raised', '#282a2e'),
        foreground: token('--ink', '#c5c8c6'),
        cursor: token('--ink', '#c5c8c6'),
        cursorAccent: token('--raised', '#282a2e'),
        selectionBackground: token('--line', '#373b41'),
        ...MONOCHROME_ANSI,
      },
      cursorBlink: true,
      // Its own scrollback, because the page around it does not scroll while this is open.
      scrollback: 2_000,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // A login's whole instruction is often a URL to visit, and the one thing a person must not
    // have to do with it is retype it. Opened through the main process, which allows `http` and
    // `https` and nothing else: this text came out of another program's stdout.
    term.loadAddon(new WebLinksAddon((_event, uri) => void window.blobot.openLink(uri)));
    term.open(element);

    // Selection is xterm's own; what it has no opinion about is which key copies. `ctrl+shift+c`
    // rather than `ctrl+c`, because in a terminal `ctrl+c` is how you interrupt what is running
    // and stealing it would be taking a key away from the program. `cmd+c` on a Mac, where the
    // clipboard has never been the interrupt.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || event.key.toLowerCase() !== 'c') return true;
      const copies = isMac ? event.metaKey : event.ctrlKey && event.shiftKey;
      if (!copies) return true;
      const selection = term.getSelection();
      if (selection === '') return true;
      void navigator.clipboard.writeText(selection);
      // Swallowed, so the keystroke does not also reach the program as an interrupt.
      return false;
    });

    const measure = (): void => {
      try {
        fit.fit();
      } catch {
        // The pane is mid-layout and has no size yet. The observer below fires again.
        return;
      }
      void window.blobot.resizeRuntimeStep(stepId.current, term.cols, term.rows);
    };
    measure();
    term.focus();

    const typed = term.onData(
      (data) => void window.blobot.sendRuntimeStepInput(stepId.current, data),
    );
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    const unsubscribe = [
      // Both streams are filtered to this visit. They are broadcast channels, and a pane that
      // has been replaced must not draw the successor's output into a terminal nobody is
      // looking at, nor conclude on its ending.
      window.blobot.onRuntimeStepData((id, data) => {
        if (id === stepId.current) term.write(data);
      }),
      window.blobot.onRuntimeStepExit((outcome) => {
        if (outcome.stepId !== stepId.current) return;
        // Left on screen rather than cleared: what the command said on its way out is often
        // the only place the real reason is written.
        term.write('\r\n');
        exit.current(outcome);
      }),
    ];
    void start(stepId.current);

    return () => {
      for (const off of unsubscribe) off();
      typed.dispose();
      observer.disconnect();
      term.dispose();
      // Closing the pane ends *this* session. A login nobody can see or type into is not running
      // in any useful sense, and leaving it would leak a terminal per visit — but naming it is
      // what keeps this from reaching a session some later pane has already started.
      void window.blobot.closeRuntimeStep(stepId.current);
    };
    // Once, deliberately: this effect owns a process and a terminal, and a re-run would start
    // a second of the first and throw away everything printed into the second.
  }, []);

  return <div className="term" ref={host} />;
}
