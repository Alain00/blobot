# Skills MVP: implementation and acceptance

Implemented locally on 2026-09-06 from `c89ca8ac022470c4619566e7892656bdebdbcd51`, on
`feat/machines`. The initial implementation was left uncommitted as requested; the user
subsequently authorized commit and push to the existing PR. Unrelated pre-existing lockfile
changes remain local; YAML 2.9.0 was added for Agent Skills frontmatter.

## Delivered first cut

- `PersonalSkills` owns a profile's `.agents/skills` catalogue. Complete local packages,
  binary resources and executable bits survive deleting the original source. Manually
  created skills are discovered. Invalid managed entries remain visible with errors.
- Drafts live outside native discovery. Create or explicitly retain an incomplete local
  import as a draft, edit its folder, then publish. Imported drafts retain provenance.
- Generic public Git HTTPS import resolves an exact commit with isolated Git config,
  without hooks, helpers, submodules or dependency installation. Folder collections,
  GitHub shorthand and both skills.sh URL hosts enter the same preview pipeline.
  Repository-level license/notice files travel with standalone skill packages.
- Preview displays the actual staged SKILL.md, author/license when declared, source and
  complete file list. Selection is explicit for collections. Names are unique per profile.
- Remote checks compare normalized package content, so a neighbor-only repository change
  is not an update. Local reimport is explicit. Edited content blocks replacement/removal;
  making a personal copy retains attribution and disconnects remote updates.
- Publication has a per-profile admission gate, durable journal and roll-forward recovery.
  Previous files remain recoverable; the last 20 removed/replaced versions are retained.
  Unreferenced staging expires after 24 hours. Changed queued inputs stay blocked and can
  be cancelled. A profile's personal identity is always validated before access.
- Execution leases span start/load/wake through confirmed provider and Machine shutdown.
  Early lifecycle events do not release files. Local POSIX executions own process groups;
  successful cleanup is remembered and failed cleanup remains retryable. Group cleanup
  covers children in that group, not independently detached external services.
- Claude owns its internal `.claude/skills` projection; conflicting existing files are
  preserved and do not block Codex's manager. Claude/Codex receive additional roots on new
  and resumed sessions; OpenCode receives its native skills path. HOME is unchanged.
- Your agents has a visible Skills action. The screen offers folder/link/create, preview,
  details, external editing, updates, drafts, pending changes, cancellation and recovery.
  The context/workspace popover opens each agent's read-only personal/project/computer
  inventory. Duplicate names are unconfirmed conflicts; disk detection never means loaded.
  Cursor/fx explicitly lack personal native integration in this cut.

Project installation is the separate second cut. MCP management, remote private Git auth,
plugins, dependency installation and a marketplace were not added. Private content can be
imported from its local clone without uploading it.

## Validation

- `pnpm -r typecheck`: passed.
- `pnpm -r test`: **1,876 passed** (1,187 core, 689 desktop), 49 existing opt-in tests skipped.
- `pnpm -r build`: passed for core and desktop.
- `git diff --check`: passed.
- Filesystem tests cover complete imports, cross-profile isolation, staged edits, concurrent
  installs, incomplete drafts, binary/executable resources, path confinement, same-name
  collisions, explicit reimport, retained edits, provenance and recovery after four crash
  phases. Remote-update tests cover neighbor-only changes and conversion to personal content.
- Process tests prove a SIGKILL request is not sufficient, unconfirmed exit rejects, an owned
  background child is stopped, and repeated successful close does not reuse an old PGID.
  SleepingRuntime tests prove leases outlive early stopped events and failed cleanup.
- Native adapter tests cover new/load config, palette intersection, stop retry and a
  Claude-only projection conflict. Inventory tests cover duplicate origins and escaping links.
- Real production adapters: **6/6 invocations passed**, new and resumed sessions in Claude,
  Codex and OpenCode, each reading a different relative proof resource from an imported
  personal skill. Selected global config/auth files remained byte-identical. See
  [production probe report](research/04-production-native-probes.md).
- A real GitLab HTTPS preview resolved 23 skills with their source commit; no installation
  was required. See [GitLab result](research/probe/gitlab-preview-result.json).
- A disposable Codex sandbox discovered personal, project and readonly operator fixtures
  together and read through the internal alias. It was destroyed. See
  [native probe report](research/03-native-probes.md).
- Browser QA used production React components with explicit fixture IPC data, at 1280x900
  and 360x780. Folder preview, full instructions, draft creation, empty/pending states,
  scrolling, Escape, focus return and absence of horizontal overflow were checked. No page
  errors were reported in the settled page. Navigation from the Team's context popover into
  its skill inventory and then the personal manager also passed. These checks validate UI
  behavior, not Electron filesystem IPC.
  Reproduce with `pnpm --filter @blobot/desktop exec vite --config ../../.scratch/skills/visual.vite.mts`
  and open `http://127.0.0.1:35174/.scratch/skills/visual.html`.

## Review

The Standards and Spec reviewers independently reviewed the working diff and new files.
All reported issues were fixed: provider-owned projection, canonical skills.sh hostname,
readable preview, refreshed detail, imported drafts, provenance on restore, process exit,
background cleanup and idempotent completed close. Both final reviews have no pending findings.
See [review record](review.md).

## Acceptance limits

Authenticated end-to-end guest invocations for Claude/OpenCode, authenticated ACP inference
inside the Codex guest, and Linux/KVM remain unexecuted. The sandbox smoke proves native
catalogue and filesystem behavior on macOS, not those broader cases. The 49 skipped tests
are existing opt-in suites; no new skipped test hides a failing skill implementation.

Managed mutations wait for the application's execution leases. Direct edits and independently
launched processes outside Blobot keep their own runtime semantics. A resumed history may
still contain instructions from a removed skill; removal is not history erasure.
