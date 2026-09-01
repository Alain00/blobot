/**
 * The environment every spawned runtime gets, minus blobot's own key doors.
 *
 * ADR-0005 clause 2: the one credential blobot holds — a speech provider's key, which may sit
 * in the user's shell as `BLOBOT_<PROVIDER>_API_KEY` — is stripped from every runtime's
 * environment, the way `cursor/stdio.ts` strips `CURSOR_API_KEY`. *Never shown to a runtime*
 * is a fact the adapters enforce, not a sentence, and this is the one function that enforces
 * it, so a sixth adapter cannot forget.
 */
export const BLOBOT_KEY_VARIABLE = /^BLOBOT_[A-Z0-9_]+_API_KEY$/;

export function childEnvironment(
  ...layers: readonly (Readonly<Record<string, string | undefined>> | undefined)[]
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const layer of layers) Object.assign(env, layer ?? {});
  for (const name of Object.keys(env)) if (BLOBOT_KEY_VARIABLE.test(name)) delete env[name];
  return env;
}
