// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RuntimeRemedy } from '@blobot/core';
import { resizeStep, runningStep, startStep, stopStep, writeStep } from './runtime-step.js';

/**
 * A real pseudo-terminal, against commands that are nobody's runtime.
 *
 * What is worth testing here is the shape rather than a vendor: that a command runs on a TTY,
 * that what it prints comes back, that what is typed reaches it, and who hears about the exit.
 * A login is that shape with a browser in the middle of it.
 */
const remedy = (argv: readonly string[]): RuntimeRemedy => ({
  kind: 'sign_in',
  runtimeId: 'test-runtime',
  argv,
  shown: argv.join(' '),
  note: 'a test',
});

interface Watched {
  readonly id: string;
  /** Resolves when the step reports its exit. Never, if it was stopped instead. */
  readonly ended: Promise<number>;
  readonly reported: () => boolean;
  readonly output: () => string;
}

let nextId = 0;

function watch(argv: readonly string[]): Watched {
  let output = '';
  let reported = false;
  const id = `step-${(nextId += 1)}`;
  const ended = new Promise<number>((resolve) => {
    startStep(id, remedy(argv), {
      onData: (data) => {
        output += data;
      },
      onExit: (exitCode) => {
        reported = true;
        resolve(exitCode);
      },
    });
  });
  return { id, ended, reported: () => reported, output: () => output };
}

const settle = (ms = 250): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('a remedy on a terminal', () => {
  it('gives the command a real TTY, which is the whole reason for a PTY', async () => {
    // On a pipe both of these logins see no terminal, drop to a non-interactive path, and
    // either fail outright or wait forever with nothing on screen.
    const step = watch(['/bin/sh', '-c', 'test -t 1 && echo tty']);
    await step.ended;
    expect(step.output()).toContain('tty');
  });

  it('carries the exit code, which is not the same thing as having worked', async () => {
    await expect(watch(['/bin/sh', '-c', 'exit 3']).ended).resolves.toBe(3);
  });

  it('reaches the command with what is typed at it', async () => {
    const step = watch(['/bin/sh', '-c', 'read line; echo got:$line']);
    await settle(150);
    writeStep(step.id, 'yes\r');
    await step.ended;
    expect(step.output()).toContain('got:yes');
  });

  it('says what is running, and says nothing once it has ended', async () => {
    const step = watch(['/bin/sh', '-c', 'true']);
    await step.ended;
    expect(runningStep()).toBeUndefined();
  });

  it('ends the one before it rather than running two at once', async () => {
    const first = watch(['/bin/sh', '-c', 'sleep 30']);
    const second = watch(['/bin/sh', '-c', 'echo second']);
    await second.ended;
    expect(second.output()).toContain('second');
    // The one that was replaced is silent on the way out. Its pane is gone, and an exit
    // arriving for it would land on the screen the new one is drawing.
    expect(first.reported()).toBe(false);
  });

  it('kills a command nobody is watching, and does not report that as an ending', async () => {
    const step = watch(['/bin/sh', '-c', 'sleep 30']);
    await settle(150);
    stopStep(step.id);
    await settle();
    expect(runningStep()).toBeUndefined();
    expect(step.reported()).toBe(false);
  });
});

describe('naming the session a call is about', () => {
  /**
   * The bug this exists for: the pane is a React effect, React runs effects twice in
   * development, and the first mount's cleanup landed *after* the second mount had started its
   * own process. An unaddressed stop killed the survivor, and because a deliberate stop reports
   * no exit, the screen sat on a login that had printed one line and would never print another.
   */
  it('ignores a stop that names a session which is no longer live', async () => {
    const first = watch(['/bin/sh', '-c', 'sleep 30']);
    const second = watch(['/bin/sh', '-c', 'sleep 30']);
    // The doomed pane's cleanup, arriving late. It must not touch the one that replaced it.
    stopStep(first.id);
    expect(runningStep()).toBeDefined();
    writeStep(second.id, '');
    stopStep(second.id);
    await settle(100);
    expect(runningStep()).toBeUndefined();
  });

  it('ignores keystrokes and resizes from a pane that has been replaced', async () => {
    const first = watch(['/bin/sh', '-c', 'read line; echo got:$line']);
    const second = watch(['/bin/sh', '-c', 'read line; echo got:$line']);
    await settle(150);
    writeStep(first.id, 'stale\r');
    resizeStep(first.id, 10, 10);
    writeStep(second.id, 'live\r');
    await second.ended;
    expect(second.output()).toContain('got:live');
    expect(first.output()).not.toContain('stale');
  });
});
