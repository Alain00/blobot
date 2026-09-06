import { describe, expect, it } from 'vitest';
import type { Team } from '@blobot/core';
import { TeamPool } from './team-pool.js';

interface Fake {
  readonly team: { readonly id: string };
  working: boolean;
  closed: boolean;
  close(): void;
}

function team(id: string): Team {
  return {
    id,
    name: id,
    workspacePath: `/tmp/${id}`,
    workspaceKind: 'git',
    turnBudget: 6,
    createdAt: 0,
  } as Team;
}

function pool(limit: number): {
  readonly pool: TeamPool<Fake>;
  readonly started: string[];
  readonly evicted: string[];
  live(id: string): Fake | undefined;
} {
  const started: string[] = [];
  const evicted: string[] = [];
  const instance = new TeamPool<Fake>({
    limit,
    start: async (row) => {
      started.push(row.id);
      const fake: Fake = {
        team: { id: row.id },
        working: false,
        closed: false,
        close: () => {
          fake.closed = true;
        },
      };
      return fake;
    },
    isWorking: (live) => live.working,
    onEvict: (live) => evicted.push(live.team.id),
  });
  return { pool: instance, started, evicted, live: (id) => instance.find(id) };
}

describe('the live teams', () => {
  it('waits for an evicted execution to stop before starting the same team again', async () => {
    let finishClose!: () => void;
    let starts = 0;
    const teams = new TeamPool<Fake>({ limit: 1, isWorking: () => false,
      start: async (row) => {
        starts += 1;
        const slow = row.id === 'alpha' && starts === 1;
        const live: Fake = { team: row, working: false, closed: false,
          close: () => slow ? new Promise<void>((resolve) => {
            finishClose = () => { live.closed = true; resolve(); };
          }) : void (live.closed = true) };
        return live;
      } });
    const original = await teams.select(team('alpha'));
    const switching = teams.select(team('beta'));
    await expect.poll(() => typeof finishClose).toBe('function');
    const returning = teams.select(team('alpha'));
    await Promise.resolve();
    expect(starts).toBe(2);
    finishClose();
    await switching;
    const replacement = await returning;
    expect(original.closed).toBe(true);
    expect(replacement).not.toBe(original);
    expect(starts).toBe(3);
    await teams.closeAll();
  });

  it('rejects stale starts and keeps admission closed throughout a roster change', async () => {
    let finishStart!: (live: Fake) => void;
    let finishClose!: () => void;
    let finishChange!: () => void;
    let changed = false;
    const starts: string[] = [];
    const teams = new TeamPool<Fake>({ limit: 3, isWorking: () => false,
      start: (row) => {
        starts.push(row.name);
        if (starts.length === 1) return new Promise((resolve) => { finishStart = resolve; });
        const live: Fake = { team: row, working: false, closed: false, close() { this.closed = true; } };
        return Promise.resolve(live);
      } });
    const opening = teams.select(team('alpha'));
    const refused = expect(opening).rejects.toThrow('changing');
    const original: Fake = { team: team('alpha'), working: false, closed: false,
      close: () => new Promise<void>((resolve) => { finishClose = () => { original.closed = true; resolve(); }; }) };
    const editing = teams.withReleased('alpha', async () => {
      changed = true;
      await new Promise<void>((resolve) => { finishChange = resolve; });
    });
    await expect(teams.select(team('alpha'))).rejects.toThrow('changing');
    finishStart(original);
    await refused;
    await expect.poll(() => typeof finishClose).toBe('function');
    expect(changed).toBe(false);
    expect(teams.find('alpha')).toBeUndefined();
    finishClose();
    await expect.poll(() => changed).toBe(true);
    await expect(teams.select(team('alpha'))).rejects.toThrow('changing');
    finishChange();
    await editing;
    await teams.select({ ...team('alpha'), name: 'Updated roster' });
    expect(starts).toEqual(['alpha', 'Updated roster']);
    await teams.closeAll();
  });

  it('drains an admitted durable change on shutdown and closes its execution only once', async () => {
    let finishChange!: () => void;
    let closes = 0;
    const teams = new TeamPool<Fake>({ limit: 3, isWorking: () => false,
      start: async (row) => ({ team: row, working: false, closed: false, close() { closes += 1; } }) });
    await teams.select(team('alpha'));
    const changing = teams.withReleased('alpha', () => new Promise<void>((resolve) => { finishChange = resolve; }));
    await expect.poll(() => typeof finishChange).toBe('function');
    let closed = false;
    const closing = teams.closeAll().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    await expect(teams.withReleased('beta', async () => {})).rejects.toThrow('closing');
    finishChange();
    await Promise.all([changing, closing]);
    expect(closes).toBe(1);
  });

  it('drains an in-flight start on shutdown and refuses to publish or start another team', async () => {
    let finish!: (live: Fake) => void;
    let finishClose!: () => void;
    let closeCalls = 0;
    const live: Fake = { team: { id: 'late' }, working: false, closed: false,
      close: () => { closeCalls += 1; return new Promise<void>((resolve) => { finishClose = () => { live.closed = true; resolve(); }; }); } };
    const teams = new TeamPool<Fake>({ limit: 3, isWorking: () => false,
      start: () => new Promise((resolve) => { finish = resolve; }) });
    const selecting = teams.select(team('late'));
    const joining = teams.select(team('late'));
    const refused = Promise.all([expect(selecting).rejects.toThrow('closing'), expect(joining).rejects.toThrow('closing')]);
    let closed = false;
    const closing = teams.closeAll().then(() => { closed = true; });
    finish(live);
    await refused;
    expect(closed).toBe(false);
    expect(teams.live).toEqual([]);
    expect(closeCalls).toBe(1);
    finishClose();
    await closing;
    expect(live.closed).toBe(true);
    await expect(teams.select(team('next'))).rejects.toThrow('closing');
    await teams.closeAll();
    expect(closeCalls).toBe(1);
  });
  it('starts a team the first time it is selected', async () => {
    const { pool: teams, started } = pool(3);
    const alpha = await teams.select(team('alpha'));
    expect(started).toEqual(['alpha']);
    expect(teams.active).toBe(alpha);
  });

  it('does not restart a team that is already live', async () => {
    const { pool: teams, started } = pool(3);
    const first = await teams.select(team('alpha'));
    await teams.select(team('beta'));
    const again = await teams.select(team('alpha'));

    // The point of the whole exercise: switching back is free, and the agents are the same
    // objects, so nothing was reconciled, respawned or replayed.
    expect(again).toBe(first);
    expect(started).toEqual(['alpha', 'beta']);
    expect(first.closed).toBe(false);
  });

  it('evicts the least recently selected once the limit is passed', async () => {
    const { pool: teams, evicted, live } = pool(2);
    await teams.select(team('alpha'));
    await teams.select(team('beta'));
    await teams.select(team('gamma'));

    expect(evicted).toEqual(['alpha']);
    expect(live('alpha')).toBeUndefined();
    expect(teams.live.map((entry) => entry.team.id)).toEqual(['gamma', 'beta']);
  });

  it('counts a re-selection as recent, so the one you keep returning to survives', async () => {
    const { pool: teams, evicted } = pool(2);
    await teams.select(team('alpha'));
    await teams.select(team('beta'));
    await teams.select(team('alpha'));
    await teams.select(team('gamma'));

    expect(evicted).toEqual(['beta']);
  });

  it('never evicts a team that is mid-turn', async () => {
    const { pool: teams, evicted, live } = pool(1);
    const alpha = await teams.select(team('alpha'));
    alpha.working = true;
    await teams.select(team('beta'));

    // Over the limit on purpose. Killing an agent between a tool call and its result loses
    // work nobody can see and nobody can redo.
    expect(evicted).toEqual([]);
    expect(teams.live).toHaveLength(2);

    // And it goes as soon as it is quiet.
    alpha.working = false;
    await teams.evictIdle();
    expect(evicted).toEqual(['alpha']);
    expect(live('alpha')).toBeUndefined();
  });

  it('never evicts the team the user is looking at', async () => {
    const { pool: teams, evicted } = pool(1);
    await teams.select(team('alpha'));
    const beta = await teams.select(team('beta'));
    expect(evicted).toEqual(['alpha']);
    expect(teams.active).toBe(beta);
    expect(beta.closed).toBe(false);
  });

  it('starts one set of agents when the same team is selected twice at once', async () => {
    const { pool: teams, started } = pool(3);
    const [first, second] = await Promise.all([
      teams.select(team('alpha')),
      teams.select(team('alpha')),
    ]);
    expect(started).toEqual(['alpha']);
    expect(first).toBe(second);
  });

  it('closes a released team and forgets it', async () => {
    const { pool: teams, live } = pool(3);
    const alpha = await teams.select(team('alpha'));
    await teams.release('alpha');
    expect(alpha.closed).toBe(true);
    expect(live('alpha')).toBeUndefined();
  });

  it('stops everything on the way out, working or not', async () => {
    const { pool: teams } = pool(3);
    const alpha = await teams.select(team('alpha'));
    const beta = await teams.select(team('beta'));
    alpha.working = true;
    await teams.closeAll();
    expect([alpha.closed, beta.closed]).toEqual([true, true]);
    expect(teams.live).toEqual([]);
  });

  it('survives a team that throws on the way out', async () => {
    const { pool: teams } = pool(1);
    const alpha = await teams.select(team('alpha'));
    alpha.close = () => {
      throw new Error('the bridge is already gone');
    };
    await expect(teams.select(team('beta'))).resolves.toBeDefined();
    expect(teams.active?.team.id).toBe('beta');
  });
});

