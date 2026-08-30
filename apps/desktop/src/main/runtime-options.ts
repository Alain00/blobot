import { mkdtempSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AgentRuntime, RuntimeOptionGroup } from '@blobot/core';
import { runtimeFor } from './runtime-for.js';

/**
 * What a runtime lets the user choose, asked of the runtime itself.
 *
 * There is no method for this question on either provider: both *volunteer* `configOptions`
 * when a session is created, and neither answers it any other way. So the honest way to fill a
 * picker in the hire dialog is to start the runtime in a scratch directory, read what it
 * advertises, and stop it. It costs a process and a second or two, and no model turn, so it
 * costs no tokens.
 *
 * The alternative was a list of model names in blobot's source, which is the command palette's
 * problem again: a list that goes stale on somebody else's release cadence, and blobot claiming
 * to know what the user's binary can do. Asking is always current.
 *
 * The scratch directory is deliberate. The agent has no workspace yet, and may never have one
 * since hiring is not joining a team, so pointing a session at a repository the user has not
 * chosen would be blobot reading a folder for its own convenience.
 */
export interface RuntimeOptionsProbe {
  readonly runtimeId: string;
  readonly groups: readonly RuntimeOptionGroup[];
  /** Why there is nothing to choose, when the reason is not that the runtime offers nothing. */
  readonly error?: string;
}

/** What a probe is worth remembering as, and the three things that make it stale. */
interface Remembered {
  readonly executablePath: string;
  readonly runtimeVersion: string;
  readonly probedAt: number;
  readonly groups: readonly RuntimeOptionGroup[];
}

interface RememberedFile {
  readonly version: 1;
  readonly runtimes: Record<string, Remembered>;
}

/** A day. Long enough to be free at the desk, short enough that a new model lands the next. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The answer, remembered across launches.
 *
 * Spawning a CLI to fill a picker is a second or two, and it was being paid **on every launch**
 * and then thrown away with the process. A model list is not volatile: it moves when the user
 * upgrades the binary, and occasionally when a provider adds one behind a binary that has not
 * moved. So the answer is written next to the database and served immediately on the next
 * launch, and the spawn happens behind the already-drawn menu instead of in front of it.
 *
 * **Nothing here is authoritative.** A remembered list is what the runtime said last time, and
 * the runtime is asked again the moment it might have changed. Two things make a remembered
 * answer worthless: a different executable and a different version. Both are keys rather than
 * timers, because they are the same fact the picker is about to state (`ready · 2.1.251`), and
 * a CLI upgrade is exactly when a model list moves. Age is only the third check, and it is
 * *stale-while-revalidate*: a day-old list is drawn now and replaced quietly for next time,
 * because a menu that stalls to be current is the thing this exists to stop.
 *
 * A choice stored against a model the provider has since dropped is already handled where it
 * matters: `applyOptionChoices` skips an option the live session does not advertise and says so.
 * So a remembered list going stale costs a line in the transcript, never a failed launch.
 */
export class RuntimeOptionsCache {
  readonly #probe: (runtimeId: string, executablePath?: string) => Promise<RuntimeOptionsProbe>;
  readonly #now: () => number;
  readonly #staleAfterMs: number;
  /** In flight or already answered this launch: one spawn per runtime per process, as before. */
  readonly #live = new Map<string, Promise<RuntimeOptionsProbe>>();
  #file: string | undefined;

  constructor(
    options: {
      readonly probe?: (runtimeId: string, executablePath?: string) => Promise<RuntimeOptionsProbe>;
      readonly now?: () => number;
      readonly staleAfterMs?: number;
      readonly file?: string;
    } = {},
  ) {
    this.#probe = options.probe ?? probeRuntime;
    this.#now = options.now ?? (() => Date.now());
    this.#staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS;
    this.#file = options.file;
  }

  /**
   * Where to remember, which only the main process knows: it is `userData`, beside the database.
   *
   * Called once at startup rather than passed in at construction, because the module is
   * imported long before Electron will say where `userData` is.
   */
  rememberIn(file: string): void {
    this.#file = file;
  }

