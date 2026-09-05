# How the market grains the machine

Read 2026-09-04 from each vendor's own documentation, pricing or source; everything here is [DOC],
eve from the installed package (`eve@0.51.1`). *Not stated* means the vendor is silent. Nothing was
run. Conductor, Sprites and Ona are added because each answers one column better than the list.

## Comparison


| Product | Bound to | Repo enters by | Work lands; who pushes | Persistent home | Shared | Credentials | Hosted / price |
|---|---|---|---|---|---|---|---|
| Docker Sandboxes | **workspace directory**, long-lived | virtiofs mount of the checkout, or `--clone` in the VM | user's local tree; user commits, or fetches `sandbox-<name>` | per-sandbox VM state; no host `~/.claude` | skills store, mounted dir | host proxy injects, VM sees sentinel; SSH agent forwarded | local, free |
| eve | **durable session**, one sandbox per agent | seeded files, `bootstrap` clone, or GitHub channel checkout | inside `/workspace`; no push flow | `/workspace` per session; memory per principal | root's `agent` copies share; declared subagents never | firewall injection; secrets never enter | framework; Vercel Sandbox or local Docker |
| Grok Bot | **user account**: one VM per user, all Bots on it | not stated | `/workspace` files; no branch, no PR | yes, per user: files, logins, memory, routines | all a user's Bots: files, logins, connectors | human types logins in a takeover; tokens on backend | hosted; Cursor/SuperGrok tier |
| Codex cloud | **chat/task** container per repo environment | GitHub App clone | diff; PR by user, or `codex apply` patch locally | none | environment cache | App token; secrets only in setup | hosted; Plus/Pro/Business $20 |
| Cursor cloud agent | **run** VM; 90 d snapshot | App clone atop a cached Build | forge; agent pushes, opens PR | none; Build per environment | Build image | App token; secrets as env, Runtime Secret redacted | hosted; $20/$40 seat + model price |
| Claude Code web | **session**; VM reclaimed | fresh clone; snapshot after setup | Claude pushes; user clicks Create PR; `--teleport` fetches locally | none | environment snapshot | proxy swaps scoped credential; `proxy-injected` placeholder | hosted; Pro/Max/Team, no compute charge |
| Devin | **session** VM; org snapshot | App clone into snapshot; Outposts: `repos/` on your box | forge; Devin pushes, opens PR; authoring modes | none; org Knowledge, Playbooks | org snapshot; Outpost `repos/` | org App token; secrets as env | hosted; $0 to $200; ACUs |
| Copilot cloud agent | **task**: one Actions job, 59 min | `actions/checkout` | forge; `copilot/*` only; draft PR; human merges | none; Memory per repo/user | runner image | repo-scoped token; secrets as env | hosted; Actions minutes + credits |
| container-use | **environment**: container + branch per task | `git push HEAD` into a bare fork; worktree at `/workdir` | fork branch auto-committed; `cu merge/apply` into the checkout | none | Docker daemon; one fork per repo | secret refs resolved in container | local, free, Apache-2.0 |
| OpenHands | **sandbox** for one or more conversations | cloud: App clone; local: bind mount | local: the mounted tree; cloud: agent pushes, opens PR | none; `.openhands/` per repo | grouped conversations share fs, credentials | tokens as env vars | both; local free, cloud at-cost |
| Jules | **task**; fresh VM | App clone; per-repo snapshot | GitHub branch user owns, Jules authors; PR on request; patch locally | none; memory per repo | per-repo snapshot | App auth held by Google; repo env vars | hosted; 15/100/300 tasks a day |
| Conductor | **workspace** = one branch | `git worktree` on the user's own `.git` | user's local repo; user pushes, opens PR | none; chat per workspace | user's `.git`, Mac, permissions | host tokens (`claude /login`, `gh`) | local, free; Pro $50, Teams $60 |
| Sprites | **org**; one agent per Sprite; no timer | not stated; exec, fs API, `.sprite` pointer | inside the VM; forge via connector | yes: whole disk, checkpoints | nothing; org shares connectors | gateway; token never in VM | hosted; per CPU-h and GB-h |
| Ona | **environment** per task; disposable | clone into `/workspaces/<repo>` | forge; agent pushes, opens PR | humans keep `$HOME`; agents `AGENTS.md` | none; VM per env, worktrees refused | secrets store + credential proxy | hosted; $20 per org |

## Per product

