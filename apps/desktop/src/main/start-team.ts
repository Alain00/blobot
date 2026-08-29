import {
  ClaudeAgentRuntime,
  workspaceProviderFor,
  Orchestrator,
  PeerMessageServer,
  SqliteRecorder,
  SqliteStore,
  composePersona,
  uuidv7,
  type Agent,
  type AgentRuntime,
  type BlobotDatabase,
  type Clock,
  type Team,
  type WorkspaceProvider,
} from '@blobot/core';
import type { RunningTeam } from './running-team.js';
import { runtimeLabel } from './runtime-labels.js';

export interface StartTeamOptions {
  readonly team: Team;
  readonly store: SqliteStore;
  readonly db: BlobotDatabase;
  readonly clock: Clock;
  readonly workspaces?: WorkspaceProvider;
  readonly onLog?: (line: string) => void;
}

/**
 * Bring a persisted team back to life: reconcile every agent's workspace, spawn its runtime,
 * hand it the loopback `message_agent` tool, and put an orchestrator around the lot.
 *
 * This is the old `live-team.ts` with the hardcoded roster taken out — the roster is rows now.
 * The launch reconcile runs *here* rather than at creation because the interesting cases only
 * happen on the second launch: a directory deleted under us, or a branch that is gone.
 *
 * What does not come back is the agent's *context*: there is no `session/load` yet, so every
 * launch is a fresh session against the same transcript. The transcript survives; the agent's
 * memory of it does not.
 */
export async function startTeam(options: StartTeamOptions): Promise<RunningTeam> {
  const { team, store, db, clock } = options;
  const log = options.onLog ?? ((line: string) => process.stderr.write(`${line}\n`));
  // The kind was decided when the team was created and stored on the row, so a team of
  // copies and a team of worktrees both come back without anything here knowing which is which.
  const workspaces = options.workspaces ?? workspaceProviderFor(team.workspaceKind);

  const records = store.agentsOfTeam(team.id);
  const inspection = await workspaces.inspect(team.workspacePath);
  if (inspection.dirty) {
    // The ticket 06 trap: the user's uncommitted work is in no agent's workspace, so agents
    // read a version of the file the user is not looking at.
    log(`[workspace] ${team.workspacePath} has uncommitted changes; the agents will not see them`);
  }

  const agents: Agent[] = [];
  const branches: Record<string, string> = {};
  for (const record of records) {
    const request = {
      workspacePath: team.workspacePath,
      teamName: team.name,
      agentId: record.id,
      agentName: record.name,
      ...(team.workspaceRepos === undefined ? {} : { repos: team.workspaceRepos }),
    };
    // `absent` is a first launch, `repaired` is a directory recreated from an intact branch,
    // and `lost` is data loss that has already happened. Saying which is the whole job.
    const reconciled = await workspaces.reconcile(request);
    if (reconciled.state === 'lost' || reconciled.state === 'repaired') {
      log(`[workspace] ${record.id}: ${reconciled.detail}`);
    }
    const workspace = await workspaces.provision(request);
    agents.push({
      id: record.id,
      teamId: team.id,
      ...(record.profileId === undefined ? {} : { profileId: record.profileId }),
      name: record.name,
      role: record.role,
      ...(record.instructions === undefined ? {} : { instructions: record.instructions }),
      workspacePath: workspace.path,
    });
    // A copied AgentWorkspace has no branch to show, and the UI already treats it as optional.
    if (workspace.branch !== undefined) branches[record.id] = workspace.branch;
  }

  let orchestrator: Orchestrator;
  const mcp = new PeerMessageServer({
    handler: (call) => orchestrator.handleMessageAgent(call),
    onLog: (line) => log(line),
  });
  await mcp.start();

  const personas = new Map(agents.map((agent) => [agent.id, composePersona(agent, team, agents)]));
  const runtimeLabels: Record<string, string> = {};
  const runtimes = new Map<string, AgentRuntime>();
  for (const record of records) {
    const agent = agents.find((candidate) => candidate.id === record.id);
    if (agent === undefined) continue;
    runtimeLabels[record.id] = runtimeLabel(record.runtimeId);
    const endpoint = mcp.endpointFor(agent.id);
    const runtime = new ClaudeAgentRuntime({
      agentId: agent.id,
      cwd: agent.workspacePath,
      persona: personas.get(agent.id) ?? '',
      // Ticket 07: the user's own binary, never the bridge's bundled copy.
      ...(record.executablePath === undefined ? {} : { claudeExecutable: record.executablePath }),
      mcpServers: [
        {
          type: 'http',
          name: 'blobot',
          url: endpoint.url,
          headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }],
        },
      ],
      onStderr: (line) => log(`[bridge:${agent.id}] ${line}`),
    });
    runtime.onLifecycleChange((lifecycle) => log(`[${agent.id}] ${lifecycle}`));
    runtimes.set(agent.id, runtime);
  }

  orchestrator = new Orchestrator({
    team,
    agents,
    runtimes,
    store,
    clock,
    recorder: new SqliteRecorder(db, team.id),
  });
  await orchestrator.start();

  for (const agent of agents) {
    const runtime = runtimes.get(agent.id);
    const providerSessionId = runtime?.sessionId;
    store.startSession({
      id: uuidv7(clock.now()),
      agentId: agent.id,
      ...(providerSessionId === undefined || providerSessionId === ''
        ? {}
        : { providerSessionId }),
      personaText: personas.get(agent.id) ?? '',
      startedAt: clock.now(),
    });
  }

  // Ticket 15's first hazard: a dead port or a rejected token yields a perfectly normal
  // `sessionId` and nothing in the ACP stream, so the agent simply has no tool and only finds
  // out when it tries. The inbound handshake is the only honest signal — a report, not a gate.
  void Promise.all(
    agents.map(async (agent) => {
      if (!(await mcp.whenReady(agent.id, 30_000))) {
        log(`[mcp] ${agent.id} has not handshaked yet — it may have no message_agent tool`);
      }
    }),
  );

  return {
    team,
    agents,
    orchestrator,
    store,
    runtimeLabels,
    branches,
    demoMode: false,
    autoplayPrompt:
      'Ask a teammate, using your message_agent tool, what they think the riskiest part of ' +
      'this repository is. Tell them you are looking at it from your side. Then wait.',
    close: async () => {
      orchestrator.dispose();
      // Switching teams stops the bridges rather than leaving them running: `stop()` closes
      // the session before the pipe, which is the difference between a routine shutdown and
      // the bridge logging a cleanup failure.
      await Promise.all([...runtimes.values()].map((runtime) => runtime.stop().catch(() => {})));
      await mcp.stop();
    },
  };
}
