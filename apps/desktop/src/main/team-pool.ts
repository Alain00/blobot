import type { Team } from '@blobot/core';

/**
 * The shape the pool needs. `RunningTeam` satisfies it; a test does not have to build an
 * orchestrator to exercise the eviction rule.
 */
export interface PoolableTeam {
  readonly team: { readonly id: string };
  close(): Promise<void> | void;
}

export interface TeamPoolOptions<T extends PoolableTeam> {
  /**
   * How many teams stay live. A count rather than an idle timer, on purpose: a timer makes
   * the moment an agent loses its memory depend on how long the user looked at another team,
   * which is not a rule anybody can hold in their head. A count is one sentence — the last
   * few teams you touched are still running — and it bounds the process fan-out, which is the
   * cost that actually scales.
   */
  readonly limit: number;
  start(team: Team): Promise<T>;
  /**
   * Whether anyone on it is mid-turn. A working team is never evicted: an agent killed
   * between a tool call and its result loses work the user cannot see and cannot redo. So the
   * limit is a target, not a cap, and it is honoured as soon as the team goes quiet.
   */
  isWorking(live: T): boolean;
  /** Told what left and why, because a team going quiet in the background is worth a line. */
  onEvict?(live: T, reason: 'over_limit' | 'closed'): void;
}

/**
 * The live teams, most recently selected first.
 *
 * Switching used to stop the previous team, which made every switch a restart: agents came
 * back as strangers, because there was no `session/load` yet. There is one now, so the cost of
 * stopping is lower than it was — but a restart still costs a bridge process per agent, a
 * workspace reconcile and a transcript replay, and it still throws away a turn in flight.
 *
 * So: keep the last few, evict the rest. Nothing here decides whether a backgrounded team
 * should keep *working* — that is the team's own business and the orchestrator's turn budget
 * bounds it. This decides only how many are loaded.
 */
export class TeamPool<T extends PoolableTeam> {
  readonly #options: TeamPoolOptions<T>;
  /** Most recently selected first. The head is the active team. */
  #live: T[] = [];
  /** In-flight starts, so two clicks on the same team do not spawn two sets of agents. */
  readonly #starting = new Map<string, Promise<T>>();

  constructor(options: TeamPoolOptions<T>) {
    this.#options = options;
  }

  /** The team the user is looking at, or undefined before the first one is selected. */
  get active(): T | undefined {
    return this.#live[0];
  }

  /** Every live team, most recently selected first. */
  get live(): readonly T[] {
    return this.#live;
  }

  find(teamId: string): T | undefined {
    return this.#live.find((candidate) => candidate.team.id === teamId);
  }

  /**
   * Make this team the active one, starting it if it is not already live.
   *
   * A team that is already live is promoted rather than restarted — which is the whole point:
   * switching back to a team you were just in costs nothing and loses nothing.
   */
  async select(team: Team): Promise<T> {
    const already = this.find(team.id);
    if (already !== undefined) {
      this.#promote(already);
      return already;
    }

    // Two selections of the same team race only until the first one resolves.
    const inFlight = this.#starting.get(team.id);
    if (inFlight !== undefined) {
      const started = await inFlight;
      this.#promote(started);
      return started;
    }

    const starting = this.#options.start(team);
    this.#starting.set(team.id, starting);
    let live: T;
    try {
      live = await starting;
    } finally {
      this.#starting.delete(team.id);
    }
    // A second selection may have landed while this one was starting.
    const raced = this.find(team.id);
    if (raced !== undefined) {
      await this.#close(live, 'over_limit');
      this.#promote(raced);
      return raced;
    }
    this.#live.unshift(live);
    await this.#evict();
    return live;
  }

  /** Drop a team on purpose — it was deleted, or its agents changed under it. */
  async release(teamId: string): Promise<void> {
    const live = this.find(teamId);
    if (live === undefined) return;
    this.#live = this.#live.filter((candidate) => candidate !== live);
    await this.#close(live, 'closed');
  }

  /** Quitting. Everything stops, working or not: the window is going away regardless. */
  async closeAll(): Promise<void> {
    const closing = this.#live;
    this.#live = [];
    await Promise.all(closing.map((live) => this.#close(live, 'closed')));
  }

  /**
   * Trim back to the limit. Called after every selection, and worth calling again when a team
   * goes idle: a team kept alive only because it was mid-turn should not stay forever.
   */
  async evictIdle(): Promise<void> {
    await this.#evict();
  }

  #promote(live: T): void {
    this.#live = [live, ...this.#live.filter((candidate) => candidate !== live)];
  }

  async #evict(): Promise<void> {
    if (this.#live.length <= this.#options.limit) return;
    // Oldest first, and never the active team even at a limit of one — the user is looking
    // at it.
    const doomed: T[] = [];
    for (let index = this.#live.length - 1; index > 0; index -= 1) {
      if (this.#live.length - doomed.length <= this.#options.limit) break;
      const candidate = this.#live[index];
      if (candidate === undefined || this.#options.isWorking(candidate)) continue;
      doomed.push(candidate);
    }
    if (doomed.length === 0) return;
    this.#live = this.#live.filter((candidate) => !doomed.includes(candidate));
    await Promise.all(doomed.map((live) => this.#close(live, 'over_limit')));
  }

  async #close(live: T, reason: 'over_limit' | 'closed'): Promise<void> {
    this.#options.onEvict?.(live, reason);
    // A team that throws on the way out must not take the switch down with it: the user asked
    // for a different team, and they get one either way.
    try {
      await live.close();
    } catch {
      // The bridge is already gone, or never came up. Nothing here can act on it.
    }
  }
}
