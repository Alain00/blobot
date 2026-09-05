Pinned Linux runtime images for arm64 and amd64. Each archive contains one runtime and its
required ACP bridge, based on the Docker shell template identified in its build receipt.

CI checks UID 1000, an empty home, the pinned CLI version and signed-out ACP startup with no
network. fx requires authentication for ACP initialize; no sign-in or inference is performed.
These checks do not establish sbx mailbox, provider sign-in, egress or state migration acceptance.

Review the receipts and smoke results before publishing this draft. Published archives must
remain immutable. Verify anonymous downloads, then copy `runtime-builds.json` into the matching
adapter image definitions in a separate reviewed change. Private releases are not anonymously
downloadable; the app does not carry a repository token. No automatic image upgrade is enabled.
