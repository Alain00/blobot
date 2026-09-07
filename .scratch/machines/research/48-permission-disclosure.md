# Permission disclosure: scope belongs to the runtime option

2026-09-06. Read-only research by the existing `image_startup_hosts` helper, followed by local
implementation and deterministic tests. No provider invocation, sign-in or real approval was
performed for this change.

## Evidence and limits

- **Claude:** the real MCP approval in
  [the original permission measurement](../../first-demo/issues/14-permission-posture-in-an-agent-worktree.md)
  wrote `permissions.allow` into the worktree's `.claude/settings.local.json`. This proves that
  case, not every request kind. [Claude's permissions documentation](https://code.claude.com/docs/en/permissions)
  describes rule management and settings scopes. Removing a rule from disk is possible; when
  an active ACP session observes that removal was not measured.
- **OpenCode:** [official permissions documentation](https://opencode.ai/docs/permissions/)
  says `always` approves the tool's suggested patterns for the rest of the session. The local
  [ACP evidence](../../first-demo/research/16-opencode-persona.md) confirms the advertised option,
  not a common settings file or individual revocation operation in blobot.
- **fx:** [official permissions documentation](https://fx.sh/docs/configure-fx/permissions)
  distinguishes live grants from saved settings: no settings write and no restoration through
  resume. [Pinned v0.0.7 ACP source](https://github.com/vercel-labs/fx/blob/v0.0.7/src/acp/server.zig#L768)
  maps `allow_always` to `.always`. Native `/permissions reset` is not a verified control in
  blobot's ACP session.
- **Cursor:** the [local measurement](../../cursor-runtime/issues/01-does-cursor-config-dir-give-an-agent-its-own-cursor.md)
  used 2026.08.25-3e8eec8, before the current image pin. The grant was in session state under
  `CURSOR_CONFIG_DIR/acp-sessions/<id>/store.db`, not `cli-config.json`. Neither individual
  revocation nor the current pin's exact lifetime was demonstrated. The UI therefore shows
  the offered option's name and makes no file or persistence claim.
- **Codex:** exact bridge 1.7.0 source,
  [commit 2b48e9822330fc09f3a94a81563e5c4bb779601a](https://github.com/agentclientprotocol/codex-acp/blob/2b48e9822330fc09f3a94a81563e5c4bb779601a/src/permissions/options.ts#L32),
  maps session grants, command-prefix rules and future network rules to the same `allow_always`
  kind. More than one option can have that kind. The existing UI selects the first; this
  change carries that exact option's name together with its id, without selecting another.
  [Native rule documentation](https://developers.openai.com/codex/rules/) does not establish one
  ACP destination for every variant, so the UI does not invent one.

## Implementation

`PermissionOption.description` is optional adapter-owned prose. Claude, OpenCode and fx attach
only their supported explanation to reusable approvals. Cursor and Codex retain the factual
fallback and their advertised name. Main selects the name/description from the same option it
will answer. Live requests and restored pending requests carry that explanation into the
transcript. React knows no provider. The disclosure makes no common claim about file location,
permanence, exact-command scope or effects on another Agent. Once-only requests do not describe
an unavailable reusable approval. The three choices and their ids are unchanged on both kinds.

The creation footer describes separate working folders and the selected approval settings;
it no longer promises every unvouched action asks, nor universally says blobot is not a sandbox.
Kind-specific words and startup/refusal copy are owned by the resolved
[disclosure ticket](../issues/09-what-a-machine-lets-blobot-say.md#answer--2026-09-06);
its Machine UI placement remains with the screen ticket. No box activation is enabled here.

## Setup-source check

The current [Docker agreement](https://www.docker.com/legal/docker-subscription-service-agreement/)
and [privacy page](https://www.docker.com/legal/privacy/) were opened on 2026-09-06 to verify the
links accompanying the already accepted account/software cost. The agreement distinguishes
Usage Data and reserves ownership in the vendor's software. The historical sbx daemon event
batch observation remains in research 08. Product wording says the software can send usage data;
it does not claim measured payload contents, a telemetry opt-out, a price or offline reliability.

## Validation

Focused: 149 adapter tests and 186 desktop tests pass. This includes selected-option identity,
multiple reusable options, missing details, once-only disclosure, live state and snapshot
restoration. Full suites: core 975 passed / 47 skipped; desktop 623 passed / 1 skipped. Both
package typechecks and production builds pass. Logs: `/private/tmp/blobot-disclosure-core-tests.log`,
`/private/tmp/blobot-disclosure-desktop-tests.log`, `/private/tmp/blobot-disclosure-desktop-build.log`. No real
provider grant or new persistence/revocation behavior is claimed by these tests.
