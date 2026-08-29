import { basename } from 'node:path';
import {
  ClaudeAgentRuntime,
  Orchestrator,
  SqliteRecorder,
  SqliteStore,
  SystemClock,
  composePersona,
  openDatabase,
  type Agent,
  type AgentRuntime,
  type OpenedDatabase,
  type Team,
} from '@blobot/core';
import type { DemoTeam } from './demo-team.js';

/**
 * A real Claude Code agent, in a real directory, rendered by the real UI.
 *
 * One agent, not two, and that is the honest shape today: peer messaging rides an MCP tool
 * blobot serves over loopback (ticket 15), which is not built. A second agent would inherit a
 * persona promising a `message_agent` tool that does not exist, so `composePersona` gets a
 * one-agent roster and tells the truth — "You have no teammates on this team yet."
 *
 * Nothing here is provider-specific beyond the one `new ClaudeAgentRuntime`: the orchestrator,
 * the store and the UI are the same ones demo mode drives.
 */
export async function createLiveClaudeTeam(
  workspacePath: string,
  migrationsFolder?: string,
): Promise<DemoTeam> {
  const clock = new SystemClock();
  const team: Team = {
    id: 'team_live',
    name: basename(workspacePath),
    workspacePath,
    workspaceKind: 'git',
    turnBudget: 10,
  };
  // No worktree yet (ticket 10): the agent works in the directory it was pointed at.
  const alice: Agent = {
    id: 'alice',
    teamId: team.id,
    name: 'Alice',
    role: 'engineer',
    workspacePath,
  };
  const agents = [alice];

  const opened: OpenedDatabase = openDatabase({
    path: ':memory:',
    ...(migrationsFolder === undefined ? {} : { migrationsFolder }),
  });
  const store = new SqliteStore(opened.db);
  store.createTeam({ ...team, createdAt: clock.now() });

  const persona = composePersona(alice, team, agents);
  const runtime = new ClaudeAgentRuntime({
    agentId: alice.id,
    cwd: workspacePath,
    persona,
    onStderr: (line) => process.stderr.write(`[bridge:alice] ${line}\n`),
  });
  const runtimes = new Map<string, AgentRuntime>([[alice.id, runtime]]);

  store.createAgent({
    ...alice,
    runtimeId: 'claude-code',
    branch: `blobot/${team.name}/alice`,
    createdAt: clock.now(),
  });

  // `Orchestrator.start()` swallows a spawn failure by design — one dead agent must not stop
  // the team — so the reason is only visible if someone logs it.
  runtime.onLifecycleChange((lifecycle) => process.stderr.write(`[alice] ${lifecycle}\n`));

  const orchestrator = new Orchestrator({
    team,
    agents,
    runtimes,
    store,
    clock,
    recorder: new SqliteRecorder(opened.db, team.id),
  });
  await orchestrator.start();

  // The session id only exists once the bridge has answered `session/new`, so the row is
  // written after `start()` rather than before it.
  store.startSession({
    id: runtime.sessionId,
    agentId: alice.id,
    personaText: persona,
    startedAt: clock.now(),
  });

  return {
    team,
    agents,
    orchestrator,
    store,
    runtimeLabels: { [alice.id]: 'Claude Code' },
    demoMode: false,
    autoplayPrompt: 'In one short sentence: what is in this directory?',
    close: () => {
      orchestrator.dispose();
      opened.close();
    },
  };
}
