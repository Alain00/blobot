# Image decision frontier after host worktrees

Date: 2026-09-05. Scope: ticket `13`, following `22` and the author's acceptance of a
host worktree plus its common Git directory mounted RW. Research only: official docs,
release/package metadata, installed source and `sbx --help`. No sandbox, image build,
large image download, daemon change or live login was performed. Proposals below are
not recorded human decisions.

## What is already decided

- Keep `sbx`, UID 1000, passwordless guest sudo and private Docker/Compose inside each
  microVM. The host Docker socket stays outside. Do not re-ask this trade-off:
  [`22`, answer](../issues/22-reevaluate-the-first-machine-engine.md#answer).
- Build one image per runtime in CI. Delivery is **CI → release tar per runtime and
  architecture → blobot download with pinned SHA-256 → `sbx template load`**, already
  settled in [`13`, build-and-pull amendment, lines 397–420](../issues/13-the-image-one-per-runtime.md).
- Resource edits have approval for opaque data passing through broker memory, temporary
  cost and retention of the original; image upgrades were expressly excluded. The
  approved scope is recorded in [`19`, lines 187–208](../issues/19-a-box-lifecycle-and-engine-setup.md).
  It does not establish whole-system or Docker preservation.
- No user credentials or skills are baked into a release image. The Claude bridge
  selects the image's own CLI through `CLAUDE_CODE_EXECUTABLE` (`13`, lines 381–395).

## A viable base proposal, with a concrete pin

Use a common derivative of `docker/sandbox-templates:shell-docker`, then add the
runtime and bridge for each of the five images. Docker documents an Ubuntu base,
`agent` with sudo, a shell variant without an agent, and `-docker` variants with an
inner daemon. This retains the vendor's environment contract while allowing a later
measured reduction. It is a **candidate**, not a tested blobot image.
([Docker templates](https://docs.docker.com/ai/sandboxes/customize/templates/))

Public registry metadata read on this date, without fetching layers:

| `shell-docker` object | SHA-256 |
| --- | --- |
| Multi-platform index | `5fc81bc7a127e59d81b244a06831ae3212a0310b2e5a0349c54e29249e45e919` |
| Linux amd64 manifest | `53b08fa716a1725f5a238b69e85f05f96956e621943d7a5c4466502321b07cfd` |
| Linux arm64 manifest | `d353bf15d949bfb5a9de5338cc1285949a9e83d575c185958e449a19d9150190` |

Source: [Docker Hub distribution manifest](https://registry-1.docker.io/v2/docker/sandbox-templates/manifests/shell-docker),
retrieved with a public pull token. This proves a pin exists for both architectures;
it does not prove these bytes match the older cached shell fixture or certify its packages.
`ubuntu:24.04` also has both architectures, but assembling its full sbx/inner-Docker
contract adds work without evidence that it improves the first release.

**The root kit still matters.** Merely choosing a `-docker` image does not prove that
blobot's custom root kit starts the daemon correctly. The current
[`sbxKit`](../../../../packages/core/src/machines/sbx/kit.ts) overrides the entrypoint
with Node, declares home storage, and contains no explicit privileged setting,
Docker data volume or daemon startup. Those must be resolved together against the kit
schema and then tested. Do not import a permissive vendor agent kit to obtain them.

## Pinning the five CLIs and two bridges

These are compatibility baselines from `13`, not a claim that each is the newest
release. Version drift on the operator's Mac is not an instruction to update them.

| Runtime | Concrete distribution candidate | Evidence and remaining limit |
| --- | --- | --- |
| Claude `2.1.260` | Exact npm package with exact platform optional package, or native versioned installer | [npm version metadata](https://registry.npmjs.org/@anthropic-ai/claude-code/2.1.260) exists, includes integrity and platform dependencies; [official installation](https://code.claude.com/docs/en/installation) supports exact native versions. No Linux installation run here. |
| Codex `0.151.0` | Official `rust-v0.151.0` Linux arm64/x64 release assets | [Release](https://github.com/openai/codex/releases/tag/rust-v0.151.0) and [asset API](https://api.github.com/repos/openai/codex/releases/tags/rust-v0.151.0) publish downloadable assets and SHA-256 digests. Check whether the package bundle's helper binaries are required before choosing only the bare executable. |
| OpenCode `1.18.4` | Official Linux arm64/x64 release tar | [Release](https://github.com/anomalyco/opencode/releases/tag/v1.18.4), [asset API](https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.18.4) and [pinned installer source](https://raw.githubusercontent.com/anomalyco/opencode/v1.18.4/install) establish named versions and platform downloads. The executable is distributed independently of system Node. |
| fx `0.0.7` | Official Linux arm64/x64 tar plus checksum | [Release](https://github.com/vercel-labs/fx/releases/tag/v0.0.7) and [asset API](https://api.github.com/repos/vercel-labs/fx/releases/tags/v0.0.7) include both architectures and `.sha256` files. Its [source/build instructions](https://github.com/vercel-labs/fx/blob/v0.0.7/README.md) require Zig for building, not Node to run the release executable. |
| Cursor `2026.09.02-c22c1a3` | Exact versioned native package used by its installer | Reading [the official installer](https://cursor.com/install) exposed `https://downloads.cursor.com/lab/2026.09.02-c22c1a3/linux/{arm64,x64}/agent-cli-package.tar.gz`. Both Linux HEAD requests returned **403 here**: download and checksum are unverified, not evidence of unsupported Linux. Local installed launcher uses its own sibling Node executable. |

Keep a build lock for every package and transitive dependency; pinning a top-level
version alone leaves dependency ranges unresolved. The repo's bridge versions are
already exact in [`packages/core/package.json`](../../../../packages/core/package.json):

- [`@agentclientprotocol/claude-agent-acp@0.70.0`](https://registry.npmjs.org/@agentclientprotocol/claude-agent-acp/0.70.0)
  requires Node ≥22 and depends on Claude Agent SDK `0.3.232`. That SDK's native packages
  are optional dependencies; omitting them is a plausible size reduction, still needing
  an install and ACP test with the explicitly selected external Claude CLI.
- [`@agentclientprotocol/codex-acp@1.7.0`](https://registry.npmjs.org/@agentclientprotocol/codex-acp/1.7.0)
  depends on `@openai/codex` through a caret range. Set the image's `CODEX_PATH` as the
  [existing adapter](../../../../packages/core/src/adapters/codex/stdio-bridge.ts) does;
  otherwise the bridge may select a different bundled CLI.

**System Node is currently required in all five images.** Independently of each CLI,
the [sbx transport](../../../../packages/core/src/machines/sbx/transport.ts) invokes
`guestNode -e` and the [guest bootstrap](../../../../packages/core/src/machines/sbx/bootstrap.ts)
uses Node APIs. `22.22.1` is a pinneable baseline for that path: official
[checksums](https://nodejs.org/dist/v22.22.1/SHASUMS256.txt) contain Linux arm64 and x64
archives. Removing Node from the bridgeless images would require changing this machinery.

Proposal: put fixed release binaries, Node and bridge trees below `/opt/blobot`,
outside the mounted `/home/agent`; use explicit executable paths. Record versions and
hashes in the build manifest, and verify them before enabling a runtime. Claude
documents `DISABLE_UPDATES` to disable automatic and manual update paths. Cursor
[documents automatic updates](https://cursor.com/docs/cli/installation) but its
[parameter reference](https://cursor.com/docs/cli/reference/parameters) does not establish
a disable switch; do not invent one. Cursor update behavior and the other CLIs' update
paths remain validation items. Guest sudo means a supplied version pin is not a
guarantee that an Agent can never alter its own Machine.

## Persistence is the important unfinished contract

| State | Stop/start of the same Machine | Current replacement path |
| --- | --- | --- |
| Host worktree and common Git directory | Remain on host | Reattach the same owned paths; no copy or rollback of host Git state |
| `/home/agent` | Private volume | Legacy fixture copies this tree through memory |
| Installed packages and changes in `/usr`, `/opt`, `/etc`, `/root` | Same sandbox retains its filesystem | Not copied by the two-tree archive |
| Private Docker images, containers, named volumes and configuration | Require its persistent storage and correct restart | Not covered by the two-tree archive |

The last column follows directly from
[`data-transfer.ts`, lines 23–27](../../../../packages/core/src/machines/sbx/data-transfer.ts):
the archive contains only `home/agent` and legacy `workspace`. The current
[`reconfigure`, lines 245–247](../../../../packages/core/src/machines/sbx/owned-machine.ts)
already rejects resource changes for mounted Workspaces until full private state
preservation is established. Image/configuration mismatches are separately refused.

Docker documents persistent sandbox changes and local `template save` as capturing
packages, configuration and files. It also warns that saved templates can contain
credentials and that agent configuration is recreated at creation. The documentation
does **not** give a sufficiently precise guarantee that all mounted block-volume data
is captured. A saved template is therefore a candidate for the system layer, not proof
of whole-Machine migration.
([Template persistence and limitations](https://docs.docker.com/ai/sandboxes/customize/templates/#saving-a-sandbox-as-a-template))

Installed `/opt/homebrew/Caskroom/sbx@rc/0.42.0-rc5/bin/sbx template save --help`
confirms local save into the engine image store and optional tar export. Its
`--capture-mode all` memory/disk/microVM checkpoint is **only effective with `--cloud`**;
it is not evidence for a local resource-edit solution. No save was executed.

Docker state must be inventoried from the actual daemon configuration. Engine 29's
containerd image store can use `/var/lib/containerd` in addition to `/var/lib/docker`,
while daemon configuration normally lives in `/etc/docker/daemon.json`. Copying only
`/var/lib/docker` is not a universal guarantee.
([Docker daemon data directory](https://docs.docker.com/engine/daemon/#daemon-data-directory))
The copy helper itself notes that `sbx exec` can restart a stopped guest. **Inference:**
once that guest boots a private daemon, migration must also hold inner services and
containers quiescent; stopping only the outer VM before issuing `exec` is insufficient.

## Decisions versus factual gates

The consequential unresolved answer is the promised resource-edit behavior: preserve
the Agent's installed system and complete Docker state, or explicitly reset some of
it. Recommendation: preserve it, keep the current refusal until verified, and retain
the original during cutover. Do not silently interpret the old two-tree approval as
acceptance of losing packages or Docker data. Image upgrades remain refused under the
existing decision; they need not be designed to finish first-use images.

If preserving the system requires a persistent per-Agent snapshot in the engine image
store, that is a distinct proposed lifecycle/storage mechanism. It must not become a
release artifact or host tar containing credentials. Resolve its retention and private
state boundary against `19`'s approved no-host-credential-archive route before using it
on real data. A synthetic fixture can establish what it captures first.

The concrete image proposal for the author is the common `shell-docker` derivative
above, retaining sudo and private Docker, versus investing now in a smaller Ubuntu
base with an independently assembled contract. Recommend the derivative first; size
has not yet been measured for blobot's five images. Exact dependency pins can accompany
that baseline without a separate interview per patch.

The storage choice needs explicit home and private-Docker capacity limits, plus the
acceptable download/shared-image budget and temporary space for retaining the original
during replacement. The old clone-workspace volume budget no longer applies to the host
worktree. Do not present `12`'s placeholder figures or a vendor default as measured costs.

Publication is narrower than a fresh registry/hosting choice: `13` already names release
assets and says no registry credentials. Its lines 405–408 explicitly leave the private
repository download barrier outside this ticket. Public availability therefore requires
the owner to resolve that existing distribution decision; this research does not
authorize making a repository public or adding tokens. The measured first architecture
is arm64; the second remains Alain's to name. amd64 assets exist if that is the answer.

For skills, `13` lines 343–360 place mounts and discovery under `05`; the image only
promises not to bake them in. The follow-up below supplies the path facts requested by
`05`, without changing the policy about what crosses.

The following are **engineering evidence still needed**, not preference questions:
Cursor Linux retrieval/hash and update behavior; root-kit Docker privileges/startup and
effective data directories; local snapshot coverage and cost; complete resource-edit
preservation with quiescent Docker; actual layer/tar sizes; and the five runtime login,
ACP and mailbox acceptance paths against the proposed base. None was certified here.

## Follow-up: Linux skill discovery roots for the five pins

Read-only source verification on 2026-09-05; no provider was executed and no binary
downloaded. Assume blobot owns the guest environment: `HOME=/home/agent`, default
guest config homes, and no imported host configuration. With the integration's
documented `sbx create … PATH:ro`, the single host skills tree is mounted read-only at
**its absolute host path**, also visible at that path in the guest. Below, `MOUNT`
means that actual mounted path for the operator's `~/.claude/skills`; it does not mean
`/home/agent/.claude/skills`. No public remap to `/home/agent` has been verified.
Aliases below refer only to the skills directory, never to an entire `.claude`,
`.cursor`, `.codex` or config directory.

| Candidate version | Verified user discovery root(s) in Linux home | Guest connection to the single mount | Primary evidence |
| --- | --- | --- | --- |
| Claude `2.1.260` | `~/.claude/skills` | `/home/agent/.claude/skills` → `MOUNT` | [Official skills locations](https://code.claude.com/docs/en/skills#where-skills-live); the installed `~/.local/share/claude/versions/2.1.260` also contains the personal/project discovery help text. Documentation plus exact-version static corroboration, not Linux execution. |
| Codex `0.151.0` | `~/.agents/skills`; legacy `$CODEX_HOME/skills` | `/home/agent/.agents/skills` → `MOUNT` | [Pinned roots, lines 95–107](https://github.com/openai/codex/blob/rust-v0.151.0/codex-rs/ext/skills/src/host_roots.rs#L95); [loader canonicalizes roots and follows User symlinks, lines 129–175](https://github.com/openai/codex/blob/rust-v0.151.0/codex-rs/ext/skills/src/loader/host.rs#L129). `.claude/skills` is not a default Codex root. |
| OpenCode `1.18.4` | `~/.config/opencode/skills`; compatible `~/.claude/skills` and `~/.agents/skills` | Prefer `/home/agent/.config/opencode/skills` → `MOUNT`; the native root also works when blobot disables external/Claude discovery. | [Pinned discovery, lines 185–207](https://github.com/anomalyco/opencode/blob/v1.18.4/packages/opencode/src/skill/index.ts#L185); [native path docs](https://opencode.ai/docs/skills/#place-files); [pinned config-home resolution](https://github.com/anomalyco/opencode/blob/v1.18.4/packages/core/src/global.ts). Scanner uses `symlink: true` at lines 147–155. |
| Cursor `2026.09.02-c22c1a3` | `~/.cursor/skills`, `~/.agents/skills`; compatible `~/.claude/skills` and `~/.codex/skills` | Prefer `/home/agent/.cursor/skills` → `MOUNT`; `.claude` compatibility discovery is conditional on third-party extensibility. | [Official paths](https://cursor.com/docs/skills#skill-directories); exact installed [index.js](/Users/guillermo/.local/share/cursor-agent/versions/2026.09.02-c22c1a3/index.js) defines `qr` roots, `Wr(home, enabled)` user roots and `Xr`'s third-party filter. Its filesystem walker resolves symlinks. These are platform-independent JS path operations; Linux package execution remains untested. |
| fx `0.0.7` | `~/.fx/skills` managed root, plus compatible `~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills`, `~/.config/opencode/skills`, `~/.claw/skills` | `/home/agent/.claude/skills` → `MOUNT` | [Pinned global roots, lines 26–38](https://github.com/vercel-labs/fx/blob/v0.0.7/src/builtins/skills.zig#L26); [HOME resolution, lines 41–59](https://github.com/vercel-labs/fx/blob/v0.0.7/src/builtins/skills.zig#L41); [runtime joins global roots to home, lines 357–360](https://github.com/vercel-labs/fx/blob/v0.0.7/src/core/skills/skill_runtime.zig#L357). |

For a uniform setup independent of compatibility toggles, link the applicable guest
discovery root to `MOUNT`: Claude and fx `.claude/skills`, Codex `.agents/skills`,
Cursor `.cursor/skills`, OpenCode `.config/opencode/skills`. All of those are paths
under `/home/agent`, distinct from the absolute host mount path. Create/validate those
aliases **after the home volume is attached**; baking them under `/home/agent` would
hide them beneath that volume. Refuse an existing conflicting path instead of replacing
Agent data. A symlink does not relax the target mount's read-only permission.

OpenCode's exact [runtime flags](https://github.com/anomalyco/opencode/blob/v1.18.4/packages/opencode/src/effect/runtime-flags.ts#L21)
disable compatible roots through `OPENCODE_DISABLE_EXTERNAL_SKILLS`,
`OPENCODE_DISABLE_CLAUDE_CODE` or `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`; native config
roots are scanned outside that condition. Cursor's native roots similarly avoid its
third-party filter. Keep guest config-home variables consistent with the table rather
than inheriting operator overrides. Claude's user skill source must remain enabled in
the bridge; a path alone cannot override `settingSources` excluding that scope.

These facts establish where to link. They do not certify the final prepared ACP
sessions' discovery, name precedence, palette enumeration or behavior of symlinks
*inside* the mounted skills tree that point outside it. Those remain `05`'s validation
against the permitted tree; no additional host root is implied by such a link.
