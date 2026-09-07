# The first box, measured

**Ticket 16's record.** Six items; **only section (5) is filled so far**. Sections (1) to (4)
and (6) are the `sbx` half and wait on `sbx login`, which is the user's act (`research/02` §4)
and had not happened when this was written. Nothing in an empty section is a no.

Observed 2026-09-04 on Guillermo's Mac: Darwin 25.6.0, arm64, `/usr/bin/sandbox-exec` present.
`claude` 2.1.260 (`~/.local/bin/claude` → `~/.local/share/claude/versions/2.1.260`, a Mach-O
arm64 binary), the pinned bridge `@agentclientprotocol/claude-agent-acp@0.70.0`, its SDK
`@anthropic-ai/claude-agent-sdk@0.3.232`, vitest 4.1.11. [OBS] marks a thing that was run and
seen here; [DOC] marks a line read from a vendor's own source, binary or documentation, and is
kept out of the tables.

## (1) The mailbox from inside a `shell` sandbox

Not run. Waits on `sbx login`.

## (2) `sbx create --clone` on a worktree plus its repository

Not run. Waits on `sbx login`.

## (3) RAM, disk and boot time of an empty sandbox

Not run. Waits on `sbx login`.

## (4) Docker's own claude image reaching the mailbox

Not run. Waits on `sbx login`.

## (5) Claude's own sandbox through `_meta`, live [OBS]

**Question.** Does a `sandbox` object in `_meta.claudeCode.options` reach the Claude Agent SDK
through the bridge, and when it does, does Claude's own sandbox keep blobot's loopback mailbox
reachable from a Bash tool call? `research/02` §3 had the route by source only; `research/04`
*Costs a turn* §1 wrote the test. Two real turns were spent of the three allowed; the third was
reserved for ambiguity and neither turn was ambiguous.

### Answer in one paragraph

**Yes, it reaches the SDK unedited, and the fence it raises is real on all three axes**:
`~/.ssh` became unreadable, egress to an unlisted domain raised a permission request and stayed
blocked, and the loopback mailbox was reachable from Bash **only with
`network.allowLocalBinding: true`** — without it the connect is refused silently, with no prompt
and no violation report. The mailbox's own MCP handshake (in-process, not Bash) succeeded in both
turns before the prompt was sent, which is `research/04`'s *every sandbox fences the shell, never
the CLI* seen a third time. No permission request arrived for any of the Bash commands
themselves, and no unsandboxed retry was attempted.

### How it was run

- A throwaway repository under the session scratchpad with one commit (`HELLO.txt`), used as
  `cwd`. Nothing was written into it.
- `PeerMessageServer` on `127.0.0.1` with an ephemeral port (64446 in A, 64563 in B), one
  endpoint minted for `alice`, handed as the adapter's ordinary `mcpServers` entry with the
  bearer.
- `ClaudeAgentRuntime` with `trust: 'trusting'`, so `allowedTools` carried `Bash(ls:*)`,
  `Bash(wc:*)`, `Bash(echo:*)` from `VOUCHED_BASH` and `Bash(curl:*)` from `TRUSTING_BASH`
  (`permissions.ts`; `curl` is vouched at no lower level).
- The adapter has no hook for extra `_meta` options and its `#sessionParams` is private, so the
  probe **wrapped the transport** through the adapter's injectable `spawn` and rewrote the one
  `session/new` line on its way out, adding `sandbox` to `_meta.claudeCode.options`. Nothing in
  `packages/` was changed; the probe file was deleted after and `git status` is clean of it.
- Permission handler: record the request, then choose `reject_once` when offered, else cancel,
  so the measurement stays inside the fence.
- One new bridge process and one new session per turn (`session/new`, never `session/load`).

The exact `_meta` sent on `session/new` in Turn A, captured on the wire (Turn B differs in one
boolean, `allowLocalBinding: false`):

