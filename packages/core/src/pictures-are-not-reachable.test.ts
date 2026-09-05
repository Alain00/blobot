import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **Nothing hands an Agent a path or an id into blobot's store.**
 *
 * `.scratch/agent-media/02` handed this over as an invariant and asked for a test by name. It is
 * what makes ADR-0004's argument survive the reversal: the attachment store is safe because it
 * cannot be reached, and pictures live in the same database. The id crosses to the renderer and
 * nowhere else -- no tool takes one, no persona mentions one -- and a future *show me that picture
 * again* tool would break it in one line, which is precisely why this is checked rather than
 * remembered.
 *
 * It is load-bearing for two features now, so it is checked where an agent could actually read it:
 * the tool schemas and descriptions blobot sends, and the text it composes into a prompt.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url));

/** Where blobot's own words reach an agent: the loopback tools, the personas, the envelopes. */
const REACHABLE = ['mcp', 'orchestrator', 'handbook', 'routines'];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('what an agent can reach', () => {
  it('is never a picture id or the store that holds one', () => {
    const offenders = sources(SRC)
      .filter((path) => REACHABLE.some((dir) => path.includes(`/${dir}/`)))
      .filter((path) => /pictureId|PictureStore|pictureUrl/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
