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
  /** Empty until CI has produced and published verified release assets. No unpinned fetch. */
  readonly builds: readonly RuntimeImageBuild[];
}

export function runtimeImageBuild(image: RuntimeImageDefinition, hostArch: string): RuntimeImageBuild | undefined {
  const arch = hostArch === 'x64' ? 'amd64' : hostArch;
  return image.builds.find(build => build.arch === arch);
}
