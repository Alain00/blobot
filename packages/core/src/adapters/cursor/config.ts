import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_TRUST, type TrustLevel } from '../../trust.js';
import { cursorCliConfig } from './permissions.js';

/**
 * Per-agent Cursor config, owned by blobot, never by the workspace and never by `~/.cursor`.
 *
 * Cursor's ACP server does not take `mcpServers` from the client — the docs are explicit, and
 * a forum report measured `session/new` accepting the field and connecting to nothing. The
 * loopback mailbox is how a teammate talks, and its bearer token *is* the caller's identity,
 * so the file has to be per agent. Both doors Cursor offers are wrong:
 *
 * - project-level `.cursor/mcp.json` is inside the AgentWorkspace, a checkout;
 * - user-level `~/.cursor/mcp.json` is one file for every agent at once.
 *
 * `CURSOR_CONFIG_DIR` is the third door: a process environment variable, so it dies with the
 * child, writes nothing into the repository, and can differ per agent. This directory is what
 * we point it at. Ticket 01 of `.scratch/cursor-runtime/` is the measurement of what the
 * variable actually relocates; until that is run live, this is the charted mechanism.
 */

export type McpServerConfig = McpStdioServer | McpHttpServer;

export interface McpStdioServer {
  readonly type?: 'stdio';
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: readonly { readonly name: string; readonly value: string }[];
}

export interface McpHttpServer {
  readonly type: 'http';
  readonly name: string;
  readonly url: string;
  readonly headers?: readonly { readonly name: string; readonly value: string }[];
}

export interface CursorConfigFiles {
  readonly dir: string;
  readonly mcpPath: string;
  readonly cliConfigPath: string;
  readonly personaPath: string;
}

export function defaultCursorConfigDir(agentId: string, home = homedir()): string {
  const data = process.env['XDG_DATA_HOME'];
  const root =
    data !== undefined && data.length > 0 ? data : join(home, '.local', 'share');
  return join(root, 'blobot', 'cursor-config', agentId);
}

/**
 * Write the three files an isolated Cursor process needs, and nothing else.
 *
 * A stale token on disk after an unclean exit points at a server that is gone; the next
 * start overwrites the file. We never copy the user's login in here — if the variable takes
 * auth with it, that is ticket 01's *no*, not a thing to paper over by arranging a credential.
 */
export function writeCursorConfig(options: {
  readonly dir: string;
  readonly persona?: string;
  readonly trust?: TrustLevel;
  readonly mcpServers?: readonly McpServerConfig[];
}): CursorConfigFiles {
  mkdirSync(join(options.dir, 'rules'), { recursive: true });
  const mcpPath = join(options.dir, 'mcp.json');
  const cliConfigPath = join(options.dir, 'cli-config.json');
  const personaPath = join(options.dir, 'rules', 'blobot-persona.mdc');
  writeFileSync(mcpPath, `${JSON.stringify(mcpFile(options.mcpServers ?? []), null, 2)}\n`);
  writeFileSync(
    cliConfigPath,
    `${JSON.stringify(cursorCliConfig(options.trust ?? DEFAULT_TRUST), null, 2)}\n`,
  );
  writeFileSync(personaPath, personaRule(options.persona ?? ''));
  return { dir: options.dir, mcpPath, cliConfigPath, personaPath };
}

function mcpFile(servers: readonly McpServerConfig[]): { mcpServers: Record<string, unknown> } {
  const mcpServers: Record<string, unknown> = {};
  for (const server of servers) {
    mcpServers[server.name] = server.type === 'http' ? httpEntry(server) : stdioEntry(server);
  }
  return { mcpServers };
}

function httpEntry(server: McpHttpServer): unknown {
  const headers: Record<string, string> = {};
  for (const header of server.headers ?? []) headers[header.name] = header.value;
  return {
    url: server.url,
    ...(Object.keys(headers).length === 0 ? {} : { headers }),
  };
}

function stdioEntry(server: McpStdioServer): unknown {
  const env: Record<string, string> = {};
  for (const entry of server.env ?? []) env[entry.name] = entry.value;
  return {
    command: server.command,
    ...(server.args === undefined || server.args.length === 0 ? {} : { args: server.args }),
    ...(Object.keys(env).length === 0 ? {} : { env }),
  };
}

function personaRule(persona: string): string {
  return [
    '---',
    'description: Standing identity blobot composed for this teammate.',
    'alwaysApply: true',
    '---',
    '',
    persona,
    '',
  ].join('\n');
}
