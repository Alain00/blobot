import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The discipline that makes "AgentEvent is our own type" real is narrow and checkable:
 * `packages/core` never exports an ACP type, and the vocabulary is defined without one in
 * sight. This is that check, kept as a test so it runs with everything else.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('packages/core', () => {
  it('imports nothing from ACP', () => {
    const offenders = sources(SRC).filter((path) =>
      /from\s+'[^']*agentclientprotocol[^']*'/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
