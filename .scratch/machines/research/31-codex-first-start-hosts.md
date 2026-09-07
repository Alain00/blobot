# Codex and OpenCode: sources behind signed-out startup traffic

Date: 2026-09-05. Read-only source investigation for **The image: one per runtime**.
No CLI, sbx, Docker, login, session, prompt or inference was run for this note. No
image flags or network policy were changed. Admission remains with **Egress from a
box**.

## Observation and attribution boundary

[Research29](29-runtime-image-deny-all-traffic.md) measured successful ACP
`initialize` under deny-all, with an empty private home and no credentials:

| Runtime | New blocked host rows during the ACP process window |
| --- | --- |
| Codex 0.151.0 + codex-acp 1.7.0 | `github.com:443` once; `api.github.com:443` once; `chatgpt.com:443` twice |
| OpenCode 1.18.4 | `registry.npmjs.org:443` once |

Boot, `--version` and signed-out status had no observed hosts in their measured
windows. The underlying results are [Codex](29-runtime-image-traffic-codex-final-results.json)
and [OpenCode](29-runtime-image-traffic-opencode-results.json). These logs expose
hostnames and counts, not HTTPS paths or calling stacks. Therefore the source
paths below establish concrete candidate causes, not request-by-request packet
attribution. Starting the ACP process also starts background work; the label
`initialize-only` does not mean the JSON-RPC handler caused every request.

Exact source revisions inspected:

