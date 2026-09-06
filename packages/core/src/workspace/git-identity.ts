import { refSlug } from './workspace.js';

/** Agent authorship is process state: never write identity into the shared repository. */
export function agentGitEnvironment(
  agentName: string,
  inherited: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string>> {
  const name = agentName.trim();
  if (name === '' || /[\x00-\x1f<>]/.test(name)) throw new Error('Invalid Agent Git identity.');
  const email = `${refSlug(name)}@agents.blobot.invalid`;
  const count = Number(inherited['GIT_CONFIG_COUNT'] ?? '0');
  // The appended signing override counts toward the bound too.
  if (!Number.isSafeInteger(count) || count < 0 || count >= 10_000) throw new Error('Invalid inherited Git configuration.');
  const env: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    for (const part of ['KEY', 'VALUE']) {
      const key = `GIT_CONFIG_${part}_${i}`;
      const value = inherited[key];
      if (value === undefined) throw new Error('Incomplete inherited Git configuration.');
      env[key] = value;
    }
  }
  return {
    ...env,
    GIT_AUTHOR_NAME: name, GIT_COMMITTER_NAME: name,
    GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email,
    GIT_CONFIG_COUNT: String(count + 1),
    [`GIT_CONFIG_KEY_${count}`]: 'commit.gpgsign',
    [`GIT_CONFIG_VALUE_${count}`]: 'false',
  };
}
