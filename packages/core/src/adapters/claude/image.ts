import type { RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Published CI builds, verified by anonymous full-byte download before adding these pins. */
export const CLAUDE_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '2.1.260',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/claude',
  sharedSkillLocations: ['/home/agent/.claude/skills'],
  builds: [
    {
      arch: 'arm64',
      reference: 'blobot-machine-claude:3b4535de48403a040fa7302506592d41d4107bf5134a59bbbd93e03a36b72192-arm64',
      imageId: 'sha256:3b4535de48403a040fa7302506592d41d4107bf5134a59bbbd93e03a36b72192',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-claude-arm64-3b4535de48403a040fa7302506592d41d4107bf5134a59bbbd93e03a36b72192.tar',
      sha256: '75881fe4b412dc3cf7daf36071d75e7f1a8c093ecc845c21ec909b43cb6c11ea',
      bytes: 693360640,
    },
    {
      arch: 'amd64',
      reference: 'blobot-machine-claude:8394a72a6a7830ff1161438814452e7af1f9063be68b45bc32780b9d6153f54b-amd64',
      imageId: 'sha256:8394a72a6a7830ff1161438814452e7af1f9063be68b45bc32780b9d6153f54b',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-claude-amd64-8394a72a6a7830ff1161438814452e7af1f9063be68b45bc32780b9d6153f54b.tar',
      sha256: '801717469a40026ff6c628e044d179ef3d37118c55eaaeb1b2a2cebe8a63c93a',
      bytes: 709304832,
    },
  ],
};
