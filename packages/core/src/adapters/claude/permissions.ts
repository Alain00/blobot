import { ATTENDED_TRUST_LEVELS, TRUST_LEVELS, type TrustLevel } from '../../trust.js';

/**
 * What blobot vouches for on a Claude session, as `allowedTools` rules.
 *
 * The counterpart to OpenCode's `PERMISSION_POSTURE`, and the answer to ticket 14's 2026-08-30
 * amendment. That ticket read `default` mode's own description — "prompts for dangerous
 * operations" — as a description of behaviour. It is not: `default` prompts on every `Edit`,
 * every `Write` and every un-preapproved `Bash`, whatever the path, so an agent asked to write a
 * file inside its own worktree stopped and waited for a human. `waiting` became the ordinary
 * state on one of the two runtimes, which is the exact posture ticket 14 rejected for the other.
 *
 * The lever is `_meta.claudeCode.options.allowedTools`, which the bridge passes through
 * untouched — unlike `permissionMode`, `canUseTool` and `allowDangerouslySkipPermissions`, which
 * it discards. Ticket 15 has been relying on that route for `mcp__blobot` since it shipped. The
 * rule strings are settings' own: a bare tool name, or `Bash(<prefix>:*)` matching the head of
 * the command.
 *
 * Not a file. Seeding `<workspace>/.claude/settings.local.json` would have worked and was
 * rejected: an AgentWorkspace is a checkout of the user's repository on a blobot branch, so
 * anything blobot leaves there can be staged, committed and merged home. This is per session and
 * in memory.
 *
 * **A speed bump, not a boundary** — the same sentence ticket 14 wrote about OpenCode's list.
 * `npm run` executes a script the agent may have just written and `sed` writes whatever it is
 * told to. Nothing here is a guarantee. What blobot claims is prompting, which stays true.
 */

/**
 * Editing, unconditionally.
 *
 * An AgentWorkspace is the agent's own copy in all three workspace kinds — a worktree on its own
 * branch where git can hold one, a copy where it cannot — so an edit here is never the user's
 * working tree, and on the git kinds it is recoverable with the tool the user already has.
 * `Read`, `Glob` and `Grep` are absent because Claude never prompts for them.
 */
const EDITING_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

/**
 * The commands that are how an agent does its job, as `Bash` prefixes.
 *
 * Enumerated rather than subtracted, because an allowlist cannot say *everything except these*.
 * OpenCode gets `'*': allow` minus seventeen patterns; Claude gets this closed list, so an
 * unlisted-but-harmless command still prompts. That asymmetry runs in the safe direction and it
 * fails closed, which is the property ADR-0003 wanted from the palette for the same reason.
 *
 * Nothing here changes permissions or publishes — two of the three things ticket 14's OpenCode
 * list stops. The third, *reaches the network*, turned out to be the wrong axis and was corrected
 * on 2026-08-31: `git fetch` and `git pull` were always here, and they are reads over the same
 * network as `gh pr view`. What decides is the **verb**, so the reading half of `gh` is here
 * beside them and the writing half is absent at every level. `git push`, `git remote`,
 * `gh pr create`, `curl`, `wget`, `ssh`, `scp`, `docker`, `sudo`, `rm`, `chmod`, `chown` and
 * every install verb are absent by construction, and stay absent: a prefix added here is a
 * prompt the user stops getting.
 *
 * `bash` and `sh` are absent for the same reason: `bash -c "rm -rf …"` would walk straight
 * through this list, and a rule that vouches for a shell vouches for everything the shell can
 * reach. Claude runs its commands directly, so the cost is a prompt on `bash script.sh` and
 * nothing else. OpenCode cannot make that distinction, which is one more place the two postures
 * differ in the safe direction.
 */
