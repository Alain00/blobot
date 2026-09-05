const CLIENT_ENV_NAMES = [
  'HOME', 'PATH', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME',
] as const;

/** No host secrets/SSH agent; opt out on every client, including one that starts the daemon. */
export function sbxClientEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { SBX_NO_TELEMETRY: '1' };
  for (const name of CLIENT_ENV_NAMES) {
    if (source[name] !== undefined) env[name] = source[name];
  }
  return env;
}
