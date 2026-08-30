Type: task
Status: resolved

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

## Answer

Built, 2026-08-30. `adapters/acp/npm-bridge.ts` is the shared half, and it is the second time the
shared half turned out to be the protocol rather than the vendor -- after JSON-RPC, the child
transport, the wire shapes and the `session/update` translation.

A bridge is now a **`NpmBridgeSpec`: five names and nothing else** -- package, exact pin, entry
path, override variable, the user's binary, the variable the bridge reads to find it, plus how the
agent and the CLI are named in the two sentences a failure produces. `spawnNpmBridge`,
`bridgeEntryPathOf` and `resolveBridgeExecutable` take one and do the four general things. The
error text keeps its shape: it names the package, the pin, the override and everything it tried.

`adapters/claude/stdio-bridge.ts` is now `CLAUDE_BRIDGE` plus four one-line calls, and it still
exports `BRIDGE_VERSION`, `BRIDGE_PACKAGE`, `bridgeEntryPath`, `resolveClaudeExecutable`,
`spawnClaudeBridge` and both option types unchanged, because `claude-agent-runtime.ts`,
`index.ts` and `fake-bridge.ts` all read them. `claudeExecutable` stays the Claude-facing option
name -- the generalisation is under it, not through it, and `runtime-for.ts` did not move.
`npm-bridge.test.ts` is new and covers what had no test before: the real pin resolving on disk,
the override winning ahead of it, an empty override not counting as an answer, the error text's
four parts, the explicit / environment / `PATH` ladder, and a named binary that is missing being
an error rather than a fall-through to `PATH`.

`@agentclientprotocol/codex-acp@1.7.0` is pinned exactly in `packages/core` **and** in the
desktop app, for the reason the Claude pin is in both. `adapters/codex/stdio-bridge.ts` is
`CODEX_BRIDGE` and its spawn.

**Read off the installed package, not the documentation** (the README is now on disk): the six
variables are `CODEX_PATH`, `CODEX_CONFIG`, `DEFAULT_AUTH_REQUEST`, `INITIAL_AGENT_MODE`,
`NO_BROWSER` and `APP_SERVER_LOGS`, exactly as the spec read them. Two facts the spec did not
have:

- **`@openai/codex@0.148.0` came down with it**, platform binary and all. So the caret range is
  not hypothetical and `CODEX_PATH` is not an optimisation: a bridge started without it runs a
  Codex that arrived as a transitive dependency of blobot's own `node_modules`.
- **There is a runnable Codex on this machine now**, which is a cheaper door into ticket 01 than
  a global install -- though the login is still the user's to do, and `CODEX_PATH` must still
  point at *their* binary in anything that ships.

Two decisions inside the spawn, both ticket 04's to overturn:

- **`NO_BROWSER=1` is set.** It hides the ChatGPT auth method, which is the one of the three the
  bridge advertises that blobot answers with the CLI's own `codex login` on a PTY instead.
  `CODEX_API_KEY` and `OPENAI_API_KEY` are populated from nothing, ever.
- **`APP_SERVER_LOGS` is deliberately not set.** The bridge's stderr already reaches `onStderr`;
  a log directory is a pile of files on the user's disk that nothing in blobot would clean up or
  ever show them.

Not verified live: nothing has been spawned. The bridge resolves, and that is all this ticket
claims. Typecheck, tests and build pass -- 393 in core, 248 in the desktop app.
