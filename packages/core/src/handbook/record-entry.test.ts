import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import {
  HANDBOOK_ENTRY_LIMIT,
  HANDBOOK_LIMIT,
} from '../orchestrator/bounds.js';
import type { Agent, Team } from '../orchestrator/domain.js';
import { InMemoryMessageStore } from '../orchestrator/message-store.js';
import { Orchestrator, type HandbookStore } from '../orchestrator/orchestrator.js';
import type { AgentRuntime, HandbookEntryInput } from '../runtime.js';
import type { HandbookEntry, HandbookWrite, NewHandbookEntry } from './domain.js';

/**
 * Ticket 03, from the model's side. An agent writes into its own persona, and the whole
 * justification for letting it is that every refusal comes back as something it has to account
 * for and every write opens in the turn it happened.
 */

const team: Team = {
  id: 'team_1',
  name: 'demo',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};
const mara: Agent = {
  id: 'agent_mara',
  teamId: team.id,
  name: 'Mara',
  role: 'writer',
  workspacePath: '/agents/mara',
};

/** The three methods a write needs, and nothing else the orchestrator could reach for. */
class Handbooks implements HandbookStore {
  readonly rows: HandbookEntry[] = [];

  handbookOf(teamId: string, agentName: string): HandbookEntry[] {
    return this.rows.filter(
      (row) =>
        row.teamId === teamId && row.agentName === agentName && row.removedAt === undefined,
    );
  }

  recordHandbookEntries(entries: readonly NewHandbookEntry[]): HandbookEntry[] {
    // The store's own numbering: over every entry this Handbook ever had, removed included.
    const written = entries.map((entry, index) => ({
      ...entry,
      ordinal:
        this.rows.filter(
          (row) => row.teamId === entry.teamId && row.agentName === entry.agentName,
        ).length +
        index +
        1,
    }));
    this.rows.push(...written);
    return written;
  }

  removeHandbookEntry(entryId: string, at: number): void {
    const index = this.rows.findIndex((row) => row.id === entryId);
    if (index >= 0) {
      this.rows[index] = { ...(this.rows[index] as HandbookEntry), removedAt: at };
    }
  }
}

async function harness(options: { handbooks?: Handbooks } = {}) {
  const clock = new VirtualClock();
  const handbooks = options.handbooks ?? new Handbooks();
  const runtimes = new Map<string, AgentRuntime>();
  let orchestrator: Orchestrator;
  let entries: readonly HandbookEntryInput[] = [];

  runtimes.set(
    mara.id,
    new MockAgentRuntime({
      agentId: mara.id,
      clock,
      startupMs: 0,
      recordEntry: (call) => orchestrator.handleRecordEntry(call),
      script: () => scenario('record').recordEntry(entries).say('noted').end() as never,
    }),
  );

  orchestrator = new Orchestrator({
    team,
    agents: [mara],
    runtimes,
    store: new InMemoryMessageStore(),
    clock,
    handbooks,
  });

  // What the model was told about the call it made, which is the half that matters here.
  const errors: string[] = [];
  orchestrator.onEvent((event) => {
    if (event.type === 'tool_call_updated' && event.status === 'failed') errors.push(event.error ?? '');
  });
  const writes: HandbookWrite[] = [];
  orchestrator.onHandbookWrite((write) => writes.push(write));

  const starting = orchestrator.start();
  await clock.runAll();
  await starting;

  return {
    orchestrator,
    handbooks,
    errors,
    writes,
    async record(next: readonly HandbookEntryInput[]): Promise<void> {
      entries = next;
      const turn = orchestrator.promptFromUser([mara.id], 'here is how the work goes');
      await clock.runAll();
      await orchestrator.settled();
      await turn;
    },
  };
}

const told = (text: string): HandbookEntryInput => ({ text, source: 'told' });
const noticed = (text: string): HandbookEntryInput => ({ text, source: 'noticed' });

