import { basename } from 'node:path';
import {
  ClaudeAgentRuntime,
  Orchestrator,
  PeerMessageServer,
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
 * Two real Claude Code agents who can message each other, rendered by the real UI.
 *
 * This is demo mode's shape with the mocks taken out: the same orchestrator, store, recorder
 * and renderer, plus ticket 15's loopback MCP server handing each agent a `message_agent` tool
 * whose handler is `Orchestrator.handleMessageAgent` in this very process.
 *
 * A dev flag, not shipped behaviour, and one thing is knowingly wrong: **both agents work in
 * the same directory**, because ticket 10's worktrees are not built. Their personas tell them
 * otherwise. Do not point it at anything you mind being edited twice.
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
    turnBudget: 6,
  };
  const agents: Agent[] = [
    { id: 'alice', teamId: team.id, name: 'Alice', role: 'frontend', workspacePath },
    { id: 'bob', teamId: team.id, name: 'Bob', role: 'backend', workspacePath },
  ];

  const opened: OpenedDatabase = openDatabase({
    path: ':memory:',
    ...(migrationsFolder === undefined ? {} : { migrationsFolder }),
  });
  const store = new SqliteStore(opened.db);
  store.createTeam({ ...team, createdAt: clock.now() });

  let orchestrator: Orchestrator;
  const mcp = new PeerMessageServer({
    handler: (call) => orchestrator.handleMessageAgent(call),
    onLog: (line) => process.stderr.write(`${line}\n`),
  });
  await mcp.start();

  const personas = new Map(agents.map((agent) => [agent.id, composePersona(agent, team, agents)]));
  const runtimes = new Map<string, AgentRuntime>(
    agents.map((agent) => {
      const endpoint = mcp.endpointFor(agent.id);
      const runtime = new ClaudeAgentRuntime({
        agentId: agent.id,
        cwd: workspacePath,
        persona: personas.get(agent.id) ?? '',
        mcpServers: [
          {
            type: 'http',
            name: 'blobot',
            url: endpoint.url,
            headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }],
          },
        ],
        onStderr: (line) => process.stderr.write(`[bridge:${agent.id}] ${line}\n`),
      });
      runtime.onLifecycleChange((lifecycle) =>
        process.stderr.write(`[${agent.id}] ${lifecycle}\n`),
      );
      return [agent.id, runtime];
    }),
  );

  for (const agent of agents) {
    store.createAgent({
      ...agent,
      runtimeId: 'claude-code',
      branch: `blobot/${team.name}/${agent.name.toLowerCase()}`,
      createdAt: clock.now(),
    });
  }

  orchestrator = new Orchestrator({
    team,
    agents,
    runtimes,
    store,
    clock,
    recorder: new SqliteRecorder(opened.db, team.id),
  });
  await orchestrator.start();

  for (const agent of agents) {
    // The session id only exists once the bridge has answered `session/new`.
    const runtime = runtimes.get(agent.id);
    store.startSession({
      id: runtime?.sessionId === undefined || runtime.sessionId === '' ? agent.id : runtime.sessionId,
      agentId: agent.id,
      personaText: personas.get(agent.id) ?? '',
      startedAt: clock.now(),
    });
  }

  // Ticket 15's first hazard: a dead port or a rejected token yields a perfectly normal
  // `sessionId` and nothing in the ACP stream, so the agent simply has no tool and only finds
  // out when it tries. The handshake reaching us is the only honest signal, and the runtimes
  // handshake lazily — so this is a report, not a gate.
  void Promise.all(
    agents.map(async (agent) => {
      const ready = await mcp.whenReady(agent.id, 30_000);
      if (!ready) {
        process.stderr.write(
          `[mcp] ${agent.id} has not handshaked yet — it may have no message_agent tool\n`,
        );
      }
    }),
  );

  return {
    team,
    agents,
    orchestrator,
    store,
    runtimeLabels: Object.fromEntries(agents.map((agent) => [agent.id, 'Claude Code'])),
    demoMode: false,
    autoplayPrompt:
      'Ask Bob, using your message_agent tool, what he thinks the riskiest part of this ' +
      'repository is. Tell him you are looking at it from the frontend side. Then wait.',
    close: () => {
      orchestrator.dispose();
      void mcp.stop();
      opened.close();
    },
  };
}
