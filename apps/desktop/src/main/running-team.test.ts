import { expect, it, vi } from 'vitest';
import { LocalMachine, MockAgentRuntime, Orchestrator, SleepingRuntime, VirtualClock, scenario, type Agent, type Team } from '@blobot/core';
import { isWorking } from './running-team.js';
import { TeamPool } from './team-pool.js';

it('keeps a team that is waking for queued work when a fourth team is selected', async () => {
  const clock = new VirtualClock();
  const row = (id: string): Team => ({ id, name: id, workspaceKind: 'plain', workspacePath: '/fixture', turnBudget: 10 });
  const create = async (team: Team) => {
    const agent: Agent = { id: team.id, teamId: team.id, name: 'Agent', role: 'Engineer', workspacePath: '/fixture' };
    const machine = new LocalMachine({ agentId: agent.id, workspacePath: agent.workspacePath });
    const execution = new SleepingRuntime({ machine, clock, startRequest: { mailboxPort: 4321 },
      idleAfterMs: 0, canSleep: () => true,
      create: () => new MockAgentRuntime({ agentId: agent.id, clock, startupMs: 0, script: scenario('reply').end() }),
    });
    const executions = new Map([[agent.id, execution]]);
    const orchestrator = new Orchestrator({ team, agents: [agent], runtimes: executions, clock });
    await orchestrator.start();
    return { team, agents: [agent], executions, orchestrator, machine,
      close: vi.fn(async () => { orchestrator.dispose(); await execution.stop(); await orchestrator.drained(); }),
    };
  };
  const pool = new TeamPool<Awaited<ReturnType<typeof create>>>({ limit: 3, start: create, isWorking });
  const first = await pool.select(row('one'));
  const second = await pool.select(row('two'));
  await pool.select(row('three'));
  await first.executions.get('one')!.sleep();
  let release!: () => void;
  vi.spyOn(first.machine, 'start').mockImplementationOnce(() => new Promise((resolve) => {
    release = () => resolve(first.machine.location());
  }));
  const turn = first.orchestrator.promptFromUser(['one'], 'Do this after waking');
  await clock.advance(0);
  expect(first.orchestrator.statusOf('one')).toBe('idle');
  expect(first.executions.get('one')?.power).toBe('waking');
  await pool.select(row('four'));
  expect(pool.find('one')).toBe(first);
  expect(first.close).not.toHaveBeenCalled();
  expect(second.close).toHaveBeenCalledTimes(1);
  release(); await turn;
  expect(first.orchestrator.mailbox('one')).toHaveLength(0);
  await pool.closeAll();
});
