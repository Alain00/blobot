import {
  workspaceProviderFor,
  machineFor,
  SleepingRuntime,
  Orchestrator,
  PeerMessageServer,
  SqliteRecorder,
  SqliteStore,
  composePersona,
  uuidv7,
  type Agent,
  type AgentRecord,
  type AgentRuntime,
  type BlobotDatabase,
  type Clock,
  type Team,
  type Machine,
  type WorkspaceProvider,
} from '@blobot/core';
import type { RunningTeam } from './running-team.js';
import { FileHandoffArchive } from './handoff-archive.js';
import { runtimeLabel } from './runtime-labels.js';
import { runtimeFor } from './runtime-for.js';
import { resolveCeiling } from './context-ceilings.js';

export interface StartTeamOptions {
  readonly team: Team;
  readonly store: SqliteStore;
  readonly db: BlobotDatabase;
  readonly clock: Clock;
  readonly workspaces?: WorkspaceProvider;
  readonly onLog?: (line: string) => void;
  /**
   * One agent's runtime is up. Called once per agent, as each becomes ready rather than when
   * the last one does, because a cold start is a process per agent and the user is entitled to
   * watch them arrive instead of waiting on the slowest.
   */
  readonly onAgentReady?: (agentId: string) => void;
  readonly idleAfterMs?: number;
  readonly canSleep?: () => boolean;
  readonly onMachinePowerChange?: () => void;
  readonly createMachine?: (record: AgentRecord) => Machine;
  readonly beforeRuntimeStart?: (machine: Machine) => Promise<void>;
}