  async describe(
    runtimeId: string,
    executablePath?: string,
    runtimeVersion?: string,
  ): Promise<RuntimeOptionsProbe> {
    const key = `${runtimeId} ${executablePath ?? ''} ${runtimeVersion ?? ''}`;
    const live = this.#live.get(key);
    if (live !== undefined) return live;

    const remembered = this.#read()?.runtimes[runtimeId];
    const usable =
      remembered !== undefined &&
      remembered.executablePath === (executablePath ?? '') &&
      remembered.runtimeVersion === (runtimeVersion ?? '');

    if (usable && remembered !== undefined) {
      const answer: RuntimeOptionsProbe = { runtimeId, groups: remembered.groups };
      // Answered from the file, so the menu draws now. The spawn still happens where the list
      // has had time to move under a binary that did not, and its only effect is on next time.
      this.#live.set(key, Promise.resolve(answer));
      if (this.#now() - remembered.probedAt > this.#staleAfterMs) {
        void this.#ask(runtimeId, executablePath, runtimeVersion).catch(() => undefined);
      }
      return answer;
    }

    const asking = this.#ask(runtimeId, executablePath, runtimeVersion);
    this.#live.set(key, asking);
    // A failure is not kept. The ordinary reasons are a CLI that is not installed yet or is
    // signed out, and both are things the user fixes in another window and comes back from.
    void asking.then((result) => {
      if (result.error !== undefined) this.#live.delete(key);
    });
    return asking;
  }

  async #ask(
    runtimeId: string,
    executablePath?: string,
    runtimeVersion?: string,
  ): Promise<RuntimeOptionsProbe> {
    const result = await this.#probe(runtimeId, executablePath);
    // Only a real answer is written. An error is this machine's weather, not the runtime's
    // shape, and remembering it would hand the next launch a wrong reason instantly.
    if (result.error === undefined) {
      this.#write(runtimeId, {
        executablePath: executablePath ?? '',
        runtimeVersion: runtimeVersion ?? '',
        probedAt: this.#now(),
        groups: result.groups,
      });
    }
    return result;
  }

  #read(): RememberedFile | undefined {
    const file = this.#file;
    if (file === undefined) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as RememberedFile;
      // A file this process did not write, or wrote in an older shape, is not repaired. It is
      // one spawn to replace and nothing in it is worth a migration.
      return parsed.version === 1 && typeof parsed.runtimes === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  #write(runtimeId: string, entry: Remembered): void {
    const file = this.#file;
    if (file === undefined) return;
    try {
      // One entry per runtime, replaced outright: the old version's list is exactly the thing
      // that just stopped being true, so keeping it would only grow the file.
      const next: RememberedFile = {
        version: 1,
        runtimes: { ...(this.#read()?.runtimes ?? {}), [runtimeId]: entry },
      };
      mkdirSync(dirname(file), { recursive: true });
      // Through a temporary file, because two windows can be asking at once and a half-written
      // JSON file is a cache that never hits again.
      const scratch = `${file}.${process.pid}.tmp`;
      writeFileSync(scratch, JSON.stringify(next), 'utf8');
      renameSync(scratch, file);
    } catch {
      // A cache that cannot be written is a slower app, not a broken one.
    }
  }
}

const shared = new RuntimeOptionsCache();

/** Where the answers are remembered. Called once, by main, when Electron will say where. */
export function rememberRuntimeOptionsIn(file: string): void {
  shared.rememberIn(file);
}

export function describeRuntimeOptions(
  runtimeId: string,
  executablePath?: string,
  runtimeVersion?: string,
): Promise<RuntimeOptionsProbe> {
  return shared.describe(runtimeId, executablePath, runtimeVersion);
}

async function probeRuntime(
  runtimeId: string,
  executablePath?: string,
): Promise<RuntimeOptionsProbe> {
  const cwd = mkdtempSync(join(tmpdir(), 'blobot-options-'));
  let runtime: AgentRuntime | undefined;
  try {
    runtime = runtimeFor({
      runtimeId,
      agentId: 'options_probe',
      agentName: 'blobot',
      cwd,
      // No persona: this session is never prompted, and a persona would have OpenCode define
      // an agent for a teammate that does not exist yet.
      persona: '',
      ...(executablePath === undefined ? {} : { executablePath }),
      mcpServers: [],
      onStderr: () => undefined,
    });
    await runtime.start();
    return { runtimeId, groups: runtime.optionGroups };
  } catch (error) {
    return {
      runtimeId,
      groups: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await runtime?.stop().catch(() => undefined);
  }
}
