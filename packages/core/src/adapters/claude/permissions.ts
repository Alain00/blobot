import type { TrustLevel } from '../../trust.js';

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
 */
export function vouchedTools(trust: TrustLevel): readonly string[] {
  if (trust === 'careful') return [];
  const bash = trust === 'trusting' ? [...VOUCHED_BASH, ...TRUSTING_BASH] : VOUCHED_BASH;
  return [...EDITING_TOOLS, ...bash.map((prefix) => `Bash(${prefix}:*)`)];
}
