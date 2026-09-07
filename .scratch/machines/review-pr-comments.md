# PR #5 — Copilot and Claude review responses

Review baseline: `8bb8a85`, 6 September 2026. [Pull request](https://github.com/Alain00/blobot/pull/5).

All **33 inline comments and 11 additional summary findings** were assessed against code, accepted decisions and targeted regressions. Confirmed defects were corrected; partial claims and deferred capabilities are explicitly distinguished below. This does not replace Guillermo’s review or account/platform release acceptance.

## Standards and specification

The independent standards pass checked shared Git execution, identity bounds, CI provenance, persisted invalid state and UI regressions. The specification pass checked lifecycle, admission, native runtime policy, recovery and actual native behavior. The parent integrated desktop flows, cleanup, progress, ownership inventory and documentation. Tests and final commit references are recorded at the end.

## C1. apps/desktop/src/renderer/src/components/MachinePick.tsx

[Comment 3942816992](https://github.com/Alain00/blobot/pull/5#discussion_r3942816992) · `apps/desktop/src/renderer/src/components/MachinePick.tsx`.

**Valid — fixed.** The resource pickers include the persisted value as well as presets. Real UI tests preserve 3 CPUs / 6 GiB and change either field independently.

## C2. packages/core/src/workspace/git-identity.ts

[Comment 3942817002](https://github.com/Alain00/blobot/pull/5#discussion_r3942817002) · `packages/core/src/workspace/git-identity.ts`.

**Valid — fixed.** The inherited GIT_CONFIG_COUNT must leave room for the appended signing override. Boundary regressions accept 9,999 inherited pairs and reject 10,000.

## C3. Alto · un agente en sandbox consigue ejecución de código en el host a través del `.git` compartido

[Comment 3943532476](https://github.com/Alain00/blobot/pull/5#discussion_r3943532476) · `packages/core/src/workspace/status.ts`.

**Valid — fixed with an explicit trust limit.** Host Git uses command-scoped overrides for fsmonitor, hooks, diff/textconv, SSH selection and custom protocol helpers, including provisioning and explicit UI operations. Real linked-worktree regressions reproduce the execution vectors. Shared Git remains trusted metadata: filters, credential helpers and refs/objects are not made harmless, and other host tools do not use these overrides. UI Git buttons now skip hooks; docs/machines.md and CONTEXT.md disclose that behavior.

## C4. Alto · un `sbx create` fallido deja un `pending` que bloquea la Machine para siempre

[Comment 3943532479](https://github.com/Alain00/blobot/pull/5#discussion_r3943532479) · `packages/core/src/machines/sbx/owned-machine.ts`.

**Valid — fixed.** Interrupted creation is cleared only after complete inventory proves the name absent. A durable name+id retries boundary admission without another create; surviving name-only resources remain unadopted. Cancellation, failed journal save and explicit pending deletion have regression coverage. Unknown ownership is visible in Settings and still refuses destructive cleanup.

## C5. Alto · todos los agentes Claude locales pasan a correr Bash bajo el sandbox nativo en modo requerido, y no se anuncia en ninguna parte

[Comment 3943532481](https://github.com/Alain00/blobot/pull/5#discussion_r3943532481) · `packages/core/src/adapters/claude/sandbox.ts`.

**Valid — fixed; intentional policy retained.** ADR-0006 deliberately requires local Claude native protection even with box preview disabled. Added the measured loopback-binding setting and documented this main-branch behavior change. Research79 exercises the real pinned bridge/CLI with isolated configuration and a synthetic local provider; Git commits and loopback bind pass. Linux remains a separate host acceptance check.

## C6. Alto · un agente local que no arranca se queda sin puerta de vuelta

[Comment 3943532483](https://github.com/Alain00/blobot/pull/5#discussion_r3943532483) · `apps/desktop/src/main/index.ts`.

**Valid — fixed.** Agent execution lookup and retry now work for both locations. Missing local runtimes fail by Agent name with a Settings remedy, peers continue, and local panes show the reason/queue/retry. Retry refreshes host detection. Malformed factory/constructor failures are isolated before execution rather than silently becoming local.

## C7. Alto · borrar un agente mezcla tres pasos en un solo `try`, y el primero que falle se lleva a los otros

[Comment 3943532485](https://github.com/Alain00/blobot/pull/5#discussion_r3943532485) · `apps/desktop/src/main/team-store.ts`.

**Valid — fixed.** Cleanup reports working-folder and private-state outcomes independently. A workspace failure no longer skips private-state disposal, and a successful workspace removal survives a later state failure. Stop failure keeps potentially live work untouched. Regression tests cover all three orderings and UI visibility.

## C8. Medio · la limpieza completa es imposible en cuanto un equipo tiene un sandbox creado

[Comment 3943532488](https://github.com/Alain00/blobot/pull/5#discussion_r3943532488) · `apps/desktop/src/main/team-store.ts`.

**Valid — fixed.** Full clean requires a known working-folder size, not a known combined total. Unknown private state is disclosed separately; reclaimed bytes count only measured storage actually removed. UI and main-process regressions cover known work/unknown state and unavailable work.

## C9. Medio · el primer cambio de pin de imagen deja sin arrancar todos los sandboxes existentes

[Comment 3943532490](https://github.com/Alain00/blobot/pull/5#discussion_r3943532490) · `apps/desktop/src/main/machines.ts`.

**Valid limitation — refusal/remedy clarified; migration deferred.** The desktop checks the saved kit before downloading current software and reports a precise software mismatch. Existing home/login remain recorded, visible and explicitly removable only once the membership is gone. docs/machines.md explains matching-version reuse or a separate new Agent. Automatic image migration remains deferred by tickets 13/25 rather than silently reconstructing private state.

## C10. Medio · la existencia de `~/.claude/skills` queda grabada en la identidad del sandbox

[Comment 3943532494](https://github.com/Alain00/blobot/pull/5#discussion_r3943532494) · `packages/core/src/workspace/box-mounts.ts`.

**Valid — fixed.** The skills mount decision is retained from the saved kit while the current worktree is validated separately. Creating an operator skills directory later no longer changes an existing kit. Missing/replaced recorded directories refuse with a restore-path remedy; there is no silent mount retarget.

## C11. Medio · dos fuentes de verdad y ningún inventario: las cajas huérfanas son invisibles e imborrables desde la app

[Comment 3943532497](https://github.com/Alain00/blobot/pull/5#discussion_r3943532497) · `packages/core/src/machines/sbx/owned-machine.ts`.

**Valid — fixed.** Settings combines saved memberships, verified ownership journals and read-only engine inventory. Retained/pending/missing/unclaimed/unverified entries stay distinct. Explicit removal uses recorded identities, checks every active membership including invalid/local placements, preserves workspaces and refuses names alone. Real owned lifecycle tests with temporary journals/fake engine cover deletion and foreign-id rejection.

## C12. Medio · el desalojo puede cerrar un equipo mientras despierta su Machine, y el mensaje se pierde

[Comment 3943532499](https://github.com/Alain00/blobot/pull/5#discussion_r3943532499) · `apps/desktop/src/main/running-team.ts`.

**Valid — fixed.** Team eviction considers waking, startup and actual reserved Orchestrator work, including pre-work checks while power is awake. An integration test selects a fourth Team during wake and confirms the original queued message is delivered.

## C13. Medio · `stop()` en carrera con `beforeWork` deja el sandbox corriendo y el lease retenido

[Comment 3943532504](https://github.com/Alain00/blobot/pull/5#discussion_r3943532504) · `packages/core/src/machines/sleeping-runtime.ts`.

**Valid — fixed.** Wake and pre-work verification share one serialized transition for prompts/restarts. Shutdown waits for the check before stopping the Machine and never admits a late provider prompt. Two paused-verification regressions reproduce the prior race.

## C14. Medio · el cierre de la aplicación espera sin límite ni cancelación a un arranque de caja en vuelo

[Comment 3943532508](https://github.com/Alain00/blobot/pull/5#discussion_r3943532508) · `packages/core/src/machines/sleeping-runtime.ts`.

**Valid — fixed.** Each wake owns an AbortController propagated through engine, image and owned lifecycle commands. startTeam exposes pending execution before whole-Team readiness so application shutdown can actually cancel a first start. Cleanup drains before SQLite closes. No arbitrary global timeout abandons ownership/data cleanup.

## C15. Medio · el `sbx login` gestionado no puede funcionar como está, y no está en la lista de aceptación

[Comment 3943532509](https://github.com/Alain00/blobot/pull/5#discussion_r3943532509) · `apps/desktop/src/main/engine-setup.ts`.

**Partly valid — bounded fixes applied; account acceptance remains.** Official Docker docs state that sbx login opens its own browser; pipes alone do not prove impossibility and no documented PTY/no-browser event contract was found. Fixed hidden stdin waits, host-only desktop-session environment and bounded cancellation, with actual synthetic subprocess tests. The missing-browser fallback URL/code is still not surfaced: real managed OAuth on macOS/Ubuntu, fallback, keyring and cancellation remain explicit release blockers behind disabled-by-default preview. No account completion is claimed.

## C16. Medio · la descarga de ~700 MB de la imagen no muestra cifra, ni progreso, ni se puede cancelar

[Comment 3943532512](https://github.com/Alain00/blobot/pull/5#discussion_r3943532512) · `apps/desktop/src/main/machines.ts`.

**Valid — fixed.** Each Agent sees throttled numeric download progress during first startup and can cancel preparation without permanently closing execution. Shared transfers fan progress out to all waiters; one cancellation preserves peers and the last cancels download/import. Pending starts are exposed to IPC before the Team finishes opening. Tests cover fan-out, cancellation, retry and no post-cancel import success.

## C17. Medio · cada imagen descargada se queda para siempre en disco, y los templates viejos tampoco se limpian

[Comment 3943532514](https://github.com/Alain00/blobot/pull/5#discussion_r3943532514) · `packages/core/src/machines/sbx/image-store.ts`.

**Partly valid — archive cleanup fixed; template GC deferred.** Verified runtime archives are removed only after a matching installed template is confirmed; failed/cancelled imports retain them for retry. macOS installer archives are removed after verified installation; Linux packages remain for the OS installer. Settings shows cache bytes separately. Old template pruning cannot infer liveness from current members alone because retained/missing records and external engine clients may still refer to them; no unsafe automatic GC was added.

## C18. Medio · los pines apuntan a un repositorio personal mientras la CI de este repositorio publicaría en otro sitio

[Comment 3943532518](https://github.com/Alain00/blobot/pull/5#discussion_r3943532518) · `packages/core/src/adapters/claude/image.ts`.

**Valid documentation gap — fixed.** Documented public publisher guillermolg00/blobot-machine-images, exact source snapshot 056a3b31fa1838e16fcdd181c7c89528f7baf226, successful native run and sole observed writer Guillermo. This source workflow targets its own repository; public releases require their own reviewed snapshot/run. Hash pins reject altered assets, so control of the public repository alone cannot silently replace an already-pinned image. The external publisher was not mutated.

## C19. Medio · las acciones de GitHub van por etiqueta mayor mutable mientras todo lo demás está fijado por hash

[Comment 3943532519](https://github.com/Alain00/blobot/pull/5#discussion_r3943532519) · `.github/workflows/machine-images.yml`.

**Valid — fixed.** All six distinct GitHub actions/eight invocations are pinned to official full commit SHAs, with Dependabot for reviewed updates. Image docs disclose version-selected engine/buildx downloads and absence of independent attestations; hardening does not retroactively certify the existing publisher run.

## C20. Medio · en un Workspace `nested`, el sandbox nativo recién forzado probablemente bloquee `git add`/`git commit` del agente local

[Comment 3943532521](https://github.com/Alain00/blobot/pull/5#discussion_r3943532521) · `packages/core/src/adapters/claude/sandbox.ts`.

**Valid — fixed and measured.** A real nested-worktree negative control fails creating the common Git index.lock without allowWrite. Exact common directories for selected repositories now travel through runtimeFor to Claude sandbox settings. Ordinary and both nested commits plus loopback binding pass through the real pinned bridge/CLI. Excluded/empty repositories do not gain access.

## C21. Medio · un sandbox que no arranca no dice por qué

[Comment 3943532528](https://github.com/Alain00/blobot/pull/5#discussion_r3943532528) · `apps/desktop/src/renderer/src/components/AgentMachine.tsx`.

**Valid — fixed.** UiAgentMachine carries the tracker failure. Failed panes show the actual cause; missing engine names Settings → Machines. Login choices appear only when the latest guest detection requests sign-in, with details inline. Queues and retry are available for local failures too.

## C22. Medio · las negativas se muestran con el prefijo de Electron

[Comment 3943532530](https://github.com/Alain00/blobot/pull/5#discussion_r3943532530) · `apps/desktop/src/renderer/src/components/AgentMachine.tsx`.

**Valid — fixed.** A single preload invokeAction boundary removes only Electron remote-method wrapping from machine operations. It preserves the meaningful refusal and unrelated errors; regression tests cover wrapped/unwrapped errors and success.

## C23. Medio · la línea de estado se congela en el resultado de la última acción y nunca puede decir «listo»

[Comment 3943532535](https://github.com/Alain00/blobot/pull/5#discussion_r3943532535) · `apps/desktop/src/renderer/src/components/MachineSettings.tsx`.

**Valid — fixed.** The status line now always renders current read-only engine readiness when no action is active. A terminal action result is explicitly labelled Last setup attempt, not substituted for current readiness. A UI regression changes the engine state after a completed action. Read-only display still does not claim work admission.

## C24. Medio · la configuración del motor aparece dentro del panel de cada agente, que es lo que el ticket 12 rechaza

[Comment 3943532540](https://github.com/Alain00/blobot/pull/5#discussion_r3943532540) · `apps/desktop/src/renderer/src/components/AgentMachine.tsx`.

**Valid — fixed.** Removed engine onboarding from AgentMachine. The Agent disclosure names Settings → Machines as the shared setup door; onboarding remains in Settings and creation.

## C25. Medio · «20 GiB for Docker data» nombra el mecanismo, y la cifra está escrita a mano

[Comment 3943532545](https://github.com/Alain00/blobot/pull/5#discussion_r3943532545) · `apps/desktop/src/renderer/src/components/AgentMachine.tsx`.

**Valid — fixed.** The Agent panel receives private storage ceilings from its prepared/saved kit rather than hardcoding them and describes installed software without naming the engine product. Creation/edit/setup wording was aligned. Unverified inventory entries ask for restoration of the original ownership record.

## C26. Medio · se ofrecen hasta 8 CPUs y 16 GiB sin decir de cuánto dispone el ordenador

[Comment 3943532550](https://github.com/Alain00/blobot/pull/5#discussion_r3943532550) · `apps/desktop/src/renderer/src/components/MachinePick.tsx`.

**Valid — fixed.** Choices say up to, show host CPU/RAM, and show combined sandbox ceilings with a soft overcommit warning. Existing valid nonpreset values remain selectable. No arbitrary hard allocation cap was introduced.

## C27. Medio · `machineFor` sigue negando `box` con una frase que ya no es cierta

[Comment 3943532554](https://github.com/Alain00/blobot/pull/5#discussion_r3943532554) · `packages/core/src/machines/machine-for.ts`.

**Valid — fixed.** Core machineFor now accepts the host factory used by startTeam, verifies that it preserves the chosen kind and gives a precise missing-factory refusal. Local core consumers retain the useful default. Regression tests reject silent local fallback.

## C28. Medio · el canal de imagen de la propia interfaz está muerto

[Comment 3943532558](https://github.com/Alain00/blobot/pull/5#discussion_r3943532558) · `packages/core/src/runtime.ts`.

**Valid — fixed.** SleepingRuntime resolves its adapter image build and passes the requirement on every box start, including remedy. Owned image mismatch checks are reachable. Desktop imageFor remains the preparation path; the runtime requirement verifies agreement independently.

## C29. Medio · main estrecha una `Machine` con `instanceof` para llegar a tres miembros que la interfaz no tiene

[Comment 3943532562](https://github.com/Alain00/blobot/pull/5#discussion_r3943532562) · `apps/desktop/src/main/index.ts`.

**Valid — fixed.** Machine now has an optional runtimeAccess capability for detection and pre-start checks. Main and MachineLogins consume that structural capability instead of instanceof DesktopBoxMachine. Provider login interpretation remains adapter-owned.

## C30. Medio · tres ejecutores de `sbx` con semánticas distintas dentro del mismo árbol de clases

[Comment 3943532565](https://github.com/Alain00/blobot/pull/5#discussion_r3943532565) · `packages/core/src/machines/sbx/owned-machine.ts`.

**Valid — fixed.** Owned lifecycle and data-transfer control commands use the shared bounded sbx runner and its signal semantics. Policy-check exit1 remains explicit. Streaming archive subprocesses remain separate because bounded stdout is not their transport.

## C31. Medio · unas 2.900 líneas de `state-*.ts` y `data-transfer.ts` viajan en `packages/core` sin ningún consumidor

[Comment 3943532569](https://github.com/Alain00/blobot/pull/5#discussion_r3943532569) · `packages/core/src/machines/sbx/state-exec.ts`.

**Partly valid — organization clarified; removal not applied.** Added the sbx source README distinguishing active integration from retained state-preservation evidence and its ticket25 activation gate. The workspace package is private and state-exec has no desktop dependency path. Removing these regression tests or guarded seams conflicts with the accepted retention decision; unsupported resource changes remain refused.

## C32. Medio · CLAUDE.md sigue prometiendo una negativa por nombre que este PR borró

[Comment 3943532571](https://github.com/Alain00/blobot/pull/5#discussion_r3943532571) · `CLAUDE.md`.

**Valid — fixed.** Restored the per-Agent local missing-runtime refusal and retry door; CLAUDE.md and the main comment now explain that peers still start rather than claiming whole-Team refusal.

## C33. Medio · el registro de esfuerzos de CLAUDE.md no tiene entrada de Machines

[Comment 3943532574](https://github.com/Alain00/blobot/pull/5#discussion_r3943532574) · `CLAUDE.md`.

**Valid — fixed.** CLAUDE.md now indexes Machines, preview gate, local native policy, shared Git/network decisions, resize deferral, ADR and review/history links. Next points to current Machines acceptance while retaining independent effort follow-ups.

## S1. Ready-runtime retry

**Valid — fixed.** Explicit retry clears a failed tracker through starting→ready when the provider itself is still ready, then drains queued work without discarding its session. The admission-persistence failure regression retains one provider and delivers once.

## S2. Provider death and VM power

**Valid — fixed.** Unexpected awake provider death/stopping schedules serialized Machine stop. Power becomes asleep only on success and unknown on failure; retry resumes the latest session.

## S3. IPv6-disabled callback host

**Valid — fixed.** IPv6 unsupported/unavailable errors keep the IPv4 callback listener. An occupied IPv6 port still refuses and closes IPv4, preventing callback theft. Supported-error and actual occupied-listener regressions pass.

## S4. Agent identity/constructor failure

**Valid — fixed.** Runtime constructor/identity failures surface during per-Agent startup instead of escaping the creation loop. Peers and queued work survive; retry reconstructs after correction.

## S5. Malformed persisted placement

**Valid — fixed.** StoredMachinePlacement has an explicit invalid sentinel. The damaged row remains visible/editable/deletable, healthy listings continue and no local fallback is constructed. Joining choices validate before provisioning. Cleanup consults verified ownership separately from malformed placement.

## S6. Unreadable sleep preference

**Valid — fixed.** Unreadable saved sleep settings carry an explicit diagnostic. The editor is blank until a deliberate repair, including choosing zero hours; only successful persistence clears the diagnostic. Runtime fallback is visibly temporary.

## S7. Manual authorization code masking

**No behavior change — intentional privacy choice.** A manual authorization response can contain exchange credentials/callback state, whereas the displayed device code is intended to be read on another screen. Keeping pasted input masked and clearing it on submit/challenge changes is deliberate. No account credential is logged or persisted by this UI; a show/hide control can be considered separately.

## S8. Sign-in method accessibility

**Valid — fixed.** Sign-in method details are now visible next to their actions and connected by aria-describedby, rather than hidden in a title tooltip.

## S9. Generic process helper ownership

**Valid — fixed.** Moved generic child environment/transport helpers and their tests to core/process, updated actual imports and public exports, and removed ACP coupling from the transport type. No extra wrapper or compatibility shim.

## S10. Stale image documentation

**Valid — fixed.** Image README and release notes now state accepted open Internet/host/LAN reach, deferred resize/migration and the actual public publishing path.

## S11. Future hosted mailbox/path seam

**Deferred — future product design.** Hosted paid Machines remain explicitly out of scope. The current Machine transport/path namespace and mailbox seam isolate those concerns; adding unused remote reach variants now would be speculative. Extend the union and host provisioning contract with real hosted requirements in that effort.

## Validation and release limits

Final integrated verification: **core 1,135 passed / 47 skipped; desktop 684 passed / 1 skipped**. Both typechecks and production builds pass; image release-manifest tests pass 3/3. The actual Electron interaction fixture passed and its synthetic captures were refreshed. There are 79 additional automated regression cases relative to review baseline. A pre-existing dictation test’s fixed 20 ms wait flaked under the full suite; it now waits for durable download-completion writes, with no production dictation change.

Commits: `4ba7311` (CI/provenance), `756c061` (host Git), `563adfe` (lifecycle, storage, UI and native regression). Each uses Guillermo’s configured author/committer, without bot trailers. Native macOS regression is documented in [research79](research/79-local-claude-git-sandbox.md). The [preview guide](../../docs/machines.md) names the remaining account/platform acceptance, managed engine missing-browser fallback, deferred migration/resize and shared-template GC limits. The draft PR keeps Guillermo’s not-ready note first.