const VOUCHED_BASH = [
  // Looking around.
  'ls', 'cat', 'head', 'tail', 'wc', 'pwd', 'echo', 'which', 'file', 'stat', 'date', 'du',
  'find', 'grep', 'rg', 'tree', 'diff', 'sort', 'uniq', 'basename', 'dirname', 'realpath',
  // Local git. Not `push`, not `remote`, and never the bare verb, which would cover both.
  'git status', 'git diff', 'git log', 'git show', 'git branch', 'git add', 'git commit',
  'git checkout', 'git switch', 'git restore', 'git stash', 'git rev-parse', 'git ls-files',
  'git blame', 'git fetch', 'git pull', 'git merge', 'git rebase', 'git reset', 'git tag',
  'git describe', 'git config', 'git apply', 'git cherry-pick',
  // Reading GitHub. The same split as local git one line up, made on the verb and never on the
  // transport. `gh api` is absent because `gh api -X POST` writes and a prefix rule cannot see
  // the flag; every other writing verb is absent at every level, `gh pr create` included, since
  // a pull request is the user's action and never an agent's.
  'gh pr view', 'gh pr list', 'gh pr diff', 'gh pr checks', 'gh pr status',
  'gh issue view', 'gh issue list', 'gh issue status',
  'gh repo view', 'gh repo list',
  'gh run view', 'gh run list',
  'gh workflow view', 'gh workflow list',
  'gh release view', 'gh release list',
  'gh label list', 'gh search', 'gh auth status',
  // Doing the work. Running a script is not installing one: the `add` and `install` verbs are out.
  'npm test', 'npm run', 'npm ls', 'pnpm test', 'pnpm run', 'pnpm ls', 'pnpm build',
  'yarn test', 'yarn run', 'bun test', 'bun run', 'make', 'cargo test', 'cargo build',
  'cargo check', 'go test', 'go build', 'go vet', 'pytest', 'vitest', 'jest', 'tsc',
  'node', 'python', 'python3', 'ruby',
  // Ordinary file work. `rm` is deliberately not here, on either runtime.
  'mkdir', 'touch', 'cp', 'mv', 'sed', 'awk', 'tee', 'ln',
];

/**
 * What `trusting` adds: the network and the installers.
 *
 * These are the prefixes ticket 14's OpenCode list asks about, minus the ones that delete,
 * publish or change who can do what. An agent set here fetches a page and adds a dependency
 * without stopping; it still stops before `rm`, `sudo`, `chmod`, `chown`, `ssh`, `scp`,
 * `docker`, `git push`, `git remote` and every writing `gh` verb, at every level, on both
 * runtimes. `gh` is not here: its reads are vouched at `normal` and its writes at no level, so
 * there is nothing left for this list to add.
 */
const TRUSTING_BASH = [
  'curl', 'wget', 'npm install', 'npm ci', 'npx', 'pnpm add', 'pnpm dlx', 'pnpm install',
  'yarn add', 'yarn install', 'bun add', 'bun install', 'pip install', 'pip3 install',
  'cargo add', 'go get',
];

/**
 * The rules blobot vouches for at one trust level, in settings' own syntax.
 *
 * `careful` vouches for nothing: the list is empty and `default` mode asks about every edit and
 * every command, which is what that word has to mean to be worth offering. The mailbox is not
 * in here and so is unaffected — `preApprovedTools` contributes `mcp__blobot` separately,
 * because it is ticket 15's and belongs to the servers blobot injected rather than to this
 * posture. An agent that had to ask permission to answer its teammate would not be careful, it
 * would be broken.
 *
 * `unattended` takes `trusting`'s list **unchanged**, and that is the point rather than an
 * oversight. `allowedTools` is consulted before the permission path, so every rule here is a call
 * the classifier never sees and never charges an inference call for. The fourth level buys a
 * decider for the tail; giving it a wider list would be widening what blobot vouches for, which
 * is a different decision nobody made.
 */
const WIDE_BASH_LEVELS: readonly TrustLevel[] = ['trusting', 'unattended'];

export function vouchedTools(trust: TrustLevel): readonly string[] {
  if (trust === 'careful') return [];
  const bash = WIDE_BASH_LEVELS.includes(trust)
    ? [...VOUCHED_BASH, ...TRUSTING_BASH]
    : VOUCHED_BASH;
  return [...EDITING_TOOLS, ...bash.map((prefix) => `Bash(${prefix}:*)`)];
}

/**
 * The `session/set_mode` id blobot puts a Claude session in, per trust level.
 *
 * The third instance of a shape the other two adapters already have -- `codexModeFor` and
 * `fxModeFor` -- and the first where the trust word actually moves the answer. Claude is the only
 * one of the four runtimes with more than one usable position.
 *
 * ## Why `auto` is here now, having been refused
 *
 * `first-demo/14` took `default` and named `auto` as the thing it would not inherit: *"an
 * inference call we do not control makes safety decisions for an unattended teammate."* That
 * sentence is still true and is now the *description of a level the user picks* rather than a
 * reason to withhold one. What changed is the author asking twice and the objection being
 * answerable rather than fatal:
 *
 * - **It is chosen, not inherited.** Ticket 14's version of `auto` was blobot dropping the forced
 *   `set_mode` and taking whatever the user's `settings.json` said, per agent, invisibly. This is
 *   a word on the agent form with a sentence under it.
 * - **It is no longer silent when unavailable.** `auto` is advertised *"only when the model
 *   supports it"*, and until `wire.ts` grew `availableModes` blobot could not see whether it was
 *   offered. The adapter probes and falls back to `default`, saying so, which is the opposite
 *   direction from Codex's fatal `#assertPosture`: falling back here is falling back to *stricter*,
 *   and refusing to launch would punish the user for their model choice.
 * - **The vouched list still runs first.** `allowedTools` is consulted before the permission path,
 *   so `unattended` costs no inference call on anything `normal` already allowed. It buys a
 *   decider for the tail.
 *
 * `acceptEdits`, `dontAsk`, `plan` and `bypassPermissions` stay unoffered. The first three are
 * decisions blobot has already made and the fourth is the one ticket 14 refuses, which
 * `.scratch/sandboxing/04` is the place to reopen.
 */
