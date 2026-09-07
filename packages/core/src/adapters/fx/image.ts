import { MACHINE_GIT_ENVIRONMENT, type RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Published CI builds, verified by anonymous full-byte download before adding these pins. */
export const FX_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '0.0.7',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/fx',
  sharedSkillLocations: ['/home/agent/.claude/skills'],
  allowedEnvironment: [...MACHINE_GIT_ENVIRONMENT, 'FX_PERMISSION_MODE', 'FX_NO_OPEN_BROWSER', 'NO_COLOR'],
  builds: [
    {
      arch: 'arm64',
      reference: 'blobot-machine-fx:fa5a6e736d1664474b3b4e3d7ee673732b4664457527b5f6dcdcac318cfe0a40-arm64',
      imageId: 'sha256:fa5a6e736d1664474b3b4e3d7ee673732b4664457527b5f6dcdcac318cfe0a40',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-fx-arm64-fa5a6e736d1664474b3b4e3d7ee673732b4664457527b5f6dcdcac318cfe0a40.tar',
      sha256: '9989ecf9f1faa8ea70d43e35ed8c87936a7df733f437cd63c3d659662b097cdf',
      bytes: 594126848,
    },
    {
      arch: 'amd64',
      reference: 'blobot-machine-fx:8ae591bf93887934b5808d52d25fd82427876e52bc05c892b4bd0c8fd7b6963c-amd64',
      imageId: 'sha256:8ae591bf93887934b5808d52d25fd82427876e52bc05c892b4bd0c8fd7b6963c',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-fx-amd64-8ae591bf93887934b5808d52d25fd82427876e52bc05c892b4bd0c8fd7b6963c.tar',
      sha256: '270a0186e7439754a63ad0459d4b76f665f77e88bd802098c25d67806ffd648a',
      bytes: 610527744,
    },
  ],
};
