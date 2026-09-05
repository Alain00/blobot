/**
 * The persona and the permission posture, as one inline config handed to the process.
 *
 * OpenCode has no ACP field for a system prompt: `session/new`'s `_meta` is parsed and never
 * read (research 16 §1). What it has instead is its **agent** concept, and it is better than
 * a preamble: an agent's `prompt` becomes element 0 of the system array, in place of the
 * provider identity block, and the array is coalesced to two blocks — a cached prefix, which
 * is exactly what ticket 06 asked for. Measured at +88 tokens for the persona text.
 *
 * It is delivered through `OPENCODE_CONFIG_CONTENT` rather than a file, which is ticket 14's
 * decision and ticket 10's instinct: **blobot writes nothing into the user's repository.**
 * The env var is the last config layer, so it wins key by key over a repo's own
 * `opencode.json` while still deep-merging with it — the user's plugins, MCP servers and
 * model choices all survive.
 */

import { DEFAULT_TRUST, type TrustLevel } from '../../trust.js';

/**
 * Ticket 14's posture, and what `normal` means here.
 *
 * `edit: allow` and `bash: {'*': allow}` because an agent that prompts on every `ls` and
 * `npm test` makes `waiting` the normal state, and ticket 09 spent its only contrast
 * inversion on `waiting` meaning something. The named patterns are the commands that reach
 * the network, change permissions, or publish.
 *
 * Two things this list is not. It is **not a boundary**: `bash -c "rm -rf ..."` and
 * `$(echo rm)` sail straight past a command-string pattern, and ticket 14 says so out loud.
 * And it is **not a scalar** — `"permission": "ask"` appends `{permission:'*', action:'ask'}`
 * last, which makes `read` ask too and every agent unusable (research 16 §8).
 *
 * `external_directory` is deliberately absent: 1.18.4 already defaults it to `ask`.
 */
export const BASH_PERMISSIONS: Readonly<Record<string, 'ask' | 'allow'>> = {
  '*': 'allow',
  'rm *': 'ask',
  'sudo *': 'ask',
  'chmod *': 'ask',
  'chown *': 'ask',
  'curl *': 'ask',
  'wget *': 'ask',
  'ssh *': 'ask',
  'scp *': 'ask',
  'docker *': 'ask',
  'git push*': 'ask',
  'git remote*': 'ask',
  'gh *': 'ask',
  // Reading GitHub, allowed back after the blanket `gh *` above, because rules are a flat
  // ordered list and the later one wins. The axis is the **verb**, not the transport: `git
  // fetch` and `git pull` are network reads and were never in this list, so `gh pr view` had no
  // business being in it either (2026-08-31). Every writing verb stays covered by `gh *`, at
  // every level, `gh pr create` included. `gh api` is not here: `gh api -X POST` writes and a
  // glob on the command string cannot see the flag.
  'gh pr view*': 'allow',
  'gh pr list*': 'allow',
  'gh pr diff*': 'allow',
  'gh pr checks*': 'allow',
  'gh pr status*': 'allow',
  'gh issue view*': 'allow',
  'gh issue list*': 'allow',
  'gh issue status*': 'allow',
  'gh repo view*': 'allow',
  'gh repo list*': 'allow',
  'gh run view*': 'allow',
  'gh run list*': 'allow',
  'gh workflow view*': 'allow',
  'gh workflow list*': 'allow',
  'gh release view*': 'allow',
  'gh release list*': 'allow',
  'gh label list*': 'allow',
  'gh search*': 'allow',
  'gh auth status*': 'allow',
  'npm install*': 'ask',
  'npx *': 'ask',
  'pnpm add*': 'ask',
  'yarn add*': 'ask',
  'bun add*': 'ask',
  // Anything that reaches the display server, at every level and never on `TRUSTED_ANYWAY`.
  // Everything else blobot vouches for at `normal` acts on the agent's own copy of the user's
  // repository; that containment is why editing is vouched unconditionally. The screen is in no
  // workspace, is not per agent, and is the one place *the recipient owns the repository* stops
  // working: a user owns their screen, not everything visible on it. Capture and input injection
  // are one class because they are one reach. `ffmpeg` is here for `gh api`'s reason exactly:
  // `-f x11grab` and `-f avfoundation` are invisible to a pattern on the head of the command.
  //
  // These were absent, and absence means the opposite on the two runtimes: Claude's posture is an
  // allowlist, where an unlisted command prompts, and this one is a denylist, where it runs. So
  // `grim` ran unprompted at `normal` here while the same command prompted there. A rule that is
  // safe by omission on one runtime is unsafe by omission on the other.
  'import *': 'ask',
  'scrot*': 'ask',
  'grim*': 'ask',
  'maim*': 'ask',
  'spectacle*': 'ask',
  'screencapture*': 'ask',
  'gnome-screenshot*': 'ask',
  'flameshot*': 'ask',
  'wayshot*': 'ask',
  'xwd*': 'ask',
  'xdotool*': 'ask',
  'wmctrl*': 'ask',
  'ydotool*': 'ask',
  'ffmpeg*': 'ask',
};

