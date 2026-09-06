import { MACHINE_GIT_ENVIRONMENT, type RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Published CI builds, verified by anonymous full-byte download before adding these pins. */
export const CODEX_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '0.151.0',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/codex',
  sharedSkillLocations: ['/home/agent/.agents/skills'],
  allowedEnvironment: [...MACHINE_GIT_ENVIRONMENT, 'CODEX_PATH', 'CODEX_CONFIG', 'INITIAL_AGENT_MODE', 'NO_BROWSER'],
  builds: [
    {
      arch: 'arm64',
      reference: 'blobot-machine-codex:475f185a738767edbd26a87ad2e6141c473f4698a3acadafcbd3b0740e88125c-arm64',
      imageId: 'sha256:475f185a738767edbd26a87ad2e6141c473f4698a3acadafcbd3b0740e88125c',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-codex-arm64-475f185a738767edbd26a87ad2e6141c473f4698a3acadafcbd3b0740e88125c.tar',
      sha256: '23afd9ac9381563f4bc02b9a4b0cf04b6f8da59a840b5dd7f1b078e358b505d2',
      bytes: 719340032,
    },
    {
      arch: 'amd64',
      reference: 'blobot-machine-codex:5b9db9612c65fc8d0446a80df044e06625958e60875335e52fdd32f508ad9385-amd64',
      imageId: 'sha256:5b9db9612c65fc8d0446a80df044e06625958e60875335e52fdd32f508ad9385',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-codex-amd64-5b9db9612c65fc8d0446a80df044e06625958e60875335e52fdd32f508ad9385.tar',
      sha256: '0ce580f033c7adbe0c06c8cdb342661090322ca88804028d746c07a0aa6a34dd',
      bytes: 743079424,
    },
  ],
};