/**
 * Bring a persisted team back to life: reconcile every agent's workspace, resume or spawn its
 * runtime, hand it the loopback `message_agent` tool, and put an orchestrator around the lot.
 *
 * This is the old `live-team.ts` with the hardcoded roster taken out — the roster is rows now.
 * The launch reconcile runs *here* rather than at creation because the interesting cases only
 * happen on the second launch: a directory deleted under us, or a branch that is gone.
 *
 * The agent's *context* comes back too, now that it can: each runtime is handed the provider
 * session id its last session recorded, so a relaunched agent knows the conversation instead
 * of reading its own transcript as a stranger's. When the provider has forgotten that session
 * the adapter quietly starts a new one, which is exactly where this used to be every time.
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
      // The stored hue was being dropped here, so a running team drew the name's derived
      // colour while every other surface drew the one the user picked. The hue is the only
      // part of a face that is stored rather than derived; losing it is one agent, two faces.
      ...(record.hue === undefined ? {} : { hue: record.hue }),
      // And the silhouette beside it, which is the other half of the same face.
      ...(record.shape === undefined ? {} : { shape: record.shape }),
      // Dropped here the same way the hue was, and with teeth: the orchestrator reads
      // `agent.compaction ?? DEFAULT_COMPACTION`, so an agent the user had switched *off*
      // arrived as undefined and was compacted anyway. The setting was on screen, stored, and
      // read by nothing.
      ...(record.compaction === undefined ? {} : { compaction: record.compaction }),
      // And the same path for the same reason: `composePersona` reads it off the Agent.
      ...(record.verbosity === undefined ? {} : { verbosity: record.verbosity }),
      workspacePath: workspace.path,
      ...(record.machine === undefined ? {} : { machine: record.machine }),
    });
    // A copied AgentWorkspace has no branch to show, and the UI already treats it as optional.
    if (workspace.branch !== undefined) branches[record.id] = workspace.branch;
  }

  let orchestrator: Orchestrator;
  const mcp = new PeerMessageServer({
    handler: (call) => orchestrator.handleMessageAgent(call),
    // Issue 05. Offered because this team's Routines are rows in the same file everything else
    // is in; an agent may propose one and no agent may arm one.
    proposeRoutine: (call) => orchestrator.handleProposeRoutine(call),
    // Offered for the same reason and on the same condition: the Handbook is rows in the file
    // everything else is in, so there is somewhere for an entry to go.
    recordEntry: (call) => orchestrator.handleRecordEntry(call),
    onLog: (line) => log(line),
  });
  await mcp.start();

  // The Handbook is read here and passed in, because `composePersona` is pure and reads no
  // store. Keyed on `(team, agent name)`, so it is the same Handbook after somebody was taken
  // off this roster and put back on.
  const personas = new Map(
    agents.map((agent) => [
      agent.id,
      composePersona(agent, team, agents, store.handbookOf(team.id, agent.name)),
    ]),
  );
  const runtimeLabels: Record<string, string> = {};
  /**
   * What blobot knows about each model's usable context, resolved here because this is where
   * the record and the runtime id are both in hand. An agent whose model nobody measured
   * contributes no key, and the renderer falls back for it. See ticket 09.
   */
  const contextCeilings: Record<string, number> = {};
  // Read once for the whole roster: what the user set outranks what the adapter ships.
  const overrides = store.contextCeilings();
  const runtimes = new Map<string, AgentRuntime>();
  const executions = new Map<string, SleepingRuntime>();
  const machines = new Map<string, Machine>();
  for (const record of records) {
    const agent = agents.find((candidate) => candidate.id === record.id);
    if (agent === undefined) continue;
    runtimeLabels[record.id] = runtimeLabel(record.runtimeId);
    const measured = resolveCeiling(overrides, record.runtimeId, record.runtimeOptions?.['model']);
    if (measured !== undefined) contextCeilings[record.id] = measured;
    const machine = options.createMachine?.({ ...record, workspacePath: agent.workspacePath })
      ?? machineFor(record.machine?.kind ?? 'local', { agentId: agent.id, workspacePath: agent.workspacePath });
    machines.set(agent.id, machine);
    const endpoint = mcp.endpointFor(agent.id, machine.mailboxHostname);
    // The whole difference between a relaunch and a resume. Undefined on a first launch, and
    // a session the provider has forgotten is not fatal: the adapter falls back to a new one.
    const resumeSessionId = store.lastProviderSessionOf(agent.id);
    // The one branch on a provider in the whole app, and it produces an `AgentRuntime`:
    // nothing below this line knows which runtime an agent is.
    const runtime = new SleepingRuntime({
      machine,
      clock,
      startRequest: { mailboxPort: mcp.port },
      beforeRuntimeStart: async () => options.beforeRuntimeStart?.(machine),
      ...(options.idleAfterMs === undefined ? {} : { idleAfterMs: options.idleAfterMs }),
      ...(resumeSessionId === undefined ? {} : { resumeSessionId }),
      canSleep: () => (options.canSleep?.() ?? true) &&
        orchestrator.statusOf(agent.id) === 'idle' && orchestrator.mailbox(agent.id).length === 0,
      onPowerChange: () => options.onMachinePowerChange?.(),
      onSessionOpened: (sessionId) => {
        store.startSession({
          id: uuidv7(clock.now()), agentId: agent.id, providerSessionId: sessionId,
          personaText: personas.get(agent.id) ?? '', startedAt: clock.now(),
        });
      },
      create: (latestSessionId) => runtimeFor({
      machine,
      runtimeId: record.runtimeId,
      agentId: agent.id,
      agentName: agent.name,
      cwd: agent.workspacePath,
      persona: personas.get(agent.id) ?? '',
      ...(latestSessionId === undefined ? {} : { resumeSessionId: latestSessionId }),
      // Ticket 07: the user's own binary, never a bundled copy.
      ...(machine.kind === 'box' || record.executablePath === undefined ? {} : { executablePath: record.executablePath }),
      // What this agent was set to when it was hired or last edited. A team takes it at its
      // next start, which is this line.
      ...(record.runtimeOptions === undefined ? {} : { options: record.runtimeOptions }),
      // Taken at start for the same reason as the options above, and more strictly: a posture
      // is a `session/new` parameter on one runtime and a child's environment on the other, so
      // it cannot change under a live process even in principle.
      ...(record.trust === undefined ? {} : { trust: record.trust }),
      mcpServers: [
        {
          type: 'http',
          name: 'blobot',
          url: endpoint.url,
          headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }],
        },
      ],
      onStderr: (line) => log(`[runtime:${agent.id}] ${line}`),
      // The store measures the bytes and decides whether there is anything to draw, so no two
      // runtimes can disagree about what blobot will keep. `.scratch/agent-media/06`.
      pictures: { keep: (picture) => store.keepPicture(picture) },
      }),
    });
    executions.set(agent.id, runtime);
    runtime.onLifecycleChange((lifecycle) => {
      log(`[${agent.id}] ${lifecycle}`);
      if (lifecycle === 'ready') options.onAgentReady?.(agent.id);
    });
    runtimes.set(agent.id, runtime);
  }

  orchestrator = new Orchestrator({
    team,
    agents,
    runtimes,
    store,
    clock,
    recorder: new SqliteRecorder(db, team.id),
    // The same numbers the gauge divides by, so the threshold and the mark on screen cannot
    // disagree about what a full agent is. Ticket 09 resolved the lookup here; ticket 10 is
    // the first thing to act on it.
    contextCeilings: new Map(Object.entries(contextCeilings)),
    handoffs: new FileHandoffArchive(),
    routines: store,
    handbooks: store,
    profileOverviews: store,
  });
  await orchestrator.start();

  /**
   * A session blobot replaced needs a row, or the next launch resumes the one it closed.
   *
   * `lastProviderSessionOf` is what turns a relaunch into a resume, and it reads the newest
   * session row. Without this the agent would come back pointed at a session the provider has
   * thrown away — which is survivable, since the adapter falls back to a new one, but it would
   * silently cost the agent the handoff it had just been given.
   *
   * A `command` compaction writes one too. The session id is unchanged, but the persona row is
   * the record of what an agent was carrying at a moment, and a compacted session is a
   * different moment.
   */
  orchestrator.onCompaction((compacted) => {
    if (compacted.how === 'refused') return;
    const agent = agents.find((candidate) => candidate.id === compacted.agentId);
    if (agent === undefined) return;
    store.startSession({
      id: uuidv7(compacted.at),
      agentId: agent.id,
      ...(compacted.sessionId === '' ? {} : { providerSessionId: compacted.sessionId }),
      personaText: personas.get(agent.id) ?? '',
      startedAt: compacted.at,
    });
    log(`[${agent.id}] ${compacted.how} · session ${compacted.sessionId}`);
  });

  // Ticket 15's first hazard: a dead port or a rejected token yields a perfectly normal
  // `sessionId` and nothing in the ACP stream, so the agent simply has no tool and only finds
  // out when it tries. The inbound handshake is the only honest signal — a report, not a gate.
  void Promise.all(
    agents.map(async (agent) => {
      if (!(await mcp.whenReady(agent.id, 30_000))) {
        log(`[mcp] ${agent.id} has not handshaked yet. It may have no message_agent tool`);
      }
    }),
  );

  return {
    team,
    agents,
    orchestrator,
    store,
    runtimeLabels,
    contextCeilings,
    branches,
    machines,
    executions,
    powerOf: (agentId) => executions.get(agentId)?.power ?? 'unknown',
    setIdleAfterMs: (value) => { for (const execution of executions.values()) execution.setIdleAfterMs(value); },
    demoMode: false,
    autoplayPrompt:
      'Ask a teammate, using your message_agent tool, what they think the riskiest part of ' +
      'this repository is. Tell them you are looking at it from your side. Then wait.',
    close: async () => {
      orchestrator.dispose();
      // Eviction or quit, no longer every switch — `TeamPool` keeps the last few teams live.
      // `stop()` closes the session before the pipe, which is the difference between a routine
      // shutdown and the bridge logging a cleanup failure, and it does not cost the team its
      // memory: a closed session still resumes (research 15 §7a).
      await Promise.all([...runtimes.values()].map((runtime) => runtime.stop().catch(() => {})));
      await mcp.stop();
    },
  };
}
