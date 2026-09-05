import type { RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Release builds are filled from CI receipts after publication, never from a local build. */
export const CURSOR_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '2026.09.02-c22c1a3',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/cursor-agent',
  sharedSkillLocations: ['/home/agent/.cursor/skills'],
  builds: [],
};
