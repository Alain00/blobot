# Linux Claude: login-scoped BROWSER suppression

2026-09-06. Follow-up to the final opener finding in
[66](66-login-challenge-contracts.md#follow-up-suppressing-claudes-automatic-opener)
and the challenge/cancel observations in [67](67-production-login-challenges.md).

**The exact published Linux arm64 Claude 2.1.260 executes the destination of
`/bin/true` when the standalone login process receives `BROWSER=/bin/true`.** The
manual authorization challenge remains available, cancellation leaves no login
process, and ordinary guest processes before/after have no `BROWSER` variable.
No opener executable was replaced. No URL was opened, code supplied, account
authorized or inference requested.

## Evidence and subject

- [Accepted receipt](68-browser-env-results.json), 01:32:10–01:32:51 UTC.
- [Combined host fixture](68-browser-env-and-69-transport-fixture.mts), accepted
  repeat invoked with `BLOBOT_LIVE_BROWSER_ENV=1 BLOBOT_LOGIN_ONLY=1`.
- [Guest exec observer](68-login-exec-observer.py), SHA-256
  `919c073da9e9589634868e4e3b6743fb92aea0621cc7cb1d5af59d668bd1962c`.
- [First receipt](68-browser-env-first-results.json) and
  [first observer](68-login-exec-first-observer.py), retained because immediate
  cancellation initially prevented a positive opener observation.

The host is macOS arm64, engine client/server `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, API 0.28.0. The image is the same
published Claude arm64 pin as 64/67:
`sha256:3b4535de48403a040fa7302506592d41d4107bf5134a59bbbd93e03a36b72192`;
archive 693,360,640 bytes, SHA-256
`75881fe4b412dc3cf7daf36071d75e7f1a8c093ecc845c21ec909b43cb6c11ea`.
The actual Linux native executable `/opt/blobot/runtime/claude` hashed to
`9811afb5f97224c2c5d3d0ee1e8c316117d298d5ec3e095d5ff0c1dd0e889ca5` before
and after the accepted run. This is Linux evidence, not the macOS executable
examined statically in 66.

Each of the two sequential attempts used one own 2-vCPU/2-GiB VM, new 8-GiB home,
20-GiB private Docker storage and a synthetic Git worktree/common directory.
Only fixture-owned temporary paths were mounted. The initial failed-observation
attempt was fully cleaned before the accepted repeat. Research69 reused that
first VM after its login was cancelled; those successful mechanical tests were
not repeated in the second VM.

## What was observed

| Check | Accepted observation |
| --- | --- |
| Native command | `/opt/blobot/bin/claude auth login --claudeai`, whose wrapper execs the pinned native CLI |
| Scope of env | Fixture copies the production login spec, adds `BROWSER=/bin/true` and permits that key in its Machine transport. No box-global or host setting is written. |
| Exec trace | `/usr/bin/dash`, `/opt/blobot/runtime/claude`, then `/usr/bin/gnutrue`; all report the variable present and exactly equal to `/bin/true`. |
| `/bin/true` resolution | The image's existing symlink resolves to `/usr/bin/gnutrue`; this is the observed final executable. |
| Unexpected opener | No recognized browser/opener exec observed or blocked. |
| Ordinary guest process | UID 1000, `BROWSER` absent before and after the login attempt. Root inspection also finds it absent. |
| Files | Listed opener file fingerprints/symlinks and the native CLI are unchanged before/after. The fixture never writes any opener. |
| Challenge | `https://claude.com/cai/oauth/authorize`; manual redirect `https://platform.claude.com/oauth/code/callback`; state and PKCE lengths 43; manual input requested; no displayed authorization-code value. |
| Cancellation | `AbortError`; no new process by PID/start-time comparison and no login/observer process remaining before stopping the VM. |

The challenge arrived 2,273.27 ms after `MachineLogin.run` started, including
`beforeWork`, guest startup and observation. The run rejected 11.04 ms after
challenge delivery. These are instrumented timings, not a product latency claim.

## Why the observer delayed stdout

The first observer forwarded stdout immediately. It saw the native CLI receive
the correct env and produced a recognized manual challenge; cancellation then
arrived before any `/bin/true` exec was observed. That result established env
delivery, not suppression. It is consistent with the vendor call order in 66:
print the manual URL before awaiting the automatic opener.

For the accepted repeat, the observer retained the CLI's small initial stdout
only in memory, bounded at 256 KiB, until the true exec event. It then forwarded
the original bytes without editing the challenge. `MachineLogin` still cancelled
immediately upon the first recognized/delivered challenge. This delay is a
fixture observation aid; it is not a proposed production stdout wrapper.

The observer uses Python already in the guest and Linux `ptrace` fork/clone/exec
events. At exec it emits only executable path and booleans for the single env
key. Arguments and other environment values never leave memory. A guard would
kill a recognized unexpected browser/opener at its exec stop before allowing
its new program to run; that guard did not fire. `PTRACE_O_EXITKILL` terminates
tracees if the observer dies during cancellation. Exec-stop and exit-kill
semantics are documented by the [Linux ptrace manual](https://man7.org/linux/man-pages/man2/ptrace.2.html).
The tracer prefix and delayed stdout distinguish this measurement from the
untraced production cancellation already measured in 67.

## Integration boundary and cleanup

This validates a pin-specific override for this **standalone subscription login**.
It does not make `BROWSER` a documented stable Claude auth API, override an
attacher's browser capability, test Console/SSO or demonstrate successful manual
code completion. The precedence and documentation limitations in 66 remain.
No browser callback relay, token exchange completion or credential persistence
was attempted.

The fixture imports production `MachineLogin`, uses the production Claude parser
and passes env through the actual guest transport. It augments only its local
spec/allowlist and prefixes the CLI with the observer. The recorded source hashes
identify the tested source; later production additions of the same `BROWSER`
fields are separate integration changes. This research edited no production file.

Both receipts finish with the exact owned VM stopped and removed, no sandboxes,
the initial vendor templates `94670d5b2a24` and `5fc81bc7a127` unchanged, and the
temporary worktree/repository/journal/download cache removed. Final sampled disk
availability stayed above 21 GiB. Sbx was ceded clean after the accepted repeat;
no further engine calls were made for these notes.