- Codex tag `rust-v0.151.0`: commit
  [`78c290807ce710180111df227df3b7a4fe845452`](https://github.com/openai/codex/tree/78c290807ce710180111df227df3b7a4fe845452).
- codex-acp tag `v1.7.0`: commit
  [`2b48e9822330fc09f3a94a81563e5c4bb779601a`](https://github.com/agentclientprotocol/codex-acp/tree/2b48e9822330fc09f3a94a81563e5c4bb779601a).
- OpenCode tag `v1.18.4`: commit
  [`49c69c5ed3ccf706b61b3febb43c8aaff7f8325e`](https://github.com/anomalyco/opencode/tree/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e).

Public GitHub ref/tree APIs resolved these tags; raw files were then read by full
commit SHA. This is source analysis of the pinned releases, not a rebuild or a
binary provenance proof.

## Codex: plugin startup explains the complete host pattern

The ACP bridge reads `CODEX_PATH` when starting its Codex connection. Its
`initialize` handler forwards app-server initialization with experimental API
capability; it does not itself request a model list or start authentication.
[Bridge startup](https://github.com/agentclientprotocol/codex-acp/blob/2b48e9822330fc09f3a94a81563e5c4bb779601a/src/index.ts#L72),
[initialize forwarding](https://github.com/agentclientprotocol/codex-acp/blob/2b48e9822330fc09f3a94a81563e5c4bb779601a/src/CodexAcpClient.ts#L130).

Codex app-server starts plugin warmups in `MessageProcessor::new`. Plugin support
is a stable feature enabled by default. The manager starts curated-repository
sync when plugins are enabled and an authenticated remote global catalog is not
active. That condition includes this signed-out case.
[App-server startup](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/app-server/src/message_processor.rs#L522),
[feature default](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/features/src/lib.rs#L1263),
[signed-out sync condition](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/manager.rs#L666).

The curated sync has an explicit fallback chain:

1. Fetch the public `https://github.com/openai/plugins.git` repository.
2. On Git failure, query the GitHub HTTP API under `https://api.github.com`.
3. On HTTP failure and no existing local curated snapshot, bootstrap from
   `https://chatgpt.com/backend-api/plugins/export/curated`.

The backup is only used to fill a missing snapshot. This sequence accounts for
one attempt to each of the three measured hostnames under deny-all; it concerns
plugin distribution, not a Codex binary update. The initial GitHub HTTP request
is repository metadata at `/repos/openai/plugins`.
[Endpoint constants and fallback chain](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/startup_sync.rs#L23),
[GitHub metadata request](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/startup_sync.rs#L760).

A separate startup warmup fetches featured plugin IDs. It sends GET
`<chatgpt_base_url>/plugins/featured?platform=…` even when auth is absent; auth
headers are conditional. The default base URL is
`https://chatgpt.com/backend-api/`. This supplies a concrete candidate for the
second ChatGPT attempt. **Inference:** the curated fallback plus featured lookup
are the strongest complete explanation of the four observed attempts. The
policy log alone cannot prove their paths or ordering.
[Featured warmup](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/manager.rs#L2697),
[optional-auth request](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/remote_legacy.rs#L123),
[default base URL](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core/src/config/mod.rs#L4240).

The model refresh worker also starts immediately, so background model work cannot
be excluded just by examining ACP forwarding. However, the OpenAI model manager
only refreshes if its endpoint has Codex-backend auth or command-scoped auth.
Without either, it returns before the network fetch. This makes model discovery a
weaker explanation for this specific empty-home case; it may matter after login
or custom provider configuration.
[Refresh worker](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/app-server/src/models_refresh_worker.rs#L39),
[refresh gate](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/models-manager/src/manager.rs#L380),
[endpoint auth check](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/model-provider/src/models_endpoint.rs#L62).

### Controls and functional cost

`--disable plugins`, equivalently `-c features.plugins=false`, is a real public
CLI override. CLI feature overrides flow to all subcommands; the effective flag
feeds `PluginsConfigInput`. The startup method wraps the tasks above in
`if config.plugins_enabled`. **Static prediction, not a measured variant:** this
override should eliminate these plugin startup attempts.
[CLI syntax](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/cli/src/main.rs#L958),
[config mapping](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core/src/config/mod.rs#L1634),
[startup gate](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/manager.rs#L2589).

This is a feature removal, not a telemetry-only switch. The same flag makes plugin
loading return an empty outcome, so configured plugins and their supplied
capabilities would disappear too. It also skips marketplace auto-upgrade and
remote catalog warmups. Do not silently apply it to the image merely to obtain an
empty log. The accepted use of runtime-native skills must be evaluated separately
from plugin-packaged skills/tools; a successful handshake would not validate that
functional boundary.
[Disabled plugin loading](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/manager.rs#L739).

`features.remote_plugin=false` is insufficient here: signed-out operation already
falls back to the local curated repository, and featured lookup checks the broad
plugin flag. `features.recommended_plugins=false` is already the default and does
not gate the featured-ID warmup. No narrower supported setting for only these
two startup operations was found in the inspected implementation.
[Remote-active condition](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/manager.rs#L666),
[featured gate](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core-plugins/src/manager.rs#L1677),
[recommended feature default](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/features/src/lib.rs#L1257).

The image's existing `check_for_update_on_startup=false` gates the TUI's Codex
upgrade check; it is not the plugin gate. Existing `analytics.enabled=false`
selects no metrics exporter, while explicit `otel.exporter="none"` and
`otel.trace_exporter="none"` address their separate exporters. These controls do
not prevent plugin HTTP requests. Calling every ChatGPT request telemetry would
therefore be unsupported.
[Upgrade gate](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/tui/src/updates.rs#L27),
[exporter selection](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core/src/otel_init.rs#L68).

## OpenCode: config dependency installation is the strongest candidate

The `acp` command uses `effectCmd` with its default instance bootstrap. Before the
command handler runs, that wrapper loads an instance, which bootstraps config and
then plugins. The actual ACP `initialize` handler constructs a capability
response; it performs no explicit registry request.
[ACP command](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/cli/cmd/acp.ts#L9),
[command instance wrapper](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/cli/effect-cmd.ts#L79),
[instance boot](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/project/instance-store.ts#L45),
[config-first bootstrap](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/project/bootstrap.ts#L34),
[ACP response](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/acp/service.ts#L92).

For each config directory, config loading unconditionally starts a detached
dependency install that adds `@opencode-ai/plugin` at the release version
(`1.18.4` here). Global config is always among those directories, even when project
config is disabled. In a writable empty directory without `node_modules`, the npm
service calls Arborist `reify` with that package; it uses npm configuration and
disables install scripts. The default registry is `https://registry.npmjs.org`.
[Config install](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/config/config.ts#L422),
[directory selection](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/config/paths.ts#L25),
[npm install and Arborist](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/core/src/npm.ts#L80),
[npm configuration](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/core/src/npm-config.ts#L12).

**Inference:** this first-home SDK dependency install is a strong explanation for
the one blocked npm request. A host-only log cannot distinguish its package
metadata, tarball or another npm call. In particular it does not prove a binary
auto-update or a provider login was attempted. The bootstrap starts dependency
work in the background and handles failure as a warning, explaining how a blocked
install can coexist with a successful handshake. Session behavior remains
unmeasured.

The default provider-auth plugins are directly imported into OpenCode, including
Codex, Copilot, GitLab, Poe and other provider integrations. They are not downloaded
from npm at that point. External configured npm plugins have a separate on-demand
installation path, but this empty-home fixture supplies none.
[Built-in imports and plugin list](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/index.ts#L64),
[external loader](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/loader.ts#L94).

### Controls and functional cost

- `OPENCODE_DISABLE_DEFAULT_PLUGINS=true` is a real runtime flag, but it skips
  built-in provider integrations. It does **not** gate the earlier config
  dependency install. It would remove useful authentication behavior without
  establishing a cure for this request.
  [Flag](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/effect/runtime-flags.ts#L19),
  [application](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/plugin/index.ts#L166).
- `OPENCODE_DISABLE_PROJECT_CONFIG=true` leaves global config in the directory
  list. Disabling project settings therefore cannot eliminate a cold global
  install, and loses project config/discovered plugin behavior. Existing
  `OPENCODE_DISABLE_AUTOUPDATE=1` does not appear in this install path.
- The npm service can skip installation when `node_modules` exists and its
  package lock already declares every requested dependency. **Candidate to
  validate:** provision the actual pinned plugin SDK and lock into the initial
  private config home, then repeat the empty-home test. This preserves the
  integration in principle; a fake empty `node_modules` or fake lock is not a
  correct fix. Additional project config directories can still need their own
  dependencies. The private home mount means merely baking files at the same
  path in an image does not prove they will be visible.
  [Skip/dirty checks](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/core/src/npm.ts#L139).
- Making config unwritable also skips this npm install, but blocks normal config
  and plugin management. It is not a suitable quiet-start shortcut.
  [Writable check](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/core/src/npm.ts#L139).

No direct selective OpenCode flag that disables only this automatic SDK install
was found in the inspected config/npm implementation. Its npm configuration is
passed through to Arborist, but changing registry/offline behavior globally also
changes later requested package installation. That requires a separate evaluated
policy, not an assumed image hardening setting.

## Evidence needed before changing admission

Keep the measured facts and these static predictions separate. A disposable
deny-all variant with the Codex plugin flag would test attribution but must not
be promoted without deciding which plugin capabilities belong in the product.
An OpenCode variant with a real preseeded SDK can test the npm candidate while
preserving defaults. Neither test alone would prove real authenticated turns,
native skills or mailbox behavior. No hostname was allowed on the basis of this
investigation.