```json
{"systemPrompt":"You are Alice. Do exactly what is asked, with no commentary.",
 "claudeCode":{"options":{
   "disallowedTools":["SendMessage","ListAgents"],
   "settingSources":["user","project","local"],
   "allowedTools":["Edit","Write","MultiEdit","NotebookEdit",
     "Bash(ls:*)","Bash(cat:*)","Bash(head:*)","Bash(tail:*)","Bash(wc:*)","Bash(pwd:*)","Bash(echo:*)",
     "Bash(which:*)","Bash(file:*)","Bash(stat:*)","Bash(date:*)","Bash(du:*)","Bash(find:*)","Bash(grep:*)",
     "Bash(rg:*)","Bash(tree:*)","Bash(diff:*)","Bash(sort:*)","Bash(uniq:*)","Bash(basename:*)",
     "Bash(dirname:*)","Bash(realpath:*)","Bash(git status:*)","Bash(git diff:*)","Bash(git log:*)",
     "Bash(git show:*)","Bash(git branch:*)","Bash(git add:*)","Bash(git commit:*)","Bash(git checkout:*)",
     "Bash(git switch:*)","Bash(git restore:*)","Bash(git stash:*)","Bash(git rev-parse:*)",
     "Bash(git ls-files:*)","Bash(git blame:*)","Bash(git fetch:*)","Bash(git pull:*)","Bash(git merge:*)",
     "Bash(git rebase:*)","Bash(git reset:*)","Bash(git tag:*)","Bash(git describe:*)","Bash(git config:*)",
     "Bash(git apply:*)","Bash(git cherry-pick:*)","Bash(gh pr view:*)","Bash(gh pr list:*)",
     "Bash(gh pr diff:*)","Bash(gh pr checks:*)","Bash(gh pr status:*)","Bash(gh issue view:*)",
     "Bash(gh issue list:*)","Bash(gh issue status:*)","Bash(gh repo view:*)","Bash(gh repo list:*)",
     "Bash(gh run view:*)","Bash(gh run list:*)","Bash(gh workflow view:*)","Bash(gh workflow list:*)",
     "Bash(gh release view:*)","Bash(gh release list:*)","Bash(gh label list:*)","Bash(gh search:*)",
     "Bash(gh auth status:*)","Bash(npm test:*)","Bash(npm run:*)","Bash(npm ls:*)","Bash(pnpm test:*)",
     "Bash(pnpm run:*)","Bash(pnpm ls:*)","Bash(pnpm build:*)","Bash(yarn test:*)","Bash(yarn run:*)",
     "Bash(bun test:*)","Bash(bun run:*)","Bash(make:*)","Bash(cargo test:*)","Bash(cargo build:*)",
     "Bash(cargo check:*)","Bash(go test:*)","Bash(go build:*)","Bash(go vet:*)","Bash(pytest:*)",
     "Bash(vitest:*)","Bash(jest:*)","Bash(tsc:*)","Bash(node:*)","Bash(python:*)","Bash(python3:*)",
     "Bash(ruby:*)","Bash(mkdir:*)","Bash(touch:*)","Bash(cp:*)","Bash(mv:*)","Bash(sed:*)","Bash(awk:*)",
     "Bash(tee:*)","Bash(ln:*)","Bash(curl:*)","Bash(wget:*)","Bash(npm install:*)","Bash(npm ci:*)",
     "Bash(npx:*)","Bash(pnpm add:*)","Bash(pnpm dlx:*)","Bash(pnpm install:*)","Bash(yarn add:*)",
     "Bash(yarn install:*)","Bash(bun add:*)","Bash(bun install:*)","Bash(pip install:*)",
     "Bash(pip3 install:*)","Bash(cargo add:*)","Bash(go get:*)","mcp__blobot"],
   "sandbox":{"enabled":true,"failIfUnavailable":true,
     "network":{"allowedDomains":["api.anthropic.com"],"allowLocalBinding":true},
     "filesystem":{"denyRead":["~/.ssh"]}}}}}
```

The prompt, verbatim, with the port substituted per turn:

> Using Bash only, run these three commands and report each result on its own line, verbatim,
> nothing else: `ls ~/.ssh | wc -l`; `curl -s --max-time 4 http://127.0.0.1:<PORT>/ || echo
> BLOCKED`; `curl -s -o /dev/null -w '%{http_code}' --max-time 6 https://example.com/ || echo
> BLOCKED`