/**
 * A Routine firing needs a team live and has no business changing what is on screen. Holding is
 * how it gets one: behind the active team, pinned for the length of the run.
 */
describe('a team held for a Routine', () => {
  it('starts it without putting it on screen', async () => {
    const { pool: teams, started } = pool(3);
    const alpha = await teams.select(team('alpha'));

    const beta = await teams.hold(team('beta'));

    expect(started).toEqual(['alpha', 'beta']);
    expect(teams.active).toBe(alpha);
    expect(teams.find('beta')).toBe(beta);
  });

  it('is not evicted while the run is still holding it', async () => {
    const { pool: teams, evicted } = pool(1);
    await teams.select(team('alpha'));
    // Held while idle, which is exactly the state the eviction rule collects. The run has not
    // started a turn yet, so `isWorking` cannot protect it and the pin has to.
    await teams.hold(team('beta'));
    await teams.select(team('gamma'));

    // The limit was enforced against the team nothing is holding, not against the run.
    expect(evicted).toEqual(['alpha']);
    expect(teams.find('beta')).toBeDefined();

    // Let go when the run ends, and it is an ordinary background team again.
    teams.letGo('beta');
    await teams.evictIdle();
    expect(evicted).toEqual(['alpha', 'beta']);
  });

  it('holds a team that is already live rather than starting a second one', async () => {
    const { pool: teams, started } = pool(3);
    const alpha = await teams.select(team('alpha'));

    expect(await teams.hold(team('alpha'))).toBe(alpha);
    expect(started).toEqual(['alpha']);
    expect(teams.active).toBe(alpha);
  });
});
