/** Adapter-owned distribution facts; the engine never dispatches on a provider name. */
export interface RuntimeImageBuild {
  readonly arch: 'arm64' | 'amd64';
  readonly reference: string;
  readonly imageId: string;
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface RuntimeImageDefinition {
  readonly cliVersion: string;
  readonly guestNode: string;
  readonly moduleRoot: string;
  readonly executable: string;
  readonly sharedSkillLocations: readonly string[];
  readonly allowedEnvironment: readonly string[];
  /** Empty until CI has produced and published verified release assets. No unpinned fetch. */
  readonly builds: readonly RuntimeImageBuild[];
}

/** Fixed process-local identity, with one explicit Git override and no host config imports. */
export const MACHINE_GIT_ENVIRONMENT = Object.freeze([
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
  'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',
]);

export function runtimeImageBuild(image: RuntimeImageDefinition, hostArch: string): RuntimeImageBuild | undefined {
  const arch = hostArch === 'x64' ? 'amd64' : hostArch;
  return image.builds.find(build => build.arch === arch);
}