The host answers `ls ~/.ssh | wc -l` with `7`. The mailbox answers an unauthenticated `GET /`
with `401` and a JSON-RPC body, so any body at all means the connection was made.

### The three lines per turn

| turn | sandbox | `ls ~/.ssh \| wc -l` | `curl 127.0.0.1:<port>/` | `curl https://example.com/` |
|---|---|---|---|---|
| **A** | `enabled`, `failIfUnavailable`, `allowedDomains: [api.anthropic.com]`, **`allowLocalBinding: true`**, `denyRead: [~/.ssh]` | `ls: /Users/guillermo/.ssh: Operation not permitted` then `0` | `{"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"unauthorized"}}` — **reached**; the mailbox logged `401 GET /` | `000BLOCKED` + `<sandbox_violations> deny network-outbound example.com:443 (user denied) </sandbox_violations>` — **fenced**, after a `SandboxNetworkAccess` request was rejected |
| **B** | same, **`allowLocalBinding: false`** | `ls: /Users/guillermo/.ssh: Operation not permitted` then `0` | `BLOCKED` — **fenced**; no mailbox log line, **no prompt, no `<sandbox_violations>`** | `000BLOCKED` + the same violations block, after the same request was rejected |
| C | `{enabled: true}` alone | not run | not run | not run |

Per turn, the rest of the record:

| | A | B |
|---|---|---|
| `session/new` accepted `_meta` | yes, session `29b963be-…` | yes, session `bbc3696e-…` |
| `failIfUnavailable` path | not taken: the sandbox was available | same |
| mailbox handshake before the prompt (`whenReady`) | `true` | `true` |
| permission requests | **one**: `SandboxNetworkAccess`, `rawInput {"host":"example.com"}`, options `Deny` (`reject_once`) / `Allow Once` (`allow_once`) / `Always Allow` (`allow_always`) | the same one |
| requests for the Bash calls | none | none |
| unsandboxed retry (`dangerouslyDisableSandbox`, a "Bash command (unsandboxed)" title) | none | none |
| `usage_updated`, first → last | 32,862 → 34,672 of 1,000,000 | 32,862 → 33,829 of 1,000,000 |
| `costUsd` as the bridge reported it | 0.75513 | 0.51910925 |
| `stopReason` | `end_turn` | `end_turn` |
| wall time (vitest) | 25.4 s | 29.1 s |
| bridge stderr beyond its usual | nothing about the sandbox | nothing about the sandbox |

The agent's own final message in A was the three lines in one code fence; in B it was the three
lines and then a second message, `messageId: msg_unknown`: **"Model fallback: claude-fable-5-1
declined this request (cyber); retried with claude-opus-4-8. The session will continue on
claude-opus-4-8."** A CLI diagnostic in the agent-message voice, the same shape as fx's
(`.scratch/fx-runtime` ticket 05); a probe that curls loopback and a public host trips a cyber
classifier on the default model, and the transcript would draw the fallback as if the agent had
said it.

### What each result means

1. **`~/.ssh` was hidden**, both turns. `denyRead` in `_meta` is honoured, and honoured against a
   path outside the workspace. The `ls` failed with the operating system's own
   `Operation not permitted` and `wc` counted nothing, against a host count of 7.
2. **Loopback reached with `allowLocalBinding: true` and not without it.** The reason is in the
   binary [DOC, strings of `claude` 2.1.260]: the macOS profile builder pushes, only when network
   restriction is on *and* `allowLocalBinding` is set,
   `(allow network-bind (local ip "*:*"))`, `(allow network-inbound (local ip "*:*"))` and
   **`(allow network-outbound (remote ip "localhost:*"))`** — the only rule that admits an
   outbound connection to localhost at all, under a profile that opens with `(deny default)`.
   The docs' one-line description, *"Let sandboxed commands bind to localhost ports on macOS"*
   [DOC, settings reference], undersells it: the key is what lets a shell **connect** to a
   loopback port too, and `research/02` §1's srt measurement was the same rule seen from outside.
   So a shell inside Claude's fence reaches blobot's mailbox on exactly one condition, and that
   condition is a key blobot can set per session from `_meta`.