export type ClaudeMode = 'default' | 'auto';

/** What a Claude session is put in when the user has not reached for the fourth level. */
export const CLAUDE_POSTURE_MODE: ClaudeMode = 'default';

export function claudeModeFor(trust: TrustLevel): ClaudeMode {
  return trust === 'unattended' ? 'auto' : CLAUDE_POSTURE_MODE;
}

/**
 * The mode id blobot needs to find in `modes.availableModes` before it will ask for it.
 *
 * `default` is advertised unconditionally, so only the fourth level has anything to check.
 */
export function claudeModeNeedsProbe(mode: ClaudeMode): boolean {
  return mode !== CLAUDE_POSTURE_MODE;
}

/**
 * Which positions are real on this runtime, which is all four.
 *
 * The counterpart to `CODEX_EXPRESSES_TRUST` and `FX_EXPRESSES_TRUST`, widened from a boolean
 * because the question stopped being *does the word do anything* and became *which words does
 * this runtime have*. Codex, fx and OpenCode answer `ATTENDED_TRUST_LEVELS`; only Claude has a
 * classifier, so only Claude answers with the fourth.
 *
 * Advertised rather than assumed at the point of use: an agent form that hardcoded four rows
 * would offer `unattended` beside a Codex runtime, where it means precisely nothing.
 */
export const CLAUDE_TRUST_LEVELS: readonly TrustLevel[] = TRUST_LEVELS;

/** Kept so the three-level runtimes have one import for the thing they all say. */
export { ATTENDED_TRUST_LEVELS };

/**
 * The nine verbs `unattended` refuses outright, as `disallowedTools` rules.
 *
 * ## Measured, after this level shipped claiming otherwise
 *
 * `trust.ts` and ticket 14 both said the refusals survived the fourth level -- *"what changes is
 * who answers, not whether it is asked about."* **That was false, and three live runs against a
 * real `claude` on 2026-08-31 disproved it one after another.** Under `auto`, with these commands
 * absent from `allowedTools` exactly as designed, the classifier approved every one of them and
 * **no permission request ever reached blobot**:
 *
 * - `chmod 777` on a workspace file ran; the mode went 664 to 777.
 * - `git push -u origin main` ran; the commit landed on the remote.
 * - `sudo -n true` ran; only the operating system's password prompt stopped it.
 *
 * Absent from an allowlist is not the same as refused. `auto` does not consult blobot's list at
 * all: it decides for itself, and it decided yes. `unattended` as first shipped was far closer to
 * `bypassPermissions` than its own copy admitted, and it contradicted the rule in `CLAUDE.md`
 * that **a pull request is the user's action and never an agent's**.
 *
 * ## What makes the claim true
 *
 * `disallowedTools` **is** honoured under `auto` -- measured in the same session, on the same
 * push, which was refused with `Permission denied` and left the remote empty, again with no
 * permission request reaching blobot. So the fix is a deny list rather than a retraction, and the
 * level survives with its promise intact.
 *
 * ## Why only at `unattended`
 *
 * At the other three levels these commands **ask**, and asking is what the copy promises and what
 * the user can answer. Denying them there would turn *"still asks before deleting, publishing, or
 * changing who can do what"* into *"cannot delete, publish, or change who can do what"* -- a
 * different product, silently, for every agent already hired. The deny list exists because
 * `unattended` is the one level where nobody can be asked, so the alternative to refusing is not
 * prompting, it is the silent yes measured above.
 *
 * The list is ticket 14's own, unchanged: what deletes, publishes, or changes who can do what.
 * `gh`'s writing verbs are not here because `Bash(gh:*)` would deny the reading half that
 * `VOUCHED_BASH` allows from `normal`, and a prefix rule cannot see the difference; they remain
 * un-vouched rather than denied, which is the same asymmetry running in the safe direction.
 */
const REFUSED_AT_UNATTENDED = [
  'rm', 'sudo', 'chmod', 'chown', 'ssh', 'scp', 'docker', 'git push', 'git remote',
];

/**
 * What the session refuses outright, beside the two shadowing tools the adapter always excludes.
 *
 * Empty at every attended level, because there a human is the answer to these and the block in
 * the transcript is how they give it.
 */
export function refusedTools(trust: TrustLevel): readonly string[] {
  if (trust !== 'unattended') return [];
  return REFUSED_AT_UNATTENDED.map((prefix) => `Bash(${prefix}:*)`);
}
