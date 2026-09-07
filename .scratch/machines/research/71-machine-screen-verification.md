# Machine screen verification

2026-09-06, macOS arm64, built Electron desktop with development preview enabled.
[The fixture](71-machine-screen-fixture.cjs) drives the actual renderer and preload.
Its paths record this workstation; build core and the desktop first, then run it
with Node and the bundled Playwright runtime. Screenshots disable animations.

The first Settings read uses actual read-only engine readiness. Subsequent views
replace only test IPC handlers with explicit synthetic snapshots: Alice uses a
sandbox, Bob is local, Alice has queued work and a fake manual-login challenge.
No Team/worktree/VM is created, no sign-in is submitted and no provider is called.
The temporary Electron profile lives under `/private/tmp/blobot-machines-ui-review`.

Observed and checked:

- Settings shows saved Agent CPU/RAM and engine setup in the existing page.
- Alice's login controls sit in the composer's measured notice area and do not
  overlap its input. The first capture exposed overlap; this was corrected before
  these final captures by using the existing notice slot/height observer.
- Creating a mixed Team submits a box default (2 CPUs, 4 GiB) and Bob's explicit
  local override. Existing creation controls, typography and colors remain.
- At 840×660 the folder/setup area scrolls, and the sticky Create control remains
  reachable after opening setup. The disclosure remains inline.
- Component tests separately check typed login-code stability across view refresh,
  attempt-scoped submission, and clearing input on completion. Main-process tests
  verify that default builds refuse box activation before invoking the engine.

[Settings](71-machine-screen-captures/settings-registry.png) ·
[Agent login](71-machine-screen-captures/agent-login.png) ·
[Mixed Team](71-machine-screen-captures/creation-mixed.png) ·
[Narrow setup](71-machine-screen-captures/creation-narrow-setup.png)

These are interaction/layout checks, not successful account authentication,
end-to-end provider execution, or Guillermo's still-pending visual review.

Repeated after PR comment fixes on 2026-09-06. The Agent pane no longer embeds engine
onboarding; Settings includes a separate ownership inventory. The mixed placement,
login/composer geometry and 840×660 creation checks still pass. Component tests also
cover local retry, initial download cancellation, ownership removal confirmation,
nonpreset limits and corrupt sleep-preference repair.
