import { homedir } from 'node:os';
import { spawn as spawnPty, type IPty } from 'node-pty';
import type { RuntimeRemedy } from '@blobot/core';

/**
 * A remedy, running on a real terminal, watched.
 *
 * **Why a PTY and not a pipe.** Both of these commands are written for a person: the login
 * prints a code to paste and waits on a keypress, and the installer draws a progress bar. On a
 * pipe a CLI sees no TTY, drops to a non-interactive path, and either fails or hangs with
 * nothing on screen. A pseudo-terminal is the only shape in which the vendor's own program
 * behaves the way its own documentation describes.
 *
 * **One at a time.** Signing two runtimes in at once is not a thing anybody does, and a second
 * session would need a second pane to be watched in. Starting one ends the one before it, which
 * is what closing the pane already does.
 *
 * **Every call names the session it means.** The pane that opens one is a React effect, and React
 * runs effects twice in development: mount, clean up, mount again. With an unaddressed `stop()`
 * the first mount's cleanup raced the second mount's start and killed the surviving process,
 * which looked exactly like a login that printed one line and hung — silently, because a
 * deliberate stop reports no exit. An id decides it instead of the ordering: a stop that names a
 * session which is no longer the live one does nothing at all.
 *
 * The credential rule is kept by *not participating*: keystrokes go from the pane to the
 * terminal and bytes come back, and blobot reads none of it. What it watches is the exit.
 */
export interface RuntimeStepHandlers {
  readonly onData: (data: string) => void;
  /** `exitCode` is the command's own. Also fires when the pane is closed, which is an outcome. */
  readonly onExit: (exitCode: number) => void;
}

interface LiveStep {
  /** The pane's own id, minted by the renderer that opened it. Names one visit, nothing more. */
  readonly id: string;
  readonly remedy: RuntimeRemedy;
  readonly pty: IPty;
}

let live: LiveStep | undefined;

/** What is running, if anything. The renderer reopening a pane asks this rather than assuming. */
export function runningStep(): RuntimeRemedy | undefined {
  return live?.remedy;
}

export function startStep(id: string, remedy: RuntimeRemedy, handlers: RuntimeStepHandlers): void {
  stopStep();
  const [command, ...args] = remedy.argv;
  if (command === undefined) return;
  const pty = spawnPty(command, args, {
    name: 'xterm-256color',
    // Replaced by the pane's real size as soon as it has measured itself. A terminal that
    // starts at nothing draws its first line wrapped and never redraws it.
    cols: 80,
    rows: 24,
    // The user's home, not the app's cwd and not a workspace: neither of these commands is
    // about a repository, and an installer run inside somebody's project is a surprise.
    cwd: homedir(),
    env: terminalEnv(),
  });
  const step: LiveStep = { id, remedy, pty };
  live = step;
  pty.onData((data) => {
    if (live === step) handlers.onData(data);
  });
  pty.onExit(({ exitCode }) => {
    if (live !== step) return;
    live = undefined;
    handlers.onExit(exitCode);
  });
}

/**
 * The app's environment, minus the two things that are true of *this* process and would be
 * lies about the child: the flag that makes an Electron binary behave like node, and the
 * bridge override that names a file this command has no business loading.
 */
function terminalEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  delete env['ELECTRON_RUN_AS_NODE'];
  delete env['BLOBOT_CLAUDE_BRIDGE'];
  env['TERM'] = 'xterm-256color';
  return env;
}

/** A keypress from the pane that owns the session. A stale pane's keystrokes reach nothing. */
export function writeStep(id: string, data: string): void {
  if (live?.id === id) live.pty.write(data);
}

export function resizeStep(id: string, cols: number, rows: number): void {
  // A zero on either axis is a pane that has not been laid out yet, and node-pty throws on it.
  if (cols < 1 || rows < 1) return;
  if (live?.id === id) live.pty.resize(Math.floor(cols), Math.floor(rows));
}

/**
 * End it. Quitting the app, closing the pane, or starting another one.
 *
 * A login the user walked away from is a process holding a pipe open forever, and an installer
 * killed halfway is the reason detection is asked again rather than assumed after this.
 *
 * With an `id` this stops **that** session and no other, which is what makes a pane's cleanup
 * safe to fire after another pane has already started its own. Without one it stops whatever is
 * live, which is only ever right at the point the app itself is going away.
 */
export function stopStep(id?: string): void {
  const step = live;
  if (step === undefined) return;
  if (id !== undefined && step.id !== id) return;
  live = undefined;
  try {
    step.pty.kill();
  } catch {
    // Already gone. There is nothing to report: the pane is closing either way.
  }
}