describe('record_entry', () => {
  it('records a whole briefing in one call, because it takes a list', async () => {
    const harnessed = await harness();
    await harnessed.record([
      told('the client is Vlue, a two-person agency'),
      told('nothing ships on a Friday'),
      noticed('the copy in /marketing is the current tone'),
    ]);

    expect(harnessed.handbooks.rows.map((row) => [row.ordinal, row.source])).toEqual([
      [1, 'told'],
      [2, 'told'],
      [3, 'noticed'],
    ]);
    expect(harnessed.errors).toEqual([]);
  });

  it('opens in the turn that made it, which is what pays for the write', async () => {
    const harnessed = await harness();
    await harnessed.record([told('nothing ships on a Friday')]);

    const write = harnessed.writes[0];
    expect(write?.kind).toBe('recorded');
    if (write?.kind !== 'recorded') throw new Error('expected a recorded write');
    expect(write.agentId).toBe(mara.id);
    expect(write.entries.map((entry) => entry.text)).toEqual(['nothing ships on a Friday']);
    expect(write.withdrew).toEqual([]);
  });

  it('refuses a second call in one turn, and says the tool takes a list', async () => {
    const handbooks = new Handbooks();
    const harnessed = await harness({ handbooks });
    await harnessed.record([told('one')]);
    // A second call in the same turn is what the cap bounds: interruptions, not knowledge.
    await expect(
      harnessed.orchestrator.handleRecordEntry({ from: mara.id, entries: [told('two')] }),
    ).rejects.toThrow(/already recorded this turn/i);
    expect(handbooks.rows).toHaveLength(1);
  });

  it('refuses an entry that ran long, which the agent can fix itself', async () => {
    const harnessed = await harness();
    await harnessed.record([told('x'.repeat(HANDBOOK_ENTRY_LIMIT + 1))]);

    expect(harnessed.errors[0]).toMatch(/is a note about the work, not the work/);
    expect(harnessed.handbooks.rows).toEqual([]);
  });

  it('refuses a full Handbook, tells the agent it cannot fix it, and tells the user', async () => {
    const handbooks = new Handbooks();
    handbooks.recordHandbookEntries([
      {
        id: 'old',
        teamId: team.id,
        agentName: mara.name,
        text: 'x'.repeat(HANDBOOK_LIMIT),
        source: 'told',
        createdAt: 0,
      },
    ]);
    const harnessed = await harness({ handbooks });
    await harnessed.record([told('one more thing')]);

    // The one refusal in the app whose remedy belongs to somebody who is not in the room.
    expect(harnessed.errors[0]).toMatch(/only the person you are working with can do that/);
    expect(harnessed.writes.map((write) => write.kind)).toEqual(['full']);
    expect(handbooks.rows).toHaveLength(1);
  });

  it('records nothing at all when one entry in the list is refused', async () => {
    const harnessed = await harness();
    await harnessed.record([told('a good one'), told('y'.repeat(HANDBOOK_ENTRY_LIMIT + 1))]);

    // Never half a call: what is disclosed in the turn has to be exactly what happened.
    expect(harnessed.handbooks.rows).toEqual([]);
  });
});

describe('correcting an entry', () => {
  it('withdraws what the agent worked out and writes the correction as one act', async () => {
    const handbooks = new Handbooks();
    const harnessed = await harness({ handbooks });
    await harnessed.record([noticed('the ICP is enterprise')]);
    await harnessed.record([{ ...noticed('the ICP is two-person agencies'), replaces: 1 }]);

    expect(handbooks.handbookOf(team.id, mara.name).map((row) => row.text)).toEqual([
      'the ICP is two-person agencies',
    ]);
    const write = harnessed.writes[1];
    if (write?.kind !== 'recorded') throw new Error('expected a recorded write');
    expect(write.withdrew.map((entry) => entry.ordinal)).toEqual([1]);
  });

  it('will not let an agent withdraw what it was told', async () => {
    const handbooks = new Handbooks();
    const harnessed = await harness({ handbooks });
    await harnessed.record([told('nothing ships on a Friday')]);
    await harnessed.record([{ ...noticed('we shipped on a Friday once'), replaces: 1 }]);

    // Removing the user's words is editing the user, and that has no exception.
    expect(harnessed.errors[0]).toMatch(/not yours to withdraw/);
    expect(handbooks.handbookOf(team.id, mara.name).map((row) => row.text)).toEqual([
      'nothing ships on a Friday',
    ]);
  });

  it('refuses a number that is not in the Handbook rather than guessing', async () => {
    const harnessed = await harness();
    await harnessed.record([{ ...noticed('a correction to nothing'), replaces: 4 }]);

    expect(harnessed.errors[0]).toMatch(/there is no entry 4/);
    expect(harnessed.handbooks.rows).toEqual([]);
  });
});
