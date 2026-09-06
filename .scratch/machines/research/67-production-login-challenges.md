# Production guest login: first challenges and cancellation

Measured 2026-09-06, 01:14:11–01:18:26 UTC. Bounded AFK continuation of
[63](63-guest-login-ui-mechanisms.md) and [66](66-login-challenge-contracts.md),
using the newly prepared production `MachineLogin` and runtime login specs.

**All eight requested methods produced a challenge recognized by their current
production parser. Immediate `AbortController` cancellation completed, and each
guest had no new or login-related process left before its VM was stopped and
removed. No login was completed.** No browser URL was opened, code entered,
account selected, host provider credential imported, or inference requested.

The [executed fixture](67-production-login-challenges-fixture.mts) and
[sanitized receipt](67-production-login-challenges-results.json) are the primary
evidence. The receipt stores source hashes, image pins, origins/paths, field
presence/length, static markers, line structure and process metadata. It does not
store login URL queries, code/state values, raw CLI output, frame payloads or
hashes of authentication material. The data passed to the production parsers
remained in memory; the report received only the sanitized shape.

## Exact route measured

Host is the same macOS arm64 host as [64](64-production-box-launch-acceptance.md).
Engine client/server were `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, API 0.28.0. Each method used a new,
single owned VM with 2 vCPU/2 GiB, an 8 GiB private home, 20 GiB private Docker
storage, and a synthetic linked worktree/common Git directory under `/private/tmp`.
No real repository, operator skills, host home or host configuration directory
was mounted. Host Git operations used a synthetic identity and disabled global
and system Git config. The root kit declares no credential imports.

The production [MachineLogin](../../../packages/core/src/adapters/login.ts) ran
through `OwnedSbxMachine.spawn`, its fixed guest Node/bootstrap and its framed
`GUEST_LOGIN_SOURCE`. There was no TTY or fake CLI. The fixture used each actual
`*_LOGIN.spec(method)` unchanged, with a recording wrapper around `parse` and the
transport. It never called `respond`; its transport wrapper refuses input. The
callback records a sanitized challenge and immediately aborts. Each attempt had
a 60-second abort timer and a 75-second outer run deadline; none reached either
deadline.

| Image / CLI pin | Manifest identifier prefix | Anonymous download + validation + load |
| --- | --- | ---: |
| Claude 2.1.260 arm64 | `3b4535de4840` | 13.32 s |
| Codex 0.151.0 arm64 | `475f185a7387` | 16.79 s |
| Cursor 2026.09.02-c22c1a3 arm64 | `781376cc4e5d` | 15.83 s |
| OpenCode 1.18.4 arm64 | `f64b333bf23e` | 13.04 s |
| fx 0.0.7 arm64 | `fa5a6e736d16` | 13.78 s |

All were the exact published arm64 builds supplied by their adapter image
definitions, from the release admitted in [34](34-public-runtime-distribution.md).
Full image IDs, archive SHA-256 values and byte sizes are in the receipt. No
matching template or temporary archive was available at the start. Each image
was downloaded/verified/loaded once, reused for that runtime's separate fresh-home
attempts, then removed with its private download cache. The vendor Claude and
shell templates already present were not used or modified. These installation
times include network and validation; they are not pure load/boot costs.

## Recognized challenge matrix

Origins/paths below intentionally omit all authentication query values.
Lengths describe this observation only; they do not create a new format promise.
“Input” means the parser requests a later manual entry, not that anything was
entered. The user-code column is `LoginChallenge.code`, distinct from URL flags.

| Production spec / method | Executed guest CLI arguments | Observed origin/path | User code / input / callback | First challenge |
| --- | --- | --- | --- | ---: |
| [CLAUDE_LOGIN](../../../packages/core/src/adapters/claude/login.ts), subscription | `claude auth login --claudeai` | `https://claude.com/cai/oauth/authorize` | No displayed user code; manual input requested. State and PKCE challenge lengths 43. Printed redirect is `https://platform.claude.com/oauth/code/callback`. | 2,121.94 ms |
| [CODEX_LOGIN](../../../packages/core/src/adapters/codex/login.ts), device | `codex login --device-auth` | `https://auth.openai.com/codex/device` | User-code length 10; no input or callback requested. | 2,177.80 ms |
| [CURSOR_LOGIN](../../../packages/core/src/adapters/cursor/login.ts), browser | `cursor-agent login` | `https://cursor.com/loginDeepControl` | No user code or input; URL challenge length 43. `NO_OPEN_BROWSER=1` supplied by the spec. | 2,219.81 ms |
| [OPENCODE_LOGIN](../../../packages/core/src/adapters/opencode/login.ts), openai | `opencode auth login --provider openai --method 'ChatGPT Pro/Plus (headless)'` | `https://auth.openai.com/codex/device` | User-code length 10; no input requested. | 3,047.15 ms |
| OPENCODE_LOGIN, xai | `opencode auth login --provider xai --method 'xAI Grok OAuth (Headless / Remote / VPS)'` | `https://accounts.x.ai/oauth2/device` | User-code length 9; no input requested. URL also contains a query, discarded by the report. | 3,386.17 ms |
| [FX_LOGIN](../../../packages/core/src/adapters/fx/login.ts), vercel | `fx login vercel` | `https://vercel.com/oauth/device` | User-code length 9; no initial input requested. | 3,103.01 ms |
| FX_LOGIN, codex | `fx login codex` | `https://auth.openai.com/oauth/authorize` | No user code/input; parser requests callback `http://localhost:1455/auth/callback`, state length 43. | 1,948.33 ms |
| FX_LOGIN, grok | `fx login grok` | `https://auth.x.ai/oauth2/authorize` | Manual input requested; state/PKCE lengths 43. URL contains a guest loopback redirect at `http://127.0.0.1:<ephemeral>/callback`; parser chooses its manual-input route. | 1,853.81 ms |

