# Local Claude: common Git writes and loopback

6 September 2026. Real `ClaudeAgentRuntime` → ACP bridge → pinned Claude CLI
2.1.260 on macOS, with empty HOME/config and deterministic localhost Messages API.
No operator credentials, real provider account or remote inference was used.

- Negative control: without additional common Git paths, a nested worktree's
  `git add` fails creating `.git/worktrees/one/index.lock`: Operation not permitted.
- Corrected ordinary worktree: `git add` and `git commit` succeed with the expected
  commit present. An actual Node listener binds 127.0.0.1 successfully.
- Corrected nested workspace: both selected repositories commit successfully and
  loopback binding succeeds. Each case receives one explicit test approval.

The adapter now allows writes to the exact common Git directories derived from
selected repositories and enables `network.allowLocalBinding`. It still requires
native protection and permits no unsandboxed fallback. An earlier attempt wrapped
the CLI in another Seatbelt profile and failed at nested `sandbox_apply`; that was
fixture interference and is not evidence about Git paths.

Reproduce with [the fixture](79-claude-git-sandbox-fixture.mjs); checked observations
are in [the results](79-claude-git-sandbox-results.json). Verify saved assertions:
`node .scratch/machines/research/79-claude-git-sandbox-fixture.mjs --verify-results`.
This establishes pinned macOS behavior. Linux/bubblewrap/socat and authenticated
provider turns remain separate acceptance checks.

Primary settings references: [Claude sandboxing](https://code.claude.com/docs/en/sandboxing)
and [Claude settings](https://code.claude.com/docs/en/settings).