**Docker Sandboxes.** One sandbox per workspace path, reconnected on the next `sbx run`, a second
only under `--name`; packages, images and agent state persist until `sbx rm`. Direct mode mounts
the checkout at its host path; clone mode clones inside the VM at the host's ref, fetched back over
a `sandbox-<name>` remote. A worktree directory mounted alone leaves the agent with no git. The
host proxy injects auth and the VM sees a sentinel; Claude's OAuth token stays on the host.
(https://docs.docker.com/ai/sandboxes/architecture/, https://docs.docker.com/ai/sandboxes/workflows/git/,
https://docs.docker.com/ai/sandboxes/security/)

**eve.** "Every eve agent has exactly one" sandbox, keyed per durable session; `/workspace`
persists across turns. A template (`bootstrap`) is shared, a session (`onSession`) is not. The
root's `agent` copies share the parent's sandbox; a declared subagent gets its own. Memory is a
separate slot scoped `byPrincipal`. The GitHub channel checks the ref out with a token-free URL and
firewall injection, Vercel backend only; no push flow is documented.
(`docs/sandbox.mdx`, `docs/subagents/index.mdx`, `docs/memory/overview.mdx`, `docs/channels/github.mdx`)

**Grok Bot.** The map has one fact backwards: "the computer is assigned to your user account, not
an individual Bot"; Bots "isolate personalities and workspaces, not compute" and are not a security
boundary. Per user, `/workspace`, browser sessions, logins, memory and routines persist. No
repository or branch mechanics are published. A Bot "has no identity of its own"; the human types
logins during a takeover. Runs in Cursor's cloud on a Cursor or SuperGrok plan.
(https://docs.x.ai/grok-bot/computer-and-apps, https://docs.x.ai/grok-bot/teams-and-enterprises,
https://cursor.com/help/grok-bot/plans)

**Codex cloud.** A container per chat from a per-repository environment, cached twelve hours. The
result is a diff: the user opens the PR, or `codex apply` git-applies it locally, non-zero on
conflict. Secrets are removed before the agent phase, whose network is off by default.
(https://learn.chatgpt.com/docs/environments/cloud-environment, https://learn.chatgpt.com/docs/codex/cli)

**Cursor cloud agents.** "Every agent gets a dedicated environment", recycled on idle, resumable
from a 90-day snapshot, started from a Build that "preserve[s] disk state only". The agent clones
through the Cursor GitHub App, pushes and opens the PR. The self-hosted worker runs tool calls in a
`--worker-dir` on the user's laptop with inference elsewhere.
(https://cursor.com/docs/cloud-agent/builds, https://cursor.com/docs/cloud-agent/security,
https://cursor.com/docs/cloud-agent/self-hosted/my-machines)

**Claude Code on the web.** "Each task gets its own session and its own branch" on a fresh VM,
cloned every session, nothing from `~/.claude` along. Claude pushes; the user clicks Create PR;
`claude --teleport` fetches the branch into a clean local checkout once it is on the remote. The
proxy swaps a scoped git credential after verifying "it is only pushing to the configured branch".
(https://code.claude.com/docs/en/claude-code-on-the-web, https://code.claude.com/docs/en/cloud-environments)

**Devin.** One snapshot per organization; "each session boots a fresh copy" and discards its
changes, so the pushed branch is the only artifact. Devin pushes and opens the PR, with four
commit-authoring modes. Knowledge and Playbooks are org-scoped. Outposts execute on your machines
in a pre-cloned `repos/<repo>` tree with no per-session isolation stated.
(https://docs.devin.ai/onboard-devin/environment/blueprints, https://docs.devin.ai/integrations/gh,
https://docs.devin.ai/cloud/outposts/quickstart)

**Copilot cloud agent.** An ephemeral Actions job on one repository, 59 minutes, "can only push to"
its `copilot/` branch, a draft PR a human must merge. Copilot Memory is per repository and user.
(https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent,
https://docs.github.com/en/copilot/concepts/agents/copilot-memory)

**container-use.** Not archived (`pushed_at` 2026-08-17). An environment is a container plus a
branch in a **bare fork** under `~/.config/container-use/repos/`, seeded by `git push HEAD`,
auto-committed on every tool call. The user's repo sees it as remote `container-use/<id>` until
`cu checkout`, `cu merge` (`--no-ff`) or `cu apply` (`--squash`) runs inside the checkout. No forge.
(https://api.github.com/repos/dagger/container-use,
https://raw.githubusercontent.com/dagger/container-use/main/repository/repository.go)

**OpenHands.** A sandbox is "used by one or more conversations", paused on idle, deleted on
timeout; "a separate conversation is not a security boundary when it shares a sandbox". Locally the
checkout is bind-mounted, with a warning the agent can delete anything mounted; in the cloud the
App clones and the agent pushes.
(https://docs.openhands.dev/enterprise/conversations-and-sandboxes,
https://docs.openhands.dev/openhands/usage/sandboxes/docker)

**Jules.** "Each task runs in a fresh virtual machine" with a per-repo snapshot reused. "You are
the branch owner", "Jules appears as the commit author", authorship is a setting; `jules remote
pull` brings a patch, never a branch. Memory is per repository.
(https://jules.google/docs/faq/, https://jules.google/docs/running-tasks/, https://jules.google/docs/cli/reference)

**Conductor.** The nearest product to blobot: a workspace is "one task, issue, experiment, or pull
request", a `git worktree` on the user's own `.git` under `~/conductor/workspaces/<repo>/<city>`,
one branch each, which the **agent is instructed to rename**. The user pushes and opens the PR
with their own `gh`. Gitignored `.env*` files are copied in from the main checkout.
(https://www.conductor.build/docs/concepts/git-worktrees, https://www.conductor.build/docs/concepts/workspaces-and-branches,
https://www.conductor.build/docs/reference/files-to-copy)

**Sprites.** "Every agent gets its own Sprite": a Firecracker VM, persistent disk on the same paths
every run, warm resume under a second, filesystem-only checkpoints. No repository ingest is
documented; `sprite use` writes a `.sprite` file binding a local directory to a machine by name.
"The Sprite never holds the provider token."
(https://fly.io/sprites/, https://docs.sprites.dev/concepts/lifecycle/, https://docs.sprites.dev/concepts/connectors/)

**Ona.** A VM per environment, one per task, agents' destroyed after use. It names worktrees as the
thing it refuses: "unlike sharing file systems (worktrees), this prevents cross-environment
conflicts". The agent pushes and opens the PR; durable knowledge is `AGENTS.md` in the repo root.
(https://ona.com/cases/ona-agents, https://ona.com/docs/ona/agents-md, https://ona.com/pricing)

## What transfers to blobot and what does not

**(a) The grain each chose, and why.** Four grains, each fixed by what the product treats as
durable. *Task* (Codex, Cursor, Claude web, Copilot, Jules, Ona, Devin's session, OpenHands cloud,
container-use): the machine is a cache, the branch is the output, so the box is disposable.
*Directory* (Docker Sandboxes, Conductor): a local tool binds to the folder because it exists
before the agent does. *User* (Grok Bot): errands with the user's logins, so Bots share the
computer. *Agent* (Sprites, eve's declared subagents): the agent is durable and the repository
incidental. Templates sit above all four at org or repo grain and are never a running filesystem.
Nobody binds at `<team>/<agent>`, and nobody has a *team*: the closest is OpenHands's grouped
conversations, which its docs call a shared failure domain.

**(b) Where the work product lives.** In the user's own repository: Conductor, Docker Sandboxes,
container-use (a bare fork merged back), OpenHands local. On the forge, every one through a GitHub
App: Codex, Cursor, Claude web, Devin, Copilot, Jules, Ona, OpenHands cloud; the ways back are
patches (`codex apply`, `jules remote pull`) or `--teleport` after the push. Nowhere: Grok Bot,
Sprites, eve, whose output is files in a VM.

**(c) Settled; do not reinvent.** The box is disposable and the branch survives (Devin, Claude web,
Cursor), blobot's existing rule. Credentials are injected at a proxy with a sentinel inside
(Docker, Claude web, Ona, Sprites, eve); Claude web's proxy checking the push target is a local
pattern too, a pre-push guard admitting only `blobot/<team>/<agent>`. A shared template over a
per-instance overlay is universal. Agents push only to a prefixed branch (`copilot/`, `codex/`,
`cu-<id>`). The human owns the branch, the agent authors the commit, authorship is selectable
(Jules, Devin). Idle means pause, not delete. Seed from `HEAD`, never the dirty tree. Conductor's
copying of gitignored `.env*` into each worktree is a need blobot has not met. The market's memory
is per repository or per org, never per agent: the Handbook is already ahead of it.

**(d) What nobody does.** A branch in the user's own local repository is *not* unique: Conductor
and container-use end there too. What is unique is narrower: **the branch belongs to an agent on a
team, is named for that pair, outlives any task, and is the whole output, with no forge in the
loop and the pull request left as the user's act.** Conductor's branch is a task's and the agent
renames it; container-use's is a petnamed environment's; Sprites' agent owns a machine and no
branch. Everyone else grains at the task, where no author persists, or at the agent, which has a home
but no branch. That is the constraint ticket `01` bends around: a per-profile
home in the Grok shape has no branch to hold, and the market's per-user shared computer is what
ticket 10's *never a shared directory* refuses.
