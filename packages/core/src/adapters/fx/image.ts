import type { RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Release builds are filled from CI receipts after publication, never from a local build. */
export const FX_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '0.0.7',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/fx',
  sharedSkillLocations: ['/home/agent/.claude/skills'],
  builds: [],
};
