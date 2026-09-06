# Pinned CLI login challenge contracts

Date: 2026-09-06. Follow-up to [63](63-guest-login-ui-mechanisms.md), for a
provider-agnostic UI driven by owned guest processes. **Static research only:** no
CLI execution, VM, engine, login, provider request, credentials or real codes.
Placeholders below describe fields; they are not captured authentication output.

**Finding:** a version-specific parser can recognize these challenge messages,
but terminal text is not a structured authentication protocol. In particular,
OpenCode's `Done` and exit status alone are insufficient, fx Gateway needs stdin
kept open for a possible team selection, and fx Codex requires a callback relay.
Two device verification URL paths remain unverified; issuer URLs must not be
mistaken for the device verification URL.

Labels: **[S]** inspected release/package source, **[D]** official documentation,
**[I]** implementation implication, **[U]** not demonstrated. All behavior here is
source-derived; actual no-TTY bytes and successful Linux guest login remain
acceptance checks. No production or tracker changes are part of this note.

## Provenance and notation

The exact release sources and artifact hashes are recorded in [63](63-guest-login-ui-mechanisms.md#sources-and-limits):
Codex `78c290807ce710180111df227df3b7a4fe845452`, OpenCode
`49c69c5ed3ccf706b61b3febb43c8aaff7f8325e`, fx
`cef08aa0f178537e552a931c7863dc4c1487e4a0`. Cursor uses the official Linux arm64
`2026.09.02-c22c1a3` archive. Claude is embedded JavaScript in the **macOS**
`2.1.260` executable identified in 63; it has not been compared with the Linux
guest artifact. This distinction applies to every Claude format below.

Additional first-party package inspected without executing it:
[`@clack/prompts` 1.0.0-alpha.1](https://registry.npmjs.org/@clack/prompts/1.0.0-alpha.1),
[published tarball](https://registry.npmjs.org/@clack/prompts/-/prompts-1.0.0-alpha.1.tgz),
SHA-1 `8d252f5b3542712f66013acbe96573165065305e`. OpenCode pins this version in
[`package.json:78`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/package.json#L78).
Local source copy: `/private/tmp/blobot-guest-login-source/clack-prompts-1.0.0-alpha.1/package/dist/index.mjs`.

`<url>`, `<code>`, `<state>` and `<name>` mean dynamic fields. `\n` denotes a
newline and `\x20` a literal space. Unless specified otherwise, a prompt is stdout. Formatting controls
must be removed before comparing the visible strings, without rendering them.
No fixed length or alphabet is asserted for server-issued user codes.

## Claude 2.1.260

**[S] Command:** `claude auth login`; choose public `--claudeai` or `--console`
only when that is the selected method. Optional `--email EMAIL` / `--sso` exist.
No public browser-suppression flag was found on this command. The `--no-browser`
flag elsewhere in the binary belongs to `mcp login`, not this flow.

The `authLogin` function prints, in order:

```text
Opening browser to sign in…
If the browser didn't open, visit: <url>
Paste code here if prompted >\x20
```

The last prompt has no trailing newline. `<url>` is passed through hyperlink
helper `jg(..., {assumeSupport:true})`; the helper's exact escape bytes were not
established here. Do not assume this is a plain whitespace-delimited URL.
Source anchors in the hashed executable: command declaration byte `169646782`,
`authLogin` byte `176927744`, OAuth class byte `171998006`.

**[S] URL contract:** the printed manual URL is an authorization URL on
`https://claude.com/cai/oauth/authorize` (Claude subscription) or
`https://platform.claude.com/oauth/authorize` (Console). Its `redirect_uri` is
`https://platform.claude.com/oauth/code/callback`. Relevant parameters include
`code=true`, `response_type=code`, `client_id`, `scope`, `code_challenge`,
`code_challenge_method=S256`, `state`, plus optional login/org hints. Production
constants are at byte `156112802`, URL builder at `158287716`. The separate URL
given to the browser opener uses `http://localhost:<port>/callback`; open the
**printed manual URL** for a UI using pasted-code completion.

**[S] Input:** one stdin line containing `<authorizationCode>#<state>\n`.
The command trims the line and splits on `#`; it requires the first two fields
to be nonempty. Its invalid-input stderr message starts `Invalid code.` and it
keeps listening. The OAuth object's `handleManualAuthCodeInput` resolves only
`authorizationCode`, and token exchange uses the internally generated state;
this code does **not** prove that the pasted state is compared with the attempt.
There is no source-established fixed code length. **[I]** A launcher may enforce
one line, exactly two nonempty fields and equality with the printed URL's state;
that is its own validation, not a vendor guarantee.

**[S] Result:** stdout `Login successful.\n` occurs after credential persistence
and validation, followed by exit 0. Generic failure is stderr prefix
`Login failed: ` and exit 1; do not surface its arbitrary suffix. Managed Gateway
login fails before the challenge and asks for interactive `/login`. Conflicting
`--console` / `--claudeai` also fail. Other managed-policy and validation failures
have additional dynamic messages; they are not fully enumerated by this parser.
The public methods are also described in the [official CLI reference](https://code.claude.com/docs/en/cli-reference).

## Codex 0.151.0

**[S] Command:** `codex login --device-auth`. This explicit device route avoids
mixing its contract with bare `codex login` and browser fallback. No stdin code
or callback is needed. This command clears the existing auth before login, so it
belongs to the owned guest home. See [`cli/login.rs:319`](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/cli/src/login.rs#L319).

**[S] Challenge framing:** after removing color controls, the URL and code each
occupy a line beginning with exactly three spaces. The URL follows step `1.`;
the code follows step `2.`. Exact visible field framing:

```text
1. Open this link in your browser and sign in to your account
   <url>

2. Enter this one-time code (expires in 15 minutes)
   <user_code>
```

See [`device_code_auth.rs:149`](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/login/src/device_code_auth.rs#L149).
The prompt always inserts its ANSI constants; no-TTY alone does not remove them.
`print_device_code_prompt` uses stdout, not stderr.

**[S] URL:** default exact verification URL is
`https://auth.openai.com/codex/device`; it is constructed from the selected issuer
plus `/codex/device`, not copied from a server verification URI. The code is the
server's `user_code` string. Do not impose an invented `XXXX-XXXX` pattern.
See [`device_code_auth.rs:165`](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/login/src/device_code_auth.rs#L165)
and [`server.rs:59`](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/login/src/server.rs#L59).

**[S] Result:** stderr `Successfully logged in\n`, exit 0; failure prefix
`Error logging in with device code: `, exit 1. A managed login restriction can
fail earlier. The device polling loop times out after 15 minutes. **[D]** Account
or workspace device-auth availability remains a real prerequisite; see
[OpenAI authentication documentation](https://learn.chatgpt.com/docs/auth).
**[I]** Match the complete expected challenge sequence, not any indented line or
any occurrence of an OpenAI URL.

## OpenCode 1.18.4: selected headless methods

**[S] Commands with provider and method pickers resolved:**

```text
opencode auth login --provider openai --method "ChatGPT Pro/Plus (headless)"
opencode auth login --provider xai --method "xAI Grok OAuth (Headless / Remote / VPS)"
```

The method label matches case-insensitively and exactly. These two methods have
no additional `prompts` and use automatic polling; no stdin code is required.
This does not generalize to other plugins or methods. See
[`providers.ts:39`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/cli/cmd/providers.ts#L39).

**[S] Visible payloads before Clack decoration:**

| Field | OpenAI headless | xAI headless |
| --- | --- | --- |
| Browser URL payload | `Go to: https://auth.openai.com/codex/device` | `Go to: <verification_uri_complete-or-verification_uri>` |
| Code payload | `Enter code: <user_code>` | `Open <verification_uri> on any device and enter code: <user_code>` |
| Waiting payload | `Waiting for authorization...` | Same |
| Result payload | `Login successful` or `Failed to authorize` | Same |

OpenAI source: [`plugin/openai/codex.ts:461`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/openai/codex.ts#L461).
xAI source: [`plugin/xai.ts:585`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/xai.ts#L585).

**[S] xAI URL boundary:** the device request endpoint is fixed to
`https://auth.x.ai/oauth2/device/code`; the browser URL comes from the response.
The source checks that required values exist but does not enforce a browser
hostname/path. The browser callback CORS origins elsewhere in the plugin are
**not** a verification-URI specification. **[U]** Exact production verification
origin/path is not established by these sources. Neither `https://auth.x.ai`
nor `https://accounts.x.ai` plus an invented path is a proven replacement.
See [`xai.ts:198`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/xai.ts#L198).

**[S] Clack framing:** OpenCode delegates to `@clack/prompts` through
[`cli/effect/prompt.ts`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/cli/effect/prompt.ts).
In the published `dist/index.mjs`, `log.message` prints a separator line followed
by `<symbol><two spaces><payload>\n`. `log.info` uses `●` (U+25CF) or `•`
(U+2022); continuation/separator is `│` or `|`. On Linux the Unicode decision is
`TERM !== "linux"`, not `isTTY`. Spinner stop uses `◇`/`o` for success and `■`/`x`
for status 1, each followed by two spaces and the result payload. ANSI colors and
cursor movement may surround these. `CI=true` changes spinner updates but does
not turn it into a JSON or plain-line protocol. **[I]** Admit these specific
decorations and payloads after incremental terminal-control removal; never send
the renderer arbitrary cleaned stdout. Setting CI solely to change formatting
has not been evaluated for other OpenCode behavior.

**[S] Success limitation:** the auth handler saves credentials before its success
payload. A callback `{type:"failed"}` prints the failure payload and nevertheless
reaches `Prompt.outro("Done")` and returns true. Spinner's second argument `1`
is a visual status, not a process exit. **Do not treat `Done` or exit 0 alone as
authentication success.** Thrown failures are wrapped with `Failed to authorize: `;
its suffix can contain a provider response body. xAI polling errors are caught
and reduced to `{type:"failed"}`, so the CLI loses distinctions such as denied
versus expired. OpenAI polls indefinitely while responses are 403/404 in this
pin; it has no local deadline in this method. A launcher deadline is its own
control. See [`providers.ts:96`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/cli/cmd/providers.ts#L96),
[`codex.ts:487`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/openai/codex.ts#L487)
and [`xai.ts:603`](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/xai.ts#L603).

## fx 0.0.7: Gateway and Grok

**[S] Commands:** `fx login` (Gateway default), `fx login vercel`, `fx login grok`.
Set `FX_NO_OPEN_BROWSER=1`; implementation checks presence, so even an empty or
`0` value suppresses the opener. Keep stdin a writable pipe. Public argument
dispatch and errors are in [`cli_surface.zig:933`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/cli/cli_surface.zig#L933).

**[S] Gateway framing:** `Open <url>\nCode: <user_code>\n\n`, followed by
`Waiting for authentication...\n` when no-TTY/browser opening is disabled.
The URL is `verification_uri_complete` if present, otherwise `verification_uri`.
Issuer is `https://vercel.com`; metadata and the device response supply endpoint
and verification URLs. **[U]** This investigation did not establish the exact
production verification path. `/verify` in the fx unit tests is a synthetic
fixture, not evidence. The official [Vercel device-flow announcement](https://vercel.com/changelog/new-vercel-cli-login-flow)
confirms the mechanism but does not specify that path. See
[`login_flow.zig:553`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/login_flow.zig#L553),
[`oauth.zig:245`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/oauth.zig#L245).

**[S] Gateway team selection:** zero teams chooses no team, one team chooses it
automatically, multiple teams use the no-TTY line picker. `fetchTeams` failure is
also caught and replaced with an empty list; absence of a picker does not prove
successful team discovery. Its framing is:

```text
Select a Vercel team for AI Gateway:
  <1-based-index>. <name> (<slug>)<optional " (default)">
Team [<default-index>]:\x20
```

A billing notice and blank lines occur between the heading and rows. The final
prompt has no newline. Submit a decimal listed index plus `\n`. Empty input
selects the default; **EOF and read failure also become empty input**. Invalid
input prints `Enter a team number from the list.` and repeats the prompt.
Team names/slugs are interpolated without escaping, so arbitrary text, controls
or ambiguous rows must not be trusted as UI commands. In this login route the
default index is the first team. See [`login_flow.zig:1109`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/login_flow.zig#L1109)
and [`readLine:1423`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/login_flow.zig#L1423).

**[S] Gateway results:** `Signed in to Vercel.\n` follows durable session save;
the next line says Gateway may still need billing/API setup. Known stderr
payloads are `fx login: authorization denied`,
`fx login: authorization expired; run fx login again`,
`fx login: failed to sign in`, and a missing `FX_OAUTH_CLIENT_ID` configuration
error. The CLI uses a compiled public client ID by default; this env is not a
required user secret. Error dispatch returns failure; application entry maps
that to exit 1. Source: [`oauth_session.zig:13`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/oauth_session.zig#L13),
[`app_entry_runtime.zig:191`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/app/app_entry_runtime.zig#L191).

**[S] Grok challenge:** heading `Open this URL to sign in with Grok:\n`, then
the URL, two newlines and `Waiting for browser authorization...\n`. The next
line is `Paste the code shown by xAI and press Enter if the browser doesn't return.` URL is
`https://auth.x.ai/oauth2/authorize` with PKCE, `state`, `response_type=code`,
`referrer=fx`, and `redirect_uri=http://127.0.0.1:<allocated-port>/callback`.
See [`grok_oauth.zig:376`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/grok_oauth.zig#L376)
and [`URL builder:799`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/grok_oauth.zig#L799).

**[S] Grok manual input:** the raw code plus `\n`, **not** `code#state` or a
callback URL. The code is trimmed, must be nonempty, at most 4096 bytes, and every
remaining byte must be in `0x21..0x7e`. The stdin reader closes its logical input
after the first newline (or EOF with a partial line); there is **one submitted
line per attempt**, not an indefinitely repeatable prompt. Success is
`Signed in with Grok.\n` after provider activation; failure is stderr
`fx login: failed to sign in with Grok\n`, mapped to exit 1. Detailed OAuth
errors are not distinct public CLI payloads. See [`grok_oauth.zig:75`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/grok_oauth.zig#L75),
[`reader:416`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/grok_oauth.zig#L416).

## fx Codex: precise callback contract

**[S] Command:** `fx login codex`, `FX_NO_OPEN_BROWSER=1`. It prints heading
`Open this URL to sign in with Codex:\n`, the URL, then two newlines and the
browser-waiting message used above. There is **no stdin manual-code fallback**.

**[S] Authorization URL:** `https://auth.openai.com/oauth/authorize`; public
client ID `app_EMoamEEZ73f0CkXaXp7hrann`; `response_type=code`,
`code_challenge_method=S256`, `id_token_add_organizations=true`,
`codex_cli_simplified_flow=true`, `originator=fx`, plus `scope`, `state`, PKCE
challenge and redirect URI. Guest listener binds **127.0.0.1**, trying port
**1455**, then **1457** only on address-in-use. It advertises exactly
`http://localhost:<chosen-port>/auth/callback`. Both unavailable is a login
failure. State is 32 random bytes encoded base64url without padding (43
characters); verifier is independently generated inside the guest. Five-minute
login deadline. Test-only environment overrides can select a different issuer
and port 0; these are not a production callback contract. See
[`chatgpt_oauth.zig:15`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L15),
[`prepare:98`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L98),
[`bind:180`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L180),
[`URL builder:732`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L732).

**[S] Accepted request:** GET with target starting `/auth/callback?`; literal
`#` in the target is invalid. Requires nonempty percent-decoded `code` and
`state`, with state equal to this attempt. Alternatively nonempty `error` plus
matching `state` is a denial. Query reader takes the first matching key;
`+` decodes to space, malformed percent escapes fail. Unknown paths/state
mismatches are unrelated and do not consume the login. No `Host` validation is
present in the common parser. Request headers are capped at 16 KiB and terminate
with CRLF CRLF. Codex passes no allowed CORS origin, so only GET is accepted;
the shared Grok OPTIONS path is not enabled for Codex. See
[`parseBrowserCallbackTarget:756`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L756),
[`classify:295`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L295),
[`browser_callback.zig:175`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/browser_callback.zig#L175).

**[S] HTTP responses:** fixed HTML, not credentials or redirect URLs:

| Outcome | Status | Fixed page text |
| --- | --- | --- |
| Token exchange accepted | `HTTP/1.1 200 OK` | `Authorization complete` |
| Denied / exchange failed | `HTTP/1.1 400 Bad Request` | `Authorization failed` |
| Unrelated or invalid callback | `HTTP/1.1 404 Not Found` | `Not found.` |

Headers are `Content-Type: text/html; charset=utf-8`, exact `Content-Length`,
and `Connection: close`. Codex has no CORS response headers, Location or cookie.
**The 200 is sent after exchanging the code, before `completeSignIn` and
credential persistence.** It is not final login success. Final stdout is
`Signed in with Codex.\n` after provider activation. Known stderr results:
`fx login: Codex authorization denied`,
`fx login: Codex authorization expired; run fx login codex again`, or
`fx login: failed to sign in with Codex`, followed by failure exit. See
[`pollBrowserToken:237`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L237),
[`saveSignIn:338`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/chatgpt_oauth.zig#L338),
[`writeResponse:282`](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/auth/browser_callback.zig#L282).

**[I] Minimum restricted relay:** reserve the exact advertised host loopback
port before opening the browser; bind one attempt/state to one admitted guest
and that guest's selected loopback port. Accept only this GET callback with the
matching state, forward the encoded query to the fixed guest destination, and
return the guest's bounded HTTP response. Reject duplicate query keys as a
stricter launcher rule; do not accept arbitrary URLs, paths, ports, headers or
destinations. Do not synthesize 200 just because a request was forwarded. Stop
the relay with attempt cancellation/exit/timeout. If the host port is occupied,
rewriting the URL to a different port is not supported by this CLI contract;
guest and host port selection need coordination. Relay transport and real
browser completion have not been demonstrated here.

## Cursor 2026.09.02-c22c1a3

**[S] Command:** `cursor-agent login`, `NO_OPEN_BROWSER=1`, no-TTY stdin. No
provider/team picker or manual-code input in the inspected command. Sources are
`./src/commands/login.ts` and `auth-status-format.ts` bundled in hashed
`7792.index.js`, plus the login manager in hashed `index.js` (provenance above).

**[S] Visible framing after formatting removal:** initial
`Starting login process...`; progress starts `Authenticating with Cursor...`.
With browser suppression the contained message is
`Waiting for browser authentication...\nOpen a browser and navigate to this link: <url>`.
This command embeds the URL in that message; it does not pass the formatter's
optional separate `loginUrl` field. QR output is disabled when stdin is not a
TTY. No one-time user code is printed for this route.

**[S] URL:** default `https://cursor.com/loginDeepControl`, query fields
`challenge`, `uuid`, `mode=login`, `redirectTarget=cli`. The challenge is the
base64url SHA-256 digest of a generated verifier and uuid is UUIDv4. The command
polls `https://api2.cursor.sh/auth/poll` from the guest with uuid and verifier;
**the verifier is not a browser/UI field**. Endpoint/website overrides exist
(`CURSOR_API_BASE_URL`, `CURSOR_WEBSITE_URL` and CLI settings); the default URL
allowlist presumes those are not inherited. Static source offsets in `index.js`:
default website/API around `4057703`, authorization URL around `4059538`,
browser suppression around `2140553`.

**[S] Result:** green check plus either `Logged in as <email>` or
`Login successful!`, then
`Authentication tokens stored securely.` Normal return exits 0. Fixed error
messages include `Login failed or timed out. Please try again.` and
`Failed to store authentication tokens. Please try again.`; general catch starts
`Login error: ` and exits 1. Initial configuration failure starts `Error: `.
Keychain-specific errors can differ. **[I]** Show a fixed UI status rather than
echoing dynamic error suffixes, email/id or arbitrary account text.

## Parser boundary implied by these facts

**[I]** Use a bounded incremental UTF-8/terminal-control decoder and a parser
selected by pinned runtime **and selected login method**. Parse partial prompts
without requiring newline (Claude and fx Team). Require the observed framing
and validate the complete URL with a URL parser: exact scheme/host/path, no
userinfo/fragment, expected query fields and the attempt's state where applicable.
Codes are opaque bounded fields, not guessed regular-expression formats. Keep
challenge values and manual input ephemeral, associated with the owned process;
never include raw stdout, bearer credentials or PKCE verifier in UI events/logs.

**[I]** A recognized success line is a transition to checking readiness. Require
process completion plus the selected provider's existing guest auth check;
another provider's saved credential must not satisfy this login. A failure
payload wins over OpenCode's later `Done`. Cancellation closes only this attempt.
The UI may use a fixed generic failure when output is unknown, rather than
displaying it or discovering URLs with a broad HTTPS regex.

**[U] Remaining precision gaps:** Linux Claude byte-level framing/opener behavior;
production verification origin/path for fx Gateway and OpenCode xAI; actual
no-TTY buffering/ANSI combinations of the pinned images; browser completion,
credential persistence and selected-provider readiness; callback relay transport.
These gaps cannot be closed by treating synthetic fixture URLs or source intent
as a successful login. A reviewed origin allowlist for dynamic device URLs is a
separate explicit launcher policy, not a fact established by this note.

## Follow-up: suppressing Claude's automatic opener

Static follow-up on 2026-09-06 after [fixture 67](67-production-login-challenges-fixture.mts)
and its [results](67-production-login-challenges-results.json). No additional
CLI, VM or provider execution was performed for this follow-up.

**[S] Direct vendor call chain, not an assumption about npm `open`:** in the
hashed Claude **macOS** 2.1.260 executable above, OAuth chunk
`/$bunfs/root/chunk-6brztqmw.js` imports `jr` from
`/$bunfs/root/chunk-1tn14wkq.js`. `startOAuthFlow` calls the manual-URL printing
callback before `await jr(automaticUrl)`. The latter chunk starts at byte
`167702627`; `jr` delegates to `vrn` (HTTP/HTTPS validation), then `l`. Its
opener-selection function at byte `167705326` contains:

```js
let e = sl()?.browser, o = e !== void 0 ? e ?? void 0 : a.BROWSER;
// The vendor then calls its process helper:
Fe(o || "open", [url], { useCwd: true, useToolMemoryCgroup: false })
```

This snippet preserves the relevant expressions with a descriptive `url` name
and formatted whitespace; it is not a live process output. `a.BROWSER` is a
string env accessor (`BROWSER` schema around byte `156165590`, `H.str()` at
`156169578`, accessor implementation near `156192000` reads `process.env`).
`Fe` at byte `156460112` delegates to the process helper with executable and
argv separately; the opener call passes no shell option. An exit code of 0
becomes `{ok:true}`. It does not itself authenticate or end the OAuth wait.

**[S] Precedence:** `sl()` at byte `155975770` reads
`surfaceCapabilities.attacherCaps()`, not `settings.json`. An attacher's defined
`browser` field wins over the environment; even explicit `null` skips the env
fallback and leaves the default opener. With that field absent/undefined,
`BROWSER=/bin/true` selects `/bin/true` as the executable and passes the automatic
URL as its single argument. Claude itself sets `BROWSER:"true"` when constructing
background-process environments (bytes `167008232` and `167059641`), additional
evidence that this vendor uses the executable override to neutralize opening.
The sibling `VL()` checks `stdout.isTTY`, but this auth-login call chain does not
call `VL()`; no-TTY alone must not be presented as verified browser suppression.

**[D/U] Documentation:** the inspected official [environment-variable reference](https://code.claude.com/docs/en/env-vars)
does not list `BROWSER` as a supported no-open login switch. Its
`CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0` is expressly for publishing artifacts, and
refresh-token env authentication changes the login flow rather than preserving
manual OAuth. No public auth-login no-browser switch was established in the
[CLI reference](https://code.claude.com/docs/en/cli-reference). Thus this is a
**pin-specific source-supported executable override**, not a documented stable
Claude login API. The [official release note for manual auth-login input](https://code.claude.com/docs/en/whats-new/2026-w18)
supports the separate manual-code mechanism.

**[I] Conditional recommendation:** for the owned standalone guest login process,
set only its `BROWSER=/bin/true`, provided the pinned Linux image supplies that
executable and no attacher capability overrides it. This leaves the printed
manual URL and stdin listener intact in the inspected control flow. Validate
the actual Linux pin with its ordinary opener unmodified: expect the manual
challenge/paste prompt, no actual browser-opener invocation, and normal owned
process cancellation. Do not extend this env setting to agent execution or to
the host. **[U]** This follow-up has not established Linux execution behavior.
Fixture 67 used 27 replacement opener scripts, reported one Claude opener call,
and passed no Claude suppression env; it proves that its fixture blocked the
attempt, not that the production launcher already suppressed it.
