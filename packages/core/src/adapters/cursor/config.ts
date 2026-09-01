import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_TRUST, type TrustLevel } from '../../trust.js';
import { cursorCliConfig } from './permissions.js';

/**
 * The per-agent `CURSOR_CONFIG_DIR`, owned by blobot, never the workspace and never `~/.cursor`.
 *
 * Ticket 01 measured exactly what the variable relocates, and this file is sized to the
 * answer: the directory carries **`cli-config.json`** (the posture, enforced — a
 * `permissions.deny` written there blocked a real turn) and **`acp-sessions/`** (resume state,
 * so pool eviction survives per agent), and nothing else. The login lives outside it and
 * survives; `mcp.json` and `rules/` placed here are ignored. So no `mcp.json` is written — the
 * loopback rides `session/new`'s `mcpServers`, the standard door (ticket 02) — and no persona
 * rule is written, because a rule here never reaches the model (ticket 08); the persona rides
 * the prompt. The PR's three-file version of this module is refuted on both of those halves.
 */

export function defaultCursorConfigDir(agentId: string, home = homedir()): string {
  const data = process.env['XDG_DATA_HOME'];
  const root = data !== undefined && data.length > 0 ? data : join(home, '.local', 'share');
  return join(root, 'blobot', 'cursor-config', agentId);
}

/**
 * Assert the posture into `<dir>/cli-config.json`, preserving what the CLI keeps there itself.
 *
 * `cursor-agent` treats this file as its own — it caches display settings, model history and
 * an `authInfo` block (identity metadata, not a credential) into it as it runs — so blobot
 * merges over what exists rather than clobbering it: our four fields are asserted on every
 * start, the vendor's are left alone. `permissions` is written whole each time, which is safe
 * because an `allow-always` answer persists in the session store and never in this file
 * (measured, ticket 01) — overwriting the block cannot erase a rule the user made.
 */
export function writeCursorConfig(options: {
  readonly dir: string;
  readonly trust?: TrustLevel;
}): string {
  mkdirSync(options.dir, { recursive: true });
  const path = join(options.dir, 'cli-config.json');
  const posture = cursorCliConfig(options.trust ?? DEFAULT_TRUST);
  const merged = { ...existingConfig(path), ...posture };
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
  return path;
}

function existingConfig(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