3. **The loopback refusal is silent.** `example.com` raised a `SandboxNetworkAccess` request and
   left a `<sandbox_violations>` block in the tool result; `127.0.0.1` in B did neither — curl
   exited non-zero, `BLOCKED` printed, and nothing told the model or blobot why. An agent whose
   dev server "will not answer" would have no line in the transcript to explain it.
4. **Egress was fenced, by a prompt and not by a wall.** The unlisted host arrived through the
   ordinary `session/request_permission` channel with the three kinds the adapter already maps,
   so in blobot it would draw as ticket 14's inline block with the agent `waiting` — under the
   tool name `SandboxNetworkAccess`, which the block would show as its title. Rejected, the
   command saw `000` and the violations block named the host and port. The docs say the sandbox
   *"pre-allows no domains by default"* and prompts on the first use of a host [DOC, sandboxing
   page, *Network isolation*]; `strictAllowlist: true` would deny without asking and is honoured
   from the `--settings` layer, which is the layer `_meta` lands in (see 6) — not measured.
   **`Always Allow` here writes a `WebFetch(domain:…)` allow rule to local settings** per the
   same page; where that file is for a blobot agent (the workspace's
   `.claude/settings.local.json`, as ticket 14 measured for `allow_always` on edits) is not
   measured.
5. **No permission request for any Bash call, and two explanations that this run cannot
   separate**: every verb used was in `allowedTools` at `trusting`, and
   `autoAllowBashIfSandboxed` defaults to `true` [DOC, CLI schema: *"still defaults to true, so
   sandboxed commands keep running without prompts"*]. If the second is what did it, a sandbox
   makes blobot's vouched list irrelevant for sandboxed commands and prompts only on what the
   fence refuses — which is a different posture from ticket 14's, and the reason Turn C should
   be spent as `sandbox: {enabled: true}` **with `trust: 'careful'`** (an empty `allowedTools`)
   rather than as the plain defaults probe. Left unspent here, deliberately.
6. **The route, by source** [DOC]. The bridge spreads `...userProvidedOptions` into the SDK
   options (`dist/acp-agent.js` line 4870), then sets `settings` only if `_meta` carried one or
   `CLAUDE_MODEL_CONFIG` is set (lines 4829–4871); neither was, so `sandbox` survived the spread.
   The SDK then **folds `sandbox` into the `settings` option**, which is the `--settings` flag
   layer — `sdk.mjs` line 118: `n.settings = Se({...settings, sandbox: r})` — and throws
   `"Cannot use both a settings file path and the sandbox option"` if `settings` is a path. Two
   consequences. First, the sandbox rides the highest user-controlled settings tier, which is why
   `denyRead` and any of the *user-or-managed-only* keys (`strictAllowlist`, `allowAppleEvents`,
   `tlsTerminate`) should be honoured from `_meta`; only `denyRead` was measured. Second, **the
   SDK forces `failIfUnavailable: true` when `enabled` is true and the key is absent** (the same
   line: `t.enabled===!0&&t.failIfUnavailable===void 0?{...t,failIfUnavailable:!0}:t`), while the
   CLI's own schema text says *"When false (default), a warning is shown and commands run
   unsandboxed"*. `research/02` §3's "defaults **true**" is the SDK's default and not the CLI's;
   both are true of their own caller. Since the probe set it explicitly, neither default was
   exercised.
7. **The `failIfUnavailable` path was not taken** — `sandbox-exec` is present — and `session/new`
   did not reject `_meta`. What a machine without the dependency says is unmeasured; by the
   docs it is a startup error rather than a silent unsandboxed run.
8. **Ticket 16's second half of item 5 — does a real `claude` under an srt fence authenticate
   from the Keychain — is not measured by this**, and must not be read as measured. The SDK
   sandbox fences Bash and its children only; the CLI process that holds the login was outside
   the fence in both turns, which is why it authenticated at all. The test that answers it is a
   different one: wrap the bridge (`node dist/index.js`) itself in `srt` or `sandbox-exec` and
   read `initialize.authMethods` and the first turn's `initialize` result.
9. **Two lines the bridge printed that are about the adapter, not the sandbox.** On both starts:
   `[CLAUDE_SDK_CAN_USE_TOOL_SHADOWED] Warning: canUseTool will not be invoked for: Edit, Write,
   MultiEdit, NotebookEdit, mcp__blobot. Bare allowedTools entries auto-approve the whole tool
   before the callback is consulted.` True of ticket 14's posture since it shipped, said out loud
   by this SDK version; worth one line on ticket 14 and nothing more here.

### What the neighbours take

- **`14` (the engine and the Machine interface)**: `_meta` through the bridge is **yes**, per
  session, with no file written anywhere. The `local` kind's inner fence can be composed by
  blobot at `session/new`, and its vocabulary is the SDK's `SandboxSettings`.
- **`04` (where the boundary goes)**: Claude's fence confines reads (`denyRead`), egress (prompt,
  or `strictAllowlist`), and loopback (`allowLocalBinding`), and the loopback key is the one the
  mailbox-from-a-shell needs. The in-process mailbox needs nothing. The Keychain question stays
  open (8).