The fx spec supplied `FX_NO_OPEN_BROWSER=1` for all three methods. No additional
environment override was added to a login spec. The executable paths were the
adapter's fixed `/opt/blobot/bin/...` paths, never host PATH lookups.

The timings begin immediately before `MachineLogin.run`, so they include its
`beforeWork` revalidation and guest transport setup. They are not isolated vendor
API latencies. No parser mismatch, missing challenge, unexpected input choice,
normal successful return or attempt timeout was observed in these eight runs.

These observations establish the previously unmeasured first device URL paths
for OpenCode xAI and fx Vercel in 66. They do not establish later redirects,
regional variants, future URL formats or authorization success.

## Browser suppression and cancellation

**Fixture-specific condition:** to obey the no-browser requirement, each isolated
guest received no-op executables for nine browser/opener names in
`/opt/blobot/bin`, `/usr/local/bin` and `/usr/bin`. They discard arguments and
append only one byte to a guest-local counter. No URL is saved by them. The login command, parser and transport remain the production implementations;
the no-ops change what happens if the CLI attempts its native opener. All changes disappear
with the VM.

Claude invoked a no-op opener once. Its first challenge and cancellation are
therefore accepted with that suppression; this is not acceptance of the native
opener on an otherwise unmodified image. The other seven methods invoked none.
In particular, the actual production Claude spec has no browser-suppression flag:
the fixture does not demonstrate that the UI route itself prevents a native
browser attempt. No host browser or callback relay was invoked by this research.

| Method | Challenge → `run` rejection | Consumed child exit frame | After-cancel process comparison |
| --- | ---: | --- | --- |
| Claude subscription | 17.00 ms | 143 | No new or login-related processes |
| Codex device | 21.55 ms | 130 | Same |
| Cursor browser | 12.88 ms | 143 | Same |
| OpenCode openai | 517.22 ms | None consumed | Same |
| OpenCode xai | 533.50 ms | None consumed | Same |
| fx vercel | 19.29 ms | 130 | Same |
| fx codex | 8.72 ms | 130 | Same |
| fx grok | 8.72 ms | 130 | Same |

All eight `run` calls rejected with `AbortError`; all transports announced close
without an error reason. The exit codes above are the wrapper's observed frame
values, not proof of a particular signal handler. OpenCode's exit frame was not
consumed before the aborted iterator stopped. Its roughly half-second close is
consistent with the wrapper's 500 ms escalation timer, but the actual signal is
not recorded and is not inferred as a measured fact.

Before/after inventories compared PID and process start time inside the one
microVM, excluding the inspecting process. They additionally searched for
executables under `/opt/blobot` and the exact source hash of the login wrapper.
There were zero new processes and zero matching login processes after each
cancel, before VM stop. No process arguments, environment values or account
data were emitted by that probe. Then the exact journal-owned VM was confirmed
`stopped` and removed before the next attempt.

## Limits and final cleanup

No success/completion parser, authorization-code validation, `respond`, actual
browser page, callback relay, account/workspace eligibility, Vercel team selection,
post-login status, persistence across restart, old-login replacement, provider
inference or usage was tested. CLI pipes on Linux arm64 inside macOS RC5 are
covered; native Linux-host sbx/KVM and amd64 are not. Network traffic beyond the
first challenges was not inventoried. This is challenge/cancel acceptance, not
login acceptance or proof of every error format.

All five downloaded references and private caches were removed, along with all
eight synthetic repositories/worktrees/journals. Final inventory:
`sandboxes: []`, only the initial vendor templates `94670d5b2a24` and
`5fc81bc7a127`, with image inventory identical to the initial one. The exact
temporary root was removed. The sampled free-disk minimum was 21.59 GiB against
the 2 GiB guard. Source hashes still matched when the note was closed. Sbx was
ceded back immediately after final cleanup; no further engine calls were made.
No production file, tracker entry, commit or global setting was changed.
