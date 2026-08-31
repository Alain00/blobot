/**
 * `node-pty` publishes its Unix `spawn-helper` without the executable bit. We put it back.
 *
 * On Unix, `node-pty` does not fork the command itself: it spawns a small helper binary that
 * sets up the session and the controlling terminal, then execs. `posix_spawnp` on a file that
 * is not executable fails, and the only thing that reaches us is `Error: posix_spawnp failed.`
 * — no path, no mode, nothing naming the file — as an *unhandled rejection*, because the throw
 * happens inside the helper's own callback rather than in the caller's frame.
 *
 * Verified against the published tarball rather than inferred from our own tree, since a local
 * `node_modules` is the one place this could have been an accident:
 *
 *     tar -tvzf $(npm view node-pty@1.1.0 dist.tarball)
 *     -rw-r--r--  package/prebuilds/darwin-arm64/spawn-helper
 *
 * So it is upstream, it is every clean install on every machine, and it is not the package
 * manager's doing. `node-pty`'s own `install` script only checks that the prebuild directory
 * exists; nothing in its lifecycle ever chmods what it shipped.
 *
 * This is not only a test failure. `main/runtime-step.ts` is the real pseudo-terminal behind
 * ticket 11's remedies — `claude auth login`, and the vendors' own install commands — so
 * without this the one screen that helps a user past a runtime that is not ready cannot spawn
 * anything, on a machine that has just been set up, which is exactly the machine it is for.
 *
 * A postinstall rather than a patched dependency: `pnpm patch` diffs file contents and would
 * have to carry a 50 KB binary to change nine bits of mode. Idempotent, quiet when there is
 * nothing to do, and never fatal — an install must not fail over a helper this may not need.
 */

import { chmodSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Windows uses conpty and ships no helper. Nothing to do, and no directory to look for.
if (process.platform === 'win32') process.exit(0);

const require = createRequire(import.meta.url);

/** The prebuild for *this* machine. The others are somebody else's platform and stay as they are. */
let helper;
try {
  const root = dirname(require.resolve('node-pty/package.json'));
  helper = join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');
} catch {
  // No `node-pty` here at all. A partial install, or a workspace that does not depend on it.
  process.exit(0);
}

try {
  const mode = statSync(helper).mode;
  // Already executable by somebody. Leave the exact bits alone rather than restating them.
  if ((mode & 0o111) !== 0) process.exit(0);
  chmodSync(helper, 0o755);
  console.log(`> Restored the executable bit on ${helper}`);
} catch (error) {
  // A missing helper is not ours to fix and not ours to fail on: `node-pty` built from source
  // puts one in `build/Release` instead, and that one comes out of `node-gyp` executable.
  if (error.code !== 'ENOENT') throw error;
}
