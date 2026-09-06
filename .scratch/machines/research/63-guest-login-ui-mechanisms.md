# Guest login without a visible terminal

Date: 2026-09-06. Bounded source investigation for **A Machine on screen, and where
a profile is addressed from**. No VM, engine, provider CLI, login, credential,
session or inference was invoked. Only this note was added to the repository.

**Finding:** a common UI can present browser links, one-time codes, choices and
manual authorization-code input while the vendor CLI keeps OAuth and credential
storage inside the Agent's guest. There is no single existing login protocol
covering all five runtimes. Hiding the terminal does not remove provider selection,
team selection, manual-code input or loopback callback requirements.

Labels below: **[S]** inspected exact release source; **[D]** current official
documentation; **[I]** implementation implication; **[U]** unverified. An available
code path is not evidence of a successful account login in blobot's images.

## Sources and limits

- Codex `rust-v0.151.0`: [commit 78c290807ce710180111df227df3b7a4fe845452](https://github.com/openai/codex/tree/78c290807ce710180111df227df3b7a4fe845452).
  codex-acp `v1.7.0`: [commit 2b48e9822330fc09f3a94a81563e5c4bb779601a](https://github.com/agentclientprotocol/codex-acp/tree/2b48e9822330fc09f3a94a81563e5c4bb779601a).
- OpenCode `v1.18.4`: [commit 49c69c5ed3ccf706b61b3febb43c8aaff7f8325e](https://github.com/anomalyco/opencode/tree/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e).
- fx `v0.0.7`: [commit cef08aa0f178537e552a931c7863dc4c1487e4a0](https://github.com/vercel-labs/fx/tree/cef08aa0f178537e552a931c7863dc4c1487e4a0).
  The existing local `login_flow.zig` was compared byte-for-byte with this commit.
- Cursor `2026.09.02-c22c1a3`: JavaScript shipped in the [official Linux arm64 archive](https://downloads.cursor.com/lab/2026.09.02-c22c1a3/linux/arm64/agent-cli-package.tar.gz).
  Archive provenance is recorded in [43](43-cursor-codex-inner-sandbox.md).
  Rehashed `index.js`: `ce5bab7bc0751c3c20bf5bda9253d515452684d7ba2f0cea5701f59eaafff05a`;
  `7792.index.js`: `5854dd4d8899e9eba0af3fbd3227b93e7775a48e28cfb2fc0054907b686df18e`.
- Claude `2.1.260`: embedded JavaScript in the previously installed official
  [native executable](/Users/guillermo/.local/share/claude/versions/2.1.260), SHA-256
  `3c269f66801028823e24a63ced9fdd3988cb86cf85fccd9f03f87e463b9d3e3c`.
  This is the **macOS executable**, also identified by [42](42-claude-native-sandbox-policy.md).
  The inspected OAuth/command code establishes that release's mechanisms; it is
  not a fresh inspection or execution of the Linux guest binary. Linux callback,
  browser-opener and credential-storage behavior remains an image acceptance check.

Public source copies used here are under `/private/tmp/blobot-guest-login-source`;
Cursor and fx reuse `/private/tmp/blobot-runtime-inputs-research`. They contain
source, not login output. The repository's [first-box evidence ledger](53-first-box-evidence-ledger.md)
already states that real vendor sign-in, callback completion and login persistence
have not been demonstrated by the synthetic guest-login fixture.

## Per-runtime mechanisms

| Runtime | Public guest command / control | Browser return and required UI interaction |
| --- | --- | --- |
| Claude | `claude auth login`; optional `--claudeai`, `--console`, `--email EMAIL`, `--sso` | Printed manual URL returns a one-use `code#state` for stdin. Automatic browser URL instead returns to guest `localhost:<port>/callback`. |
| Codex | `codex login --device-auth` | URL + one-time user code; CLI polls. No inbound callback required by this path. Account/workspace must allow device auth. |
| OpenCode | `opencode auth login --provider ID --method LABEL` | Provider-specific: device polling, loopback callback, manual code or API key. Flags skip provider/method pickers, not a method's additional prompts. |
| fx, Gateway | `fx login`, with `FX_NO_OPEN_BROWSER=1` | Device URL/code, then possible Vercel-team choice. No inbound callback for Gateway. |
| fx, Codex / Grok | `fx login codex` / `fx login grok`, with `FX_NO_OPEN_BROWSER=1` | Codex requires guest loopback callback. Grok has loopback plus a manual-code stdin fallback. These are distinct routes. |
| Cursor | `cursor-agent login`, with `NO_OPEN_BROWSER=1` | Printed URL, remote browser completion and polling from CLI. No local callback or required stdin selection in the inspected login command. |

### Claude 2.1.260

**[S]** The command registers exactly the flags in the table. `--console` and
`--claudeai` together fail; the default is Claude subscription unless managed
settings force another method. Managed `forceLoginMethod: gateway` makes this
command fail and directs the user to interactive `/login`. Do not silently turn a
subscription login into Console billing. The public documentation also describes
the Console/SSO/email options. [CLI reference](https://code.claude.com/docs/en/cli-reference).

**[S]** `authLogin` constructs a readline interface on stdin; each line is split
as `authorizationCode#state`. It prints the **manual** authorize URL and a paste
prompt. `startOAuthFlow` generates PKCE and state inside the CLI, also starts a
local callback listener, and separately attempts to open the automatic browser
URL. The printed URL uses `https://platform.claude.com/oauth/code/callback` as
redirect; the automatically opened URL uses `http://localhost:<port>/callback`.
The CLI exchanges the returned code itself and saves the resulting credential.
There is no public `--no-browser` flag on **`auth login`** in this pin: the similarly
named flag found in the binary belongs to **`mcp login`**. An internal
`skipBrowserOpen` option is not a public argv contract.

Reproduction anchors for static reading, byte offsets in the executable above:
command declaration `169646782`; `authLogin` function `176927744`; OAuth class
`171998006`; authorize URL builder `158287716`; production endpoint constants
`156112802`. Names are minified and recur in other chunks: offsets and context
matter.

**[I] Minimum UI:** open the CLI's printed manual URL, display a one-time
authorization-code input, and forward the submitted line to that same owned guest
process. Keep input only for this attempt and clear it after delivery/cancel.
This handles a sensitive one-use authorization code, not an API key or saved
refresh token. It requires no host credential import or token exchange by blobot.
Merely forwarding the URL intercepted from a browser opener can select the
automatic loopback route instead and leave login waiting on an unreachable guest
callback. **[U]** Linux text framing, automatic opener behavior, callback listener
availability and real manual completion remain unmeasured.

### Codex 0.151.0 and bridge 1.7.0

**[S]** `--device-auth` is a public flag. That explicit command calls device auth,
prints its verification URL/code and exits nonzero on failure; it does **not**
silently switch to a browser callback. Bare `codex login` has a separate headless
path that can fall back to the loopback server when device auth is unavailable.
Device auth polls from the CLI and exchanges/persists tokens there. Its displayed
code expires in 15 minutes. [Flag](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/cli/src/main.rs#L517),
[explicit command and separate fallback](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/cli/src/login.rs#L319),
[device prompt and completion](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/login/src/device_code_auth.rs#L149).

**[D] Real availability condition:** the user or workspace admin must enable
device-code login. Current docs identify it as beta. The documented cache-copy
fallback conflicts with this task's no-host-login-copy requirement; a loopback
forward would be a separate transport capability, not something open outbound
networking provides. [Headless login](https://learn.chatgpt.com/docs/auth#login-on-headless-devices).

**[S] A structured alternative already exists upstream:** codex-acp 1.7.0 exposes
`chat-gpt-device-code` when the client advertises URL elicitation. It calls
app-server `account/login/start` with `type: chatgptDeviceCode`, receives
`verificationUrl`, `userCode`, `loginId`, emits a URL elicitation and waits for
login completion; cancellation calls `account/login/cancel`. `NO_BROWSER` hides
the ordinary browser method but does not hide the device method. This avoids a
CLI-text parser if blobot adds that ACP capability; it is not currently provided
by the generic remedy row. [Method advertisement](https://github.com/agentclientprotocol/codex-acp/blob/2b48e9822330fc09f3a94a81563e5c4bb779601a/src/CodexAuthMethod.ts#L72),
[device elicitation and cancellation](https://github.com/agentclientprotocol/codex-acp/blob/2b48e9822330fc09f3a94a81563e5c4bb779601a/src/CodexAcpClient.ts#L194).

**[I] Minimum CLI route:** fixed `login --device-auth`, a pin-specific parser for
the displayed URL/code, a browser button and waiting/cancel states. Do not pass
`--with-api-key` or `--with-access-token`. A new login clears existing Codex auth
before attempting its replacement; cancellation is not a promise to preserve an
old login. [Replacement ordering](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/cli/src/login.rs#L335).

### OpenCode 1.18.4

**[S]** `--provider`/`-p` and `--method`/`-m` select provider ID/name and exact
case-insensitive method label. Without them the CLI prompts. A method can still
define conditional select/text prompts; its OAuth result can say `auto` (await
callback/poll) or `code` (read an authorization code). A provider without a
handled OAuth method falls through to an API-key password prompt.
[Public flags](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/cli/cmd/providers.ts#L299),
[method prompts and OAuth handling](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/cli/cmd/providers.ts#L39),
[key fallback](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/cli/cmd/providers.ts#L480).

Concrete examples from built-in plugins, not a promise for every provider:

- `opencode auth login --provider openai --method 'ChatGPT Pro/Plus (headless)'`
  uses device URL/code and polling. The separate `ChatGPT Pro/Plus (browser)`
  method uses `localhost:1455/auth/callback`.
  [Exact methods](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/openai/codex.ts#L429).
- `--provider xai --method 'xAI Grok OAuth (Headless / Remote / VPS)'` uses
  device authorization. The normal subscription method uses a callback server.
  [Exact methods](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/xai.ts#L551).
- GitHub Copilot's OAuth method asks GitHub.com versus Enterprise and, when
  applicable, an enterprise URL before device authorization.
  [Additional prompts](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/github-copilot/copilot.ts#L182).

**[S] Structured alternative:** the provider-auth service exposes method lists
with prompts, `authorize -> {url, method, instructions}`, and `callback` with an
optional code. The pending OAuth exchange and credential save stay in the
OpenCode service. HTTP routes exist for `/provider/auth`,
`/provider/:providerID/oauth/authorize` and `/provider/:providerID/oauth/callback`.
The inspected HttpApi group labels itself experimental; this is not evidence of
an already admitted guest HTTP transport in blobot.
[Typed service](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/provider/auth.ts#L17),
[routes](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/server/routes/instance/httpapi/groups/provider.ts#L36).

**[I/U]** The narrow CLI mechanism is a chosen, supported OAuth method plus its
known prompts. A generic UI cannot honestly promise browser login for every
OpenCode provider; key-only methods need a different authorized credential route.
Do not auto-select the first provider or silently fall through to API-key capture.
Provider/method metadata can vary with installed plugins and configuration.

### fx 0.0.7

**[S/D] Gateway:** `fx login` uses Vercel device authorization, prints a URL plus
code, polls, then saves its own OAuth session. `FX_NO_OPEN_BROWSER=1` suppresses
browser opening. After authorization it fetches teams: zero gives no selection,
one is selected directly, **multiple teams require a choice**. With non-TTY stdin
or stdout, it prints numbered options and reads a line; a PTY uses its key-driven
picker. Empty input selects the default, so do not close stdin or auto-send Enter
to make an unseen choice disappear. [Login flow](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/login_flow.zig#L553),
[team selection](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/login_flow.zig#L1109),
[official authentication docs](https://fx.sh/docs/getting-started/authentication).

**[S] Subscription routes differ:** `fx login codex` uses browser PKCE and a
listener on localhost port 1455 or 1457. Its CLI loop has no manual-code stdin
fallback and no public device-auth flag was found in this route. Suppressing
browser opening only prints the URL; it does not remove the callback requirement.
`fx login grok` uses a dynamically allocated `127.0.0.1` callback port and also
accepts the code displayed by xAI on stdin when the browser does not return.
[Codex callback](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L98),
[Codex CLI wait](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L346),
[Grok CLI fallback](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/grok_oauth.zig#L376).

**[I] Minimum Gateway UI:** URL/code plus a team-choice event if the CLI asks,
forwarding only a validated selected index. A non-TTY guest child simplifies its
line protocol; the current `signInRuntime` transport forces `-it`, so this is an
actual transport change, not merely hiding xterm. Retaining a hidden PTY instead
needs a tested picker parser/keystroke driver. Do not substitute Gateway for an
already chosen subscription provider. **[U]** fx Codex needs an admitted callback
relay or a different vendor-supported route before it can finish from a host
browser; no such relay was established here. Login success alone does not prove
Gateway billing/access, as the CLI itself states.

### Cursor 2026.09.02-c22c1a3

**[S]** The root `login` command explicitly documents `NO_OPEN_BROWSER`. Module
`src/commands/login.ts` in `7792.index.js` generates a login URL through
`cursor-config/dist/auth/login.js`, prints it, waits for the result and calls the
credential manager's `setAuthentication` inside the guest process. It has no
required provider picker or pasted-code step. Optional `q` displays a QR code
when attached to a TTY; it is not required for login.

**[S]** The auth module in `index.js` creates a random verifier, SHA-256 challenge
and UUID; the browser URL is `/loginDeepControl` with challenge/UUID,
`mode=login` and `redirectTarget=cli`. The CLI polls `/auth/poll` using the UUID
and verifier. The returned tokens are consumed by the CLI, not printed as login
progress. No loopback HTTP listener is present on this path. Static anchors:
root command near offset `1611097`; auth URL/polling near `4059538`/`4060148`.
[Official command and browser flow](https://cursor.com/docs/cli/reference/authentication).

**[I] Minimum UI:** fixed command and `NO_OPEN_BROWSER=1`, extract its displayed
login URL, present a browser button and waiting/cancel state, and re-probe inside
the same Agent's guest after exit. There is no need to export a host Cursor login
or to recreate its polling request in blobot. **[U]** Successful token storage and
survival across image/guest lifecycle remain real-login acceptance tests.

## Smallest common UI contract and remaining checks

**[I]** Keep the vendor-specific mechanism below a provider-agnostic screen. A
login attempt can expose `starting`, `open-url` (optional user code),
`choose-option`, `enter-authorization-code`, `waiting`, `checking`, and a terminal
outcome. Each attempt belongs to one Agent, one admitted guest and one owned
process; accepted input belongs only to its current prompt. This does not require
storing access/refresh tokens or changing the inference adapter's permissions.

Use fixed argv/known method IDs, not arbitrary commands supplied by the renderer.
Only the CLI should exchange OAuth codes and write its login. URLs and one-time
codes/input are ephemeral, excluded from transcript, settings, telemetry and
persisted raw terminal output. A pin-specific text parser is an implementation
contract to test, not a vendor promise of stable machine-readable stdout. An
unexpected prompt must be reported as unsupported/failed rather than treated as
success or answered with a default. Structured upstream methods are alternatives
where available, not a universal ACP authentication facility.

The existing [guest sign-in owner](../../../packages/core/src/machines/sbx/owned-machine.ts#L92)
already requires an admitted awake guest without active Agent transports, runs as
UID1000 in `/home/agent`, then rechecks engine/identity and performs a fresh
Agent-scoped probe. Its current contract is an opaque watched PTY with the bare
commands from [remedies](../../../packages/core/src/detect/remedies.ts#L68); it has
no normalized challenges, selectable methods, manual-code input or non-TTY mode.
Engine readiness remains separate from runtime login.

Before claiming this UI works in an image, the remaining validation is specific:
parser fixtures for chunked/ANSI output and unexpected prompts; routing/cancel
tests proving no cross-Agent input; real callback/manual/device completion where
applicable; actual guest credential save and fresh status; persistence after
stop/start. No inference is necessary merely to check stored-login presence.
That presence and a zero exit code still do not certify account entitlement,
billing, refresh validity or a successful model request. None of those outcomes
was invented or tested by this source investigation.