/**
 * Which of those an agent set to `trusting` stops being asked about: the network and the
 * installers, never the ones that delete, publish or change who can do what.
 *
 * The same split the Claude adapter makes, made here by removing rules rather than by adding
 * them, because the two runtimes express a posture from opposite ends. `rm`, `sudo`, `chmod`,
 * `chown`, `ssh`, `scp`, `docker`, `git push` and `git remote` are absent from this list and so
 * keep asking at every level. `gh *` is absent too, and for a different reason: its reads are
 * already allowed at `normal` by the rules that follow it above, and its writes are allowed at
 * no level, so lifting the blanket rule here would only lift `gh pr create`.
 *
 * The display-server class is absent for the same permanence: it never reaches `trusting`, and
 * so never reaches `unattended`, which takes `trusting`'s list unchanged and is the level where
 * nobody is watching.
 */
const TRUSTED_ANYWAY = [
  'curl *', 'wget *', 'npm install*', 'npx *', 'pnpm add*', 'yarn add*', 'bun add*',
];

/**
 * The posture at one trust level.
 *
 * `careful` is the object form and never the scalar: `"permission": "ask"` appends
 * `{permission:'*', action:'ask'}` last, which makes `read` ask too and every agent unusable
 * (research 16 section 8). It is the coarse posture this ticket rejected as a *default* and it
 * is a perfectly good *choice*, which is the difference the selector adds.
 */
export function permissionPosture(trust: TrustLevel): {
  readonly edit: 'ask' | 'allow';
  readonly bash: Readonly<Record<string, 'ask' | 'allow'>>;
} {
  if (trust === 'careful') return { edit: 'ask', bash: { '*': 'ask' } };
  if (trust === 'normal') return { edit: 'allow', bash: BASH_PERMISSIONS };
  const bash = Object.fromEntries(
    Object.entries(BASH_PERMISSIONS).map(([pattern, action]) =>
      TRUSTED_ANYWAY.includes(pattern) ? [pattern, 'allow' as const] : [pattern, action],
    ),
  );
  return { edit: 'allow', bash };
}

/** Ticket 14's posture, verbatim, and still what an agent is when nobody has chosen. */
export const PERMISSION_POSTURE = permissionPosture(DEFAULT_TRUST);

export interface OpencodeConfigOptions {
  /** How much of the agent's own work blobot vouches for. See `trust.ts`. */
  readonly trust?: TrustLevel;
  /** The config key the agent is defined under, and therefore the ACP mode id. */
  readonly agentKey: string;
  /** Free text. The one place the agent's human name survives verbatim in the config. */
  readonly description: string;
  /** `composePersona`'s output, pinned as the cached system prefix. */
  readonly persona: string;
}

/**
 * The model is deliberately **not** here, though `AgentConfig` has a `model` key.
 *
 * It arrives instead through `session/set_config_option`, which is the one mechanism that
 * works on both runtimes and the only one that works on the Claude bridge at all. Two ways to
 * set the same thing is how the two runtimes start disagreeing about which one won.
 */

/**
 * The config, as the JSON string `OPENCODE_CONFIG_CONTENT` takes.
 *
 * `default_agent` rather than a follow-up `session/set_mode`, because there is no way to pass
 * a mode at `session/new` and a session created under `build` has already taken its first
 * backing turn as somebody else. The posture is written twice, globally and on the agent,
 * so a session that is switched off the persona for any reason keeps its permissions: rules
 * are a flat ordered list and two identical rules cost nothing.
 */
export function opencodeConfigContent(options: OpencodeConfigOptions): string {
  const permission = permissionPosture(options.trust ?? DEFAULT_TRUST);
  return JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    default_agent: options.agentKey,
    permission,
    agent: {
      [options.agentKey]: {
        description: options.description,
        mode: 'primary',
        prompt: options.persona,
        permission,
      },
    },
  });
}

/**
 * A config key made out of an agent's id or name.
 *
 * The key is the mode id, and OpenCode surfaces it verbatim in its own mode picker, so it has
 * to be both safe and readable. The human name survives in `description` and in the persona
 * itself, which is what the model actually reads.
 */
export function agentKeyFor(name: string): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // `build` and `plan` are OpenCode's own primary agents. Colliding with one would replace it
  // for this process, which is a surprise nobody asked for.
  if (key === '' ) return 'blobot-agent';
  if (key === 'build' || key === 'plan') return `blobot-${key}`;
  return key;
}
export const OPENCODE_LOCAL_PROTECTION =
  'Local execution has no OS sandbox. Tools run with your account’s access; approval rules still apply.';
