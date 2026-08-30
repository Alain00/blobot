import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SqliteStore,
  SystemClock,
  detectRuntimes,
  openDatabase,
  type OpenedDatabase,
  type Team,
} from '@blobot/core';
import { isWorking, type RunningTeam } from './running-team.js';
import { startTeam } from './start-team.js';
import { TeamPool } from './team-pool.js';
import { createTeam, hireAgent } from './team-store.js';

/**
 * The claim the whole switch rework rests on, end to end, against real agents: **going back
 * to a team you were just in does not restart it, and a team that was evicted comes back
 * knowing the conversation.**
 *
 * `team-pool.test.ts` pins the eviction rule against a fake, and `live.test.ts` pins the
 * resume against a real `claude`. Only this one puts the two together through the real
 * `startTeam` — the workspace reconcile, the bridge processes, the loopback MCP server and the
 * stored provider session id, which is the part no fake can vouch for.
 *
 * Off by default for the same reason as core's live tests: it costs tokens and needs a
 * logged-in machine. `BLOBOT_LIVE_CLAUDE=1 pnpm --filter @blobot/desktop test`.
 */
const live = process.env.BLOBOT_LIVE_CLAUDE === '1' ? describe : describe.skip;

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/core/migrations', import.meta.url),
);

/** A real repository, because a real `startTeam` cuts a real worktree off it. */
function repository(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `blobot-switch-${name}-`));
  writeFileSync(join(dir, 'README.md'), `# ${name}\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first'], {
    cwd: dir,
  });
  return dir;
}

live('switching between real teams', () => {
  let opened: OpenedDatabase;
  let store: SqliteStore;
  const clock = new SystemClock();

  beforeEach(() => {
    opened = openDatabase({ path: ':memory:', migrationsFolder });
    store = new SqliteStore(opened.db);
  });

  afterEach(() => {
    opened.close();
  });

  async function team(name: string): Promise<Team> {
    const claude = (await detectRuntimes()).find((runtime) => runtime.runtimeId === 'claude-code');
    const profile = hireAgent(
      {
        name: `Agent_${name}`,
        role: 'engineer',
        runtimeId: 'claude-code',
        instructions: 'Answer in as few words as possible.',
        ...(claude?.executablePath === undefined ? {} : { executablePath: claude.executablePath }),
      },
      { store, clock },
    );
    return createTeam(
      { name, workspacePath: repository(name), turnBudget: 4, profileIds: [profile.id] },
      { store, clock },
    );
  }

  it('promotes a live team instead of restarting it, and resumes one that was evicted', async () => {
    const started: string[] = [];
    const pool = new TeamPool<RunningTeam>({
      // One, so the second selection is guaranteed to evict the first. Three is the app's
      // number; one is what makes the eviction observable in a test.
      limit: 1,
      start: async (row) => {
        started.push(row.name);
        return startTeam({ team: row, store, db: opened.db, clock, onLog: () => {} });
      },
      isWorking,
    });

    const alpha = await team('alpha');
    const beta = await team('beta');

    const first = await pool.select(alpha);
    const alice = first.agents[0]?.id ?? '';
    await first.orchestrator.promptFromUser(
      alice,
      'Remember this: the build password is TANGERINE-9. Just say OK.',
    );

    // Selecting the team that is already on screen must not spawn a second set of agents.
    const again = await pool.select(alpha);
    expect(again).toBe(first);
    expect(started).toEqual(['alpha']);

    // Now push it out. At a limit of one, alpha's processes go away entirely.
    await pool.select(beta);
    expect(started).toEqual(['alpha', 'beta']);
    expect(pool.find(alpha.id)).toBeUndefined();

    // And bring it back. This is the switch that used to be a restart: a new process, a new
    // loopback port, and an agent who nonetheless remembers what it was told.
    const revived = await pool.select(alpha);
    expect(started).toEqual(['alpha', 'beta', 'alpha']);
    expect(revived).not.toBe(first);

    const revivedAlice = revived.agents[0]?.id ?? '';
    await revived.orchestrator.promptFromUser(revivedAlice, 'What is the build password?');
    const said = revived.store
      .answersOfTeam(alpha.id)
      .map((answer) => answer.text)
      .join(' ');
    expect(said).toContain('TANGERINE-9');

    await pool.closeAll();
  }, 600_000);
});