- **`02` (can an agent reach the mailbox)**: the MCP client's handshake landed before the prompt
  in both turns, fence or no fence.
- **`15` (egress from a box)**: a domain refusal on this fence is a permission request with a
  host in `rawInput`, and the refusal is written back to the model as a `<sandbox_violations>`
  block naming host and port; a loopback refusal is written back as nothing.

### The probe's source

Deleted from `packages/core/src/adapters/claude/sandbox-probe.live.test.ts` after the runs; kept
here so Alain can repeat it on Linux (`bwrap` and `socat` needed there, per the docs). Run from
`packages/core` as:

```sh
BLOBOT_LIVE_CLAUDE=1 BLOBOT_BOX_REPO=<throwaway git repo> BLOBOT_BOX_OUT=<path>.json \
BLOBOT_BOX_TURN=A pnpm exec vitest run src/adapters/claude/sandbox-probe.live.test.ts
```

```ts
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import { PeerMessageServer } from '../../mcp/peer-message-server.js';
import type { PermissionRequest } from '../../runtime.js';
import { ClaudeAgentRuntime } from './claude-agent-runtime.js';
import { spawnClaudeBridge, type SpawnBridge } from './stdio-bridge.js';

const live = process.env.BLOBOT_LIVE_CLAUDE === '1' ? describe : describe.skip;

const REPO = process.env.BLOBOT_BOX_REPO ?? '';
const OUT = process.env.BLOBOT_BOX_OUT ?? '';
const TURN = process.env.BLOBOT_BOX_TURN ?? 'A';

type Sandbox = Record<string, unknown>;

function sandboxFor(turn: string): Sandbox {
  if (turn === 'C') return { enabled: true };
  return {
    enabled: true,
    failIfUnavailable: true,
    network: { allowedDomains: ['api.anthropic.com'], allowLocalBinding: turn === 'A' },
    filesystem: { denyRead: ['~/.ssh'] },
  };
}

/** Wrap the real bridge; inject `sandbox` into `_meta.claudeCode.options` on `session/new`. */
function injectingSpawn(sandbox: Sandbox, captured: { meta?: unknown }): SpawnBridge {
  return (options) => {
    const inner = spawnClaudeBridge(options);
    return {
      write(line: string): void {
        let out = line;
        try {
          const message = JSON.parse(line) as { method?: string; params?: Record<string, unknown> };
          if (message.method === 'session/new' && message.params !== undefined) {
            const meta = (message.params['_meta'] ?? {}) as Record<string, unknown>;
            const claudeCode = (meta['claudeCode'] ?? {}) as Record<string, unknown>;
            const opts = (claudeCode['options'] ?? {}) as Record<string, unknown>;
            message.params['_meta'] = {
              ...meta,
              claudeCode: { ...claudeCode, options: { ...opts, sandbox } },
            };
            captured.meta = message.params['_meta'];
            out = `${JSON.stringify(message)}\n`;
          }
        } catch {
          // not JSON; pass through
        }
        inner.write(out);
      },
      lines: () => inner.lines(),
      close: () => inner.close(),
      onClose: (listener) => inner.onClose(listener),
    };
  };
}

live('claude sandbox through _meta', () => {
  it(`turn ${TURN}`, async () => {
    expect(REPO).not.toBe('');
    const log: string[] = [];
    const say = (line: string): void => {
      log.push(line);
      process.stderr.write(`${line}\n`);
    };

    const mcp = new PeerMessageServer({
      handler: async () => ({ delivered: true, recipient: 'Bob', status: 'started' }),
      onLog: (line) => say(`[mailbox] ${line}`),
    });
    await mcp.start();
    const endpoint = mcp.endpointFor('alice');
    const port = mcp.port;

    const captured: { meta?: unknown } = {};
    const sandbox = sandboxFor(TURN);
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: REPO,
      persona: 'You are Alice. Do exactly what is asked, with no commentary.',
      trust: 'trusting',
      mcpServers: [
        {
          type: 'http',
          name: 'blobot',
          url: endpoint.url,
          headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }],
        },
      ],
      spawn: injectingSpawn(sandbox, captured),
      onStderr: (line) => say(`[bridge] ${line}`),
    });

    const requests: PermissionRequest[] = [];
    runtime.setPermissionHandler(async (request) => {
      requests.push(request);
      say(`[permission] ${request.title} :: ${JSON.stringify(request.options)}`);
      // Reject rather than allow, so the measurement stays inside the fence. A request arriving
      // at all is the datum.
      const reject = request.options.find((option) => option.kind === 'reject_once');
      return reject?.optionId ?? null;
    });

    let startError: string | undefined;
    try {
      await runtime.start();
    } catch (error) {
      startError = error instanceof Error ? error.message : String(error);
      say(`[start] FAILED: ${startError}`);
    }
    say(`[meta] ${JSON.stringify(captured.meta)}`);

    const events: AgentEvent[] = [];
    let ready: boolean | undefined;
    if (startError === undefined) {
      ready = await mcp.whenReady('alice', 20_000);
      say(`[mailbox] handshake before prompt: ${ready}`);
      const prompt =
        'Using Bash only, run these three commands and report each result on its own line, ' +
        'verbatim, nothing else: `ls ~/.ssh | wc -l`; ' +
        `\`curl -s --max-time 4 http://127.0.0.1:${port}/ || echo BLOCKED\`; ` +
        "`curl -s -o /dev/null -w '%{http_code}' --max-time 6 https://example.com/ || echo BLOCKED`";
      say(`[prompt] ${prompt}`);
      for await (const event of runtime.sendPrompt({ text: prompt, from: 'user' })) {
        events.push(event);
        say(`[event] ${JSON.stringify(event).slice(0, 600)}`);
      }
      await runtime.stop();
    }
    await mcp.stop();

    const record = {
      turn: TURN,
      sandbox,
      metaSent: captured.meta,
      startError,
      mailboxReady: ready,
      permissionRequests: requests,
      messages: events
        .filter((event) => event.type === 'agent_message_completed')
        .map((event) => (event as { text: string }).text),
      toolCalls: events.filter(
        (event) => event.type === 'tool_call_started' || event.type === 'tool_call_updated',
      ),
      usage: events.filter((event) => event.type === 'usage_updated'),
      turnEnded: events.find((event) => event.type === 'turn_ended'),
      errors: events.filter((event) => event.type === 'error'),
      log,
    };
    if (OUT !== '') writeFileSync(OUT, JSON.stringify(record, null, 2));
    say(`[record] written to ${OUT}`);
  }, 300_000);
});
```

### Not run in this section, and why

- **Turn C.** Reserved for an ambiguous A or B; neither was. The version worth spending it on is
  in (5) above: `{enabled: true}` with `trust: 'careful'`, to separate `allowedTools` from
  `autoAllowBashIfSandboxed`, and to see whether the plain defaults admit loopback.
- **`strictAllowlist`**, **`allowUnsandboxedCommands: false`**, and where **`Always Allow`** on
  `SandboxNetworkAccess` writes its rule for a blobot agent: each is one more turn.
- **`failIfUnavailable` on a machine without `sandbox-exec`** (a Linux box without `bwrap`): the
  error text is not recorded here.
- **The Keychain under an outer fence** (8): a different experiment, on the bridge process and
  not on Bash.

## (6) A first hand-built image as an `sbx` template

Not run. Waits on `sbx login`.
