import type { RuntimeImageDefinition } from '../../machines/runtime-image.js';

/** Published CI builds, verified by anonymous full-byte download before adding these pins. */
export const OPENCODE_MACHINE_IMAGE: RuntimeImageDefinition = {
  cliVersion: '1.18.4',
  guestNode: '/usr/bin/node',
  moduleRoot: '/opt/blobot',
  executable: '/opt/blobot/bin/opencode',
  sharedSkillLocations: ['/home/agent/.config/opencode/skills'],
  builds: [
    {
      arch: 'arm64',
      reference: 'blobot-machine-opencode:f64b333bf23e6ec25614c54d4fbf59c124869b78e1f0735abf0f8f9ced2856b1-arm64',
      imageId: 'sha256:f64b333bf23e6ec25614c54d4fbf59c124869b78e1f0735abf0f8f9ced2856b1',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-opencode-arm64-f64b333bf23e6ec25614c54d4fbf59c124869b78e1f0735abf0f8f9ced2856b1.tar',
      sha256: '57287378b62a5a7e4060fd759570e9a7ac786abe34f0940495cc3e447857836e',
      bytes: 649681920,
    },
    {
      arch: 'amd64',
      reference: 'blobot-machine-opencode:f98f82e4bc3ba891e32591d9826642e48aae47247bd0184acfdbdf4889da8f4a-amd64',
      imageId: 'sha256:f98f82e4bc3ba891e32591d9826642e48aae47247bd0184acfdbdf4889da8f4a',
      url: 'https://github.com/guillermolg00/blobot-machine-images/releases/download/machines-20260905-1/blobot-machine-opencode-amd64-f98f82e4bc3ba891e32591d9826642e48aae47247bd0184acfdbdf4889da8f4a.tar',
      sha256: 'f5d434aa61b06e786c34af1370119f85a71c9bb1213d2edd27084ae002cfaf8f',
      bytes: 665677824,
    },
  ],
};
