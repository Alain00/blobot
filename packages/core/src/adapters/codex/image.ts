import type { RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Release builds are filled from CI receipts after publication, never from a local build. */
export const CODEX_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '0.151.0',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/codex',
  sharedSkillLocations: ['/home/agent/.agents/skills'],
  builds: [],
};
