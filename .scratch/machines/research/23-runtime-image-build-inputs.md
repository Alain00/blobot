# Runtime image build inputs

Date: 2026-09-05. Research for **The image: one per runtime**, after the author accepted
the common `shell-docker` base. This note supplies distribution and configuration facts;
it does not certify a built image, authenticate a provider, or resolve the ticket.

Machine-readable inputs are in
[`23-runtime-image-artifacts.json`](23-runtime-image-artifacts.json). They distinguish
publisher digests from locally measured bytes. The two Cursor Linux packages were
downloaded with explicit permission, retained outside Git for the parent build, and
never executed. Other runtime binaries were not downloaded by this researcher.

## Distributions that can be pinned now

| Runtime | Linux arm64 and amd64 input | Build implications and primary source |
| --- | --- | --- |
| Claude `2.1.260` | Versioned native `linux-arm64/claude` and `linux-x64/claude`; optional `.zst` downloads | The [versioned manifest](https://downloads.claude.ai/claude-code-releases/2.1.260/manifest.json) supplies SHA-256 and byte count, and the [compressed manifest](https://downloads.claude.ai/claude-code-releases/2.1.260/manifest.zst.json) separately pins compressed bytes. URLs follow the [official installer](https://claude.ai/install.sh). Download directly and verify; the installer is unnecessary in an image build. |
| Codex `0.151.0` | `codex-package-{aarch64,x86_64}-unknown-linux-musl.tar.gz` | Preserve the full package layout. The [versioned package README](https://github.com/openai/codex/blob/rust-v0.151.0/scripts/codex_package/README.md) and [builder](https://github.com/openai/codex/blob/rust-v0.151.0/scripts/codex_package/layout.py) include `bin/codex`, `bin/codex-code-mode-host`, `codex-resources` and `codex-path/rg`. A bare executable omits these companions. [Release API hashes and sizes](https://api.github.com/repos/openai/codex/releases/tags/rust-v0.151.0). |
| OpenCode `1.18.4` | `opencode-linux-arm64.tar.gz`; `opencode-linux-x64-baseline.tar.gz` | Both are glibc distributions. The x64 baseline avoids requiring AVX2: the [pinned installer](https://github.com/anomalyco/opencode/blob/v1.18.4/install) selects it when AVX2 is absent. The JSON also records the non-baseline x64 alternative. [Release API hashes and sizes](https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.18.4). |
| fx `0.0.7` | `fx-linux-aarch64.tar.gz`; `fx-linux-x86_64.tar.gz` | Release executables, without a system Node requirement of their own. The [release API](https://api.github.com/repos/vercel-labs/fx/releases/tags/v0.0.7) supplies SHA-256 and corresponding `.sha256` assets. System Node is still required by blobot's guest bootstrap. |
| Cursor `2026.09.02-c22c1a3` | Versioned `linux/{arm64,x64}/agent-cli-package.tar.gz` | Both URLs now return HEAD 200 and Range GET 206; the previous 403 did not recur. Complete downloads were hashed locally. Preserve `dist-package/` siblings: bundled Node, launcher, JS chunks, native modules and helpers. [Official installer](https://cursor.com/install). No independent publisher checksum was established. |

Node `22.22.1` has pinned Linux arm64/x64 `.tar.xz` SHA-256 values in the
[official checksums](https://nodejs.org/dist/v22.22.1/SHASUMS256.txt). The JSON records
both. Native Claude/OpenCode/fx do not remove the Node requirement imposed by blobot's
own sbx bootstrap and transport.

The two retained Cursor archives are:

| Architecture | Local artifact | SHA-256 | Bytes |
| --- | --- | --- | ---: |
| arm64 | `/private/tmp/blobot-runtime-inputs.clqdM3/cursor-arm64.tar.gz` | `fb7bc635be6172ebcf68f907fd9217e3614da51916455c6d7fdb66690997884c` | 177647834 |
| amd64 | `/private/tmp/blobot-runtime-inputs.clqdM3/cursor-x64.tar.gz` | `b73b59854762535c0fc20d7ccc51c3b5a356a851491088d60a362be48750f53c` | 179684142 |

These hashes fix the bytes obtained from the publisher URL. They are not signatures
or proof of reproducibility from source. Multipart ETags are not used as SHA-256.

## Bridges without duplicate native payloads

**Claude ACP `0.70.0`: the external executable route is explicitly implemented.**
`claudeCliPath()` first returns `CLAUDE_CODE_EXECUTABLE`; only its fallback resolves a
platform native optional package from the SDK. Its failure message explicitly offers
that override as the alternative to installing optional dependencies. Session options
also set `pathToClaudeCodeExecutable` from the same variable. Evidence: exact installed
`@agentclientprotocol/claude-agent-acp/dist/acp-agent.js`, corroborated by the
[published npm artifact](https://registry.npmjs.org/@agentclientprotocol/claude-agent-acp/0.70.0).

Accordingly, `npm ci --omit=optional --ignore-scripts` is a source-supported candidate
for the bridge tree when `CLAUDE_CODE_EXECUTABLE` names the image's native Claude.
This research did not perform that installation or an ACP launch. Its SDK dependency
is exact `0.3.232`; the [SDK metadata](https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/0.3.232)
places all platform CLI payloads under `optionalDependencies`. Its required peers
include `@anthropic-ai/sdk >=0.93.0`, `@modelcontextprotocol/sdk ^1.29.0`, and `zod ^4.0.0`.
The standalone bridge lock must resolve those peers as well as ordinary dependencies.
The bridge requires Node ≥22.

**Codex ACP `1.7.0`: set `CODEX_PATH` to the complete package's `bin/codex`.**
The exact installed `dist/index.js` passes it into `startCodexConnection()`; otherwise
the bridge's dependency on `@openai/codex ^0.148.0` can select another runtime. The
[npm metadata](https://registry.npmjs.org/@agentclientprotocol/codex-acp/1.7.0) and
[`stdio-bridge.ts`](../../../../packages/core/src/adapters/codex/stdio-bridge.ts)
establish this. If optional packages are omitted, the bundled fallback cannot be
treated as working. Keep the override explicit for ACP and interactive CLI paths.

Do not equate top-level exact versions with a complete lock. Both bridge trees have
dependency or peer ranges; install from a committed lock with integrity checks.

## Actual update and telemetry controls

| Runtime | Verified control | What it establishes |
| --- | --- | --- |
| Claude | `DISABLE_UPDATES=1`; `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`; optionally explicit `DISABLE_TELEMETRY=1` and `DISABLE_ERROR_REPORTING=1` | The [official environment reference](https://code.claude.com/docs/en/env-vars) distinguishes blocking all updates from `DISABLE_AUTOUPDATER`, which still permits manual updates. The nonessential-traffic switch covers automatic updates, telemetry and errors, and disables feature-flag fetching. It does not cover official marketplace auto-install; `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL` controls that separately. These are documented settings; Linux network behavior was not measured here. |
| Codex | `check_for_update_on_startup=false`; `[analytics] enabled=false`; `[feedback] enabled=false`; `[otel] exporter="none", trace_exporter="none", metrics_exporter="none"` | All are accepted by the [exact version's schema](https://github.com/openai/codex/blob/rust-v0.151.0/codex-rs/core/config.schema.json). The [startup update path](https://github.com/openai/codex/blob/rust-v0.151.0/codex-rs/tui/src/updates.rs) returns before checking when the first setting is false. Put startup policy in the private home configuration or an effective process override before launching the app server; session-only settings may be too late. No claim that these stop arbitrary user-invoked package managers. |
| OpenCode | `OPENCODE_DISABLE_AUTOUPDATE=1` or config `autoupdate: false` | The [exact flag implementation](https://github.com/anomalyco/opencode/blob/v1.18.4/packages/core/src/flag/flag.ts) and [upgrade entry point](https://github.com/anomalyco/opencode/blob/v1.18.4/packages/opencode/src/cli/upgrade.ts) return before the automatic check. This is not an established global telemetry opt-out. The [official data-handling page](https://opencode.ai/docs/enterprise/#data-handling) discusses code/context retention and explicit sharing; it does not certify all background traffic absent. |
| fx | `FX_AUTO_UPGRADE=0` | The [exact startup implementation](https://github.com/vercel-labs/fx/blob/v0.0.7/src/main.zig#L659) disables the updater for `0` or case-insensitive `false`. [Official privacy documentation](https://fx.sh/docs/using-fx/data-and-privacy) says there is no separate fx product telemetry service; the [exact telemetry implementation](https://github.com/vercel-labs/fx/blob/v0.0.7/src/core/agent/runtime/telemetry.zig) records local diagnostics, and [network metrics](https://github.com/vercel-labs/fx/blob/v0.0.7/src/core/workspace/network_metrics.zig) are an in-memory ring buffer. Provider inference remains network activity under the provider's policy. |
| Cursor | Hidden CLI option `--disable-auto-update`; config `channel: "static"` | Static inspection of the downloaded exact Linux arm64 package establishes both. The chat path checks the option or static channel before scheduling updates; the manual update handler exits for static channel. ACP receives the parsed options, but its own session path was not run. No supported global telemetry-off control was established. |

The switches above set defaults for blobot's invocation. Passwordless guest sudo
means an Agent can intentionally alter its Machine; they are not tamper-proof pins.
Configurations under `/home/agent` must be initialized after the private home mount,
without replacing existing Agent settings on resume.

## Cursor admission limit

In the exact Linux arm64 tar, `index.js` defines the hidden update option and accepts
`static` in its config schema. `1931.index.js` implements the chat updater guard;
`9215.index.js` implements the static-channel manual guard. The ACP entry in
`189.index.js` rejects unauthenticated sessions before creating shared services.
Those services initialize tracing and emit a launch analytics event. The analytics
buffer defers delivery without an access token; separate Sentry initialization uses a
literal DSN and `enabled: true`. An empty `SENTRY_DSN` therefore does not prove an
opt-out. No `DO_NOT_TRACK`/`DISABLE_TELEMETRY` consumer was found in these shipped JS
modules. Sources: the [exact arm64 tar](https://downloads.cursor.com/lab/2026.09.02-c22c1a3/linux/arm64/agent-cli-package.tar.gz)
and [configuration documentation](https://cursor.com/docs/cli/reference/configuration).

This is a remaining acceptance gate: do not label Cursor telemetry disabled because
generic environment variables were set. No unauthenticated network trace or actual
ACP startup was executed by this research, and privacy mode is not proof that all
telemetry is disabled. Also, the current
[`VERIFIED_CURSOR_VERSION`](../../../../packages/core/src/adapters/cursor/stdio.ts)
is `2026.08.25-3e8eec8`; the image pin requires its own acceptance.

## Precisely what remains unverified

- Building and launching either architecture of the five final images; actual guest
  size, image/tar size, Docker daemon startup, sudo and whole-system persistence.
- Installing both independent bridge locks without optional native packages and
  demonstrating ACP against their explicitly selected image executables.
- First-start egress for each final image, including release checks, plugin/catalog
  fetching, tracing and error reporting. Configuring an update switch alone does not
  establish network silence.
- A complete Cursor telemetry-off mechanism, and any distinction between its
  unauthenticated startup, authenticated session and interactive login paths.
- OpenCode's complete initial traffic inventory. Additional documented switches such
  as `OPENCODE_DISABLE_MODELS_FETCH` or `OPENCODE_DISABLE_DEFAULT_PLUGINS` have other
  functional effects and were not silently selected as policy here.
- Authenticated runtime/ACP discovery, mailbox/tools and native skill aliases for
  all five pins. No credentials were read, no login performed and no inference spent.
- Cursor amd64 internals: its full tar was hashed, but detailed JS path tracing used
  the arm64 tar. The built amd64 image still needs its own smoke/admission checks.

Read-only scratch source and package extracts are under
`/private/tmp/blobot-runtime-inputs-research`; only the JSON and this note belong to
the repository. Runtime release bytes remain outside it.
