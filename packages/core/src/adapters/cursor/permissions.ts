import { ATTENDED_TRUST_LEVELS, DEFAULT_TRUST, type TrustLevel } from '../../trust.js';
import type { MachineKind } from '../../machines/machine.js';

/** The pinned ACP path bypasses the interactive sandbox provider (Machines research43). */
export const CURSOR_LOCAL_PROTECTION =
  'Local execution has no verified OS sandbox through this integration. Approval rules still apply.';

/**
 * Ticket 14's posture on Cursor, as the `cli-config.json` blobot writes into the per-agent
 * `CURSOR_CONFIG_DIR`. The counterpart to `adapters/claude/permissions.ts`, mirroring the same
 * verbs in Cursor's own syntax — `Shell(cmd)` for a whole command, `Shell(cmd:args*)` for a
 * verb split, `Read(**)` / `Write(**)` scoped to the workspace, `Mcp(server:tool)` for a
 * server's tools. Cursor is the second runtime after Claude on which blobot's three attended
 * words each buy something real.
 *
 * ## Deny stays empty, and the PR that guessed otherwise is refuted by measurement
 *
 * `permissions.deny` looked like the obvious home for the nine dangerous verbs, and ticket 01
 * measured what it actually is: a **silent hard block**. A denied command raises no
 * `session/request_permission` at all, and its `tool_call` reports `status: completed` — the
 * refusal exists only in prose. blobot's rule is that `rm`, `sudo`, `chmod`, `chown`, `ssh`,
 * `scp`, `docker`, `git push` and `git remote` **ask at every level**, because the user may
 * still say yes; on Cursor asking is what an *unlisted* command does (measured: "Shell
 * allowlist is empty" arrives as a proper permission request). So the dangerous verbs are
 * simply absent from every list, and `deny` holds nothing at any attended level.
 *
 * ## Where an *always* goes
 *
 * An `allow-always` answer persists in the session store under `CURSOR_CONFIG_DIR`, never in
 * this file — measured, ticket 01. Per agent, readable and deletable as a directory blobot
 * owns, dead with it. The inline permission block names that, the way it names
 * `settings.local.json` on Claude.
 *
 * **A speed bump, not a boundary** — the same sentence every adapter's posture carries.
 * `npm run` executes a script the agent may have just written. What blobot claims is
 * prompting, which stays true.
 */

/** The three approval modes Cursor has. Only the first is ever written; `unrestricted` (and
 *  its argv spellings `--force` / `--yolo`) is ticket 14's refusal, and `auto-review` is the
 *  measured-in-shape candidate for a future `unattended` that waits on its own measurement. */
export type CursorApprovalMode = 'allowlist' | 'auto-review' | 'unrestricted';

export const CURSOR_APPROVAL_MODE: CursorApprovalMode = 'allowlist';

/**
 * The ACP session mode a blobot agent runs in. `plan` and `ask` are read-only — an agent in
 * either cannot do the work a teammate exists to do — so they are not trust levels and the
 * picker never offers them, however tempting the word *ask* looks next to *careful*.
 */
export const CURSOR_SESSION_MODE = 'agent';

/**
 * Which trust positions are real on this runtime: the three attended ones, each with its own
 * genuinely distinct translation below — unlike Codex and fx, where one posture answers all
 * three words and a constant says so.
 *
 * `unattended` is deliberately not here yet. Cursor's `--auto-review` is the same shape as
 * Claude's `auto` — a server classifier deciding the unvouched tail — and it earns its way in
 * through its own measurement effort (does the classifier consult `deny`? do the nine verbs
 * hold under it?), the same dedicated measurement Claude's fourth level got the day it
 * shipped. Recorded on the map as out of this effort's scope.
 */
export const CURSOR_TRUST_LEVELS: readonly TrustLevel[] = ATTENDED_TRUST_LEVELS;

/**
 * The mailbox, vouched at every level, `careful` included — where it is the *only* entry.
 *
 * Measured: Cursor prompts on MCP tool calls under an empty allowlist. A peer message must
 * never wait on a human — the Codex lesson — and on Cursor it is solved in config rather than
 * by the adapter answering its own permission requests, which is why this file carries no
 * carve-out logic and the runtime carries none either.
 */
