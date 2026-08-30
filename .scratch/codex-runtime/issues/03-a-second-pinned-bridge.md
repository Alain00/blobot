Type: task
Status: open

# A second pinned bridge, and the part of `stdio-bridge.ts` that was never Claude's

## Problem

`adapters/claude/stdio-bridge.ts` does five things, and only one of them is about Claude:

1. Pins one bridge version exactly and checks it loudly (`BRIDGE_VERSION`, `BRIDGE_PACKAGE`).
2. Resolves the bridge's `dist/index.js` out of that dependency rather than `npx`-ing it, from
   two anchors, because the file gets bundled and the Electron main bundle's `node_modules` chain
   is the app's rather than core's.
3. Spawns it under `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, one process per agent.
4. Points the bridge at **the user's own binary** through an environment variable, so the bridge
   does not silently run its bundled copy.
5. Names that environment variable `CLAUDE_CODE_EXECUTABLE`.

Only 5 is Claude's. Codex needs 1 through 4 identically, with `CODEX_PATH` in place of the name,
and it needs 4 more than Claude does: `codex-acp` depends on `@openai/codex` at `^0.148.0`, a
caret range, so without `CODEX_PATH` blobot does not know which Codex is running and the user's
own install is not the one answering.

This is the same lesson `adapters/acp/` already recorded once, when the JSON-RPC layer, the child
transport, the wire shapes and the `session/update` translation turned out to be the protocol's
shape rather than a provider's. Spawning a pinned npm ACP bridge is the second such shape.

## What to do

- Lift 1 through 4 into `adapters/acp/npm-bridge.ts`, parameterised by package name, pinned
  version, entry path, the executable environment variable's name, and the `BLOBOT_*_BRIDGE`
  override. Keep the error text's shape: it names the package, the pin, and everything it tried.
- Rewrite `adapters/claude/stdio-bridge.ts` as a call into it. Its tests should keep passing
  unchanged; if they do not, the generalisation took something with it.
- Add `@agentclientprotocol/codex-acp` at an exact pin -- 1.7.0 as of 2026-08-30 -- to
  `packages/core/package.json` **and** to the desktop app's, for the same reason the Claude pin is
  in both places.
- `adapters/codex/stdio-bridge.ts` sets `CODEX_PATH` from detection, and sets `NO_BROWSER=1` and
  `APP_SERVER_LOGS` where blobot wants them. Do not set `CODEX_API_KEY` or `OPENAI_API_KEY` from
  anything: see ticket 04.

## Watch for

The bridge is a Node program and Claude's is too, so nothing new is required of the runtime
environment. But `codex-acp` ships standalone binaries as well, and the temptation to use one
should be resisted for the same reason `npx` was: a pinned dependency resolved from disk is the
only version story that survives a first run with no network.
