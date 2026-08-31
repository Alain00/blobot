import { DEFAULT_TRUST, type TrustLevel } from '../../trust.js';

/**
 * Ticket 14's posture on Cursor, as `cli-config.json`.
 *
 * Cursor expresses trust on two axes blobot must not confuse: `approvalMode` and ACP `mode`.
 * `plan` and `ask` are read-only and are not a trust level — an agent in either cannot do the
 * work a teammate exists to do, so the adapter pins `agent` and never offers the other two.
 * `unrestricted` / `--force` / `--yolo` are ticket 14's ceiling, refused at every level.
 * `auto-review` spends a second model call on a decision blobot claims to be making, which is
 * fx's problem; it is not used.
 *
 * What remains is `allowlist`, with `permissions.allow` widening as trust widens and
 * `permissions.deny` holding the closed list that asks at every level. Deny wins, which is
 * how `Shell(git)` can be vouched for without vouching for `git push`.
 *
 * A speed bump, not a boundary — the same sentence as the other adapters. `npm run` executes
 * a script the agent may have just written. What blobot claims is prompting.
 *
 * Not a file in the AgentWorkspace. That is a checkout, and anything left there can be
 * committed home. This JSON is written into blobot's own `CURSOR_CONFIG_DIR` and dies with
 * the process's view of `~/.cursor`.
 */

/** The commands that delete, publish, or change who can do what. Ask at every trust level. */
export const ALWAYS_DENY: readonly string[] = [
  'Shell(rm)',
  'Shell(sudo)',
  'Shell(chmod)',
  'Shell(chown)',
  'Shell(ssh)',
  'Shell(scp)',
  'Shell(docker)',
  'Shell(git:push*)',
  'Shell(git:remote*)',
];

/**
 * Editing the AgentWorkspace, plus the looking-around and local-git verbs that are how an
 * agent does its job. `Shell(git)` is safe here because deny takes precedence and push/remote
 * are on `ALWAYS_DENY`. Network and installers are absent: those are `trusting`.
 */
const NORMAL_ALLOW: readonly string[] = [
  'Write(**)',
  'Read(**)',
  'Mcp(blobot:*)',
  'Shell(ls)',
  'Shell(cat)',
  'Shell(head)',
  'Shell(tail)',
  'Shell(wc)',
  'Shell(pwd)',
  'Shell(echo)',
  'Shell(which)',
  'Shell(file)',
  'Shell(stat)',
  'Shell(date)',
  'Shell(du)',
  'Shell(find)',
  'Shell(grep)',
  'Shell(rg)',
  'Shell(tree)',
  'Shell(diff)',
  'Shell(sort)',
  'Shell(uniq)',
  'Shell(basename)',
  'Shell(dirname)',
  'Shell(realpath)',
  'Shell(git)',
  'Shell(npm:test*)',
  'Shell(npm:run*)',
  'Shell(npm:ls)',
  'Shell(pnpm:test*)',
  'Shell(pnpm:run*)',
  'Shell(pnpm:ls)',
  'Shell(pnpm:build*)',
  'Shell(yarn:test*)',
  'Shell(yarn:run*)',
  'Shell(bun:test*)',
  'Shell(bun:run*)',
  'Shell(make)',
  'Shell(cargo:test*)',
  'Shell(cargo:build*)',
  'Shell(cargo:check*)',
  'Shell(go:test*)',
  'Shell(go:build*)',
  'Shell(go:vet*)',
  'Shell(pytest)',
  'Shell(vitest)',
  'Shell(jest)',
  'Shell(tsc)',
  'Shell(node)',
  'Shell(python)',
  'Shell(python3)',
  'Shell(ruby)',
  'Shell(mkdir)',
  'Shell(touch)',
  'Shell(cp)',
  'Shell(mv)',
  'Shell(sed)',
  'Shell(awk)',
  'Shell(tee)',
  'Shell(ln)',
];

/** Network and installers. `rm` / `sudo` / `git push` stay on the deny list. */
const TRUSTING_ALLOW: readonly string[] = [
  'Shell(curl:*)',
  'Shell(wget:*)',
  'Shell(gh)',
  'Shell(npm:*)',
  'Shell(npx:*)',
  'Shell(pnpm:*)',
  'Shell(yarn:*)',
  'Shell(bun:*)',
  'Shell(pip:*)',
  'Shell(pip3:*)',
  'Shell(cargo:add*)',
  'Shell(go:get*)',
  'WebFetch(*)',
];

export type CursorApprovalMode = 'allowlist' | 'auto-review' | 'unrestricted';

/** Ticket 14: the only mode blobot will write. The other two are refused, not mapped. */
export const CURSOR_APPROVAL_MODE: CursorApprovalMode = 'allowlist';

/**
 * The ACP session mode a blobot agent runs as. `plan` and `ask` are read-only; they are not
 * offered as trust, however tempting the word *ask* looks next to *careful*.
 */
export const CURSOR_SESSION_MODE = 'agent';

export interface CursorCliConfig {
  readonly version: 1;
  readonly approvalMode: CursorApprovalMode;
  readonly permissions: {
    readonly allow: readonly string[];
    readonly deny: readonly string[];
  };
  readonly sandbox: {
    readonly mode: 'enabled';
    readonly networkAccess: 'disabled' | 'enabled';
  };
}

/**
 * What blobot writes into `cli-config.json` at one trust level.
 *
 * `careful` vouches for the mailbox and nothing else — an agent that had to ask permission to
 * answer its teammate would not be careful, it would be broken. `normal` vouches for edits
 * inside the AgentWorkspace and the local work. `trusting` adds the network. Sandbox stays
 * on: it is ticket 10's isolation, not ticket 14's dial. Network inside the sandbox follows
 * trust, because an agent that cannot reach the network cannot install a dependency, and one
 * that can is a different blast radius.
 */
export function cursorCliConfig(trust: TrustLevel = DEFAULT_TRUST): CursorCliConfig {
  const allow =
    trust === 'careful'
      ? ['Mcp(blobot:*)']
      : trust === 'trusting'
        ? [...NORMAL_ALLOW, ...TRUSTING_ALLOW]
        : [...NORMAL_ALLOW];
  return {
    version: 1,
    approvalMode: CURSOR_APPROVAL_MODE,
    permissions: { allow, deny: ALWAYS_DENY },
    sandbox: {
      mode: 'enabled',
      networkAccess: trust === 'trusting' ? 'enabled' : 'disabled',
    },
  };
}