const MAILBOX_ALLOW = 'Mcp(blobot:*)';

/**
 * What `normal` vouches for: editing the AgentWorkspace, and the looking-around and local-work
 * verbs of `adapters/claude/permissions.ts`, in Cursor's syntax.
 *
 * `Read(**)` and `Write(**)` are workspace-scoped per Cursor's own docs, and an AgentWorkspace
 * is the agent's own copy in all three workspace kinds, so an edit here is never the user's
 * working tree. `git` is split by verb — the reading and local verbs vouched, `push` and
 * `remote` in no list so they prompt — using the `cmd:args*` prefix form. That args-prefix
 * semantics is documented but was not among ticket 01's three turns, so the live suite
 * verifies it (`live.test.ts`); the failure direction is safe — a pattern that does not match
 * leaves the command unlisted, and unlisted prompts. The reading half of `gh` rides the same
 * mechanism for the same reason Claude's list carries it: what decides is the verb, never the
 * transport. `gh api` is absent because `-X POST` is invisible to a prefix rule.
 *
 * `bash` and `sh` are absent for Claude's reason: a rule that vouches for a shell vouches for
 * everything the shell can reach.
 */
const NORMAL_ALLOW: readonly string[] = [
  MAILBOX_ALLOW,
  'Read(**)',
  'Write(**)',
  // Looking around.
  'Shell(ls)', 'Shell(cat)', 'Shell(head)', 'Shell(tail)', 'Shell(wc)', 'Shell(pwd)',
  'Shell(echo)', 'Shell(which)', 'Shell(file)', 'Shell(stat)', 'Shell(date)', 'Shell(du)',
  'Shell(find)', 'Shell(grep)', 'Shell(rg)', 'Shell(tree)', 'Shell(diff)', 'Shell(sort)',
  'Shell(uniq)', 'Shell(basename)', 'Shell(dirname)', 'Shell(realpath)',
  // Local git, split by verb. Never the bare `Shell(git)`, which would vouch for `git push`
  // and `git remote` in one word — the exact mistake the deny list cannot repair, because
  // deny does not ask, it silently blocks.
  'Shell(git:status*)', 'Shell(git:diff*)', 'Shell(git:log*)', 'Shell(git:show*)',
  'Shell(git:branch*)', 'Shell(git:add*)', 'Shell(git:commit*)', 'Shell(git:checkout*)',
  'Shell(git:switch*)', 'Shell(git:restore*)', 'Shell(git:stash*)', 'Shell(git:rev-parse*)',
  'Shell(git:ls-files*)', 'Shell(git:blame*)', 'Shell(git:fetch*)', 'Shell(git:pull*)',
  'Shell(git:merge*)', 'Shell(git:rebase*)', 'Shell(git:reset*)', 'Shell(git:tag*)',
  'Shell(git:describe*)', 'Shell(git:config*)', 'Shell(git:apply*)', 'Shell(git:cherry-pick*)',
  // Reading GitHub — the same split as local git, made on the verb and never on the transport.
  'Shell(gh:pr view*)', 'Shell(gh:pr list*)', 'Shell(gh:pr diff*)', 'Shell(gh:pr checks*)',
  'Shell(gh:pr status*)', 'Shell(gh:issue view*)', 'Shell(gh:issue list*)',
  'Shell(gh:issue status*)', 'Shell(gh:repo view*)', 'Shell(gh:repo list*)',
  'Shell(gh:run view*)', 'Shell(gh:run list*)', 'Shell(gh:workflow view*)',
  'Shell(gh:workflow list*)', 'Shell(gh:release view*)', 'Shell(gh:release list*)',
  'Shell(gh:label list*)', 'Shell(gh:search*)', 'Shell(gh:auth status*)',
  // Doing the work. Running a script is not installing one: the install verbs are `trusting`'s.
  'Shell(npm:test*)', 'Shell(npm:run*)', 'Shell(npm:ls*)',
  'Shell(pnpm:test*)', 'Shell(pnpm:run*)', 'Shell(pnpm:ls*)', 'Shell(pnpm:build*)',
  'Shell(yarn:test*)', 'Shell(yarn:run*)', 'Shell(bun:test*)', 'Shell(bun:run*)',
  'Shell(make)', 'Shell(cargo:test*)', 'Shell(cargo:build*)', 'Shell(cargo:check*)',
  'Shell(go:test*)', 'Shell(go:build*)', 'Shell(go:vet*)',
  'Shell(pytest)', 'Shell(vitest)', 'Shell(jest)', 'Shell(tsc)',
  'Shell(node)', 'Shell(python)', 'Shell(python3)', 'Shell(ruby)',
  // Ordinary file work. `rm` is deliberately not here, on any runtime.
  'Shell(mkdir)', 'Shell(touch)', 'Shell(cp)', 'Shell(mv)', 'Shell(sed)', 'Shell(awk)',
  'Shell(tee)', 'Shell(ln)',
];

