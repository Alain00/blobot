import type { RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Release builds are filled from CI receipts after publication, never from a local build. */
export const CLAUDE_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '2.1.260',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/claude',
  sharedSkillLocations: ['/home/agent/.claude/skills'],
  builds: [],
};
