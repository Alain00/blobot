import type { RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Published CI builds, verified by anonymous full-byte download before adding these pins. */
export const CURSOR_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '2026.09.02-c22c1a3',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/cursor-agent',
  sharedSkillLocations: ['/home/agent/.cursor/skills'],
  builds: [
    {
      arch: 'arm64',
      reference: 'blobot-machine-cursor:781376cc4e5d4ee335c6e62f1176219ae825ef5f74655af88b64472f8035f7ca-arm64',
      imageId: 'sha256:781376cc4e5d4ee335c6e62f1176219ae825ef5f74655af88b64472f8035f7ca',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-cursor-arm64-781376cc4e5d4ee335c6e62f1176219ae825ef5f74655af88b64472f8035f7ca.tar',
      sha256: 'a9321604a8bbf6315ee426581b4bcbc45d72fd92f9d8802f195874bc59c4bb79',
      bytes: 772251136,
    },
    {
      arch: 'amd64',
      reference: 'blobot-machine-cursor:753ac10e8f53023a35952ae30d4ea0f5921f7a11db4373766d5fc81d994501c5-amd64',
      imageId: 'sha256:753ac10e8f53023a35952ae30d4ea0f5921f7a11db4373766d5fc81d994501c5',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-cursor-amd64-753ac10e8f53023a35952ae30d4ea0f5921f7a11db4373766d5fc81d994501c5.tar',
      sha256: '41d4b8941e9fcdb9467539b9fa3e8af4bc2758b806f490e0b859fefde53cc459',
      bytes: 789465088,
    },
  ],
};
