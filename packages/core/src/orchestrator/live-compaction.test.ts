import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClaudeAgentRuntime } from '../adapters/claude/claude-agent-runtime.js';
import { SystemClock } from '../clock.js';
import type { AgentEvent, ContextCompacted } from '../events.js';
import type { AgentRuntime } from '../runtime.js';
import { HANDOFF_LIMIT, type HandoffRecord } from './compaction.js';
import type { Agent, Team } from './domain.js';
import { InMemoryMessageStore } from './message-store.js';
import { Orchestrator, type Compacted } from './orchestrator.js';

/**
 * Ticket 10's one path, against a real runtime.
 *
 * Everything else about compaction is tested against `MockAgentRuntime`, which answers whatever
 * a scenario tells it to — so the mock can prove blobot asks at the right moment, carries what
 * it was given and refuses at the boundary, and can prove none of the three things that are
 * actually claims about a real agent and a real session:
 *
 * - that a real Claude, handed `HANDOFF_PROMPT` at high occupancy, **answers with a handoff at
 *   all** rather than stopping on `max_tokens` or writing a transcript past `HANDOFF_LIMIT` —
 *   the refusal path is the whole risk of firing with margin, and until now nobody had watched
 *   a real one come back;
 * - that `restart()` really closes the conversation, so the fresh session has genuinely lost it;
 * - that what the agent wrote is enough to **carry the work across**, which is the entire point
 *   and the only part a mock cannot even approximate.
 *
 * It shipped with `/compact` first and the author reversed that from a live run, which means the
 * path that survived is the one that had never run live. Off by default for the same reason the
 * adapter's own live suite is: `BLOBOT_LIVE_CLAUDE=1 pnpm -r test`.
 */
const live = process.env.BLOBOT_LIVE_CLAUDE === '1' ? describe : describe.skip;

const team: Team = {
  id: 'team_live',
  name: 'live',
  workspacePath: '/repo',
  workspaceKind: 'git',
  turnBudget: 10,
};

const alice: Agent = {
  id: 'agent_alice',
  teamId: team.id,
  name: 'Alice',
  role: 'engineer',
  workspacePath: '/agents/alice',
};

live('compaction against a real claude', () => {
  /**
   * One prompt, then a handoff and a fresh session, then a question only the handoff can answer.
   *
   * The ceiling is injected rather than the threshold lowered: `contextCeilings` is already an
   * `OrchestratorOptions` field, so a small entry here trips `overCompactionThreshold` on the
   * first real turn without a source edit anybody could forget to undo. It is **raised again**
   * once the compaction has happened, because the fresh session is over the same tiny ceiling
   * the moment it says anything, and a test that compacts after every turn would spend a
   * handoff turn to ask one question. The map is read at check time, so mutating it is how a
   * caller says *stop now* — that is the only test-shaped thing here.
   */
  it('asks a real agent for a handoff, opens a fresh session, and carries the work across', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'blobot-live-compaction-'));
    const runtime = new ClaudeAgentRuntime({
      agentId: alice.id,
      cwd,
      persona: 'You are Alice, an engineer. Answer briefly and do exactly what is asked.',
      trust: 'normal',
    });

    // 1,000 tokens of working ceiling: a real turn carries a system prompt many times that, so
    // the first thing Alice says puts her over 80% of it.
    const ceilings = new Map<string, number>([[alice.id, 1_000]]);
    const archived: HandoffRecord[] = [];
    const events: AgentEvent[] = [];
    const orchestrator = new Orchestrator({
      team,
      agents: [alice],
      runtimes: new Map<string, AgentRuntime>([[alice.id, runtime]]),
      store: new InMemoryMessageStore(),
      clock: new SystemClock(),
      contextCeilings: ceilings,
      handoffs: {
        async write(record) {
          archived.push(record);
          return `/handoffs/${record.agentId}.md`;
        },
      },
    });
    orchestrator.onEvent((event) => events.push(event));
    const compacted: Compacted[] = [];
    orchestrator.onCompaction((one) => compacted.push(one));

    try {
      await orchestrator.start();
      const openingSessionId = runtime.sessionId;
      expect(openingSessionId).not.toBe('');

      // Something an agent would genuinely put in a handoff: a task, a reason and a next step.
      // Not a codeword — `HANDOFF_PROMPT` explicitly asks for intent and not a retelling, so a
      // test that hides a magic string in the conversation would be testing the wrong prompt.
      await orchestrator.promptFromUser(
        [alice.id],
        'Your task is ticket ZUCCHINI-42: the widget cache never expires. You have decided the ' +
          'fix belongs in src/cache/widget.ts and you were about to add a TTL. Do not write any ' +
          'code yet. Reply with just "ok".',
      );
      await orchestrator.settled();

      const compactions = events.filter(
        (event): event is ContextCompacted => event.type === 'context_compacted',
      );
      expect(compactions).toHaveLength(1);
      const compaction = compactions[0] as ContextCompacted;

      // The refusal paths are the risk this test exists to measure, so a refusal reports what
      // the agent did rather than just failing the assertion.
      expect(compaction.how, `blobot refused to restart: ${compaction.reason ?? ''}`).toBe(
        'handoff',
      );
      const handoff = compaction.handoff ?? '';
      expect(handoff).not.toBe('');
      expect(handoff.length).toBeLessThanOrEqual(HANDOFF_LIMIT);
      // Written for the successor, in the first person, about the work rather than about us.
      expect(handoff).toMatch(/ZUCCHINI-42/);

      // The session was really closed and a different one is really open. The event is stamped
      // with the session it is *about*, which on a handoff is the one that was closed; the
      // fresh id travels on `onCompaction`, which is the surface main writes the resume row from.
      expect(compaction.sessionId).toBe(openingSessionId);
      expect(compactions).toHaveLength(1);
      expect(compacted).toHaveLength(1);
      expect(compacted[0]?.previousSessionId).toBe(openingSessionId);
      expect(compacted[0]?.sessionId).toBe(runtime.sessionId);
      expect(runtime.sessionId).not.toBe('');
      expect(runtime.sessionId).not.toBe(openingSessionId);
      // Claude's persona is a `session/new` parameter, so the fresh session re-read it.
      expect(compaction.personaRefreshed).toBe(true);
      expect(archived).toHaveLength(1);
      expect(archived[0]?.sessionId).toBe(openingSessionId);

      // Now stop compacting, and ask the successor what it is doing. It has never been told
      // any of this: the only route from the closed session to this one is the handoff.
      ceilings.set(alice.id, 10_000_000);
      const before = events.length;
      await orchestrator.promptFromUser(
        [alice.id],
        'In one sentence and without using any tools: what ticket are you working on, which ' +
          'file did you decide the fix belongs in, and what were you about to do?',
      );
      await orchestrator.settled();

      const answered = events
        .slice(before)
        .filter((event) => event.type === 'agent_message_completed')
        .map((event) => (event as { text: string }).text)
        .join('\n');
      expect(answered).toMatch(/ZUCCHINI-42/);
      expect(answered).toMatch(/widget\.ts/);
      expect(answered.toLowerCase()).toMatch(/ttl|expir/);
    } finally {
      orchestrator.dispose();
      await runtime.stop();
    }
  }, 600_000);
});
