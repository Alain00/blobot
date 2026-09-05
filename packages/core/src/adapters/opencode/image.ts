import type { RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Release builds are filled from CI receipts after publication, never from a local build. */
export const OPENCODE_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '1.18.4',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/opencode',
  sharedSkillLocations: ['/home/agent/.config/opencode/skills'],
  builds: [],
};