/**
 * What `trusting` adds: the network and the installers, `adapters/claude/permissions.ts`'s
 * `TRUSTING_BASH` in Cursor's syntax — plus `WebFetch(*)`, which exists here because Cursor
 * names its fetch tool apart from the shell, and vouching `curl` while prompting the built-in
 * fetch would be a distinction without a difference. An agent set here still stops before
 * `rm`, `sudo`, `chmod`, `chown`, `ssh`, `scp`, `docker`, `git push`, `git remote` and every
 * writing `gh` verb, because none of those is in any list.
 */
const TRUSTING_ALLOW: readonly string[] = [
  'Shell(curl)', 'Shell(wget)',
  'Shell(npm:install*)', 'Shell(npm:ci*)', 'Shell(npx)',
  'Shell(pnpm:add*)', 'Shell(pnpm:dlx*)', 'Shell(pnpm:install*)',
  'Shell(yarn:add*)', 'Shell(yarn:install*)', 'Shell(bun:add*)', 'Shell(bun:install*)',
  'Shell(pip:install*)', 'Shell(pip3:install*)', 'Shell(cargo:add*)', 'Shell(go:get*)',
  'WebFetch(*)',
];

export interface CursorCliConfig {
  readonly version: 1;
  readonly approvalMode: CursorApprovalMode;
  readonly permissions: {
    readonly allow: readonly string[];
    readonly deny: readonly string[];
  };
  readonly sandbox: {
    readonly mode: 'enabled' | 'disabled';
    readonly networkAccess: 'allow_all';
  };
}

/**
 * The posture at one trust level, as the fields blobot asserts in `cli-config.json`.
 *
 * `careful` vouches for the mailbox and nothing else — an agent that had to ask permission to
 * answer its teammate would not be careful, it would be broken. `normal` vouches for edits in
 * the AgentWorkspace and the local work. `trusting` adds the network and the installers.
 *
 * Local execution keeps the existing sandbox setting at every trust level, but it is NOT a
 * claim of an effective fence: the pinned ACP path uses ConfigPermissionsAdapter directly
 * with insecure_none, bypassing the interactive sandbox provider (Machines research43).
 * Box execution writes the independent disabled setting; neither setting changes approvals.
 * The AgentRuntime's box preparation guard remains closed until startup is complete.
 *
 * A stored `unattended` — a word this runtime does not express and the form never offers —
 * takes `trusting`'s list and nothing more: everything unvouched still prompts, which is the
 * strictly more cautious reading of a choice made for a different runtime.
 */
export function cursorCliConfig(
  trust: TrustLevel = DEFAULT_TRUST,
  kind: MachineKind = 'local',
): CursorCliConfig {
  const allow =
    trust === 'careful'
      ? [MAILBOX_ALLOW]
      : trust === 'trusting' || trust === 'unattended'
        ? [...NORMAL_ALLOW, ...TRUSTING_ALLOW]
        : [...NORMAL_ALLOW];
  return {
    version: 1,
    approvalMode: CURSOR_APPROVAL_MODE,
    permissions: { allow, deny: [] },
    // `allow_all` is the CLI's own canonical value: a smoke run wrote `enabled` here and
    // cursor-agent rewrote it to `allow_all` on start. Writing the canonical word means the
    // file blobot asserts is the file the vendor keeps, with no coercion in between.
    sandbox: { mode: kind === 'local' ? 'enabled' : 'disabled', networkAccess: 'allow_all' },
  };
}
